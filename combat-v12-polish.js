(() => {
  const nativeSetTimeout = window.setTimeout.bind(window);
  const PREVIEW_PACE = 1.25;

  // Keep the intent reveal brisk, but give each beat ~25% more reading time.
  // Scope the multiplier tightly to short timers scheduled while the preview owns input.
  window.setTimeout = function(fn, delay = 0, ...args){
    const d = Number(delay) || 0;
    const paced = document.body.classList.contains('v11-intent-preview-active') && d >= 180 && d <= 1100
      ? Math.round(d * PREVIEW_PACE)
      : d;
    return nativeSetTimeout(fn, paced, ...args);
  };

  pipsMarkup = function(entity, hits = 0, dodges = 0, prevented = 0){
    const arr = [];
    for(let i = 0; i < entity.max; i++){
      arr.push(i < entity.hp ? '<span>♥</span>' : '<span class="damage-empty">♡</span>');
    }
    let cursor = entity.hp - 1;
    for(let i = 0; i < hits && cursor >= 0; i++, cursor--){
      arr[cursor] = '<span class="hit intent-crosshair" title="Intended damage">⌖</span>';
    }
    // Dodges no longer consume a health pip; movement feedback is handled by the board UI.
    for(let i = 0; i < prevented && cursor >= 0; i++, cursor--){
      arr[cursor] = '<span class="prevented-mark" title="Prevented: enemy action cancelled">⊘</span>';
    }
    return arr.join(' ');
  };

  const hpSnapshot = new Map();
  [...playerRooms, ...enemyRooms].forEach(room => hpSnapshot.set(room.id, room.hp));

  function sideForRoom(room){ return playerRooms.includes(room) ? 'player' : 'enemy'; }
  function roomElement(room){ return getEntityElement(sideForRoom(room), room.id); }
  function weaponReady(room){ return !!(room?.weapon && room.hp > 0 && window.combatTurn?.isReady(room.id)); }
  function utilityUsed(room){ return !!(window.combatUtility && combatUtility.isUsed(room.id)); }
  function utilityAvailable(room){ return !!(window.combatUtility && combatUtility.isAvailable(room)); }
  function isUtility(room){ return !!room && room.actionType && room.actionType !== 'fire'; }

  function animateRepairPip(room, repairedIndex){
    const el = roomElement(room);
    const pip = el?.querySelectorAll('.pips span')?.[repairedIndex];
    if(!el || !pip) return;
    const er = el.getBoundingClientRect(), pr = pip.getBoundingClientRect();
    const note = document.createElement('div');
    note.className = 'v12-repair-pip';
    note.textContent = '♥+';
    note.style.left = `${pr.left - er.left + pr.width/2}px`;
    note.style.top = `${pr.top - er.top + pr.height/2}px`;
    el.appendChild(note);
    nativeSetTimeout(() => note.remove(), 900);
  }

  function collectRepairs(){
    const repairs = [];
    [...playerRooms, ...enemyRooms].forEach(room => {
      const before = hpSnapshot.get(room.id);
      if(Number.isFinite(before) && room.hp > before){
        for(let i = before; i < room.hp; i++) repairs.push({room, index:i});
      }
    });
    return repairs;
  }
  function updateHpSnapshot(){ [...playerRooms, ...enemyRooms].forEach(room => hpSnapshot.set(room.id, room.hp)); }

  function decorateAmmo(){
    document.querySelectorAll('.v12-ammo-status').forEach(n => n.remove());
    playerRooms.filter(r => r.weapon).forEach(room => {
      const el = getEntityElement('player', room.id); if(!el) return;
      const loaded = weaponReady(room);
      const ammo = document.createElement('div');
      ammo.className = `v12-ammo-status ${loaded ? 'loaded' : 'empty'}${room.hp <= 0 ? ' disabled' : ''}`;
      ammo.innerHTML = `<span>${loaded ? '●' : '○'}</span>`;
      ammo.title = room.hp <= 0 ? 'Disabled' : (loaded ? 'Cannonball loaded' : 'Cannonball empty — loading');
      el.appendChild(ammo);
    });
  }

  function utilityPresentation(room, used, available){
    if(room.actionType === 'repair') return {icon:'♥+', title:used?'Repair used this turn':available?'Repair available':'No repair target'};
    if(room.actionType === 'quickLoad') return {icon:'↻+', title:used?'Quick Load used this turn':available?'Quick Load available':'No loading adjacent gun'};
    if(room.actionType === 'resetSails') return {icon:'⛵↻', title:used?'Reset Sails used this turn':available?'Reset Sails available':'Sails do not need resetting'};
    if(room.actionType === 'brace') return {icon:'⛨', title:used?'Brace used this turn':available?'Brace available':'No unbraced target in reach'};
    return {icon:'•', title:'Support action'};
  }
  function decorateUtilityIcons(){
    document.querySelectorAll('.v12-utility-icon').forEach(n => n.remove());
    playerRooms.filter(isUtility).forEach(room => {
      const el = getEntityElement('player', room.id); if(!el) return;
      el.classList.add('v12-utility-room');
      const used = utilityUsed(room), available = utilityAvailable(room), p = utilityPresentation(room,used,available);
      const icon = document.createElement('div');
      icon.className = `v12-utility-icon ${room.actionType}${available && !used ? ' ready' : ' faded'}${used ? ' spent' : ''}`;
      icon.textContent = p.icon;
      icon.title = p.title;
      el.appendChild(icon);
    });
  }

  function decorateCancelShots(){
    document.querySelectorAll('.v12-cancel-shot').forEach(n => n.remove());
    Object.entries(state.playerIntents || {}).forEach(([sourceId, targetId]) => {
      const gun = playerRooms.find(r => r.id === sourceId), el = gun && getEntityElement('player', gun.id);
      if(!gun || !el) return;
      const target = sourceEntity('enemy', targetId);
      const button = document.createElement('button');
      button.className = 'v12-cancel-shot';
      button.dataset.sourceId = sourceId;
      button.textContent = '↶';
      button.title = `Cancel planned shot${target ? ` at ${target.name}` : ''}`;
      el.appendChild(button);
    });
  }

  function bottomRow(side){ return ((side === 'player' ? PLAYER_SHIP_SETUP : ENEMY_SHIP_SETUP).rows || 1) - 1; }
  function addFloodPreview(side, room, kind){
    const el = getEntityElement(side, room.id); if(!el) return;
    const marker = document.createElement('div');
    marker.className = `v12-flood-preview ${kind}`;
    marker.innerHTML = '<span>≈</span><b>FLOOD</b>';
    marker.title = kind === 'enemy' ? 'Enemy intent would flood this room' : 'Your planned attack would flood this room';
    el.appendChild(marker);
  }

  function decorateThreatsAndFlooding(){
    document.querySelectorAll('.v12-flood-preview').forEach(n => n.remove());
    document.querySelectorAll('.v12-lethal-threat').forEach(n => n.classList.remove('v12-lethal-threat'));
    if(window.combatEnded || window.combatTurn?.resolving) return;

    let playerState, enemyState;
    try{
      playerState = playerIntentDistribution();
      enemyState = enemyIntentDistribution(playerState);
    }catch{return;}

    playerRooms.forEach(room => {
      if(room.hp <= 0) return;
      const incoming = enemyState?.hits?.get(room.id) || 0;
      if(incoming >= room.hp){
        const el = getEntityElement('player', room.id); if(el) el.classList.add('v12-lethal-threat');
        if(room.row === bottomRow('player')) addFloodPreview('player', room, 'enemy');
      }
    });
    const mastIncoming = enemyState?.hits?.get(playerMast.id) || 0;
    if(playerMast.hp > 0 && mastIncoming >= playerMast.hp) playerMastBox.classList.add('v12-lethal-threat');

    enemyRooms.forEach(room => {
      if(room.hp <= 0 || room.row !== bottomRow('enemy')) return;
      const planned = playerState?.hits?.get(room.id) || 0;
      if(planned >= room.hp) addFloodPreview('enemy', room, 'friendly');
    });
  }

  function gunActionAvailable(room){
    if(!room?.weapon || !weaponReady(room)) return false;
    if(Object.prototype.hasOwnProperty.call(state.playerIntents || {}, room.id)) return false;
    return getTargetsForWeapon('player', room).some(t => t && t.hp > 0);
  }
  function pendingActionRooms(){
    return playerRooms.filter(room => {
      if(room.actionType === 'fire') return gunActionAvailable(room);
      if(isUtility(room)) return utilityAvailable(room) && !utilityUsed(room);
      return false;
    });
  }

  const endTurn = stage.querySelector('.v3-end-turn');
  let endWarningArmed = false;
  let endWarningTimer = null;
  let lastActionKey = '';
  function actionStateKey(){
    const plans = Object.entries(state.playerIntents || {}).sort().map(([a,b]) => `${a}:${b}`).join('|');
    const used = playerRooms.filter(r => isUtility(r) && utilityUsed(r)).map(r => r.id).sort().join('|');
    return `${state.playerMastTrack}/${plans}/${used}`;
  }
  function clearActionReminder(){
    document.querySelectorAll('.v12-action-reminder').forEach(el => el.classList.remove('v12-action-reminder'));
    stage.querySelectorAll('.v12-end-tip').forEach(n => n.remove());
  }
  function disarmEndWarning(){
    endWarningArmed = false;
    if(endWarningTimer){ clearTimeout(endWarningTimer); endWarningTimer = null; }
    if(endTurn) endTurn.textContent = 'END TURN';
    clearActionReminder();
  }
  function decorateEndTurn(){
    if(!endTurn) return;
    const key = actionStateKey();
    if(lastActionKey && key !== lastActionKey) disarmEndWarning();
    lastActionKey = key;
    const pending = pendingActionRooms();
    if(!pending.length && endWarningArmed) disarmEndWarning();
    endTurn.classList.toggle('v12-end-ready', !window.combatEnded && pending.length === 0);
    endTurn.classList.toggle('v12-end-has-actions', pending.length > 0);
  }
  function showEndWarning(pending){
    clearActionReminder();
    pending.forEach(room => getEntityElement('player', room.id)?.classList.add('v12-action-reminder'));
    const tip = document.createElement('div');
    tip.className = 'v12-end-tip';
    tip.textContent = 'Actions remain — confirm?';
    stage.appendChild(tip);
    if(endTurn) endTurn.textContent = 'CONFIRM?';
    if(endWarningTimer) clearTimeout(endWarningTimer);
    endWarningTimer = nativeSetTimeout(() => {
      if(endWarningArmed) disarmEndWarning();
    }, 2400);
  }

  function decorateAll(){
    decorateAmmo();
    decorateUtilityIcons();
    decorateCancelShots();
    decorateThreatsAndFlooding();
    decorateEndTurn();
  }

  const baseRefresh = refresh;
  refresh = function(){
    // Enemy utility targets are immutable once the turn plan is built. Presentation must never
    // retarget them during a refresh; the enemy intention controller owns all target selection.
    const repairs = collectRepairs();
    baseRefresh();
    decorateAll();
    repairs.forEach(({room,index}) => animateRepairPip(room,index));
    updateHpSnapshot();
  };

  // Planned shots can be reset either by clicking the gun again or its red return-arrow.
  stage.addEventListener('click', e => {
    if(window.combatTurn?.resolving || window.combatEnded || document.body.classList.contains('v11-intent-preview-active')) return;
    const cancel = e.target.closest && e.target.closest('.v12-cancel-shot');
    if(cancel){
      e.preventDefault(); e.stopImmediatePropagation();
      const id = cancel.dataset.sourceId, el = getEntityElement('player', id);
      delete state.playerIntents[id]; state.selectedWeaponId = null; state.hoveredWeapon = null;
      refresh(); showRoomTooltip(el, 'Cancelled');
      return;
    }
    const gunEl = e.target.closest && e.target.closest('.room[data-side="player"].weapon');
    if(gunEl && Object.prototype.hasOwnProperty.call(state.playerIntents || {}, gunEl.dataset.id)){
      e.preventDefault(); e.stopImmediatePropagation();
      delete state.playerIntents[gunEl.dataset.id]; state.selectedWeaponId = null; state.hoveredWeapon = null;
      refresh(); showRoomTooltip(gunEl, 'Cancelled');
      return;
    }
    const roomEl = e.target.closest && e.target.closest('.room[data-side="player"]');
    if(roomEl){
      const room = playerRooms.find(r => r.id === roomEl.dataset.id);
      if(room && !room.weapon && room.actionType == null){
        e.preventDefault(); e.stopImmediatePropagation();
        showRoomTooltip(roomEl, room.hp <= 0 ? 'Disabled' : 'No Action Available');
      }
    }
  }, true);

  if(endTurn){
    endTurn.addEventListener('click', e => {
      if(window.combatEnded || window.combatTurn?.resolving || document.body.classList.contains('v11-intent-preview-active')) return;
      const pending = pendingActionRooms();
      if(!pending.length){ disarmEndWarning(); return; }
      if(endWarningArmed){
        // This click is the explicit confirmation. Let the underlying End Turn handler run.
        disarmEndWarning();
        return;
      }
      e.preventDefault(); e.stopImmediatePropagation();
      endWarningArmed = true;
      showEndWarning(pending);
    }, true);

    // E mirrors the End Turn button. If a warning is active, the second E confirms it.
    window.addEventListener('keydown', e => {
      if(e.code !== 'KeyE' || e.repeat) return;
      if(window.combatEnded || window.combatTurn?.resolving || document.body.classList.contains('v11-intent-preview-active')) return;
      e.preventDefault();
      endTurn.click();
    }, true);
  }

  // Show a clear REPAIRING beat only while the repair utility is the current preview item.
  const intentDetail = stage.querySelector('.v11-intent-detail');
  if(intentDetail){
    const repairObserver = new MutationObserver(() => {
      document.querySelectorAll('.v12-preview-repairing').forEach(el => el.classList.remove('v12-preview-repairing'));
      if(!document.body.classList.contains('v11-intent-preview-active')) return;
      if(!/^REPAIR\b/i.test(intentDetail.textContent || '')) return;
      const repairChip = [...enemyGrid.querySelectorAll('.v11-enemy-action-chip.repair')].pop();
      const room = repairChip?.closest('.room[data-side="enemy"]');
      if(room) room.classList.add('v12-preview-repairing');
    });
    repairObserver.observe(intentDetail, {childList:true,subtree:true,characterData:true});
  }

  function clearEnemyIntentVisuals(){
    document.querySelectorAll('.intent-stack.enemy-stack,.miss-marker,.v11-enemy-action-chip,.v12-flood-preview.enemy').forEach(n => n.remove());
    document.querySelectorAll('.enemy-intended,.dodged,.prevented,.v12-lethal-threat,.v12-preview-repairing').forEach(el => el.classList.remove('enemy-intended','dodged','prevented','v12-lethal-threat','v12-preview-repairing'));
    document.querySelectorAll('.v11-intent-tracer-overlay,.v9-range-overlay,.arc-overlay').forEach(svg => { if(svg) svg.innerHTML = ''; });
  }
  window.addEventListener('combat-ended', () => {
    enemyIntents.splice(0, enemyIntents.length);
    window.enemyActionIntents = [];
    state.hoverIntent = null; state.overview = null;
    disarmEndWarning();
    clearEnemyIntentVisuals();
    nativeSetTimeout(clearEnemyIntentVisuals, 0);
  });

  refresh();
})();