(() => {
  // v13: persistent repair language + mast/miss readability. Loaded last on purpose.
  const repairedPips = new Map();
  const hpSnapshot = new Map();
  [...playerRooms, ...enemyRooms].forEach(room => hpSnapshot.set(room.id, room.hp));

  function sideFor(room){ return playerRooms.includes(room) ? 'player' : 'enemy'; }
  function roomEl(room){ return getEntityElement(sideFor(room), room.id); }

  function noteHpTransitions(){
    [...playerRooms, ...enemyRooms].forEach(room => {
      const before = hpSnapshot.get(room.id);
      if(!Number.isFinite(before)){ hpSnapshot.set(room.id, room.hp); return; }
      let marks = repairedPips.get(room.id);
      if(!marks){ marks = new Set(); repairedPips.set(room.id, marks); }

      if(room.hp > before){
        // A repair restores the first missing pip: visually this is the leftmost damaged heart.
        for(let i = before; i < room.hp; i++) marks.add(i);
      } else if(room.hp < before){
        // If a previously repaired pip is lost again, it stops reading as repaired.
        [...marks].forEach(index => { if(index >= room.hp) marks.delete(index); });
      }
      hpSnapshot.set(room.id, room.hp);
    });
  }

  function decorateRepairedPips(){
    [...playerRooms, ...enemyRooms].forEach(room => {
      const marks = repairedPips.get(room.id); if(!marks?.size) return;
      const el = roomEl(room); if(!el) return;
      const pips = [...el.querySelectorAll('.pips span')];
      marks.forEach(index => {
        const pip = pips[index];
        if(!pip || index >= room.hp) return;
        // Incoming/cancelled intent owns the pip while it is being previewed.
        if(pip.classList.contains('hit') || pip.classList.contains('intent-crosshair') || pip.classList.contains('prevented-mark')) return;
        pip.classList.add('v13-repaired-heart');
        pip.textContent = '♥+';
        pip.title = 'Repaired';
      });
    });
  }

  function ensureMissMarkers(){
    if(window.combatEnded || window.combatTurn?.resolving || document.body.classList.contains('v11-intent-preview-active')) return;
    let misses=[];
    try{ misses = enemyIntentDistribution(playerIntentDistribution())?.missMap || []; }catch{return;}
    misses.forEach(intent => {
      let marker = stage.querySelector(`.miss-marker[data-source-id="${intent.sourceId}"]`);
      if(!marker && typeof addMissMarker === 'function'){
        addMissMarker(intent);
        marker = stage.querySelector(`.miss-marker[data-source-id="${intent.sourceId}"]`);
      }
      if(!marker) return;
      marker.classList.add('v13-restored-miss');
      if(intent.lane === 'mast') marker.classList.add('v13-mast-miss');
      const text = marker.querySelector('.miss-text');
      if(text) text.textContent = 'MISS';
    });
  }

  function keepMagazineIndependentOfMovement(){
    // Movement is a positional choice, not a Magazine action. This marker is diagnostic and
    // makes the intended rule explicit for later generalized ship setups.
    playerRooms.filter(r => r.actionType === 'quickLoad').forEach(room => {
      const el = getEntityElement('player', room.id); if(!el || !window.combatUtility) return;
      el.dataset.utilityUsed = combatUtility.isUsed(room.id) ? 'true' : 'false';
    });
  }

  const baseRefresh = refresh;
  refresh = function(){
    noteHpTransitions();
    baseRefresh();
    decorateRepairedPips();
    ensureMissMarkers();
    keepMagazineIndependentOfMovement();
  };

  // If older layers create/remove miss markers during pointer movement, restore them next frame.
  stage.addEventListener('pointermove', () => requestAnimationFrame(ensureMissMarkers), true);
  moveAft.addEventListener('click', () => requestAnimationFrame(refresh));
  moveFore.addEventListener('click', () => requestAnimationFrame(refresh));

  window.addEventListener('combat-ended', () => {
    document.querySelectorAll('.miss-marker').forEach(n => n.remove());
  });

  refresh();
})();
