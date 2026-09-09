(() => {
  // v26: final planning presentation is one-way. combatTurn/combatUtility/state own gameplay;
  // this file only derives damage presentation, renders canonical UI, and provides dev/readability UX.
  const turn=()=>combatTurn?.turn||1, room=id=>playerRooms.find(r=>r.id===id)||null;
  const planning=()=>!window.combatEnded&&!combatTurn?.resolving;

  // Current-alignment damage model. Overkill is allowed in projections; actual HP clamps in resolver.
  const oldEnemyDist=enemyIntentDistribution;
  function currentEnemyDamage(dist){
    if(!(dist?.targetMap instanceof Map))return dist;
    const hits=new Map(),explosions=new Map(),exploded=new Set();
    dist.targetMap.forEach((intents,id)=>{
      let n=0;(Array.isArray(intents)?intents:[]).forEach(i=>{const s=sourceEntity('enemy',i?.sourceId);n+=Math.max(0,Number(i?.damage??(s?.weapon?weapons[s.weapon]?.damage:0))||0);});
      if(n)hits.set(id,n);
    });
    let changed=true;
    while(changed){changed=false;playerRooms.filter(r=>r.isMagazine&&r.hp>0).forEach(m=>{
      if(exploded.has(m.id)||(hits.get(m.id)||0)<m.hp)return;exploded.add(m.id);changed=true;
      playerRooms.filter(r=>r.id!==m.id&&r.hp>0&&Math.abs(r.col-m.col)<=1&&Math.abs(r.row-m.row)<=1).forEach(r=>{
        hits.set(r.id,(hits.get(r.id)||0)+1);explosions.set(r.id,(explosions.get(r.id)||0)+1);
      });
    });}
    const damageTypes=new Map();hits.forEach((n,id)=>{const ex=Math.min(n,explosions.get(id)||0);damageTypes.set(id,[...Array(n-ex).fill('cannon'),...Array(ex).fill('explosive')]);});
    return {...dist,hits,explosions,damageTypes,projectionAuthority:'v26-current-world'};
  }
  enemyIntentDistribution=function(playerState=playerIntentDistribution()){return currentEnemyDamage(oldEnemyDist(playerState));};

  // One canonical late UI pass. It never writes combatTurn state.
  function arrow(a,b){if(a.id===b.id)return'♥';return {'-1,-1':'↖','0,-1':'↑','1,-1':'↗','-1,0':'←','1,0':'→','-1,1':'↙','0,1':'↓','1,1':'↘'}[`${Math.sign(b.col-a.col)},${Math.sign(b.row-a.row)}`]||'•';}
  function clearPlanningUI(){
    document.querySelectorAll('.utility-reach-arrow,.utility-used-badge,.v12-utility-icon,.v12-ammo-status,.room[data-side="player"] .loading-v4').forEach(n=>n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable,.utility-reachable,.utility-reach-inactive,.utility-outside-range').forEach(el=>el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable','utility-reachable','utility-reach-inactive','utility-outside-range'));
    playerRooms.filter(r=>r.actionType==='repair'||r.actionType==='quickLoad').forEach(r=>getEntityElement('player',r.id)?.classList.remove('action-ready'));
  }
  function renderWeapons(){playerRooms.filter(r=>r.weapon).forEach(r=>{const el=getEntityElement('player',r.id);if(!el)return;const ready=r.hp>0&&combatTurn.isReady(r.id);const dot=document.createElement('div');dot.className=`v12-ammo-status ${ready?'loaded':'empty'}${r.hp<=0?' disabled':''}`;dot.innerHTML=`<span>${ready?'●':'○'}</span>`;dot.title=r.hp<=0?'Disabled':ready?'Cannonball loaded':'Cannonball empty — loading';el.appendChild(dot);if(r.hp>0&&!ready){const b=document.createElement('div');b.className='loading-v4';b.innerHTML='<span class="wheel">↻</span><span>LOAD</span>';el.appendChild(b);}});}
  function renderUtilities(){
    if(!combatUtility)return;const selected=combatUtility.selected;
    playerRooms.filter(r=>r.actionType==='repair'||r.actionType==='quickLoad').forEach(r=>{const el=getEntityElement('player',r.id);if(!el)return;const used=combatUtility.isUsed(r.id),available=combatUtility.isAvailable(r);el.classList.add('v12-utility-room');if(used)el.classList.add('utility-used');else if(r.hp<=0||!available)el.classList.add('utility-unavailable');else el.classList.add('action-ready');const i=document.createElement('div');i.className=`v12-utility-icon ${r.actionType}${available&&!used?' ready':' faded'}${used?' spent':''}`;i.textContent=r.actionType==='repair'?'♥+':'↻+';i.title=r.actionType==='repair'?(used?'Repair used this turn':available?'Repair available':'No repair target'):(used?'Quick Load used this turn':available?'Quick Load available':'No loading adjacent gun');el.appendChild(i);});
    if(!selected)return;const s=room(selected);if(!s)return;getEntityElement('player',s.id)?.classList.add('utility-selected');const reach=new Set(combatUtility.reachableRooms(s).map(r=>r.id)),eligible=new Set(combatUtility.eligibleTargets(s).map(r=>r.id));playerRooms.forEach(t=>{const el=getEntityElement('player',t.id);if(!el)return;if(!reach.has(t.id)){if(t.id!==s.id)el.classList.add('utility-outside-range');return;}el.classList.add('utility-reachable',eligible.has(t.id)?'utility-target':'utility-reach-inactive');if(t.id===s.id&&s.actionType!=='repair')return;const a=document.createElement('div');a.className=`utility-reach-arrow${eligible.has(t.id)?' active':''}`;a.textContent=arrow(s,t);a.title=eligible.has(t.id)?'Action can reach this room':'In range, but not applicable';el.appendChild(a);});
  }
  function renderPlanning(){if(!planning())return;clearPlanningUI();renderWeapons();renderUtilities();}

  // Dev resource counters.
  const ledger={balls:0,timber:0,pending:0,repairTurn:turn(),ended:false};
  const pendingRepairs=()=>{try{return combatUtility?.plannedRepairs?.().length||0}catch{return 0}};
  function syncTimber(){const t=turn();if(t!==ledger.repairTurn){ledger.timber+=ledger.pending;ledger.pending=0;ledger.repairTurn=t;}ledger.pending=pendingRepairs();}
  function stats(){const host=document.querySelector('.player-corner');if(!host)return;let el=host.querySelector('.v22-dev-stats');if(!el){el=document.createElement('span');el.className='v22-dev-stats';el.title='Development counters only — ammo and Timber limits are not enforced';host.appendChild(el);}el.textContent=`BALLS FIRED ${ledger.balls} · TIMBER USED ${ledger.timber+ledger.pending}`;}
  const projectiles=stage.querySelector('.v3-projectile-layer');if(projectiles)new MutationObserver(rs=>{let n=0;rs.forEach(r=>r.addedNodes.forEach(x=>{if(x instanceof Element&&x.matches('.v3-ball.player'))n++;}));if(n){ledger.balls+=n;stats();}}).observe(projectiles,{childList:true});

  // Persistent combat log.
  const log=stage.querySelector('.v3-log-lines'),archive=[],ids=new Set();let serial=0,restoring=false;
  function archiveLine(n){if(!(n instanceof Element)||!n.matches('.v3-log-line'))return;if(!n.dataset.v26LogId)n.dataset.v26LogId=`l${++serial}`;if(ids.has(n.dataset.v26LogId))return;ids.add(n.dataset.v26LogId);archive.push({id:n.dataset.v26LogId,html:n.outerHTML});}
  function archiveTree(n){if(!(n instanceof Element))return;archiveLine(n);n.querySelectorAll?.('.v3-log-line').forEach(archiveLine);}
  function restoreLog(){if(!log||restoring||!archive.length)return;const present=new Set([...log.querySelectorAll('.v3-log-line')].map(n=>n.dataset.v26LogId).filter(Boolean));if(archive.every(x=>present.has(x.id)))return;restoring=true;log.innerHTML=archive.map(x=>x.html).join('');log.scrollTop=log.scrollHeight;restoring=false;}
  if(log){log.querySelectorAll('.v3-log-line').forEach(archiveLine);new MutationObserver(rs=>{if(restoring)return;let removed=false;rs.forEach(r=>{r.addedNodes.forEach(archiveTree);r.removedNodes.forEach(n=>{archiveTree(n);removed=true;});});if(removed)queueMicrotask(restoreLog);}).observe(log,{childList:true});}

  // Readability tracer. Physical hold state is edge-triggered; refreshes/key-repeat do not restart it.
  const ov=document.createElementNS('http://www.w3.org/2000/svg','svg');ov.classList.add('v24-action-readability-overlay');ov.setAttribute('aria-hidden','true');ov.innerHTML='<defs><marker id="v26GreenArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="v24-support-arrow-head"/></marker></defs>';stage.appendChild(ov);
  let hover=null,held=null,timer=null;const PERIOD=2300;
  const center=el=>{const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-s.left+r.width/2,y:r.top-s.top+r.height/2}};
  function clearLines(){ov.querySelectorAll('.v24-action-line').forEach(n=>n.remove());document.querySelectorAll('.v24-target-pulse,.v24-support-pulse').forEach(e=>e.classList.remove('v24-target-pulse','v24-support-pulse'));}
  function line(a,b,kind,green=false){const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);l.setAttribute('pathLength','1');l.setAttribute('class',`v24-action-line ${kind}`);if(green)l.setAttribute('marker-end','url(#v26GreenArrow)');ov.appendChild(l);}
  function enemyAim(i){const hit=projectedEnemyImpact(i);if(hit){const el=getEntityElement('player',hit.id);if(el)return{p:center(el),el};}const pg=playerGrid.getBoundingClientRect(),s=stage.getBoundingClientRect();return{p:{x:worldColX(i.targetWorld)+ROOM_W()/2,y:i.lane==='mast'?pg.top-s.top-34:laneY('player',i.lane)+ROOM_H()/2},el:null};}
  function friendly(id,pulse=true){const tid=state.playerIntents?.[id],s=room(id),t=tid?sourceEntity('enemy',tid):null,se=s&&getEntityElement('player',s.id),te=t&&getEntityElement('enemy',t.id);if(!s||!t||!se||!te||!combatTurn.isReady(s.id))return;line(center(se),center(te),'friendly-fire');if(pulse){te.classList.add('v24-target-pulse');setTimeout(()=>te.classList.remove('v24-target-pulse'),760);}}
  function enemy(id){const s=sourceEntity('enemy',id),i=enemyIntents.find(x=>x.sourceId===id&&!x.inactive),se=s&&getEntityElement('enemy',s.id);if(!s||!i||!se||!combatTurn.isReady(s.id))return;const a=enemyAim(i);line(center(se),a.p,'enemy-fire');}
  function support(id){if(!combatUtility)return null;const rep=combatUtility.plannedRepairs?.().find(p=>p.sourceId===id);if(rep&&rep.targetId!==id)return{sourceId:id,targetId:rep.targetId};const s=room(id);if(!s||s.actionType!=='quickLoad'||!combatUtility.isUsed(id))return null;const tid=combatUtility.quickLoadedTargets?.().find(x=>{const t=room(x);return t&&combatUtility.inReach(s,t)});return tid?{sourceId:id,targetId:tid}:null;}
  function drawSupport(p){const s=room(p.sourceId),t=room(p.targetId),se=s&&getEntityElement('player',s.id),te=t&&getEntityElement('player',t.id);if(!s||!t||!se||!te||s.id===t.id)return;line(center(se),center(te),'support',true);te.classList.add('v24-support-pulse');setTimeout(()=>te.classList.remove('v24-support-pulse'),760);}
  function draw(){clearLines();if(!planning()||document.body.classList.contains('v11-intent-preview-active'))return;if(held==='enemy'){enemyRooms.filter(r=>r.weapon&&r.hp>0&&combatTurn.isReady(r.id)).forEach(r=>enemy(r.id));return;}if(held==='player'){Object.keys(state.playerIntents||{}).forEach(id=>friendly(id,false));return;}if(hover?.kind==='fire')friendly(hover.id);else if(hover?.kind==='support')drawSupport(hover.plan);}
  function reschedule(){if(timer)clearInterval(timer);timer=(hover||held)?setInterval(draw,PERIOD):null;}
  stage.addEventListener('pointerover',e=>{if(held||!planning()||document.body.classList.contains('v11-intent-preview-active'))return;const el=e.target.closest?.('.room[data-side="player"]');if(!el||el.contains(e.relatedTarget))return;const id=el.dataset.id,r=room(id);if(r?.weapon&&state.playerIntents?.[id])hover={kind:'fire',id};else{const p=support(id);if(!p)return;hover={kind:'support',plan:p};}draw();reschedule();},true);
  stage.addEventListener('pointerout',e=>{if(held||!hover)return;const el=e.target.closest?.('.room[data-side="player"]');if(!el||el.contains(e.relatedTarget))return;hover=null;clearLines();reschedule();},true);
  window.addEventListener('keydown',e=>{if(!planning()||document.body.classList.contains('v11-intent-preview-active'))return;if(e.code==='KeyZ'){if(held==='enemy')return;held='enemy';hover=null;draw();reschedule();}else if(e.code==='KeyX'){if(held==='player')return;held='player';hover=null;draw();reschedule();}},true);
  window.addEventListener('keyup',e=>{if((e.code==='KeyZ'&&held==='enemy')||(e.code==='KeyX'&&held==='player')){held=null;clearLines();reschedule();}},true);

  // Reset current planning and replay intentions.
  const replay=document.createElement('button');replay.className='v24-replay-intents';replay.textContent='↻ INTENTS [I]';replay.title='Reset this turn and replay enemy intentions';stage.appendChild(replay);
  const placeReplay=()=>replay.style.top=`${trackRow.offsetTop+50}px`;
  function replayState(){replay.disabled=!planning()||document.body.classList.contains('v11-intent-preview-active');placeReplay();}
  function replayIntents(){if(replay.disabled)return;clearLines();hover=null;held=null;reschedule();document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true,cancelable:true}));enemyAI?.replay?.();replayState();}
  replay.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();replayIntents();},true);
  window.addEventListener('keydown',e=>{if(e.code!=='KeyI'||e.repeat||!planning()||document.body.classList.contains('v11-intent-preview-active'))return;e.preventDefault();e.stopPropagation();replayIntents();},true);

  // Final refresh: state -> DOM only. It intentionally does NOT redraw held/hover traces.
  const oldRefresh=refresh;refresh=function(){oldRefresh();syncTimber();renderPlanning();stats();replayState();};
  let preview=document.body.classList.contains('v11-intent-preview-active');
  new MutationObserver(()=>{replayState();const now=document.body.classList.contains('v11-intent-preview-active');if(!preview&&now)clearLines();if(preview&&!now&&(hover||held))draw();preview=now;}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>{placeReplay();if(hover||held)draw();});
  window.addEventListener('combat-ended',()=>{if(!ledger.ended){syncTimber();ledger.timber+=ledger.pending;ledger.pending=0;ledger.ended=true;stats();}clearLines();if(timer)clearInterval(timer);replayState();});

  window.combatPlanningRenderer={get turn(){return turn()},get archivedLogLines(){return archive.length},restoreLog,currentEnemyProjection(){try{return enemyIntentDistribution(playerIntentDistribution())}catch{return null}},render:renderPlanning};
  placeReplay();refresh();
})();