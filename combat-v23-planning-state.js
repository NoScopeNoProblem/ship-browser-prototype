(() => {
  // v23: planning state is derived from current world position and canonical combatTurn cadence.
  // This layer exists specifically to keep manoeuvre, Magazine/Quick Load and explosion prediction
  // independent: moving the hull must not alter weapon cadence, and a Magazine blast only exists
  // if the Magazine is still actually destroyed at the CURRENT alignment.

  function currentTurn(){ return window.combatTurn?.turn || 1; }
  function playerRoom(id){ return playerRooms.find(r => r.id === id) || null; }

  // -------------------------------------------------------------------------
  // 1) Current-world incoming damage projection.
  // Rebuild enemy hits from targetMap (direct cannon impacts at the current alignment), then
  // derive Magazine chains from those impacts. This deliberately ignores any older/stale
  // explosions carried in the incoming distribution.
  // -------------------------------------------------------------------------
  function directDamageFromTargetMap(dist){
    const direct = new Map();
    if(!(dist?.targetMap instanceof Map)) return direct;
    dist.targetMap.forEach((intents,id) => {
      let amount = 0;
      (Array.isArray(intents) ? intents : []).forEach(intent => {
        const source = sourceEntity('enemy', intent?.sourceId);
        const fallback = source?.weapon ? Number(weapons[source.weapon]?.damage || 0) : 0;
        amount += Math.max(0, Number(intent?.damage ?? fallback) || 0);
      });
      if(amount > 0) direct.set(id, amount);
    });
    return direct;
  }

  function adjacentLivingPlayerRooms(magazine){
    return playerRooms.filter(room =>
      room.id !== magazine.id && room.hp > 0 &&
      Math.abs(room.col - magazine.col) <= 1 &&
      Math.abs(room.row - magazine.row) <= 1
    );
  }

  function rebuildCurrentWorldExplosionProjection(dist){
    if(!dist || !(dist.targetMap instanceof Map)) return dist;

    const hits = directDamageFromTargetMap(dist);
    const explosions = new Map();
    const exploded = new Set();

    // Deterministic chain reaction. A Magazine only explodes if CURRENT projected damage is
    // enough to destroy it. Moving out of the aimed world-column therefore removes the blast.
    let changed = true;
    while(changed){
      changed = false;
      playerRooms.filter(room => room.isMagazine && room.hp > 0).forEach(mag => {
        if(exploded.has(mag.id)) return;
        if((hits.get(mag.id) || 0) < mag.hp) return;
        exploded.add(mag.id);
        changed = true;
        adjacentLivingPlayerRooms(mag).forEach(room => {
          hits.set(room.id, (hits.get(room.id) || 0) + 1);
          explosions.set(room.id, (explosions.get(room.id) || 0) + 1);
        });
      });
    }

    const damageTypes = new Map();
    hits.forEach((total,id) => {
      const explosive = Math.max(0, Math.min(total, Number(explosions.get(id) || 0)));
      const cannon = Math.max(0, total - explosive);
      damageTypes.set(id, [
        ...Array(cannon).fill('cannon'),
        ...Array(explosive).fill('explosive')
      ]);
    });

    return {...dist, hits, explosions, damageTypes, projectionAuthority:'v23-current-world'};
  }

  const previousEnemyIntentDistribution = enemyIntentDistribution;
  enemyIntentDistribution = function(playerState = playerIntentDistribution()){
    return rebuildCurrentWorldExplosionProjection(previousEnemyIntentDistribution(playerState));
  };

  // -------------------------------------------------------------------------
  // 2) Manoeuvring cannot alter player weapon cadence.
  // Snapshot cadence before movement input and restore it if any older compatibility layer
  // changes it. Quick-Loaded guns are then explicitly reasserted as ready.
  // -------------------------------------------------------------------------
  function snapshotPlayerWeaponStates(){
    const out = new Map();
    if(!window.combatTurn) return out;
    playerRooms.filter(r => r.weapon).forEach(room => out.set(room.id, combatTurn.getWeaponState(room.id)));
    return out;
  }

  function sameWeaponState(a,b){
    return a?.mode === b?.mode &&
      Number(a?.remaining ?? -1) === Number(b?.remaining ?? -1) &&
      Number(a?.shotsLeft ?? -1) === Number(b?.shotsLeft ?? -1);
  }

  function reassertQuickLoadedGuns(){
    if(!window.combatTurn || !window.combatUtility) return;
    (combatUtility.quickLoadedTargets?.() || []).forEach(id => {
      const room = playerRoom(id);
      if(!room || room.hp <= 0) return;
      if(!combatTurn.isReady(id)) combatTurn.setReady(id);
      room.loading = false;
    });
  }

  function restoreCadenceAfterMove(snapshot){
    if(window.combatTurn?.resolving || window.combatEnded) return;
    let changed = false;
    snapshot.forEach((before,id) => {
      const room = playerRoom(id);
      if(!room || room.hp <= 0) return;
      const after = combatTurn.getWeaponState(id);
      if(sameWeaponState(before,after)) return;
      combatTurn.setWeaponState(id,before);
      changed = true;
    });
    reassertQuickLoadedGuns();
    playerRooms.filter(r => r.weapon).forEach(room => { room.loading = !combatTurn.isReady(room.id); });
    if(changed) refresh();
  }

  function scheduleMovementInvariant(snapshot){
    requestAnimationFrame(() => restoreCadenceAfterMove(snapshot));
  }

  window.addEventListener('pointerdown', e => {
    const move = e.target.closest?.('#moveAft,#moveFore');
    if(!move || window.combatTurn?.resolving) return;
    scheduleMovementInvariant(snapshotPlayerWeaponStates());
  }, true);

  window.addEventListener('keydown', e => {
    if(e.repeat || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') || window.combatTurn?.resolving) return;
    scheduleMovementInvariant(snapshotPlayerWeaponStates());
  }, true);

  // Before any player-room interaction, make Quick Load authoritative again. This keeps old
  // room.loading readers harmless even if a refresh layer touched the compatibility flag.
  window.addEventListener('pointerdown', e => {
    if(!e.target.closest?.('.room[data-side="player"]')) return;
    reassertQuickLoadedGuns();
    playerRooms.filter(r => r.weapon).forEach(room => { room.loading = !combatTurn.isReady(room.id); });
  }, true);

  // Some older target feedback says only "Cancelled" when the player's shot is actually
  // cancelling an ENEMY action. Make the subject explicit so it cannot be mistaken for the
  // player's freshly Quick-Loaded cannon being cancelled.
  function clarifyEnemyCancellationTooltips(){
    enemyGrid.querySelectorAll('.range-tooltip').forEach(tip => {
      if((tip.textContent || '').trim() === 'Cancelled') tip.textContent = 'Enemy action cancelled';
    });
  }
  new MutationObserver(clarifyEnemyCancellationTooltips).observe(enemyGrid,{childList:true,subtree:true});

  // -------------------------------------------------------------------------
  // 3) Persistent development combat log.
  // Older turn code clears the visible log at resolution start and on R. Archive every line
  // by stable id and restore the full history whenever such a clear occurs.
  // -------------------------------------------------------------------------
  const logLines = stage.querySelector('.v3-log-lines');
  const logArchive = [];
  const logIds = new Set();
  let logSerial = 0;
  let restoringLog = false;

  function archiveLine(node){
    if(!(node instanceof Element) || !node.matches('.v3-log-line')) return;
    if(!node.dataset.v23LogId) node.dataset.v23LogId = `log-${++logSerial}`;
    const id = node.dataset.v23LogId;
    if(logIds.has(id)) return;
    logIds.add(id);
    logArchive.push({id, html:node.outerHTML});
  }

  function archiveTree(node){
    if(!(node instanceof Element)) return;
    archiveLine(node);
    node.querySelectorAll?.('.v3-log-line').forEach(archiveLine);
  }

  function restoreFullLog(){
    if(!logLines || restoringLog || !logArchive.length) return;
    const present = new Set([...logLines.querySelectorAll('.v3-log-line')].map(n => n.dataset.v23LogId).filter(Boolean));
    if(logArchive.every(entry => present.has(entry.id))) return;
    restoringLog = true;
    logLines.innerHTML = logArchive.map(entry => entry.html).join('');
    logLines.scrollTop = logLines.scrollHeight;
    restoringLog = false;
  }

  if(logLines){
    logLines.querySelectorAll('.v3-log-line').forEach(archiveLine);
    new MutationObserver(records => {
      if(restoringLog) return;
      let removal = false;
      records.forEach(record => {
        record.addedNodes.forEach(archiveTree);
        record.removedNodes.forEach(node => { archiveTree(node); removal = true; });
      });
      if(removal) queueMicrotask(restoreFullLog);
    }).observe(logLines,{childList:true});
  }

  // Expose the regression state for dev testing without changing gameplay resources yet.
  window.combatPlanningState = {
    currentEnemyProjection(){
      try{return enemyIntentDistribution(playerIntentDistribution());}
      catch{return null;}
    },
    reassertQuickLoads:reassertQuickLoadedGuns,
    restoreLog:restoreFullLog,
    get archivedLogLines(){return logArchive.length;},
    get turn(){return currentTurn();}
  };

  const baseRefresh = refresh;
  refresh = function(){
    reassertQuickLoadedGuns();
    baseRefresh();
    reassertQuickLoadedGuns();
    clarifyEnemyCancellationTooltips();
  };

  refresh();
})();