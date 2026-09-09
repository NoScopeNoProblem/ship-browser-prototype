(() => {
  // v22: combatTurn weapon cadence is the canonical readiness state.
  // Some older interaction code still reads room.loading directly; keep that compatibility
  // flag derived from combatTurn so manoeuvring cannot make a Magazine or Quick-Loaded gun
  // appear to change state when no weapon cadence actually changed.

  function currentTurn(){ return window.combatTurn?.turn || 1; }

  function syncPlayerWeaponFlags(){
    if(!window.combatTurn) return;
    playerRooms.filter(r => r.weapon).forEach(room => {
      room.loading = !combatTurn.isReady(room.id);
    });
  }

  // Development-only consumption ledger. Limits are deliberately NOT enforced yet.
  const ledger = {
    cannonballsFired: 0,
    timberCommitted: 0,
    pendingTimber: 0,
    repairTurn: currentTurn(),
    ended: false
  };

  function pendingRepairCount(){
    try { return window.combatUtility?.plannedRepairs?.().length || 0; }
    catch { return 0; }
  }

  function syncRepairLedger(){
    const turn = currentTurn();
    if(turn !== ledger.repairTurn){
      ledger.timberCommitted += ledger.pendingTimber;
      ledger.pendingTimber = 0;
      ledger.repairTurn = turn;
    }
    ledger.pendingTimber = pendingRepairCount();
  }

  function totalTimberUsed(){ return ledger.timberCommitted + ledger.pendingTimber; }

  function decorateStats(){
    const host = document.querySelector('.player-corner');
    if(!host) return;
    let stats = host.querySelector('.v22-dev-stats');
    if(!stats){
      stats = document.createElement('span');
      stats.className = 'v22-dev-stats';
      stats.title = 'Development counters only — ammo and Timber limits are not enforced';
      host.appendChild(stats);
    }
    stats.textContent = `BALLS FIRED ${ledger.cannonballsFired} · TIMBER USED ${totalTimberUsed()}`;
  }

  // Wrap the final refresh chain so every downstream utility decorator sees a loading flag
  // that was derived from combatTurn, never from movement/threat presentation state.
  const baseRefresh = refresh;
  refresh = function(){
    syncPlayerWeaponFlags();
    syncRepairLedger();
    baseRefresh();
    syncPlayerWeaponFlags();
    syncRepairLedger();
    decorateStats();
  };

  // Also synchronize immediately before click dispatch. v5's Magazine selector and the older
  // room click handler both run later in the event path and therefore receive canonical state.
  window.addEventListener('pointerdown', e => {
    if(e.target.closest?.('.room[data-side="player"]')) syncPlayerWeaponFlags();
  }, true);
  window.addEventListener('click', e => {
    if(e.target.closest?.('.room[data-side="player"]')) syncPlayerWeaponFlags();
  }, true);

  // A manoeuvre never changes weapon cadence. Re-derive the compatibility flags after any
  // movement/reset input rather than carrying a presentation flag across the move.
  moveAft.addEventListener('click', () => requestAnimationFrame(() => { syncPlayerWeaponFlags(); refresh(); }));
  moveFore.addEventListener('click', () => requestAnimationFrame(() => { syncPlayerWeaponFlags(); refresh(); }));
  window.addEventListener('keydown', e => {
    if(e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyR'){
      requestAnimationFrame(() => { syncPlayerWeaponFlags(); refresh(); });
    }
  }, true);

  // Count actual friendly projectiles, not planned shots. Each player cannonball appended to
  // the projectile layer is one real shot that entered resolution.
  const projectileLayer = stage.querySelector('.v3-projectile-layer');
  if(projectileLayer){
    new MutationObserver(records => {
      let added = 0;
      records.forEach(record => record.addedNodes.forEach(node => {
        if(node instanceof Element && node.matches('.v3-ball.player')) added++;
      }));
      if(added){
        ledger.cannonballsFired += added;
        decorateStats();
      }
    }).observe(projectileLayer, {childList:true});
  }

  window.addEventListener('combat-ended', () => {
    if(ledger.ended) return;
    syncRepairLedger();
    ledger.timberCommitted += ledger.pendingTimber;
    ledger.pendingTimber = 0;
    ledger.ended = true;
    decorateStats();
  });

  window.combatDevStats = {
    get cannonballsFired(){ return ledger.cannonballsFired; },
    get timberUsed(){ return totalTimberUsed(); },
    syncWeaponFlags: syncPlayerWeaponFlags
  };

  syncPlayerWeaponFlags();
  syncRepairLedger();
  refresh();
})();
