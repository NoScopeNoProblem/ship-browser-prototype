(() => {
  const utility = {
    selected: null,
    used: { p_carp:false, p_mag:false },
    rollback: [],
    wasResolving: document.body.classList.contains('v3-resolving')
  };

  function resolving(){ return !!(window.combatTurn && combatTurn.resolving); }
  function roomById(id){ return playerRooms.find(r => r.id === id) || null; }
  function utilityRoom(id){ return id === 'p_carp' || id === 'p_mag'; }

  function eligibleTargets(id){
    if(id === 'p_carp'){
      return playerRooms.filter(r => r.hp > 0 && r.hp < r.max);
    }
    if(id === 'p_mag'){
      return playerRooms.filter(r => r.weapon && r.hp > 0 && r.loading);
    }
    return [];
  }

  function tooltip(el, text){
    if(!el) return;
    showRoomTooltip(el, text);
  }

  function clearUtilitySelection(){
    utility.selected = null;
  }

  function selectUtility(id, el){
    const room = roomById(id);
    if(!room || room.hp <= 0){
      clearUtilitySelection();
      tooltip(el, 'Disabled');
      refresh();
      return;
    }
    if(utility.used[id]){
      clearUtilitySelection();
      tooltip(el, 'Used this turn');
      refresh();
      return;
    }
    const targets = eligibleTargets(id);
    if(!targets.length){
      clearUtilitySelection();
      tooltip(el, id === 'p_carp' ? 'Nothing to repair' : 'No guns loading');
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
    if(!source || !target || utility.used[sourceId]) return false;
    if(!eligibleTargets(sourceId).some(r => r.id === targetId)) return false;

    if(sourceId === 'p_carp'){
      utility.rollback.push({type:'repair', targetId, hp:target.hp});
      target.hp = Math.min(target.max, target.hp + 1);
    } else if(sourceId === 'p_mag'){
      if(!window.combatTurn) return false;
      utility.rollback.push({type:'reload', targetId, weaponState:combatTurn.getWeaponState(targetId)});
      combatTurn.setReady(targetId);
      target.loading = false;
    }

    utility.used[sourceId] = true;
    utility.selected = null;
    state.hoveredWeapon = null;
    state.hoverIntent = null;
    refresh();
    const targetEl = getEntityElement('player', targetId);
    tooltip(targetEl, sourceId === 'p_carp' ? 'Repaired +1' : 'Reloaded');
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
    utility.used.p_carp = false;
    utility.used.p_mag = false;
    utility.selected = null;
  }

  function decorateUtilities(){
    document.querySelectorAll('.utility-used-badge').forEach(n => n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable').forEach(el => {
      el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable');
    });

    ['p_carp','p_mag'].forEach(id => {
      const room = roomById(id);
      const el = getEntityElement('player', id);
      if(!room || !el) return;
      if(utility.used[id]){
        el.classList.add('utility-used');
        const badge = document.createElement('div');
        badge.className = 'utility-used-badge';
        badge.innerHTML = '<span class="tick">✓</span> USED';
        el.appendChild(badge);
      } else if(room.hp <= 0 || !eligibleTargets(id).length){
        el.classList.add('utility-unavailable');
      }
    });

    if(utility.selected){
      const sourceEl = getEntityElement('player', utility.selected);
      if(sourceEl) sourceEl.classList.add('utility-selected');
      eligibleTargets(utility.selected).forEach(target => {
        const el = getEntityElement('player', target.id);
        if(el) el.classList.add('utility-target');
      });
      weaponInfo.textContent = utility.selected === 'p_carp' ? 'Carpenter' : 'Magazine';
      targetInfo.textContent = utility.selected === 'p_carp'
        ? 'Select one damaged friendly room to repair 1 pip.'
        : 'Select one loading friendly gun to reload immediately.';
    }
  }

  const baseRefresh = refresh;
  refresh = function(){
    baseRefresh();
    decorateUtilities();
  };

  // Utility rooms and their friendly targets own clicks while selected. Invalid clicks
  // cancel the temporary state rather than falling through into another room action.
  stage.addEventListener('click', e => {
    if(resolving() || state.exterior) return;
    const roomEl = e.target.closest && e.target.closest('.room[data-side="player"]');
    const id = roomEl ? roomEl.dataset.id : null;

    if(utility.selected){
      e.preventDefault();
      e.stopImmediatePropagation();
      const selected = utility.selected;
      if(id && applyUtility(selected, id)) return;
      utility.selected = null;
      refresh();
      return;
    }

    if(id && utilityRoom(id)){
      e.preventDefault();
      e.stopImmediatePropagation();
      selectUtility(id, roomEl);
    }
  }, true);

  // Clicking elsewhere in the combat panel cancels a utility selection.
  document.addEventListener('click', e => {
    if(!utility.selected || resolving()) return;
    if(stage.contains(e.target)) return;
    utility.selected = null;
    refresh();
  }, true);

  moveAft.addEventListener('click', () => { if(utility.selected){ utility.selected=null; refresh(); } });
  moveFore.addEventListener('click', () => { if(utility.selected){ utility.selected=null; refresh(); } });

  // Range safety: an intent is only valid if its fixed world-space aim falls inside
  // the source weapon's real arc. This specifically prevents a Repeater (arc 1)
  // from being re-aimed at a world column more than one column away on a new turn.
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

  // Reset one-use room actions when a new turn begins. Their effects are committed
  // once End Turn resolves, so only R rolls them back during the planning phase.
  const observer = new MutationObserver(() => {
    const now = document.body.classList.contains('v3-resolving');
    if(!utility.wasResolving && now){
      utility.selected = null;
    }
    if(utility.wasResolving && !now){
      utility.used.p_carp = false;
      utility.used.p_mag = false;
      utility.rollback = [];
      utility.selected = null;
      retargetEnemyIntentsInRange();
      refresh();
    }
    utility.wasResolving = now;
  });
  observer.observe(document.body, {attributes:true, attributeFilter:['class']});

  // R restores planning-phase Carpenter/Magazine effects as well as movement/intents.
  window.addEventListener('keydown', e => {
    if(e.code === 'KeyR' && !e.repeat && !resolving()){
      rollbackUtilityEffects();
      setTimeout(refresh, 0);
    } else if((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyH') && utility.selected){
      utility.selected = null;
    }
  }, true);

  retargetEnemyIntentsInRange();
  refresh();
})();
