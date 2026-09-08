(() => {
  const v4 = { zHeld:false, hoverSourceId:null, hoverSide:null };

  const overlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('class','v4-arc-overlay');
  overlay.setAttribute('aria-hidden','true');
  stage.appendChild(overlay);

  function weaponReady(room){
    return !!(room && room.weapon && room.hp > 0 && !room.loading);
  }

  const baseGetTargetsForWeapon = getTargetsForWeapon;
  getTargetsForWeapon = function(side, weaponEntity){
    const targets = baseGetTargetsForWeapon(side, weaponEntity);
    // Players cannot deliberately target destroyed enemy sections. Enemy fire still
    // uses physical world-space collision, so movement can slide a wrecked room into a shot.
    if(side === 'player') return targets.filter(t => t && t.hp > 0);
    return targets;
  };

  function clearV4Visuals(){
    overlay.innerHTML = '';
    document.querySelectorAll('.v4-source-focus,.v4-target-focus,.v4-overview-target,.v4-focus-miss').forEach(el => {
      el.classList.remove('v4-source-focus','v4-target-focus','v4-overview-target','v4-focus-miss');
    });
  }

  function drawV4Arc(side, source, overview=false){
    if(!source || !source.weapon || !weaponReady(source)) return;
    const sourceEl = getEntityElement(side, source.id);
    if(!sourceEl) return;

    const targetGrid = side === 'enemy' ? playerGrid : enemyGrid;
    const targetMast = side === 'enemy' ? playerMastBox : enemyMastBox;
    const sr = stage.getBoundingClientRect();
    const src = sourceEl.getBoundingClientRect();
    const gr = targetGrid.getBoundingClientRect();
    const mr = targetMast.getBoundingClientRect();
    const weapon = weapons[source.weapon];
    const sw = sourceWorld(side, source);

    const sx = src.left - sr.left + src.width/2;
    const sy = src.top - sr.top + src.height/2;
    const minY = Math.min(gr.top, mr.top) - sr.top;
    const maxY = gr.bottom - sr.top;
    const above = sy < minY;
    const nearY = above ? minY : maxY;
    const farY = above ? maxY : minY;
    const minX = worldColX(sw - weapon.arc);
    const maxX = worldColX(sw + weapon.arc + 1);

    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', [[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(p=>p.join(',')).join(' '));
    poly.setAttribute('class', `v4-arc ${side}${overview?' overview':''}`);
    overlay.appendChild(poly);
  }

  function enemyIntentFor(sourceId){
    return enemyIntents.find(i => i.sourceId === sourceId) || null;
  }

  function showSourceIntent(sourceId){
    const source = sourceEntity('enemy', sourceId);
    if(!source) return;
    const sourceEl = getEntityElement('enemy', source.id);
    if(sourceEl) sourceEl.classList.add('v4-source-focus');
    if(!weaponReady(source)) return;

    drawV4Arc('enemy', source, false);
    const intent = enemyIntentFor(source.id);
    if(!intent) return;
    const impact = projectedEnemyImpact(intent);
    if(impact){
      const targetEl = getEntityElement('player', impact.id);
      if(targetEl) targetEl.classList.add('v4-target-focus');
    } else {
      const miss = stage.querySelector(`.miss-marker[data-source-id="${source.id}"]`);
      if(miss) miss.classList.add('v4-focus-miss');
    }
  }

  function showEnemyOverview(){
    enemyRooms.filter(r => r.weapon && weaponReady(r)).forEach(r => drawV4Arc('enemy', r, true));
    const stateNow = enemyIntentDistribution(playerIntentDistribution());
    stateNow.targetMap.forEach((_,id) => {
      const el = getEntityElement('player', id);
      if(el) el.classList.add('v4-overview-target');
    });
  }

  function renderV4(){
    clearV4Visuals();
    if(v4.zHeld) showEnemyOverview();
    if(v4.hoverSourceId && v4.hoverSide === 'enemy') showSourceIntent(v4.hoverSourceId);
  }

  function decorateLoading(){
    document.querySelectorAll('.loading-v4').forEach(n => n.remove());
    [...playerRooms, ...enemyRooms].filter(r => r.weapon && r.hp > 0 && r.loading).forEach(r => {
      const el = getEntityElement(r.id.startsWith('p_') ? 'player' : 'enemy', r.id);
      if(!el) return;
      const badge = document.createElement('div');
      badge.className = 'loading-v4';
      badge.innerHTML = '<span class="wheel">↻</span><span>LOAD</span>';
      el.appendChild(badge);
    });
  }

  const baseRefresh = refresh;
  refresh = function(){
    baseRefresh();
    decorateLoading();
    renderV4();
  };

  function setHover(sourceId, side='enemy'){
    v4.hoverSourceId = sourceId;
    v4.hoverSide = side;
    renderV4();
  }
  function clearHover(sourceId=null){
    if(sourceId && v4.hoverSourceId !== sourceId) return;
    v4.hoverSourceId = null;
    v4.hoverSide = null;
    renderV4();
  }

  // Intent icon hover: always trace the exact gun, even if the parent room redraws.
  stage.addEventListener('pointerover', e => {
    const chip = e.target.closest && e.target.closest('.intent-chip[data-source-id]');
    if(chip && (chip.dataset.side || 'enemy') === 'enemy'){
      if(!chip.contains(e.relatedTarget)) setHover(chip.dataset.sourceId, 'enemy');
      return;
    }

    const room = e.target.closest && e.target.closest('.room[data-side="enemy"].weapon');
    if(room && !room.contains(e.relatedTarget)) setHover(room.dataset.id, 'enemy');
  }, true);

  stage.addEventListener('pointerout', e => {
    const chip = e.target.closest && e.target.closest('.intent-chip[data-source-id]');
    if(chip && (chip.dataset.side || 'enemy') === 'enemy'){
      if(!chip.contains(e.relatedTarget)) clearHover(chip.dataset.sourceId);
      return;
    }
    const room = e.target.closest && e.target.closest('.room[data-side="enemy"].weapon');
    if(room && !room.contains(e.relatedTarget)) clearHover(room.dataset.id);
  }, true);

  // Own Z at window-capture level. Older listeners may run first on the same node,
  // but stopPropagation does not block this listener; we then suppress legacy overview.
  window.addEventListener('keydown', e => {
    if(e.code !== 'KeyZ' || e.repeat || document.body.classList.contains('v3-resolving')) return;
    e.preventDefault();
    v4.zHeld = true;
    state.overview = null;
    renderV4();
  }, true);
  window.addEventListener('keyup', e => {
    if(e.code !== 'KeyZ') return;
    e.preventDefault();
    v4.zHeld = false;
    state.overview = null;
    renderV4();
  }, true);

  function tooltipAt(el, text){
    const r = el.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.className = 'v4-cannot-target';
    tip.textContent = text;
    tip.style.left = `${r.left+r.width/2}px`;
    tip.style.top = `${r.top+10}px`;
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 820);
  }

  // Destroyed enemy rooms/mast are never deliberate player targets.
  stage.addEventListener('click', e => {
    if(!state.selectedWeaponId) return;
    const roomEl = e.target.closest && e.target.closest('.room[data-side="enemy"]');
    const mastEl = e.target.closest && e.target.closest('#enemyMastBox');
    const target = roomEl ? sourceEntity('enemy', roomEl.dataset.id) : (mastEl ? enemyMast : null);
    const targetEl = roomEl || mastEl;
    if(!target || !targetEl || target.hp > 0) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    state.selectedWeaponId = null;
    state.hoveredWeapon = null;
    tooltipAt(targetEl, 'Cannot target');
    refresh();
  }, true);

  function nearestLivingTarget(deadTarget){
    const living = [...playerRooms, playerMast].filter(t => t.hp > 0);
    if(!living.length) return null;
    const desiredCol = deadTarget && deadTarget.kind === 'mast' ? PLAYER_MAST_LOCAL_COL : (deadTarget && Number.isFinite(deadTarget.col) ? deadTarget.col : PLAYER_MAST_LOCAL_COL);
    const desiredRow = deadTarget && Number.isFinite(deadTarget.row) ? deadTarget.row : null;
    return living.sort((a,b) => {
      const acol = a.kind === 'mast' ? PLAYER_MAST_LOCAL_COL : a.col;
      const bcol = b.kind === 'mast' ? PLAYER_MAST_LOCAL_COL : b.col;
      const arow = Number.isFinite(a.row) ? a.row : null;
      const brow = Number.isFinite(b.row) ? b.row : null;
      const ap = (desiredRow!==null && arow!==desiredRow ? 10 : 0) + Math.abs(acol-desiredCol);
      const bp = (desiredRow!==null && brow!==desiredRow ? 10 : 0) + Math.abs(bcol-desiredCol);
      return ap-bp;
    })[0];
  }

  function retargetAwayFromDestroyed(){
    const left = state.playerMastTrack - PLAYER_MAST_LOCAL_COL;
    enemyIntents.forEach(intent => {
      let target = intent.logicalTargetId ? sourceEntity('player', intent.logicalTargetId) : null;
      if(!target || target.hp <= 0){
        target = nearestLivingTarget(target);
        intent.logicalTargetId = target ? target.id : null;
      }
      if(!target) return;
      if(target.kind === 'mast'){
        intent.lane = 'mast';
        intent.targetWorld = state.playerMastTrack;
      } else {
        intent.lane = target.row;
        intent.targetWorld = left + target.col;
      }
    });
  }

  // When resolution ends, enemy AI chooses only living rooms for the new turn.
  let wasResolving = document.body.classList.contains('v3-resolving');
  const observer = new MutationObserver(() => {
    const nowResolving = document.body.classList.contains('v3-resolving');
    if(wasResolving && !nowResolving){
      retargetAwayFromDestroyed();
      refresh();
    }
    wasResolving = nowResolving;
  });
  observer.observe(document.body, {attributes:true, attributeFilter:['class']});

  // Sanity pass: ensure a selected friendly gun visually includes a live enemy mast.
  const baseRenderSelection = renderSelection;
  renderSelection = function(){
    baseRenderSelection();
    if(!state.selectedWeaponId || enemyMast.hp <= 0) return;
    const weapon = sourceEntity('player', state.selectedWeaponId);
    if(!weapon) return;
    if(getTargetsForWeapon('player', weapon).some(t => t.id === enemyMast.id)) enemyMastBox.classList.add('valid-target');
  };

  refresh();
})();
