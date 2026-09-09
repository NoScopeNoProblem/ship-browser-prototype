(() => {
  // v24: make manoeuvre cadence-neutral and make committed actions easy to re-read.
  // The combatTurn cadence state is authoritative; movement may never change it.

  const currentTurn = () => window.combatTurn?.turn || 1;
  const playerRoom = id => playerRooms.find(r => r.id === id) || null;
  const isPlayerWeapon = id => !!playerRooms.find(r => r.id === id && r.weapon);

  const baseSetReady = combatTurn.setReady.bind(combatTurn);
  const baseSetWeaponState = combatTurn.setWeaponState.bind(combatTurn);
  const cadenceDiagnostics = {blockedReadyWrites:0, movementRestores:0, enforcedReloads:0};

  function explicitPlayerQuickLoad(id){
    if(!window.combatUtility) return false;
    if((combatUtility.quickLoadedTargets?.() || []).includes(id)) return true;
    const sourceId = combatUtility.selected;
    const source = sourceId ? playerRoom(sourceId) : null;
    const target = playerRoom(id);
    return !!(source && target && source.actionType === 'quickLoad' && combatUtility.inReach?.(source,target));
  }

  // Old compatibility layers are allowed to ready enemy guns, and resolution is allowed to
  // progress natural loads. During PLAYER planning, however, a loading gun can only become ready
  // through an actual Magazine Quick Load. This prevents stale movement/refresh code from silently
  // bringing the Heavy or Standard gun online.
  combatTurn.setReady = function(id){
    if(isPlayerWeapon(id) && !combatTurn.resolving){
      const before = combatTurn.getWeaponState(id);
      if(before?.mode === 'loading' && !explicitPlayerQuickLoad(id)){
        cadenceDiagnostics.blockedReadyWrites++;
        console.warn('[combat cadence] blocked non-Quick-Load ready write', id, {turn:currentTurn(), before});
        return false;
      }
    }
    return baseSetReady(id);
  };

  combatTurn.setWeaponState = function(id,next){
    if(isPlayerWeapon(id) && !combatTurn.resolving){
      const before = combatTurn.getWeaponState(id);
      if(before?.mode === 'loading' && next?.mode === 'ready' && !explicitPlayerQuickLoad(id)){
        cadenceDiagnostics.blockedReadyWrites++;
        console.warn('[combat cadence] blocked planning loading→ready write', id, {turn:currentTurn(), before, next});
        return false;
      }
    }
    return baseSetWeaponState(id,next);
  };

  function snapshotPlayerCadence(){
    const turn = currentTurn();
    const states = new Map();
    playerRooms.filter(r => r.weapon).forEach(room => states.set(room.id, combatTurn.getWeaponState(room.id)));
    return {turn,states};
  }

  function sameState(a,b){
    return a?.mode === b?.mode &&
      Number(a?.remaining ?? -1) === Number(b?.remaining ?? -1) &&
      Number(a?.shotsLeft ?? -1) === Number(b?.shotsLeft ?? -1);
  }

  function restorePlayerCadence(snapshot){
    if(!snapshot || snapshot.turn !== currentTurn() || combatTurn.resolving || window.combatEnded) return;
    let changed = false;
    snapshot.states.forEach((before,id) => {
      const room = playerRoom(id);
      if(!room || room.hp <= 0) return;
      const after = combatTurn.getWeaponState(id);
      if(sameState(before,after)) return;
      // Use the captured pre-wrapper method: restoring a movement snapshot is not a gameplay
      // readiness transition, it is enforcing that movement had no cadence effect at all.
      baseSetWeaponState(id,before);
      changed = true;
      cadenceDiagnostics.movementRestores++;
    });
    if(changed) refresh();
  }

  // Wrap the movement FUNCTIONS themselves, rather than trying to repair state later from button
  // events. This covers mouse, keyboard and future callers and is synchronous with the move.
  const previousMoveLeft = moveLeft;
  const previousMoveRight = moveRight;
  moveLeft = function(){
    const snapshot = snapshotPlayerCadence();
    previousMoveLeft();
    restorePlayerCadence(snapshot);
  };
  moveRight = function(){
    const snapshot = snapshotPlayerCadence();
    previousMoveRight();
    restorePlayerCadence(snapshot);
  };

  // Regression guard for the reported Turn-2 Heavy issue. Identify the actual source of friendly
  // projectiles from their launch coordinates. If a gun exhausts its shots this resolution, it
  // MUST enter its normal reload cadence for the following turn even if a stale planning layer
  // tries to ready it afterwards.
  const projectileLayer = stage.querySelector('.v3-projectile-layer');
  let resolutionStartStates = new Map();
  let firedCounts = new Map();
  let wasResolving = document.body.classList.contains('v3-resolving');

  function roomCenterInStage(room){
    const el = getEntityElement('player',room.id);
    if(!el) return null;
    const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return {x:r.left-sr.left+r.width/2, y:r.top-sr.top+r.height/2};
  }

  function identifyFriendlyProjectileSource(node){
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
    if(!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let best = null, bestD = Infinity;
    playerRooms.filter(r => r.weapon && r.hp > 0).forEach(room => {
      const p = roomCenterInStage(room); if(!p) return;
      const d = (p.x-x)*(p.x-x) + (p.y-y)*(p.y-y);
      if(d < bestD){bestD=d;best=room;}
    });
    return bestD <= 1600 ? best : null;
  }

  if(projectileLayer){
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if(!(node instanceof Element) || !node.matches('.v3-ball.player')) return;
        const source = identifyFriendlyProjectileSource(node);
        if(source) firedCounts.set(source.id,(firedCounts.get(source.id)||0)+1);
      }));
    }).observe(projectileLayer,{childList:true});
  }

  function captureResolutionStart(){
    resolutionStartStates = new Map();
    firedCounts = new Map();
    playerRooms.filter(r => r.weapon).forEach(room => resolutionStartStates.set(room.id,combatTurn.getWeaponState(room.id)));
  }

  function enforcePostFireReloads(){
    if(window.combatEnded) return;
    let changed = false;
    firedCounts.forEach((count,id) => {
      const room = playerRoom(id); if(!room || room.hp <= 0) return;
      const cadence = weapons[room.weapon]?.cadence || {};
      const reloadTurns = Math.max(0,Number(cadence.reloadTurns ?? 1));
      if(reloadTurns <= 0) return;
      const start = resolutionStartStates.get(id) || {};
      const shotsBeforeReload = Math.max(1,Number(cadence.shotsBeforeReload || 1));
      const shotsAvailableAtStart = Math.max(1,Number(start.shotsLeft ?? shotsBeforeReload));
      if(count < shotsAvailableAtStart) return;
      const now = combatTurn.getWeaponState(id);
      if(now?.mode === 'loading') return;
      baseSetWeaponState(id,{mode:'loading',remaining:reloadTurns,shotsLeft:shotsBeforeReload});
      cadenceDiagnostics.enforcedReloads++;
      changed = true;
      console.warn('[combat cadence] restored mandatory post-fire reload', id, {turn:currentTurn(),count,start,now});
    });
    if(changed) refresh();
  }

  new MutationObserver(() => {
    const now = document.body.classList.contains('v3-resolving');
    if(!wasResolving && now) captureResolutionStart();
    if(wasResolving && !now) enforcePostFireReloads();
    wasResolving = now;
  }).observe(document.body,{attributes:true,attributeFilter:['class']});

  // -----------------------------------------------------------------------
  // Readability: replay committed target/support lines on hover and on Z/X.
  // -----------------------------------------------------------------------
  const overlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('class','v24-action-readability-overlay');
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML = '<defs><marker id="v24GreenArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="v24-support-arrow-head"/></marker></defs>';
  stage.appendChild(overlay);

  let hoverPlan = null;
  let heldMode = null;
  let replayTimer = null;
  const REPLAY_MS = 2300;

  function clearLines(){
    [...overlay.querySelectorAll('.v24-action-line')].forEach(n => n.remove());
    document.querySelectorAll('.v24-target-pulse,.v24-support-pulse').forEach(el => el.classList.remove('v24-target-pulse','v24-support-pulse'));
  }

  function center(el){
    const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
    return {x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};
  }

  function enemyAimPoint(intent){
    const impact = projectedEnemyImpact(intent);
    if(impact){const el=getEntityElement('player',impact.id);if(el)return {point:center(el),targetEl:el};}
    const pg=playerGrid.getBoundingClientRect(),sr=stage.getBoundingClientRect();
    if(intent.lane==='mast') return {point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:pg.top-sr.top-34},targetEl:null};
    return {point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:laneY('player',intent.lane)+ROOM_H()/2},targetEl:null};
  }

  function addLine(a,b,kind,{arrow=false}={}){
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
    line.setAttribute('pathLength','1');line.setAttribute('class',`v24-action-line ${kind}`);
    if(arrow) line.setAttribute('marker-end','url(#v24GreenArrow)');
    overlay.appendChild(line);
  }

  function drawFriendlyShot(sourceId,{pulse=true}={}){
    const targetId=state.playerIntents?.[sourceId];
    const source=playerRoom(sourceId),target=targetId?sourceEntity('enemy',targetId):null;
    const se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('enemy',target.id);
    if(!source||!target||!se||!te||source.hp<=0||!combatTurn.isReady(source.id))return;
    addLine(center(se),center(te),'friendly-fire');
    if(pulse){te.classList.add('v24-target-pulse');setTimeout(()=>te.classList.remove('v24-target-pulse'),760);}
  }

  function drawEnemyShot(sourceId,{pulse=true}={}){
    const source=sourceEntity('enemy',sourceId);
    const intent=enemyIntents.find(i=>i.sourceId===sourceId&&!i.inactive);
    const se=source&&getEntityElement('enemy',source.id);
    if(!source||!intent||!se||source.hp<=0||!combatTurn.isReady(source.id))return;
    const aim=enemyAimPoint(intent);addLine(center(se),aim.point,'enemy-fire');
    if(pulse&&aim.targetEl){aim.targetEl.classList.add('v24-target-pulse');setTimeout(()=>aim.targetEl.classList.remove('v24-target-pulse'),760);}
  }

  function supportPlanForSource(sourceId){
    if(!window.combatUtility)return null;
    const repair=(combatUtility.plannedRepairs?.()||[]).find(p=>p.sourceId===sourceId);
    if(repair&&repair.targetId!==sourceId)return {kind:'repair',sourceId,targetId:repair.targetId};
    const source=playerRoom(sourceId);if(!source||source.actionType!=='quickLoad'||!combatUtility.isUsed?.(sourceId))return null;
    const targetId=(combatUtility.quickLoadedTargets?.()||[]).find(id=>{
      const target=playerRoom(id);return target&&combatUtility.inReach?.(source,target);
    });
    return targetId&&targetId!==sourceId?{kind:'quickLoad',sourceId,targetId}:null;
  }

  function drawSupport(plan,{pulse=true}={}){
    const source=playerRoom(plan.sourceId),target=playerRoom(plan.targetId);
    const se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('player',target.id);
    if(!source||!target||!se||!te||source.id===target.id)return;
    addLine(center(se),center(te),'support',{arrow:true});
    if(pulse){te.classList.add('v24-support-pulse');setTimeout(()=>te.classList.remove('v24-support-pulse'),760);}
  }

  function renderReadability(){
    clearLines();
    if(window.combatEnded||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    if(heldMode==='enemy'){
      enemyRooms.filter(r=>r.weapon&&r.hp>0&&combatTurn.isReady(r.id)).forEach(r=>drawEnemyShot(r.id,{pulse:false}));
      return;
    }
    if(heldMode==='player'){
      Object.keys(state.playerIntents||{}).forEach(id=>drawFriendlyShot(id,{pulse:false}));
      return;
    }
    if(!hoverPlan)return;
    if(hoverPlan.kind==='friendly-fire')drawFriendlyShot(hoverPlan.sourceId);
    else if(hoverPlan.kind==='support')drawSupport(hoverPlan.plan);
  }

  function restartReplayTimer(){
    if(replayTimer){clearInterval(replayTimer);replayTimer=null;}
    if(!hoverPlan&&!heldMode)return;
    replayTimer=setInterval(renderReadability,REPLAY_MS);
  }

  stage.addEventListener('pointerover',e=>{
    if(heldMode||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    const room=e.target.closest?.('.room[data-side="player"]');if(!room||room.contains(e.relatedTarget))return;
    const id=room.dataset.id,entity=playerRoom(id);if(!entity)return;
    if(entity.weapon&&state.playerIntents?.[id]) hoverPlan={kind:'friendly-fire',sourceId:id};
    else{
      const plan=supportPlanForSource(id);if(plan)hoverPlan={kind:'support',plan};else return;
    }
    renderReadability();restartReplayTimer();
  },true);

  stage.addEventListener('pointerout',e=>{
    if(heldMode)return;
    const room=e.target.closest?.('.room[data-side="player"]');if(!room||room.contains(e.relatedTarget))return;
    if(!hoverPlan)return;hoverPlan=null;clearLines();restartReplayTimer();
  },true);

  window.addEventListener('keydown',e=>{
    if(e.repeat||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    if(e.code==='KeyZ'){heldMode='enemy';hoverPlan=null;renderReadability();restartReplayTimer();}
    else if(e.code==='KeyX'){heldMode='player';hoverPlan=null;renderReadability();restartReplayTimer();}
  },true);
  window.addEventListener('keyup',e=>{
    if((e.code==='KeyZ'&&heldMode==='enemy')||(e.code==='KeyX'&&heldMode==='player')){
      heldMode=null;clearLines();restartReplayTimer();
    }
  },true);

  // -----------------------------------------------------------------------
  // Replay button / I hotkey: reset THIS planning turn, then replay enemy intentions.
  // Existing R handlers own rollback of movement, repair, Quick Load and shot plans; the existing
  // preview class already locks all combat inputs until the replay handoff completes.
  // -----------------------------------------------------------------------
  const replayButton=document.createElement('button');
  replayButton.className='v24-replay-intents';
  replayButton.textContent='↻ INTENTS [I]';
  replayButton.title='Reset this turn and replay enemy intentions';
  stage.appendChild(replayButton);

  function positionReplayButton(){
    replayButton.style.top=`${trackRow.offsetTop+50}px`;
  }

  function replayEnemyIntentions(){
    if(window.combatEnded||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    clearLines();hoverPlan=null;heldMode=null;restartReplayTimer();
    const resetEvent=new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true,cancelable:true});
    document.dispatchEvent(resetEvent);
    window.enemyAI?.replay?.();
    updateReplayButton();
  }

  function updateReplayButton(){
    replayButton.disabled=!!(window.combatEnded||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'));
    positionReplayButton();
  }

  replayButton.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();replayEnemyIntentions();},true);
  window.addEventListener('keydown',e=>{
    if(e.code!=='KeyI'||e.repeat)return;
    if(window.combatEnded||combatTurn.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    e.preventDefault();e.stopPropagation();replayEnemyIntentions();
  },true);

  new MutationObserver(()=>{updateReplayButton();if(!document.body.classList.contains('v11-intent-preview-active'))renderReadability();}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>{positionReplayButton();if(hoverPlan||heldMode)renderReadability();});
  window.addEventListener('combat-ended',()=>{clearLines();if(replayTimer)clearInterval(replayTimer);updateReplayButton();});

  window.combatCadenceDiagnostics={
    ...cadenceDiagnostics,
    get stats(){return {...cadenceDiagnostics};},
    snapshot:snapshotPlayerCadence,
    get turn(){return currentTurn();}
  };

  positionReplayButton();
  updateReplayButton();
})();