(() => {
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const preview={active:false,running:false,token:0,revealedSources:new Set(),revealedUtilities:new Set(),disabledSeen:new Set(),scheduled:null};
  const provisionalOriginals=new Map();
  const deferredLoadProgress=new Set();
  const playerQuickLoaded=new Map();
  const enemyQuickLoaded=new Map();
  let actionSerial=0;

  window.enemyActionIntents=[];

  const tracerOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tracerOverlay.setAttribute('class','v11-intent-tracer-overlay'); tracerOverlay.setAttribute('aria-hidden','true'); stage.appendChild(tracerOverlay);
  const playerTraceOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  playerTraceOverlay.setAttribute('class','v11-player-tracer-overlay'); playerTraceOverlay.setAttribute('aria-hidden','true'); stage.appendChild(playerTraceOverlay);
  const movementOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  movementOverlay.setAttribute('class','v11-movement-overlay'); movementOverlay.setAttribute('aria-hidden','true'); stage.appendChild(movementOverlay);
  const utilityOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  utilityOverlay.setAttribute('class','v11-utility-link-overlay'); utilityOverlay.setAttribute('aria-hidden','true'); stage.appendChild(utilityOverlay);

  const previewOverlay=document.createElement('div');
  previewOverlay.className='v11-intent-preview';
  previewOverlay.innerHTML=`<div class="v11-intent-card"><div class="v11-intent-turn">TURN <span>1</span></div><div class="v11-intent-title">ENEMY INTENTIONS</div><div class="v11-intent-detail">Reading the enemy line…</div></div>`;
  stage.appendChild(previewOverlay);
  const turnEl=previewOverlay.querySelector('.v11-intent-turn span'),titleEl=previewOverlay.querySelector('.v11-intent-title'),detailEl=previewOverlay.querySelector('.v11-intent-detail');

  function currentTurn(){return window.combatTurn?.turn||1;}
  function roomById(id){return [...playerRooms,...enemyRooms].find(r=>r.id===id)||null;}
  function enemyRoom(id){return enemyRooms.find(r=>r.id===id)||null;}
  function knownRoom(room){return !!room&&(!room.hidden||room.revealed);}
  function stateFor(room){return room?.weapon&&window.combatTurn?.getWeaponState?combatTurn.getWeaponState(room.id):null;}
  function currentlyReady(room){return !!(room&&room.weapon&&room.hp>0&&stateFor(room)?.mode==='ready');}
  function currentActions(){return (window.enemyActionIntents||[]).filter(a=>a.turn===currentTurn());}
  function activeEnemyIntent(sourceId){return enemyIntents.find(i=>i.sourceId===sourceId&&!i.inactive)||null;}
  function plannedDamageTo(id){try{return playerIntentDistribution()?.hits?.get(id)||0;}catch{return 0;}}
  function playerActionCommitted(){return window.combatFactory?.hasCommittedPlayerAction?combatFactory.hasCommittedPlayerAction():Object.keys(state.playerIntents||{}).length>0;}
  function adjacent8(a,b){return !!(a&&b&&a.id!==b.id&&Math.abs(a.col-b.col)<=1&&Math.abs(a.row-b.row)<=1);}
  function orthogonal(a,b){return !!(a&&b&&a.id!==b.id&&Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1);}

  function buildEnemyActions(){
    provisionalOriginals.clear(); deferredLoadProgress.clear();
    const turn=currentTurn(),actions=[];

    enemyRooms.filter(r=>r.actionType==='repair'&&r.hp>0).sort((a,b)=>(a.col-b.col)||(a.row-b.row)).forEach(source=>{
      const targets=enemyRooms.filter(r=>r.hp>0&&r.hp<r.max&&adjacent8(source,r)).sort((a,b)=>{
        const missing=(b.max-b.hp)-(a.max-a.hp); if(missing)return missing;
        const ratio=(a.hp/a.max)-(b.hp/b.max); if(ratio)return ratio;
        return (a.col-b.col)||(a.row-b.row);
      });
      if(targets[0])actions.push({id:`repair-${turn}-${++actionSerial}`,turn,sourceId:source.id,targetId:targets[0].id,actionType:'repair',sourceWasHiddenAtPlan:!knownRoom(source)});
    });

    const assigned=new Set();
    enemyRooms.filter(r=>r.actionType==='quickLoad'&&r.hp>0).sort((a,b)=>(a.col-b.col)||(a.row-b.row)).forEach(source=>{
      const targets=enemyRooms.filter(r=>r.weapon&&r.hp>0&&!assigned.has(r.id)&&orthogonal(source,r)&&stateFor(r)?.mode==='loading').sort((a,b)=>{
        const damage=(weapons[b.weapon]?.damage||0)-(weapons[a.weapon]?.damage||0); if(damage)return damage;
        return (a.col-b.col)||(a.row-b.row);
      });
      if(targets[0]){
        const target=targets[0],original=stateFor(target); assigned.add(target.id); provisionalOriginals.set(target.id,{...original});
        actions.push({id:`quick-${turn}-${++actionSerial}`,turn,sourceId:source.id,targetId:target.id,actionType:'quickLoad',sourceWasHiddenAtPlan:!knownRoom(source),provisionalActive:false});
      }
    });

    window.enemyActionIntents=actions; syncProvisionalQuickLoads(); refresh();
  }

  function sourcePredictedDestroyed(source){return !!source&&source.hp-plannedDamageTo(source.id)<=0;}
  function targetPredictedDestroyed(target){return !!target&&target.hp-plannedDamageTo(target.id)<=0;}
  function utilityIntentCancelled(action,{actualOnly=false}={}){
    const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);
    if(!source||!target||source.hp<=0||target.hp<=0)return true;
    if(actualOnly)return false;
    if(targetPredictedDestroyed(target))return true;
    if(knownRoom(source)&&sourcePredictedDestroyed(source))return true;
    return false;
  }

  function syncProvisionalQuickLoads(){
    if(window.combatTurn?.resolving||window.combatEnded)return;
    currentActions().filter(a=>a.actionType==='quickLoad').forEach(action=>{
      const target=enemyRoom(action.targetId),original=provisionalOriginals.get(action.targetId); if(!target||!original)return;
      const cancelled=utilityIntentCancelled(action);
      if(cancelled){combatTurn.setWeaponState(target.id,{...original});action.provisionalActive=false;enemyQuickLoaded.delete(target.id);}
      else{combatTurn.setReady(target.id);action.provisionalActive=true;}
    });
  }

  const previousEnemyIntentDistribution=enemyIntentDistribution;
  enemyIntentDistribution=function(playerState=playerIntentDistribution()){
    const actions=currentActions().filter(a=>a.actionType==='quickLoad'),temporarilyReady=[];
    if(!window.combatTurn?.resolving){
      actions.forEach(action=>{
        if(utilityIntentCancelled(action))return;
        const target=enemyRoom(action.targetId);if(!target||currentlyReady(target))return;
        temporarilyReady.push([target.id,stateFor(target)]);combatTurn.setReady(target.id);
      });
    }
    const saved=enemyIntents.slice();
    if(preview.active)enemyIntents.splice(0,enemyIntents.length,...saved.filter(i=>preview.revealedSources.has(i.sourceId)));
    try{return previousEnemyIntentDistribution(playerState);}
    finally{
      if(preview.active)enemyIntents.splice(0,enemyIntents.length,...saved);
      temporarilyReady.forEach(([id,s])=>combatTurn.setWeaponState(id,s));
    }
  };

  function clearThreatDensity(){document.querySelectorAll('[data-threat-count]').forEach(el=>el.removeAttribute('data-threat-count'));}
  function decorateThreatDensity(){
    clearThreatDensity();let dist;try{dist=enemyIntentDistribution(playerIntentDistribution());}catch{return;}
    dist?.targetMap?.forEach((intents,id)=>{const el=getEntityElement('player',id);if(el)el.dataset.threatCount=String(Math.max(1,Math.min(4,intents.length)));});
  }
  function clearOverviewSources(){document.querySelectorAll('.v11-overview-fire-enemy,.v11-overview-fire-player,.v11-overview-reload-enemy,.v11-overview-reload-player,.v11-overview-cancelled').forEach(el=>el.classList.remove('v11-overview-fire-enemy','v11-overview-fire-player','v11-overview-reload-enemy','v11-overview-reload-player','v11-overview-cancelled'));}
  function decorateOverviewSources(){
    clearOverviewSources();const z=document.body.classList.contains('v9-z-held'),x=document.body.classList.contains('v9-x-held');
    if(z)enemyRooms.filter(r=>r.weapon).forEach(room=>{
      const el=getEntityElement('enemy',room.id);if(!el||room.hp<=0)return;const intent=activeEnemyIntent(room.id);
      if(sourcePredictedDestroyed(room)&&knownRoom(room)){el.classList.add('v11-overview-cancelled');return;}
      if(currentlyReady(room)&&intent)el.classList.add('v11-overview-fire-enemy');else el.classList.add('v11-overview-reload-enemy');
    });
    if(x)playerRooms.filter(r=>r.weapon).forEach(room=>{
      const el=getEntityElement('player',room.id);if(!el||room.hp<=0)return;
      if(currentlyReady(room)){if(Object.prototype.hasOwnProperty.call(state.playerIntents||{},room.id))el.classList.add('v11-overview-fire-player');}
      else el.classList.add('v11-overview-reload-player');
    });
  }

  const previousRenderTrack=renderTrack;
  renderTrack=function(){
    previousRenderTrack();const start=state.turnStartMast??window.combatTurn?.startMast??state.playerMastTrack,locked=playerActionCommitted();
    [...trackRow.children].forEach((cell,index)=>{
      const inHull=index>=PLAYER_MAST_MIN&&index<=PLAYER_MAST_MAX,inTurn=Math.abs(index-start)<=1,isCurrent=index===state.playerMastTrack;
      const reachable=isCurrent||(!locked&&playerMast.hp>0&&inHull&&inTurn);
      cell.classList.toggle('track-unreachable',!reachable);cell.classList.toggle('track-reachable',reachable);cell.classList.toggle('track-current',isCurrent);
    });
  };

  function applyLayout(){
    const enemyTop=92,trackTop=enemyTop+(ENEMY_SHIP_SETUP.rows*ROOM_H())+74,playerTop=trackTop+156,minHeight=playerTop+(PLAYER_SHIP_SETUP.rows*ROOM_H())+175;
    enemyBlock.style.setProperty('top',`${enemyTop}px`,'important');trackRow.style.setProperty('top',`${trackTop}px`,'important');
    const chev=stage.querySelector('.track-chevrons');if(chev)chev.style.setProperty('top',`${trackTop-1}px`,'important');
    playerBlock.style.setProperty('top',`${playerTop}px`,'important');
    const end=stage.querySelector('.v3-end-turn');if(end)end.style.setProperty('top',`${trackTop+50}px`,'important');
    const turn=stage.querySelector('.v9-turn-number');if(turn)turn.style.setProperty('top',`${trackTop+96}px`,'important');
    stage.style.setProperty('min-height',`${minHeight}px`,'important');
  }
  function renderMovementArrow(){
    movementOverlay.innerHTML='';const start=state.turnStartMast??window.combatTurn?.startMast??state.playerMastTrack,end=state.playerMastTrack;if(start===end)return;
    const sr=stage.getBoundingClientRect(),cells=[...trackRow.children],a=cells[start]?.getBoundingClientRect(),b=cells[end]?.getBoundingClientRect();if(!a||!b)return;
    const x1=a.left-sr.left+a.width/2,y1=a.top-sr.top+a.height/2,x2=b.left-sr.left+b.width/2,y2=b.top-sr.top+b.height/2;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);line.setAttribute('class','v11-move-line');movementOverlay.appendChild(line);
    const head=document.createElementNS('http://www.w3.org/2000/svg','text');head.setAttribute('x',x2+(end>start?-11:11));head.setAttribute('y',y2+5);head.setAttribute('text-anchor','middle');head.setAttribute('class','v11-move-head');head.textContent=end>start?'▶':'◀';movementOverlay.appendChild(head);
  }

  function utilityVisible(action,index){if(!preview.active)return true;return preview.revealedUtilities.has(action.id||`${action.sourceId}:${index}`);}
  function renderEnemyUtilityIntents(){
    document.querySelectorAll('.v11-enemy-action-chip').forEach(n=>n.remove());
    currentActions().forEach((action,index)=>{
      if(!utilityVisible(action,index))return;const target=enemyRoom(action.targetId),el=target&&getEntityElement('enemy',target.id);if(!el)return;
      const cancelled=utilityIntentCancelled(action),chip=document.createElement('div');chip.className=`v11-enemy-action-chip ${action.actionType}${cancelled?' cancelled':''}`;chip.textContent=action.actionType==='repair'?'♥+':'↻+';chip.title=cancelled?'Cancelled':(action.actionType==='repair'?'Enemy repair':'Enemy Quick Load');el.appendChild(chip);
    });
  }
  function renderQuickLoadMarkers(){
    document.querySelectorAll('.v11-quickloaded-badge').forEach(n=>n.remove());
    playerQuickLoaded.forEach((turn,id)=>{if(turn!==currentTurn())return;const el=getEntityElement('player',id);if(el){const b=document.createElement('div');b.className='v11-quickloaded-badge player';b.textContent='↻+';b.title='Quick Loaded';el.appendChild(b);}});
    enemyQuickLoaded.forEach((turn,id)=>{if(turn!==currentTurn())return;const el=getEntityElement('enemy',id);if(el){const b=document.createElement('div');b.className='v11-quickloaded-badge enemy';b.textContent='↻+';b.title='Quick Loaded';el.appendChild(b);}});
  }
  function decorateFlooded(){
    document.querySelectorAll('.v11-flood-marker').forEach(n=>n.remove());
    document.querySelectorAll('.v11-flooded').forEach(n=>n.classList.remove('v11-flooded'));
    [['player',playerRooms,PLAYER_SHIP_SETUP],['enemy',enemyRooms,ENEMY_SHIP_SETUP]].forEach(([side,rooms,setup])=>{
      const bottom=(setup.rows||1)-1;
      rooms.filter(r=>r.row===bottom&&r.hp<=0).forEach(room=>{
        const el=getEntityElement(side,room.id);if(!el)return;el.classList.add('v11-flooded');
        const marker=document.createElement('div');marker.className='v11-flood-marker';marker.innerHTML='<span>≈</span><b>FLOODED</b>';marker.title='Flooded lower-deck room';el.appendChild(marker);
      });
    });
  }

  function revealAnyDamagedUnknowns(){const out=[];enemyRooms.forEach(room=>{if(room.hidden&&!room.revealed&&room.hp<room.max){room.revealed=true;room.name=room.revealName||'REVEALED ROOM';out.push(room.id);}});return out;}
  function decoratePreviewConcealment(){enemyRooms.filter(r=>r.weapon).forEach(room=>{const el=getEntityElement('enemy',room.id);if(el)el.classList.toggle('v11-preview-unrevealed',preview.active&&!preview.revealedSources.has(room.id));});}

  const previousRefresh=refresh;
  refresh=function(){
    if(!window.combatTurn?.resolving)syncProvisionalQuickLoads();
    const revealed=revealAnyDamagedUnknowns();if(revealed.length)renderShips();
    previousRefresh();applyLayout();decorateThreatDensity();decoratePreviewConcealment();decorateOverviewSources();renderEnemyUtilityIntents();renderQuickLoadMarkers();decorateFlooded();renderMovementArrow();
    revealed.forEach(id=>{const el=getEntityElement('enemy',id);if(el)showRoomTooltip(el,'Revealed');});
  };

  function center(el){const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};}
  function endpoint(intent,impact){if(impact){const el=getEntityElement('player',impact.id);if(el)return center(el);}if(intent.lane==='mast')return center(playerMastBox);const pg=playerGrid.getBoundingClientRect(),sg=stage.getBoundingClientRect(),rows=Math.max(1,PLAYER_SHIP_SETUP.rows||1);return{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:pg.top-sg.top+(Number(intent.lane)+.5)*(pg.height/rows)};}
  async function animateEnemyTrace(source,intent,impact,token){
    tracerOverlay.innerHTML='';const sourceEl=getEntityElement('enemy',source.id);if(!sourceEl)return;const a=center(sourceEl),b=endpoint(intent,impact),line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('pathLength','1');line.setAttribute('class',`v11-intent-tracer${impact?'':' miss'}`);tracerOverlay.appendChild(line);sourceEl.classList.add('v11-preview-source');await wait(390);if(token!==preview.token)return;sourceEl.classList.remove('v11-preview-source');
  }
  function flash(el,cls,duration=560){if(!el)return;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),duration);}
  async function animateUtilityCancellation(source,target,kind='quickLoad'){
    utilityOverlay.innerHTML='';const sourceEl=source&&getEntityElement('enemy',source.id),targetEl=target&&getEntityElement('enemy',target.id);if(!sourceEl||!targetEl)return;
    const a=center(sourceEl),b=center(targetEl),line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('pathLength','1');line.setAttribute('class','v11-utility-cancel-link');utilityOverlay.appendChild(line);
    const x=document.createElementNS('http://www.w3.org/2000/svg','text');x.setAttribute('x',(a.x+b.x)/2);x.setAttribute('y',(a.y+b.y)/2+6);x.setAttribute('text-anchor','middle');x.setAttribute('class','v11-utility-cancel-x');x.textContent='×';utilityOverlay.appendChild(x);
    flash(sourceEl,'v11-preview-green',650);flash(targetEl,'v11-preview-green',650);await wait(360);line.classList.add('cancelled');x.classList.add('visible');await wait(kind==='quickLoad'?620:420);utilityOverlay.innerHTML='';
  }

  async function revealUtility(action,index,token){
    const key=action.id||`${action.sourceId}:${index}`,target=enemyRoom(action.targetId),targetEl=target&&getEntityElement('enemy',target.id),cancelled=utilityIntentCancelled(action);
    detailEl.textContent=action.actionType==='repair'?`REPAIR → ${target?.name||'room'}`:`QUICK LOAD → ${target?.name||'gun'}`;
    preview.revealedUtilities.add(key);refresh();if(targetEl)flash(targetEl,'v11-preview-green',680);if(cancelled&&targetEl)showRoomTooltip(targetEl,'Cancelled');await wait(650);if(token!==preview.token)return;
  }
  function quickLoadActionForGun(id){return currentActions().find(a=>a.actionType==='quickLoad'&&a.targetId===id&&!utilityIntentCancelled(a))||null;}
  async function revealWeapon(room,token){
    const label=weapons[room.weapon]?.name||room.name;
    if(room.hp<=0){if(preview.disabledSeen.has(room.id))return;preview.disabledSeen.add(room.id);detailEl.textContent=`${label} — DISABLED`;flash(getEntityElement('enemy',room.id),'v11-preview-disabled',460);await wait(430);return;}
    if(!currentlyReady(room)){detailEl.textContent=`${label} — ↻ LOADING`;preview.revealedSources.add(room.id);refresh();flash(getEntityElement('enemy',room.id),'v11-preview-loading',620);await wait(560);return;}
    const intent=activeEnemyIntent(room.id);if(!intent){detailEl.textContent=`${label} — HOLDING FIRE`;preview.revealedSources.add(room.id);refresh();await wait(390);return;}
    const impact=projectedEnemyImpact(intent),quick=quickLoadActionForGun(room.id);detailEl.textContent=impact?`${label}${quick?' (QUICK LOADED)':''} → ${impact.name}`:`${label} → MISS`;
    await animateEnemyTrace(room,intent,impact,token);if(token!==preview.token)return;preview.revealedSources.add(room.id);refresh();if(impact)flash(getEntityElement('player',impact.id),'v11-preview-target-flash',540);await wait(510);
  }
  function previewItems(){
    const utilities=currentActions().map((action,index)=>({kind:'utility',action,index,source:enemyRoom(action.sourceId)})).sort((a,b)=>((a.source?.col??999)-(b.source?.col??999))||((a.source?.row??999)-(b.source?.row??999)));
    const weaponsList=enemyRooms.filter(r=>r.weapon&&!(r.hp<=0&&preview.disabledSeen.has(r.id))).sort((a,b)=>(a.col-b.col)||(a.row-b.row)).map(room=>({kind:'weapon',room}));
    return [...utilities,...weaponsList];
  }
  async function runPreview(){
    if(preview.running||window.combatTurn?.resolving||window.combatEnded)return;preview.running=true;const token=++preview.token;preview.active=true;preview.revealedSources.clear();preview.revealedUtilities.clear();tracerOverlay.innerHTML='';turnEl.textContent=String(currentTurn());titleEl.textContent='ENEMY INTENTIONS';detailEl.textContent='Reading the enemy line…';previewOverlay.classList.add('visible');document.body.classList.add('v11-intent-preview-active');refresh();await wait(220);
    for(const item of previewItems()){if(token!==preview.token||window.combatEnded)return;if(item.kind==='utility')await revealUtility(item.action,item.index,token);else await revealWeapon(item.room,token);}
    if(token!==preview.token||window.combatEnded)return;preview.active=false;tracerOverlay.innerHTML='';refresh();titleEl.textContent='YOUR TURN';detailEl.textContent='Make your move.';previewOverlay.classList.add('handoff');await wait(720);if(token!==preview.token)return;previewOverlay.classList.remove('visible','handoff');document.body.classList.remove('v11-intent-preview-active');preview.running=false;refresh();
  }
  function schedulePreview(delay=980){clearTimeout(preview.scheduled);++preview.token;preview.running=false;preview.active=true;preview.revealedSources.clear();preview.revealedUtilities.clear();document.body.classList.add('v11-intent-preview-active');refresh();preview.scheduled=setTimeout(()=>{preview.active=false;runPreview();},delay);}

  window.addEventListener('click',e=>{if(!document.body.classList.contains('v11-intent-preview-active')||e.target.closest?.('.v11-outcome-overlay'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(!document.body.classList.contains('v11-intent-preview-active'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(e.code==='KeyZ'||e.code==='KeyX')requestAnimationFrame(decorateOverviewSources);},true);
  window.addEventListener('keyup',e=>{if(e.code==='KeyZ'||e.code==='KeyX')requestAnimationFrame(()=>{clearOverviewSources();decorateOverviewSources();});},true);

  function animatePlayerTarget(sourceId,targetId){
    const source=playerRooms.find(r=>r.id===sourceId),target=sourceEntity('enemy',targetId),from=source&&getEntityElement('player',source.id),to=target&&getEntityElement('enemy',target.id);if(!from||!to)return;
    playerTraceOverlay.innerHTML='';const a=center(from),b=center(to),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('pathLength','1');line.setAttribute('class','v11-player-tracer');playerTraceOverlay.appendChild(line);flash(to,'v11-player-target-flash',520);setTimeout(()=>{playerTraceOverlay.innerHTML='';},560);
  }
  stage.addEventListener('click',e=>{
    if(window.combatTurn?.resolving||window.combatEnded||document.body.classList.contains('v11-intent-preview-active'))return;
    const selected=state.selectedWeaponId;if(!selected)return;const roomEl=e.target.closest&&e.target.closest('.room[data-side="enemy"]'),mast=e.target.closest&&e.target.closest('#enemyMastBox'),targetId=roomEl?.dataset.id||(mast?enemyMast.id:null);if(!targetId)return;
    setTimeout(()=>{
      if(state.playerIntents?.[selected]!==targetId)return;animatePlayerTarget(selected,targetId);const target=sourceEntity('enemy',targetId);
      if(target?.weapon&&target.hp-plannedDamageTo(target.id)<=0&&activeEnemyIntent(target.id)&&currentlyReady(target))showRoomTooltip(getEntityElement('enemy',target.id),'Cancelled');
      if(target&&knownRoom(target))currentActions().filter(a=>a.sourceId===target.id&&utilityIntentCancelled(a)).forEach(a=>{const effect=enemyRoom(a.targetId),effectEl=effect&&getEntityElement('enemy',effect.id);if(effectEl)showRoomTooltip(effectEl,'Cancelled');});
      refresh();
    },0);
  },true);

  function repairPulse(el){if(!el)return;const n=document.createElement('div');n.className='v11-repair-pulse';n.textContent='♥ +1';el.appendChild(n);setTimeout(()=>n.remove(),820);}
  stage.addEventListener('click',e=>{
    if(window.combatTurn?.resolving||window.combatEnded)return;const selected=document.querySelector('.room.utility-selected');if(!selected)return;const source=playerRooms.find(r=>r.id===selected.dataset.id),targetEl=e.target.closest&&e.target.closest('.room[data-side="player"]'),target=targetEl&&playerRooms.find(r=>r.id===targetEl.dataset.id);if(!source||!target)return;
    const beforeHp=target.hp,beforeState=target.weapon?stateFor(target):null;
    setTimeout(()=>{if(source.actionType==='repair'&&target.hp>beforeHp)repairPulse(getEntityElement('player',target.id));if(source.actionType==='quickLoad'&&beforeState?.mode==='loading'&&currentlyReady(target)){playerQuickLoaded.set(target.id,currentTurn());refresh();}},0);
  },true);
  window.addEventListener('keydown',e=>{if(e.code==='KeyR'&&!e.repeat){playerQuickLoaded.clear();setTimeout(refresh,0);}},true);

  async function resolveBeforeEnemyFire({logLine,floatNote,wait:phaseWait}){
    for(const action of currentActions().sort((a,b)=>{const sa=enemyRoom(a.sourceId),sb=enemyRoom(b.sourceId);return((sa?.col??999)-(sb?.col??999))||((sa?.row??999)-(sb?.row??999));})){
      const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId),targetEl=target&&getEntityElement('enemy',target.id),sourceDead=!source||source.hp<=0,targetDead=!target||target.hp<=0;
      if(sourceDead||targetDead){
        if(action.actionType==='quickLoad'&&target){
          const current=stateFor(target),original=provisionalOriginals.get(target.id);
          if(original&&current?.mode==='ready')combatTurn.setWeaponState(target.id,{...original});
          if(action.provisionalActive&&!targetDead)deferredLoadProgress.add(target.id);
          enemyQuickLoaded.delete(target.id);
        }
        if(source&&target&&!targetDead)await animateUtilityCancellation(source,target,action.actionType);
        if(targetEl){showRoomTooltip(targetEl,action.actionType==='quickLoad'?'Quick Load cancelled':'Repair cancelled');await floatNote(targetEl,action.actionType==='quickLoad'?'QUICK LOAD CANCELLED':'CANCELLED','disabled');}
        logLine(`<span class="v3-log-enemy">Enemy ${action.actionType==='repair'?'repair':'Quick Load'}</span> cancelled${sourceDead?' — source room destroyed':''}.`);
        if(action.actionType==='quickLoad')await phaseWait(action.sourceWasHiddenAtPlan?620:300);
        continue;
      }
      if(action.actionType==='repair'){
        if(target.hp>=target.max){showRoomTooltip(targetEl,'Cancelled');continue;}
        target.hp=Math.min(target.max,target.hp+(source.repairAmount||1));renderShips();refresh();repairPulse(getEntityElement('enemy',target.id));logLine(`<span class="v3-log-enemy">Enemy repair</span> restores 1 blip to ${target.name}.`);await phaseWait(360);
      }else{
        combatTurn.setReady(target.id);target.loading=false;enemyQuickLoaded.set(target.id,currentTurn());refresh();flash(getEntityElement('enemy',target.id),'v11-preview-green',520);logLine(`<span class="v3-log-enemy">Enemy Quick Load</span> readies ${weapons[target.weapon]?.name||target.name}.`);await phaseWait(320);
      }
    }
  }
  async function afterEnemyFire(){
    deferredLoadProgress.forEach(id=>{const room=roomById(id),s=stateFor(room);if(!s||s.mode!=='loading')return;const remaining=(s.remaining||1)-1;if(remaining<=0)combatTurn.setReady(id);else combatTurn.setWeaponState(id,{...s,remaining});});deferredLoadProgress.clear();
  }

  window.enemyAI={rebuildForTurn:buildEnemyActions,currentActions,utilityIntentCancelled,resolveBeforeEnemyFire,afterEnemyFire,get previewActive(){return preview.active||preview.running;},replay:()=>schedulePreview(0)};

  let wasResolving=document.body.classList.contains('v3-resolving');
  const observer=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(!wasResolving&&now){clearTimeout(preview.scheduled);++preview.token;preview.active=false;preview.running=false;previewOverlay.classList.remove('visible','handoff');document.body.classList.remove('v11-intent-preview-active');tracerOverlay.innerHTML='';}
    if(wasResolving&&!now&&!window.combatEnded){playerQuickLoaded.clear();enemyQuickLoaded.clear();buildEnemyActions();schedulePreview(980);}
    wasResolving=now;
  });
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>{applyLayout();renderMovementArrow();});
  buildEnemyActions();refresh();schedulePreview(1000);
})();
