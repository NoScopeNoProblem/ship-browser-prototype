(() => {
  function resolving(){ return !!(window.combatTurn && combatTurn.resolving); }

  function enemyTargetElementFromEvent(e){
    const room = e.target.closest && e.target.closest('.room[data-side="enemy"]');
    if(room) return room;
    const mast = e.target.closest && e.target.closest('#enemyMastBox');
    return mast || null;
  }

  function selectedWeapon(){
    return state.selectedWeaponId ? sourceEntity('player', state.selectedWeaponId) : null;
  }

  function targetIdFromElement(el){
    if(!el) return null;
    if(el.id === 'enemyMastBox') return enemyMast.id;
    return el.dataset ? el.dataset.id : null;
  }

  function decorateTargetMode(){
    document.querySelectorAll('.target-mode-candidate,.target-hover-valid').forEach(el => {
      el.classList.remove('target-mode-candidate','target-hover-valid');
    });

    const weapon = selectedWeapon();
    if(!weapon || weapon.hp <= 0 || weapon.loading || resolving()) return;

    getTargetsForWeapon('player', weapon).forEach(target => {
      if(!target || target.hp <= 0) return;
      const el = getEntityElement('enemy', target.id);
      if(el) el.classList.add('target-mode-candidate');
    });
  }

  function decorateDestroyedRooms(){
    document.querySelectorAll('.destroyed-room').forEach(el => el.classList.remove('destroyed-room'));

    playerRooms.forEach(room => {
      if(room.hp > 0) return;
      const el = getEntityElement('player', room.id);
      if(el) el.classList.add('destroyed-room');
    });
    enemyRooms.forEach(room => {
      if(room.hp > 0) return;
      const el = getEntityElement('enemy', room.id);
      if(el) el.classList.add('destroyed-room');
    });
    if(playerMast.hp <= 0) playerMastBox.classList.add('destroyed-room');
    else playerMastBox.classList.remove('destroyed-room');
    if(enemyMast.hp <= 0) enemyMastBox.classList.add('destroyed-room');
    else enemyMastBox.classList.remove('destroyed-room');
  }

  function utilityAvailable(id){
    const el = getEntityElement('player', id);
    if(!el || el.classList.contains('utility-used') || el.classList.contains('utility-unavailable')) return false;
    const room = sourceEntity('player', id);
    return !!room && room.hp > 0;
  }

  function decorateActionReady(){
    document.querySelectorAll('.action-ready').forEach(el => el.classList.remove('action-ready'));

    playerRooms.forEach(room => {
      if(room.hp <= 0) return;
      let ready = false;
      if(room.weapon) ready = !room.loading;
      else if(room.id === 'p_carp' || room.id === 'p_mag') ready = utilityAvailable(room.id);
      if(!ready) return;
      const el = getEntityElement('player', room.id);
      if(el) el.classList.add('action-ready');
    });
  }

  // Hide the predictive collateral of an unrevealed enemy Magazine. The direct hit
  // remains visible; the player only learns about the blast radius once the room is revealed.
  const basePlayerIntentDistribution = playerIntentDistribution;
  playerIntentDistribution = function(){
    const result = basePlayerIntentDistribution();
    if(resolving() || !result || !result.hits) return result;

    const hits = new Map(result.hits || []);
    const explosions = new Map(result.explosions || []);

    enemyRooms.filter(r => r.isMagazine && r.hidden && !r.revealed && r.hp > 0).forEach(mag => {
      let direct = 0;
      Object.entries(state.playerIntents || {}).forEach(([weaponId, targetId]) => {
        if(targetId !== mag.id) return;
        const weapon = sourceEntity('player', weaponId);
        if(!weapon || weapon.hp <= 0 || weapon.loading) return;
        direct += weapons[weapon.weapon].damage;
      });
      if(direct < mag.hp) return;

      enemyRooms.filter(room =>
        room.id !== mag.id && room.hp > 0 &&
        Math.abs(room.col - mag.col) <= 1 &&
        Math.abs(room.row - mag.row) <= 1
      ).forEach(room => {
        const ex = explosions.get(room.id) || 0;
        if(ex <= 0) return;
        const nextEx = ex - 1;
        if(nextEx > 0) explosions.set(room.id, nextEx); else explosions.delete(room.id);
        const nextHit = Math.max(0, (hits.get(room.id) || 0) - 1);
        if(nextHit > 0) hits.set(room.id, nextHit); else hits.delete(room.id);
      });
    });

    return {...result, hits, explosions};
  };

  const baseRefresh = refresh;
  refresh = function(){
    baseRefresh();
    decorateDestroyedRooms();
    decorateActionReady();
    decorateTargetMode();
  };

  // Hovering a legal target while a friendly gun is selected gets an explicit cue.
  stage.addEventListener('pointerover', e => {
    if(resolving() || !state.selectedWeaponId) return;
    const el = enemyTargetElementFromEvent(e);
    if(!el || !el.classList.contains('target-mode-candidate')) return;
    if(el.contains(e.relatedTarget)) return;
    el.classList.add('target-hover-valid');
  }, true);

  stage.addEventListener('pointerout', e => {
    const el = enemyTargetElementFromEvent(e);
    if(!el || !el.classList.contains('target-hover-valid')) return;
    if(el.contains(e.relatedTarget)) return;
    el.classList.remove('target-hover-valid');
  }, true);

  // A destroyed friendly gun is disabled, never "loading". Capture this before the
  // older room click handler can report the loading state.
  stage.addEventListener('click', e => {
    if(resolving()) return;
    const el = e.target.closest && e.target.closest('.room[data-side="player"].weapon');
    if(!el) return;
    const room = sourceEntity('player', el.dataset.id);
    if(!room || room.hp > 0) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    state.selectedWeaponId = null;
    state.hoveredWeapon = null;
    showRoomTooltip(el, 'Disabled');
    refresh();
  }, true);

  refresh();
})();
