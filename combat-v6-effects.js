(() => {
  const explodedMagazines = new Set();
  const lastHp = new Map();
  [...playerRooms, ...enemyRooms].forEach(r => lastHp.set(r.id, r.hp));

  function resolving(){ return !!(window.combatTurn && combatTurn.resolving); }
  function sideRooms(side){ return side === 'player' ? playerRooms : enemyRooms; }
  function emptyEnemyState(){
    return {
      hits:new Map(), dodges:new Map(), prevented:new Map(),
      targetMap:new Map(), preventedTargetMap:new Map(), missMap:[],
      disabledSources:new Set(), explosions:new Map()
    };
  }
  function emptyPlayerState(){ return {hits:new Map(), targetMap:new Map(), explosions:new Map()}; }

  function adjacentRooms(side, magazine){
    return sideRooms(side).filter(r =>
      r.id !== magazine.id &&
      Math.abs(r.col - magazine.col) <= 1 &&
      Math.abs(r.row - magazine.row) <= 1
    );
  }

  function addExplosionCollateral(side, base){
    const hits = new Map(base.hits || []);
    const explosions = new Map();
    sideRooms(side).filter(r => r.isMagazine && r.hp > 0).forEach(mag => {
      const direct = hits.get(mag.id) || 0;
      if(direct <= 0 || mag.hp - direct > 0) return;
      adjacentRooms(side, mag).forEach(room => {
        if(room.hp <= 0) return;
        hits.set(room.id, (hits.get(room.id)||0) + 1);
        explosions.set(room.id, (explosions.get(room.id)||0) + 1);
      });
    });
    return {...base, hits, explosions};
  }

  // Predict magazine collateral as part of the same deterministic planning state.
  // This means collateral can disable a gun before its shot, and vanishes when the
  // primary magazine hit is dodged/prevented.
  const basePlayerIntentDistribution = playerIntentDistribution;
  playerIntentDistribution = function(){
    if(resolving()) return emptyPlayerState();
    return addExplosionCollateral('enemy', basePlayerIntentDistribution());
  };

  const baseEnemyIntentDistribution = enemyIntentDistribution;
  enemyIntentDistribution = function(playerState = playerIntentDistribution()){
    if(resolving()) return emptyEnemyState();
    return addExplosionCollateral('player', baseEnemyIntentDistribution(playerState));
  };

  function pipContainer(side, id){
    if(id === enemyMast.id) return enemyMastPips;
    if(id === playerMast.id) return playerMastPips;
    const el = getEntityElement(side, id);
    return el ? el.querySelector('.pips') : null;
  }

  function markExplosionPips(side, explosionMap){
    explosionMap.forEach((count, id) => {
      const pips = pipContainer(side, id);
      if(!pips) return;
      const hitSpans = [...pips.querySelectorAll('.hit')];
      for(let i=0;i<count && i<hitSpans.length;i++){
        const span = hitSpans[hitSpans.length - 1 - i];
        span.className = 'explosion-hit';
        span.textContent = '✹';
        span.title = 'Magazine explosion: +1 damage';
      }
    });
  }

  function decorateDestroyedGuns(){
    document.querySelectorAll('.destroyed-gun-badge').forEach(n => n.remove());
    document.querySelectorAll('.destroyed-gun').forEach(n => n.classList.remove('destroyed-gun'));
    [...playerRooms, ...enemyRooms].filter(r => r.weapon && r.hp <= 0).forEach(room => {
      const side = room.id.startsWith('p_') ? 'player' : 'enemy';
      const el = getEntityElement(side, room.id);
      if(!el) return;
      el.classList.add('destroyed-gun');
      const badge = document.createElement('div');
      badge.className = 'destroyed-gun-badge';
      badge.innerHTML = '<span>✕</span><b>DISABLED</b>';
      el.appendChild(badge);
    });
  }

  function revealEnemy(room, revealedIds){
    if(!room || !room.hidden || room.revealed) return false;
    room.revealed = true;
    room.name = room.revealName || 'REVEALED ROOM';
    revealedIds.add(room.id);
    return true;
  }

  function appendExplosionLog(side, magazine, affected){
    const log = stage.querySelector('.v3-log-lines');
    if(!log || !affected.length) return;
    const line = document.createElement('div');
    line.className = 'v3-log-line';
    const sideClass = side === 'player' ? 'v3-log-player' : 'v3-log-enemy';
    const names = affected.map(r => r.name).join(', ');
    line.innerHTML = `<span class="${sideClass}">${magazine.name}</span> explodes: ${names} each take 1 damage.`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function processActualDamageTransitions(){
    if(!resolving()) return {rerender:false, revealed:new Set(), explosionEvents:[]};

    let rerender = false;
    const revealed = new Set();
    const explosionEvents = [];
    const queue = [];

    enemyRooms.forEach(room => {
      const before = lastHp.get(room.id);
      if(Number.isFinite(before) && room.hp < before){
        if(revealEnemy(room, revealed)) rerender = true;
      }
      if(room.isMagazine && Number.isFinite(before) && before > 0 && room.hp <= 0 && !explodedMagazines.has(room.id)) queue.push({side:'enemy', magazine:room});
    });
    playerRooms.forEach(room => {
      const before = lastHp.get(room.id);
      if(room.isMagazine && Number.isFinite(before) && before > 0 && room.hp <= 0 && !explodedMagazines.has(room.id)) queue.push({side:'player', magazine:room});
    });

    while(queue.length){
      const event = queue.shift();
      const mag = event.magazine;
      if(explodedMagazines.has(mag.id)) continue;
      explodedMagazines.add(mag.id);
      const affected = [];

      adjacentRooms(event.side, mag).forEach(room => {
        const before = room.hp;
        if(before <= 0) return;
        room.hp = Math.max(0, room.hp - 1);
        affected.push(room);
        rerender = true;
        if(event.side === 'enemy' && room.hp < before) revealEnemy(room, revealed);
        if(room.isMagazine && before > 0 && room.hp <= 0 && !explodedMagazines.has(room.id)) queue.push({side:event.side, magazine:room});
      });

      explosionEvents.push({side:event.side, magazine:mag, affected});
    }

    return {rerender, revealed, explosionEvents};
  }

  function showActualEffectNotes(revealed, explosionEvents){
    revealed.forEach(id => {
      const el = getEntityElement('enemy', id);
      if(el) showRoomTooltip(el, 'Revealed');
    });

    explosionEvents.forEach(event => {
      const magEl = getEntityElement(event.side, event.magazine.id);
      if(magEl) showRoomTooltip(magEl, 'Magazine explosion');
      event.affected.forEach(room => {
        const el = getEntityElement(event.side, room.id);
        if(!el) return;
        const icon = document.createElement('div');
        icon.className = 'actual-explosion-icon';
        icon.textContent = '✹';
        el.appendChild(icon);
        setTimeout(() => icon.remove(), 650);
      });
      setTimeout(() => appendExplosionLog(event.side, event.magazine, event.affected), 0);
    });
  }

  function updateLastHp(){
    [...playerRooms, ...enemyRooms].forEach(r => lastHp.set(r.id, r.hp));
  }

  const baseRefresh = refresh;
  refresh = function(){
    const actual = processActualDamageTransitions();
    if(actual.rerender) renderShips();
    baseRefresh();

    // During the resolve animation, only committed HP loss is shown. Suppressing
    // predictive intent here removes the brief double-count flash between shots.
    if(!resolving()){
      const playerState = playerIntentDistribution();
      const enemyState = enemyIntentDistribution(playerState);
      markExplosionPips('enemy', playerState.explosions || new Map());
      markExplosionPips('player', enemyState.explosions || new Map());
    }

    decorateDestroyedGuns();
    showActualEffectNotes(actual.revealed, actual.explosionEvents);
    updateLastHp();
  };

  // If an enemy intent ever drifts outside the source arc, suppress it immediately.
  // The v5 retarget pass will choose a legal target before the next turn begins.
  const baseProjectedEnemyImpact = projectedEnemyImpact;
  projectedEnemyImpact = function(intent){
    if(!enemyIntentInRange(intent)) return null;
    return baseProjectedEnemyImpact(intent);
  };

  refresh();
})();
