(() => {
  // v19: reinforce three high-value combat reads without changing combat rules.
  const previousSetTimeout = window.setTimeout.bind(window);

  // Quick Load is strategically important, so give that specific preview beat extra dwell time.
  window.setTimeout = function(fn, delay = 0, ...args){
    const d = Number(delay) || 0;
    const quickLoadBeat = document.body.classList.contains('v11-intent-preview-active') &&
      /^QUICK LOAD\b/i.test(stage.querySelector('.v11-intent-detail')?.textContent || '');
    const paced = quickLoadBeat && d >= 180 && d <= 1300 ? Math.round(d * 1.45) : d;
    return previousSetTimeout(fn, paced, ...args);
  };

  function currentTurn(){ return window.combatTurn?.turn || 1; }

  function clearQuickLoadBeat(){
    document.querySelectorAll('.v19-quickload-active').forEach(el => el.classList.remove('v19-quickload-active'));
    document.querySelectorAll('.v19-quickload-source').forEach(el => el.classList.remove('v19-quickload-source'));
    document.querySelectorAll('.v19-quickload-spin').forEach(el => el.remove());
  }

  function syncQuickLoadBeat(){
    clearQuickLoadBeat();
    if(!document.body.classList.contains('v11-intent-preview-active')) return;
    const detail = stage.querySelector('.v11-intent-detail');
    if(!/^QUICK LOAD\b/i.test(detail?.textContent || '')) return;

    const chips = [...enemyGrid.querySelectorAll('.v11-enemy-action-chip.quickLoad:not(.cancelled)')];
    const chip = chips[chips.length - 1];
    const targetEl = chip?.closest('.room[data-side="enemy"]');
    if(!targetEl) return;

    const action = (window.enemyAI?.currentActions?.() || window.enemyActionIntents || [])
      .filter(a => a.actionType === 'quickLoad' && a.turn === currentTurn() && a.targetId === targetEl.dataset.id)
      .pop();
    const sourceEl = action ? getEntityElement('enemy', action.sourceId) : null;

    targetEl.classList.add('v19-quickload-active');
    sourceEl?.classList.add('v19-quickload-source');
    const spin = document.createElement('div');
    spin.className = 'v19-quickload-spin';
    spin.innerHTML = '<span>↻</span><b>QUICK LOAD</b>';
    spin.title = 'Enemy Magazine is Quick Loading this cannon';
    targetEl.appendChild(spin);
  }

  const detailEl = stage.querySelector('.v11-intent-detail');
  if(detailEl){
    new MutationObserver(syncQuickLoadBeat).observe(detailEl,{childList:true,subtree:true,characterData:true});
  }
  new MutationObserver(()=>requestAnimationFrame(syncQuickLoadBeat)).observe(document.body,{attributes:true,attributeFilter:['class']});

  function pipContainer(side,id){
    if(id === playerMast.id) return playerMastPips;
    if(id === enemyMast.id) return enemyMastPips;
    return getEntityElement(side,id)?.querySelector('.pips') || null;
  }

  // Explosion damage must retain the warm ✹ marker after every later decorator has run.
  function enforceExplosionMarkers(){
    if(window.combatTurn?.resolving || window.combatEnded) return;
    let playerState, enemyState;
    try{
      playerState = playerIntentDistribution();
      enemyState = enemyIntentDistribution(playerState);
    }catch{return;}

    [['enemy',playerState],['player',enemyState]].forEach(([side,dist]) => {
      (dist?.explosions || new Map()).forEach((count,id) => {
        const container = pipContainer(side,id); if(!container || count <= 0) return;
        const candidates = [...container.querySelectorAll('span')].filter(p =>
          p.classList.contains('hit') || p.classList.contains('intent-crosshair') || p.classList.contains('explosion-hit')
        );
        for(let i=0;i<count && i<candidates.length;i++){
          const pip = candidates[candidates.length - 1 - i];
          pip.className = 'explosion-hit';
          pip.textContent = '✹';
          pip.title = 'Magazine explosion: +1 damage';
        }
      });
    });
  }

  function clearMastMiss(){ document.querySelectorAll('.v19-mast-miss').forEach(n => n.remove()); }
  function enemySourceDisabledByPlan(source){
    try{return source.hp - (playerIntentDistribution()?.hits?.get(source.id) || 0) <= 0;}catch{return false;}
  }

  // Do not depend on the generic missMap here. A Mast shot is a miss whenever the Mast has
  // left the world-column that was aimed at at the start of this planning turn.
  function renderMastMiss(){
    clearMastMiss();
    if(window.combatTurn?.resolving || window.combatEnded || document.body.classList.contains('v11-intent-preview-active')) return;
    const start = state.turnStartMast ?? window.combatTurn?.startMast ?? state.playerMastTrack;
    if(state.playerMastTrack === start) return;

    const mastShots = enemyIntents.filter(intent => {
      const source = sourceEntity('enemy',intent.sourceId);
      if(!source || !source.weapon || source.hp <= 0 || intent.inactive) return false;
      if(!window.combatTurn?.isReady(source.id)) return false;
      if(enemySourceDisabledByPlan(source)) return false;
      const aimedAtMast = intent.logicalTargetId === playerMast.id || intent.lane === 'mast';
      if(!aimedAtMast) return false;
      const range = weapons[source.weapon]?.range ?? weapons[source.weapon]?.arc ?? 0;
      return Math.abs(start - sourceWorld('enemy',source)) <= range;
    });
    if(!mastShots.length) return;

    // Remove any legacy marker for these same sources so there is one unmistakable MISS read.
    mastShots.forEach(intent => stage.querySelectorAll(`.miss-marker[data-source-id="${intent.sourceId}"]`).forEach(n => n.remove()));

    const sr = stage.getBoundingClientRect(), pg = playerGrid.getBoundingClientRect();
    const x = worldColX(start) + ROOM_W()/2;
    const baseY = pg.top - sr.top - 30;
    mastShots.forEach((intent,index) => {
      const source = sourceEntity('enemy',intent.sourceId); if(!source) return;
      const marker = document.createElement('div');
      marker.className = 'v19-mast-miss';
      marker.dataset.sourceId = intent.sourceId;
      marker.style.left = `${x}px`;
      marker.style.top = `${baseY - index*30}px`;
      marker.innerHTML = `${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<strong>MISS</strong>`;
      marker.title = `${weapons[source.weapon]?.name || 'Enemy cannon'} missed the Mast after your manoeuvre`;
      marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',intent.sourceId));
      marker.addEventListener('mouseleave',endIntentHover);
      stage.appendChild(marker);
    });
  }

  function decorate(){
    // Repair intention is already represented by the green heart in the health row.
    enemyGrid.querySelectorAll('.v11-enemy-action-chip.repair').forEach(n => n.remove());
    enforceExplosionMarkers();
    renderMastMiss();
    syncQuickLoadBeat();
  }

  const baseRefresh = refresh;
  refresh = function(){ baseRefresh(); decorate(); };

  moveAft.addEventListener('click',()=>requestAnimationFrame(refresh));
  moveFore.addEventListener('click',()=>requestAnimationFrame(refresh));
  window.addEventListener('keydown',e=>{
    if(e.code==='ArrowLeft'||e.code==='ArrowRight'||e.code==='KeyR') requestAnimationFrame(refresh);
  },true);
  window.addEventListener('resize',()=>requestAnimationFrame(renderMastMiss));
  window.addEventListener('combat-ended',()=>{clearQuickLoadBeat();clearMastMiss();});

  refresh();
})();
