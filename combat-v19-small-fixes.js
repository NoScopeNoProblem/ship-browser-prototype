(() => {
  // v19: quick-load readability only. Damage typing and Mast misses are owned by v20.
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

  function decorate(){
    // Enemy repair intention is already represented in the health row by its green ♥+ pip.
    enemyGrid.querySelectorAll('.v11-enemy-action-chip.repair').forEach(n => n.remove());
    animateQuickLoadIntent();
  }

  const baseRefresh = refresh;
  refresh = function(){ baseRefresh(); decorate(); };

  const detail = stage.querySelector('.v11-intent-detail');
  if(detail) new MutationObserver(() => requestAnimationFrame(animateQuickLoadIntent))
    .observe(detail, {childList:true, subtree:true, characterData:true});

  window.addEventListener('combat-ended', clearQuickLoadVisuals);
  refresh();
})();
