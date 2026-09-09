(() => {
  const utility = {
    selected: null,
    used: {},
    rollback: [],
    wasResolving: document.body.classList.contains('v3-resolving')
  };

  function resolving(){ return !!(window.combatTurn && combatTurn.resolving); }
  function roomById(id){ return playerRooms.find(r => r.id === id) || null; }
  function isUtilityRoom(room){ return !!room && (room.actionType === 'repair' || room.actionType === 'quickLoad'); }
  function wasUsed(id){ return !!utility.used[id]; }

  function eligibleTargets(sourceOrId){
    const source = typeof sourceOrId === 'string' ? roomById(sourceOrId) : sourceOrId;
    if(!source) return [];
    if(source.actionType === 'repair'){
      return playerRooms.filter(r => r.hp > 0 && r.hp < r.max);
    }
    if(source.actionType === 'quickLoad'){
      return playerRooms.filter(r => r.weapon && r.hp > 0 && r.loading);
    }
    return [];
  }

  function tooltip(el, text){ if(el) showRoomTooltip(el, text); }
  function clearUtilitySelection(){ utility.selected = null; }

  function selectUtility(id, el){
    const room = roomById(id);
    if(!room || !isUtilityRoom(room)) return;
    if(room.hp <= 0){
      clearUtilitySelection();
      tooltip(el, 'Disabled');
      refresh();
      return;
    }
    if(wasUsed(id)){
      clearUtilitySelection();
      tooltip(el, 'Used this turn');
      refresh();
      return;
    }
    const targets = eligibleTargets(room);
    if(!targets.length){
      clearUtilitySelection();
      tooltip(el, room.actionType === 'repair' ? 'Nothing to repair' : 'No guns loading');
      refresh();
      return;
    }

    state.selectedWeaponId = null;
    state.hoveredWeapon = null;
    state.hoverIntent = null;
    utility.selected = utility.selected === id ? null : id;
    refresh();
  }

  function applyUtility(sourceId, targetId){
    const source = roomById(sourceId);
    const target = roomById(targetId);
    if(!source || !target || wasUsed(sourceId)) return false;
    if(!eligibleTargets(source).some(r => r.id === targetId)) return false;

    if(source.actionType === 'repair'){
      utility.rollback.push({type:'repair', targetId, hp:target.hp});
      target.hp = Math.min(target.max, target.hp + (source.repairAmount || 1));
    } else if(source.actionType === 'quickLoad'){
      if(!window.combatTurn) return false;
      utility.rollback.push({type:'reload', targetId, weaponState:combatTurn.getWeaponState(targetId)});
      // Quick Load creates a fresh loaded state. Nothing starts reloading again until
      // this weapon actually fires; leaving it unused preserves the loaded state.
      combatTurn.setReady(targetId);
      target.loading = false;
    }

    utility.used[sourceId] = true;
    utility.selected = null;
    state.hoveredWeapon = null;
    state.hoverIntent = null;
    refresh();
    const targetEl = getEntityElement('player', targetId);
    tooltip(targetEl, source.actionType === 'repair' ? 'Repaired +1' : 'Quick Load');
    return true;
  }

  function rollbackUtilityEffects(){
    for(let i=utility.rollback.length-1; i>=0; i--){
      const action = utility.rollback[i];
      if(action.type === 'repair'){
        const target = roomById(action.targetId);
        if(target) target.hp = action.hp;
      } else if(action.type === 'reload' && window.combatTurn){
        combatTurn.setWeaponState(action.targetId, action.weaponState);
      }
    }
    utility.rollback = [];
    utility.used = {};
    utility.selected = null;
  }

  function decorateUtilities(){
    document.querySelectorAll('.utility-used-badge').forEach(n => n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable').forEach(el => {
      el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable');
    });

    playerRooms.filter(isUtilityRoom).forEach(room => {
      const el = getEntityElement('player', room.id);
      if(!el) return;
      if(wasUsed(room.id)){
        el.classList.add('utility-used');
        const badge = document.createElement('div');
        badge.className = 'utility-used-badge';
        badge.innerHTML = '<span class="tick">✓</span> USED';
        el.appendChild(badge);
      } else if(room.hp <= 0 || !eligibleTargets(room).length){
        el.classList.add('utility-unavailable');
      }
    });

    if(utility.selected){
      const source = roomById(utility.selected);
      if(!source) return;
      const sourceEl = getEntityElement('player', utility.selected);
      if(sourceEl) sourceEl.classList.add('utility-selected');
      eligibleTargets(source).forEach(target => {
        const el = getEntityElement('player', target.id);
        if(el) el.classList.add('utility-target');
      });
      weaponInfo.textContent = source.actionType === 'repair' ? 'Carpenter' : 'Magazine — Quick Load';
      targetInfo.textContent = source.actionType === 'repair'
        ? 'Select one damaged friendly room to repair 1 pip.'
        : 'Select one loading friendly gun to Quick Load immediately.';
    }
  }

  const baseRefresh = refresh;
  refresh = function(){
    baseRefresh();
    decorateUtilities();
  };

  stage.addEventListener('click', e => {
    if(resolving() || state.exterior) return;
    const roomEl = e.target.closest && e.target.closest('.room[data-side="player"]');
    const id = roomEl ? roomEl.dataset.id : null;

    if(utility.selected){
      e.preventDefault();
      e.stopImmediatePropagation();
      const source = roomById(utility.selected);
      const target = id ? roomById(id) : null;
      if(source?.actionType === 'repair' && target && target.hp <= 0){
        utility.selected = null;
        refresh();
        tooltip(roomEl, 'Beyond repair');
        return;
      }
      const selected = utility.selected;
      if(id && applyUtility(selected, id)) return;
      utility.selected = null;
      refresh();
      return;
    }

    const room = id ? roomById(id) : null;
    if(room && isUtilityRoom(room)){
      e.preventDefault();
      e.stopImmediatePropagation();
      selectUtility(id, roomEl);
    }
  }, true);

  document.addEventListener('click', e => {
    if(!utility.selected || resolving()) return;
    if(stage.contains(e.target)) return;
    utility.selected = null;
    refresh();
  }, true);

  moveAft.addEventListener('click', () => { if(utility.selected){ utility.selected=null; refresh(); } });
  moveFore.addEventListener('click', () => { if(utility.selected){ utility.selected=null; refresh(); } });

  const baseEnemyIntentDistribution = enemyIntentDistribution;
  enemyIntentDistribution = function(playerState = playerIntentDistribution()){
    const saved = enemyIntents.slice();
    const active = saved.filter(intent => !intent.inactive && enemyIntentInRange(intent));
    enemyIntents.splice(0, enemyIntents.length, ...active);
    try {
      return baseEnemyIntentDistribution(playerState);
    } finally {
      enemyIntents.splice(0, enemyIntents.length, ...saved);
    }
  };

  function targetWorld(target){
    return target.kind === 'mast' ? state.playerMastTrack : playerWorldCol(target.col);
  }

  function retargetEnemyIntentsInRange(){
    for(let i=enemyIntents.length-1;i>=0;i--){
      if(!sourceEntity('enemy',enemyIntents[i].sourceId)) enemyIntents.splice(i,1);
    }

    enemyIntents.forEach(intent => {
      const source = sourceEntity('enemy', intent.sourceId);
      if(!source || !source.weapon || source.hp <= 0){ intent.inactive = true; return; }

      const candidates = getTargetsForWeapon('enemy', source).filter(t => t && t.hp > 0);
      if(!candidates.length){ intent.inactive = true; return; }

      const previous = intent.logicalTargetId ? sourceEntity('player', intent.logicalTargetId) : null;
      let target = previous && candidates.some(t => t.id === previous.id) ? previous : null;

      if(!target){
        const desiredRow = previous && Number.isFinite(previous.row) ? previous.row : (intent.lane === 'mast' ? null : intent.lane);
        const desiredWorld = Number.isFinite(intent.targetWorld) ? intent.targetWorld : sourceWorld('enemy', source);
        target = candidates.slice().sort((a,b) => {
          const aRow = Number.isFinite(a.row) ? a.row : null;
          const bRow = Number.isFinite(b.row) ? b.row : null;
          const aWorld = targetWorld(a), bWorld = targetWorld(b);
          const aPenalty = (desiredRow !== null && aRow !== desiredRow ? 4 : 0) + Math.abs(aWorld - desiredWorld);
          const bPenalty = (desiredRow !== null && bRow !== desiredRow ? 4 : 0) + Math.abs(bWorld - desiredWorld);
          return aPenalty - bPenalty;
        })[0];
      }

      intent.inactive = false;
      intent.logicalTargetId = target.id;
      if(target.kind === 'mast'){
        intent.lane = 'mast';
        intent.targetWorld = state.playerMastTrack;
      } else {
        intent.lane = target.row;
        intent.targetWorld = playerWorldCol(target.col);
      }
    });
  }

  const observer = new MutationObserver(() => {
    const now = document.body.classList.contains('v3-resolving');
    if(!utility.wasResolving && now){
      utility.selected = null;
    }
    if(utility.wasResolving && !now){
      state.turnStartMast = state.playerMastTrack;
      utility.used = {};
      utility.rollback = [];
      utility.selected = null;
      retargetEnemyIntentsInRange();
      refresh();
    }
    utility.wasResolving = now;
  });
  observer.observe(document.body, {attributes:true, attributeFilter:['class']});

  window.addEventListener('keydown', e => {
    if(e.code === 'KeyR' && !e.repeat && !resolving()){
      rollbackUtilityEffects();
      setTimeout(refresh, 0);
    } else if((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyH') && utility.selected){
      utility.selected = null;
    }
  }, true);

  window.combatUtility = {
    eligibleTargets,
    isUsed:id=>wasUsed(id),
    isAvailable(room){ return isUtilityRoom(room) && room.hp>0 && !wasUsed(room.id) && eligibleTargets(room).length>0; }
  };

  retargetEnemyIntentsInRange();
  refresh();
})();
