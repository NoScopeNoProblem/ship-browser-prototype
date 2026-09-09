(() => {
  // v19: last-mile readability safeguards. Loaded last so these are presentation-only.
  const previousSetTimeout = window.setTimeout.bind(window);
  const quickLoadSeen = new Set();

  // QUICK LOAD is strategically important. Give this beat substantially more dwell time than
  // ordinary intentions, on top of the general intention pacing already in v12.
  window.setTimeout = function(fn, delay = 0, ...args){
    const d = Number(delay) || 0;
    const detail = stage?.querySelector('.v11-intent-detail');
    const quickLoadBeat = document.body.classList.contains('v11-intent-preview-active') &&
      /^QUICK LOAD\b/i.test(detail?.textContent || '') && d >= 180 && d <= 1300;
    return previousSetTimeout(fn, quickLoadBeat ? Math.round(d * 1.45) : d, ...args);
  };

  function currentTurn(){ return window.combatTurn?.turn || 1; }

  function clearQuickLoadVisuals(){
    document.querySelectorAll('.v19-quickload-pop').forEach(n => n.remove());
    document.querySelectorAll('.v19-quickload-flash,.v19-quickload-source').forEach(el =>
      el.classList.remove('v19-quickload-flash','v19-quickload-source')
    );
  }

  function animateQuickLoadIntent(){
    if(!document.body.classList.contains('v11-intent-preview-active')) return;
    const detail = stage.querySelector('.v11-intent-detail');
    if(!/^QUICK LOAD\b/i.test(detail?.textContent || '')) return;
    const chips = [...enemyGrid.querySelectorAll('.v11-enemy-action-chip.quickLoad:not(.cancelled)')];
    const chip = chips[chips.length - 1];
    const room = chip?.closest('.room[data-side="enemy"]');
    if(!room) return;

    const key = `${currentTurn()}:${room.dataset.id}`;
    if(quickLoadSeen.has(key)) return;
    quickLoadSeen.add(key);

    const action = (window.enemyAI?.currentActions?.() || window.enemyActionIntents || [])
      .filter(a => a.actionType === 'quickLoad' && a.turn === currentTurn() && a.targetId === room.dataset.id)
      .pop();
    const source = action ? getEntityElement('enemy', action.sourceId) : null;

    room.querySelectorAll('.v19-quickload-pop').forEach(n => n.remove());
    const pop = document.createElement('div');
    pop.className = 'v19-quickload-pop';
    pop.innerHTML = '<span>↻</span><b>QUICK LOAD</b>';
    pop.title = 'Enemy Magazine is Quick Loading this cannon';
    room.appendChild(pop);

    room.classList.remove('v19-quickload-flash');
    source?.classList.remove('v19-quickload-source');
    void room.offsetWidth;
    room.classList.add('v19-quickload-flash');
    source?.classList.add('v19-quickload-source');

    previousSetTimeout(() => {
      pop.remove();
      room.classList.remove('v19-quickload-flash');
      source?.classList.remove('v19-quickload-source');
    }, 1050);
  }

  function pipContainer(side,id){
    if(id === playerMast.id) return playerMastPips;
    if(id === enemyMast.id) return enemyMastPips;
    return getEntityElement(side,id)?.querySelector('.pips') || null;
  }

  // Keep collateral damage as ✹ even if a later refresh/decorator rebuilt the same pip as
  // an ordinary cannon crosshair.
  function enforceExplosionMarkers(){
    if(window.combatEnded || window.combatTurn?.resolving) return;
    let playerState, enemyState;
    try{
      playerState = playerIntentDistribution();
      enemyState = enemyIntentDistribution(playerState);
    }catch{return;}

    [['enemy',playerState],['player',enemyState]].forEach(([side,dist]) => {
      (dist?.explosions || new Map()).forEach((count,id) => {
        if(count <= 0) return;
        const container = pipContainer(side,id); if(!container) return;
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

  function clearMastMisses(){
    document.querySelectorAll('.v19-mast-miss-marker,.v18-mast-miss-marker').forEach(n => n.remove());
  }

  function sourceDisabledByPlayerPlan(source){
    try{return source.hp - (playerIntentDistribution()?.hits?.get(source.id) || 0) <= 0;}
    catch{return false;}
  }

  // Do not depend on generic missMap. If the enemy aimed at the Mast's start-of-turn world
  // column and the player has manoeuvred away, that is explicitly a MISS.
  function decorateMastMisses(){
    clearMastMisses();
    if(window.combatEnded || window.combatTurn?.resolving || document.body.classList.contains('v11-intent-preview-active')) return;

    const turnStart = state.turnStartMast ?? window.combatTurn?.startMast ?? state.playerMastTrack;
    if(state.playerMastTrack === turnStart) return;

    const mastShots = enemyIntents.filter(intent => {
      const source = sourceEntity('enemy', intent.sourceId);
      if(!source || source.hp <= 0 || !source.weapon || intent.inactive) return false;
      if(!window.combatTurn?.isReady(source.id) || sourceDisabledByPlayerPlan(source)) return false;
      const aimedAtMast = intent.logicalTargetId === playerMast.id || intent.lane === 'mast';
      if(!aimedAtMast) return false;
      const range = weapons[source.weapon]?.range ?? weapons[source.weapon]?.arc ?? 0;
      return Math.abs(turnStart - sourceWorld('enemy',source)) <= range;
    });
    if(!mastShots.length) return;

    mastShots.forEach(intent =>
      stage.querySelectorAll(`.miss-marker[data-source-id="${intent.sourceId}"]`).forEach(n => n.remove())
    );

    const sr = stage.getBoundingClientRect(), pg = playerGrid.getBoundingClientRect();
    const x = worldColX(turnStart) + ROOM_W()/2;
    const baseY = pg.top - sr.top - 26;

    mastShots.forEach((intent,index) => {
      const source = sourceEntity('enemy', intent.sourceId); if(!source) return;
      const marker = document.createElement('div');
      marker.className = 'v19-mast-miss-marker';
      marker.dataset.sourceId = intent.sourceId;
      marker.style.left = `${x}px`;
      marker.style.top = `${baseY - index*32}px`;
      marker.innerHTML = `${iconMarkup(source.weapon, enemySuffix[source.id] || '', true)}<b>MISS</b>`;
      marker.title = `${weapons[source.weapon]?.name || 'Enemy cannon'} missed the Mast after manoeuvre`;
      marker.addEventListener('mouseenter', () => beginIntentHover('enemy', intent.sourceId));
      marker.addEventListener('mouseleave', endIntentHover);
      stage.appendChild(marker);
    });
  }

  function decorate(){
    // Enemy repair intention is already represented in the health row by its green ♥+ pip.
    enemyGrid.querySelectorAll('.v11-enemy-action-chip.repair').forEach(n => n.remove());
    enforceExplosionMarkers();
    decorateMastMisses();
    animateQuickLoadIntent();
  }

  const baseRefresh = refresh;
  refresh = function(){ baseRefresh(); decorate(); };

  const detail = stage.querySelector('.v11-intent-detail');
  if(detail) new MutationObserver(() => requestAnimationFrame(animateQuickLoadIntent))
    .observe(detail, {childList:true, subtree:true, characterData:true});

  moveAft.addEventListener('click', () => requestAnimationFrame(refresh));
  moveFore.addEventListener('click', () => requestAnimationFrame(refresh));
  window.addEventListener('keydown', e => {
    if(e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyR') requestAnimationFrame(refresh);
  }, true);
  window.addEventListener('resize', () => requestAnimationFrame(decorateMastMisses));
  window.addEventListener('combat-ended', () => { clearMastMisses(); clearQuickLoadVisuals(); });

  refresh();
})();
