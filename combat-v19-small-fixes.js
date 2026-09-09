(() => {
  // v19: small intent-readability fixes. Loaded last so these are presentation/state safeguards.
  const previousSetTimeout = window.setTimeout.bind(window);
  const quickLoadSeen = new Set();

  // Give QUICK LOAD a slightly longer beat than the rest of the already-paced intent sequence.
  window.setTimeout = function(fn, delay = 0, ...args){
    const d = Number(delay) || 0;
    const detail = stage?.querySelector('.v11-intent-detail');
    const quickLoadBeat = document.body.classList.contains('v11-intent-preview-active') &&
      /^QUICK LOAD\b/i.test(detail?.textContent || '') && d >= 180 && d <= 1100;
    return previousSetTimeout(fn, quickLoadBeat ? Math.round(d * 1.10) : d, ...args);
  };

  function animateQuickLoadIntent(){
    if(!document.body.classList.contains('v11-intent-preview-active')) return;
    const detail = stage.querySelector('.v11-intent-detail');
    if(!/^QUICK LOAD\b/i.test(detail?.textContent || '')) return;
    const chips = [...enemyGrid.querySelectorAll('.v11-enemy-action-chip.quickLoad:not(.cancelled)')];
    const chip = chips[chips.length - 1];
    const room = chip?.closest('.room[data-side="enemy"]');
    if(!room) return;
    const key = `${window.combatTurn?.turn || 1}:${room.dataset.id}`;
    if(quickLoadSeen.has(key)) return;
    quickLoadSeen.add(key);

    room.querySelectorAll('.v19-quickload-pop').forEach(n => n.remove());
    const pop = document.createElement('div');
    pop.className = 'v19-quickload-pop';
    pop.innerHTML = '<span>↻+</span><b>QUICK LOAD</b>';
    room.appendChild(pop);
    room.classList.remove('v19-quickload-flash');
    void room.offsetWidth;
    room.classList.add('v19-quickload-flash');
    previousSetTimeout(() => {
      pop.remove();
      room.classList.remove('v19-quickload-flash');
    }, 900);
  }

  function clearMastMisses(){
    document.querySelectorAll('.v19-mast-miss-marker,.v18-mast-miss-marker').forEach(n => n.remove());
  }

  function decorateMastMisses(){
    clearMastMisses();
    if(window.combatEnded || window.combatTurn?.resolving || document.body.classList.contains('v11-intent-preview-active')) return;

    let enemyState;
    try{ enemyState = enemyIntentDistribution(playerIntentDistribution()); }
    catch{ return; }

    const disabled = enemyState?.disabledSources || new Set();
    const turnStart = state.turnStartMast ?? window.combatTurn?.startMast ?? state.playerMastTrack;

    enemyIntents.forEach(intent => {
      const source = sourceEntity('enemy', intent.sourceId);
      if(!source || source.hp <= 0 || !source.weapon || intent.inactive) return;
      if(!window.combatTurn?.isReady(source.id) || disabled.has(source.id)) return;
      const aimedAtMast = intent.lane === 'mast' &&
        (intent.logicalTargetId === playerMast.id || intent.targetWorld === turnStart);
      if(!aimedAtMast || projectedEnemyImpact(intent)) return;

      // Keep older generic MISS markers for this source out of the way; this marker occupies
      // the vacated mast position above the hull, adjacent to the moved Mast.
      stage.querySelectorAll(`.miss-marker[data-source-id="${intent.sourceId}"]`).forEach(n => n.style.display = 'none');
      const sr = stage.getBoundingClientRect();
      const mr = playerMastBox.getBoundingClientRect();
      const marker = document.createElement('div');
      marker.className = 'v19-mast-miss-marker';
      marker.dataset.sourceId = intent.sourceId;
      marker.style.left = `${worldColX(intent.targetWorld) + ROOM_W()/2}px`;
      marker.style.top = `${mr.top - sr.top + Math.max(24, mr.height * .40)}px`;
      marker.innerHTML = `${iconMarkup(source.weapon, enemySuffix[source.id] || '', true)}<b>MISS</b>`;
      marker.title = `${weapons[source.weapon]?.name || 'Enemy cannon'} missed the Mast after manoeuvre`;
      marker.addEventListener('mouseenter', () => beginIntentHover('enemy', intent.sourceId));
      marker.addEventListener('mouseleave', endIntentHover);
      stage.appendChild(marker);
    });
  }

  function restoreGenericMissVisibility(){
    const mastSources = new Set([...document.querySelectorAll('.v19-mast-miss-marker')].map(n => n.dataset.sourceId));
    document.querySelectorAll('.miss-marker').forEach(n => {
      if(!mastSources.has(n.dataset.sourceId)) n.style.display = '';
    });
  }

  function decorate(){
    animateQuickLoadIntent();
    decorateMastMisses();
    restoreGenericMissVisibility();
  }

  const baseRefresh = refresh;
  refresh = function(){ baseRefresh(); decorate(); };

  const detail = stage.querySelector('.v11-intent-detail');
  if(detail) new MutationObserver(() => requestAnimationFrame(animateQuickLoadIntent))
    .observe(detail, {childList:true, subtree:true, characterData:true});

  moveAft.addEventListener('click', () => requestAnimationFrame(decorateMastMisses));
  moveFore.addEventListener('click', () => requestAnimationFrame(decorateMastMisses));
  window.addEventListener('keydown', e => {
    if(e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyR') requestAnimationFrame(decorateMastMisses);
  }, true);
  window.addEventListener('combat-ended', clearMastMisses);

  refresh();
})();
