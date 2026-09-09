(() => {
  // v26: one-way planning renderer.
  // Gameplay state lives in combatTurn/combatUtility/state. This layer never repairs cadence or
  // utility state; it only renders those canonical values and owns the late planning presentation.

  const currentTurn = () => window.combatTurn?.turn || 1;
  const playerRoom = id => playerRooms.find(r => r.id === id) || null;
  const isPlanning = () => !window.combatEnded && !window.combatTurn?.resolving;

  // -----------------------------------------------------------------------
  // Current-world enemy damage projection. Explosion collateral is derived from current direct
  // impacts, so moving a Magazine out of an aimed world-column removes the blast prediction.
  // Intent totals may exceed HP; actual HP is still clamped by the resolver.
  // -----------------------------------------------------------------------
  function directDamageFromTargetMap(dist){
    const direct = new Map();
    if(!(dist?.targetMap instanceof Map)) return direct;
    dist.targetMap.forEach((intents,id) => {
      let amount = 0;
      (Array.isArray(intents) ? intents : []).forEach(intent => {
        const source = sourceEntity('enemy', intent?.sourceId);
        const fallback = source?.weapon ? Number(weapons[source.weapon]?.damage || 0) : 0;
        amount += Math.max(0, Number(intent?.damage ?? fallback) || 0);
      });
      if(amount > 0) direct.set(id, amount);
    });
    return direct;
  }

  function adjacentLivingPlayerRooms(magazine){
    return playerRooms.filter(room =>
      room.id !== magazine.id && room.hp > 0 &&
      Math.abs(room.col - magazine.col) <= 1 &&
      Math.abs(room.row - magazine.row) <= 1
    );
  }

  function rebuildCurrentWorldExplosionProjection(dist){
    if(!dist || !(dist.targetMap instanceof Map)) return dist;
    const hits = directDamageFromTargetMap(dist);
    const explosions = new Map();
    const exploded = new Set();
    let changed = true;

    while(changed){
      changed = false;
      playerRooms.filter(room => room.isMagazine && room.hp > 0).forEach(mag => {
        if(exploded.has(mag.id)) return;
        if((hits.get(mag.id) || 0) < mag.hp) return;
        exploded.add(mag.id);
        changed = true;
        adjacentLivingPlayerRooms(mag).forEach(room => {
          hits.set(room.id, (hits.get(room.id) || 0) + 1);
          explosions.set(room.id, (explosions.get(room.id) || 0) + 1);
        });
      });
    }

    const damageTypes = new Map();
    hits.forEach((total,id) => {
      const explosive = Math.max(0, Math.min(total, Number(explosions.get(id) || 0)));
      damageTypes.set(id, [
        ...Array(Math.max(0,total-explosive)).fill('cannon'),
        ...Array(explosive).fill('explosive')
      ]);
    });
    return {...dist,hits,explosions,damageTypes,projectionAuthority:'v26-current-world'};
  }

  const previousEnemyIntentDistribution = enemyIntentDistribution;
  enemyIntentDistribution = function(playerState = playerIntentDistribution()){
    return rebuildCurrentWorldExplosionProjection(previousEnemyIntentDistribution(playerState));
  };

  // -----------------------------------------------------------------------
  // Canonical utility / ammo renderer. Older layers may decorate earlier in refresh, but this is
  // the single final pass. It READS combatTurn/combatUtility and never writes readiness state.
  // -----------------------------------------------------------------------
  function arrowFor(source,target){
    if(source.id === target.id) return '♥';
    const dx = Math.sign(target.col-source.col), dy = Math.sign(target.row-source.row);
    return {'-1,-1':'↖','0,-1':'↑','1,-1':'↗','-1,0':'←','1,0':'→','-1,1':'↙','0,1':'↓','1,1':'↘'}[`${dx},${dy}`] || '•';
  }

  function clearUtilityPresentation(){
    document.querySelectorAll('.utility-reach-arrow,.utility-used-badge,.v12-utility-icon,.v12-ammo-status,.loading-v4').forEach(n => n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable,.utility-reachable,.utility-reach-inactive,.utility-outside-range,.action-ready').forEach(el => {
      el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable','utility-reachable','utility-reach-inactive','utility-outside-range','action-ready');
    });
  }

  function renderWeaponStatus(){
    playerRooms.filter(r => r.weapon).forEach(room => {
      const el = getEntityElement('player',room.id); if(!el) return;
      const ready = room.hp > 0 && !!window.combatTurn?.isReady(room.id);
      const ammo = document.createElement('div');
      ammo.className = `v12-ammo-status ${ready ? 'loaded' : 'empty'}${room.hp <= 0 ? ' disabled' : ''}`;
      ammo.innerHTML = `<span>${ready ? '●' : '○'}</span>`;
      ammo.title = room.hp <= 0 ? 'Disabled' : (ready ? 'Cannonball loaded' : 'Cannonball empty — loading');
      el.appendChild(ammo);
      if(room.hp > 0 && !ready){
        const badge = document.createElement('div');
        badge.className = 'loading-v4';
        badge.innerHTML = '<span class="wheel">↻</span><span>LOAD</span>';
        el.appendChild(badge);
      }
    });
  }

  function renderUtilityStatus(){
    if(!window.combatUtility) return;
    const selectedId = combatUtility.selected;

    playerRooms.filter(r => r.actionType === 'repair' || r.actionType === 'quickLoad').forEach(room => {
      const el = getEntityElement('player',room.id); if(!el) return;
      el.classList.add('v12-utility-room');
      const used = !!combatUtility.isUsed(room.id);
      const available = !!combatUtility.isAvailable(room);
      if(used) el.classList.add('utility-used');
      else if(room.hp <= 0 || !available) el.classList.add('utility-unavailable');
      else el.classList.add('action-ready');

      const icon = document.createElement('div');
      icon.className = `v12-utility-icon ${room.actionType}${available && !used ? ' ready' : ' faded'}${used ? ' spent' : ''}`;
      icon.textContent = room.actionType === 'repair' ? '♥+' : '↻+';
      icon.title = room.actionType === 'repair'
        ? (used ? 'Repair used this turn' : available ? 'Repair available' : 'No repair target')
        : (used ? 'Quick Load used this turn' : available ? 'Quick Load available' : 'No loading adjacent gun');
      el.appendChild(icon);
    });

    if(!selectedId) return;
    const source = playerRoom(selectedId); if(!source) return;
    const sourceEl = getEntityElement('player',source.id); if(sourceEl) sourceEl.classList.add('utility-selected');
    const reachable = new Set((combatUtility.reachableRooms(source) || []).map(r => r.id));
    const eligible = new Set((combatUtility.eligibleTargets(source) || []).map(r => r.id));

    playerRooms.forEach(target => {
      const el = getEntityElement('player',target.id); if(!el) return;
      if(!reachable.has(target.id)){
        if(target.id !== source.id) el.classList.add('utility-outside-range');
        return;
      }
      el.classList.add('utility-reachable');
      el.classList.add(eligible.has(target.id) ? 'utility-target' : 'utility-reach-inactive');
      if(target.id === source.id && source.actionType !== 'repair') return;
      const arrow = document.createElement('div');
      arrow.className = `utility-reach-arrow${eligible.has(target.id) ? ' active' : ''}`;
      arrow.textContent = arrowFor(source,target);
      arrow.title = eligible.has(target.id) ? 'Action can reach this room' : 'In range, but not applicable';
      el.appendChild(arrow);
    });
  }

  function renderCanonicalPlanningUI(){
    if(!isPlanning()) return;
    clearUtilityPresentation();
    renderWeaponStatus();
    renderUtilityStatus();
  }

  // -----------------------------------------------------------------------
  // Development counters. Consumption is counted but not limited.
  // -----------------------------------------------------------------------
  const ledger = {cannonballsFired:0,timberCommitted:0,pendingTimber:0,repairTurn:currentTurn(),ended:false};
  function pendingRepairCount(){try{return combatUtility?.plannedRepairs?.().length || 0;}catch{return 0;}}
  function syncRepairLedger(){
    const turn=currentTurn();
    if(turn!==ledger.repairTurn){ledger.timberCommitted+=ledger.pendingTimber;ledger.pendingTimber=0;ledger.repairTurn=turn;}
    ledger.pendingTimber=pendingRepairCount();
  }
  function totalTimberUsed(){return ledger.timberCommitted+ledger.pendingTimber;}
  function renderStats(){
    const host=document.querySelector('.player-corner'); if(!host) return;
    let stats=host.querySelector('.v22-dev-stats');
    if(!stats){stats=document.createElement('span');stats.className='v22-dev-stats';stats.title='Development counters only — ammo and Timber limits are not enforced';host.appendChild(stats);}
    stats.textContent=`BALLS FIRED ${ledger.cannonballsFired} · TIMBER USED ${totalTimberUsed()}`;
  }
  const projectileLayer=stage.querySelector('.v3-projectile-layer');
  if(projectileLayer){
    new MutationObserver(records=>{
      let added=0;
      records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof Element&&node.matches('.v3-ball.player'))added++;}));
      if(added){ledger.cannonballsFired+=added;renderStats();}
    }).observe(projectileLayer,{childList:true});
  }

  // -----------------------------------------------------------------------
  // Persistent combat log. R and new-turn clears no longer erase earlier turns.
  // -----------------------------------------------------------------------
  const logLines=stage.querySelector('.v3-log-lines');
  const logArchive=[]; const logIds=new Set(); let logSerial=0,restoringLog=false;
  function archiveLine(node){
    if(!(node instanceof Element)||!node.matches('.v3-log-line'))return;
    if(!node.dataset.v26LogId)node.dataset.v26LogId=`log-${++logSerial}`;
    const id=node.dataset.v26LogId;if(logIds.has(id))return;
    logIds.add(id);logArchive.push({id,html:node.outerHTML});
  }
  function archiveTree(node){if(!(node instanceof Element))return;archiveLine(node);node.querySelectorAll?.('.v3-log-line').forEach(archiveLine);}
  function restoreFullLog(){
    if(!logLines||restoringLog||!logArchive.length)return;
    const present=new Set([...logLines.querySelectorAll('.v3-log-line')].map(n=>n.dataset.v26LogId).filter(Boolean));
    if(logArchive.every(entry=>present.has(entry.id)))return;
    restoringLog=true;logLines.innerHTML=logArchive.map(entry=>entry.html).join('');logLines.scrollTop=logLines.scrollHeight;restoringLog=false;
  }
  if(logLines){
    logLines.querySelectorAll('.v3-log-line').forEach(archiveLine);
    new MutationObserver(records=>{
      if(restoringLog)return;let removal=false;
      records.forEach(record=>{record.addedNodes.forEach(archiveTree);record.removedNodes.forEach(node=>{archiveTree(node);removal=true;});});
      if(removal)queueMicrotask(restoreFullLog);
    }).observe(logLines,{childList:true});
  }

  // -----------------------------------------------------------------------
  // Committed-action readability. Lines animate once immediately, then once every 2.3s while
  // still hovered/held. Key state is edge-triggered, so OS key-repeat cannot restart animation.
  // -----------------------------------------------------------------------
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('class','v24-action-readability-overlay');overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<defs><marker id="v26GreenArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="v24-support-arrow-head"/></marker></defs>';
  stage.appendChild(overlay);
  let hoverPlan=null,heldMode=null,replayTimer=null; const REPLAY_MS=2300;

  function clearLines(){
    [...overlay.querySelectorAll('.v24-action-line')].forEach(n=>n.remove());
    document.querySelectorAll('.v24-target-pulse,.v24-support-pulse').forEach(el=>el.classList.remove('v24-target-pulse','v24-support-pulse'));
  }
  function center(el){const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};}
  function addLine(a,b,kind,{arrow=false}={}){
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('pathLength','1');line.setAttribute('class',`v24-action-line ${kind}`);
    if(arrow)line.setAttribute('marker-end','url(#v26GreenArrow)');overlay.appendChild(line);
  }
  function enemyAimPoint(intent){
    const impact=projectedEnemyImpact(intent);
    if(impact){const el=getEntityElement('player',impact.id);if(el)return{point:center(el),targetEl:el};}
    const pg=playerGrid.getBoundingClientRect(),sr=stage.getBoundingClientRect();
    if(intent.lane==='mast')return{point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:pg.top-sr.top-34},targetEl:null};
    return{point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:laneY('player',intent.lane)+ROOM_H()/2},targetEl:null};
  }
  function drawFriendlyShot(sourceId,{pulse=true}={}){
    const targetId=state.playerIntents?.[sourceId],source=playerRoom(sourceId),target=targetId?sourceEntity('enemy',targetId):null;
    const se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('enemy',target.id);
    if(!source||!target||!se||!te||source.hp<=0||!combatTurn.isReady(source.id))return;
    addLine(center(se),center(te),'friendly-fire');
    if(pulse){te.classList.add('v24-target-pulse');setTimeout(()=>te.classList.remove('v24-target-pulse'),760);}
  }
  function drawEnemyShot(sourceId,{pulse=true}={}){
    const source=sourceEntity('enemy',sourceId),intent=enemyIntents.find(i=>i.sourceId===sourceId&&!i.inactive),se=source&&getEntityElement('enemy',source.id);
    if(!source||!intent||!se||source.hp<=0||!combatTurn.isReady(source.id))return;
    const aim=enemyAimPoint(intent);addLine(center(se),aim.point,'enemy-fire');
    if(pulse&&aim.targetEl){aim.targetEl.classList.add('v24-target-pulse');setTimeout(()=>aim.targetEl.classList.remove('v24-target-pulse'),760);}
  }
  function supportPlanForSource(sourceId){
    if(!window.combatUtility)return null;
    const repair=(combatUtility.plannedRepairs?.()||[]).find(p=>p.sourceId===sourceId);
    if(repair&&repair.targetId!==sourceId)return{kind:'repair',sourceId,targetId:repair.targetId};
    const source=playerRoom(sourceId);if(!source||source.actionType!=='quickLoad'||!combatUtility.isUsed(sourceId))return null;
    const targetId=(combatUtility.quickLoadedTargets?.()||[]).find(id=>{const target=playerRoom(id);return target&&combatUtility.inReach(source,target);});
    return targetId&&targetId!==sourceId?{kind:'quickLoad',sourceId,targetId}:null;
  }
  function drawSupport(plan,{pulse=true}={}){
    const source=playerRoom(plan.sourceId),target=playerRoom(plan.targetId),se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('player',target.id);
    if(!source||!target||!se||!te||source.id===target.id)return;
    addLine(center(se),center(te),'support',{arrow:true});
    if(pulse){te.classList.add('v24-support-pulse');setTimeout(()=>te.classList.remove('v24-support-pulse'),760);}
  }
  function renderReadability(){
    clearLines();
    if(!isPlanning()||document.body.classList.contains('v11-intent-preview-active'))return;
    if(heldMode==='enemy'){enemyRooms.filter(r=>r.weapon&&r.hp>0&&combatTurn.isReady(r.id)).forEach(r=>drawEnemyShot(r.id,{pulse:false}));return;}
    if(heldMode==='player'){Object.keys(state.playerIntents||{}).forEach(id=>drawFriendlyShot(id,{pulse:false}));return;}
    if(!hoverPlan)return;
    if(hoverPlan.kind==='friendly-fire')drawFriendlyShot(hoverPlan.sourceId);else if(hoverPlan.kind==='support')drawSupport(hoverPlan.plan);
  }
  function stopReplayTimer(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;}}
  function startReplayTimer(){stopReplayTimer();if(hoverPlan||heldMode)replayTimer=setInterval(renderReadability,REPLAY_MS);}

  stage.addEventListener('pointerover',e=>{
    if(heldMode||!isPlanning()||document.body.classList.contains('v11-intent-preview-active'))return;
    const room=e.target.closest?.('.room[data-side="player"]');if(!room||room.contains(e.relatedTarget))return;
    const id=room.dataset.id,entity=playerRoom(id);if(!entity)return;
    if(entity.weapon&&state.playerIntents?.[id])hoverPlan={kind:'friendly-fire',sourceId:id};
    else{const plan=supportPlanForSource(id);if(!plan)return;hoverPlan={kind:'support',plan};}
    renderReadability();startReplayTimer();
  },true);
  stage.addEventListener('pointerout',e=>{
    if(heldMode)return;const room=e.target.closest?.('.room[data-side="player"]');if(!room||room.contains(e.relatedTarget)||!hoverPlan)return;
    hoverPlan=null;clearLines();startReplayTimer();
  },true);
  window.addEventListener('keydown',e=>{
    if(!isPlanning()||document.body.classList.contains('v11-intent-preview-active'))return;
    if(e.code==='KeyZ'){
      if(heldMode==='enemy')return;
      heldMode='enemy';hoverPlan=null;renderReadability();startReplayTimer();
    }else if(e.code==='KeyX'){
      if(heldMode==='player')return;
      heldMode='player';hoverPlan=null;renderReadability();startReplayTimer();
    }
  },true);
  window.addEventListener('keyup',e=>{
    if((e.code==='KeyZ'&&heldMode==='enemy')||(e.code==='KeyX'&&heldMode==='player')){heldMode=null;clearLines();startReplayTimer();}
  },true);

  // -----------------------------------------------------------------------
  // Reset + replay enemy intentions. Existing R handlers perform the gameplay rollback; enemyAI
  // owns the preview/input lock.
  // -----------------------------------------------------------------------
  const replayButton=document.createElement('button');
  replayButton.className='v24-replay-intents';replayButton.textContent='↻ INTENTS [I]';replayButton.title='Reset this turn and replay enemy intentions';stage.appendChild(replayButton);
  function positionReplayButton(){replayButton.style.top=`${trackRow.offsetTop+50}px`;}
  function updateReplayButton(){replayButton.disabled=!!(!isPlanning()||document.body.classList.contains('v11-intent-preview-active'));positionReplayButton();}
  function replayEnemyIntentions(){
    if(!isPlanning()||document.body.classList.contains('v11-intent-preview-active'))return;
    clearLines();hoverPlan=null;heldMode=null;startReplayTimer();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true,cancelable:true}));
    window.enemyAI?.replay?.();updateReplayButton();
  }
  replayButton.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();replayEnemyIntentions();},true);
  window.addEventListener('keydown',e=>{if(e.code!=='KeyI'||e.repeat)return;if(!isPlanning()||document.body.classList.contains('v11-intent-preview-active'))return;e.preventDefault();e.stopPropagation();replayEnemyIntentions();},true);

  // -----------------------------------------------------------------------
  // Final refresh ownership: render from state after every older decorator has completed.
  // No combatTurn setter is called here.
  // -----------------------------------------------------------------------
  const baseRefresh=refresh;
  refresh=function(){
    baseRefresh();
    syncRepairLedger();
    renderCanonicalPlanningUI();
    renderStats();
    if(hoverPlan||heldMode)renderReadability();
    updateReplayButton();
  };

  new MutationObserver(()=>{
    updateReplayButton();
    if(!document.body.classList.contains('v11-intent-preview-active')&&(hoverPlan||heldMode))renderReadability();
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>{positionReplayButton();if(hoverPlan||heldMode)renderReadability();});
  window.addEventListener('combat-ended',()=>{
    if(!ledger.ended){syncRepairLedger();ledger.timberCommitted+=ledger.pendingTimber;ledger.pendingTimber=0;ledger.ended=true;renderStats();}
    clearLines();stopReplayTimer();updateReplayButton();
  });

  window.combatPlanningRenderer={
    get turn(){return currentTurn();},
    get archivedLogLines(){return logArchive.length;},
    restoreLog:restoreFullLog,
    currentEnemyProjection(){try{return enemyIntentDistribution(playerIntentDistribution());}catch{return null;}},
    render:renderCanonicalPlanningUI
  };

  positionReplayButton();
  refresh();
})();