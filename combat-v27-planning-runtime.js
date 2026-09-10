(() => {
  // v27: one authoritative planning snapshot after manoeuvre.
  // Gameplay state remains in combatTurn / combatUtility / state. Every movement-sensitive
  // visual derives from the same current-alignment snapshot once per refresh.

  const legacyPlayerDistribution=playerIntentDistribution;
  const legacyEnemyDistribution=enemyIntentDistribution;
  const currentTurn=()=>window.combatTurn?.turn||1;
  const planning=()=>!window.combatEnded&&!window.combatTurn?.resolving;
  const previewing=()=>document.body.classList.contains('v11-intent-preview-active');
  const playerRoom=id=>playerRooms.find(r=>r.id===id)||null;
  const enemyRoom=id=>enemyRooms.find(r=>r.id===id)||null;
  const playerEntity=id=>id===playerMast.id?playerMast:playerRoom(id);
  const enemyEntity=id=>id===enemyMast.id?enemyMast:enemyRoom(id);
  const bottomRow=side=>((side==='player'?PLAYER_SHIP_SETUP:ENEMY_SHIP_SETUP).rows||1)-1;
  const utilityTypes=new Set(['repair','quickLoad','resetSails','brace']);

  document.body.classList.add('v27-planning-runtime');

  function add(map,id,n){if(n>0)map.set(id,(map.get(id)||0)+n);}
  function damageFor(source,target,intent){
    const weapon=source?.weapon?weapons[source.weapon]:null;
    if(target?.kind==='mast'&&Number.isFinite(weapon?.mastDamage))return Number(weapon.mastDamage);
    return Math.max(0,Number(intent?.damage??weapon?.damage??0)||0);
  }
  function knownEnemyMagazine(room){return !!room?.isMagazine&&(!room.hidden||room.revealed);}
  function adjacentLiving(rooms,mag){return rooms.filter(r=>r.id!==mag.id&&r.hp>0&&Math.abs(r.col-mag.col)<=1&&Math.abs(r.row-mag.row)<=1);}
  function protectionFor(side,entities){
    const map=new Map();
    entities.forEach(entity=>{const n=Math.max(0,Number(window.combatBrace?.count?.(side,entity.id)||0));if(n>0)map.set(entity.id,n);});
    return map;
  }
  function addProtected(hits,braced,protection,id,amount){
    const available=Math.max(0,protection.get(id)||0),blocked=Math.min(amount,available),applied=Math.max(0,amount-blocked);
    if(blocked){protection.set(id,available-blocked);add(braced,id,blocked);}
    add(hits,id,applied);return {blocked,applied};
  }

  function addMagazineChains(rooms,hits,{predictMagazine=()=>true,protection=new Map(),braced=new Map()}={}){
    const explosions=new Map(),exploded=new Set();let changed=true;
    while(changed){
      changed=false;
      rooms.filter(r=>r.isMagazine&&r.hp>0).forEach(mag=>{
        if(exploded.has(mag.id)||!predictMagazine(mag))return;
        if((hits.get(mag.id)||0)<mag.hp)return;
        exploded.add(mag.id);changed=true;
        adjacentLiving(rooms,mag).forEach(room=>{
          const result=addProtected(hits,braced,protection,room.id,1);
          if(result.applied)add(explosions,room.id,result.applied);
        });
      });
    }
    return {explosions,exploded};
  }

  function withDamageTypes(dist){
    const damageTypes=new Map();
    dist.hits.forEach((total,id)=>{const ex=Math.max(0,Math.min(total,Number(dist.explosions?.get(id)||0));damageTypes.set(id,[...Array(total-ex).fill('cannon'),...Array(ex).fill('explosive')]);});
    return {...dist,damageTypes,projectionAuthority:'v27-current-alignment'};
  }

  function canonicalPlayerDistribution(){
    const hits=new Map(),targetMap=new Map(),braced=new Map(),protection=protectionFor('enemy',[...enemyRooms,enemyMast]);
    const plans=Object.entries(state.playerIntents||{}).map(([sourceId,targetId])=>({sourceId,targetId,source:sourceEntity('player',sourceId)})).sort((a,b)=>((a.source?.col??999)-(b.source?.col??999))||((a.source?.row??999)-(b.source?.row??999)));
    plans.forEach(({sourceId,targetId,source})=>{
      const target=sourceEntity('enemy',targetId);if(!source||!target||source.hp<=0||target.hp<=0||!combatTurn.isReady(sourceId))return;
      const damage=damageFor(source,target,{damage:weapons[source.weapon]?.damage});
      addProtected(hits,braced,protection,targetId,damage);
      if(!targetMap.has(targetId))targetMap.set(targetId,[]);targetMap.get(targetId).push({sourceId,targetId,damage});
    });
    // Hidden enemy magazines still explode in resolution, but collateral remains concealed until known.
    const chain=addMagazineChains(enemyRooms,hits,{predictMagazine:knownEnemyMagazine,protection,braced});
    return withDamageTypes({hits,targetMap,explosions:chain.explosions,explodedMagazines:chain.exploded,braced});
  }

  function canonicalEnemyDistribution(playerState=canonicalPlayerDistribution(),intentFilter=null){
    const hits=new Map(),dodges=new Map(),prevented=new Map(),braced=new Map(),protection=protectionFor('player',[...playerRooms,playerMast]);
    const targetMap=new Map(),preventedTargetMap=new Map(),missMap=[],disabledSources=new Set();

    enemyRooms.filter(r=>r.weapon&&r.hp>0).forEach(source=>{if(source.hp-(playerState.hits.get(source.id)||0)<=0)disabledSources.add(source.id);});
    const ordered=enemyIntents.slice().sort((a,b)=>{const sa=sourceEntity('enemy',a.sourceId),sb=sourceEntity('enemy',b.sourceId);return((sa?.col??999)-(sb?.col??999))||((sa?.row??999)-(sb?.row??999));});
    ordered.forEach(intent=>{
      if(intent?.inactive||(intentFilter&&!intentFilter(intent)))return;
      const source=sourceEntity('enemy',intent.sourceId);if(!source||!source.weapon||source.hp<=0||!combatTurn.isReady(source.id))return;
      if(typeof enemyIntentInRange==='function'&&!enemyIntentInRange(intent))return;
      const impact=projectedEnemyImpact(intent),original=intent.logicalTargetId?sourceEntity('player',intent.logicalTargetId):null,damage=damageFor(source,impact||original,intent),normalized={...intent,damage};
      if(disabledSources.has(source.id)){
        if(impact){add(prevented,impact.id,damage);if(!preventedTargetMap.has(impact.id))preventedTargetMap.set(impact.id,[]);preventedTargetMap.get(impact.id).push(normalized);}return;
      }
      if(impact){addProtected(hits,braced,protection,impact.id,damage);if(!targetMap.has(impact.id))targetMap.set(impact.id,[]);targetMap.get(impact.id).push(normalized);}
      if(original&&(!impact||impact.id!==original.id))add(dodges,original.id,damage);
      if(original&&!impact)missMap.push(normalized);
    });
    const chain=addMagazineChains(playerRooms,hits,{protection,braced});
    return withDamageTypes({hits,dodges,prevented,targetMap,preventedTargetMap,missMap,disabledSources,explosions:chain.explosions,explodedMagazines:chain.exploded,braced});
  }

  playerIntentDistribution=function(){if(!planning()||previewing())return legacyPlayerDistribution();return canonicalPlayerDistribution();};
  enemyIntentDistribution=function(playerState=playerIntentDistribution()){if(!planning()||previewing())return legacyEnemyDistribution(playerState);return canonicalEnemyDistribution(playerState);};

  function baseSnapshot(enemyFilter=null){
    const player=canonicalPlayerDistribution(),enemy=canonicalEnemyDistribution(player,enemyFilter);
    const mastStart=window.combatManoeuvre?.startMast??state.turnStartMast??combatTurn.startMast??state.playerMastTrack;
    return {turn:currentTurn(),mastStart,mastNow:state.playerMastTrack,moved:state.playerMastTrack!==mastStart,player,enemy};
  }
  function snapshot(){return baseSnapshot();}
  function previewSnapshot(){
    const visible=new Set(window.enemyAI?.revealedSourceIds?.()||[]);
    return baseSnapshot(intent=>visible.has(intent.sourceId));
  }

  // ---- Canonical movement-sensitive UI ----------------------------------
  function clearPlanningDecorations(){
    document.querySelectorAll('.v12-flood-preview').forEach(n=>n.remove());
    document.querySelectorAll('.utility-reach-arrow,.utility-used-badge,.v12-utility-icon,.v12-ammo-status,.room[data-side="player"] .loading-v4').forEach(n=>n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable,.utility-reachable,.utility-reach-inactive,.utility-outside-range,.v14-repair-source,.v14-repair-target').forEach(el=>el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable','utility-reachable','utility-reach-inactive','utility-outside-range','v14-repair-source','v14-repair-target'));
    document.querySelectorAll('.v14-threat-active,.v12-lethal-threat,.v15-explosion-threat,.v16-magazine-primed').forEach(el=>el.classList.remove('v14-threat-active','v12-lethal-threat','v15-explosion-threat','v16-magazine-primed'));
    playerRooms.filter(r=>utilityTypes.has(r.actionType)||r.weapon).forEach(r=>getEntityElement('player',r.id)?.classList.remove('action-ready'));
  }

  function addFlood(side,room,kind){const el=getEntityElement(side,room.id);if(!el)return;const marker=document.createElement('div');marker.className=`v12-flood-preview ${kind}`;marker.innerHTML='<span>≈</span><b>FLOOD</b>';marker.title=kind==='enemy'?'Enemy intent would flood this room':'Your planned attack would flood this room';el.appendChild(marker);}
  function renderThreats(s){
    playerRooms.forEach(room=>{const el=getEntityElement('player',room.id);if(!el||room.hp<=0)return;const incoming=s.enemy.hits.get(room.id)||0;if(incoming>0)el.classList.add('v14-threat-active');if((s.enemy.explosions.get(room.id)||0)>0)el.classList.add('v15-explosion-threat');if(incoming>=room.hp){el.classList.add('v12-lethal-threat');if(room.row===bottomRow('player'))addFlood('player',room,'enemy');}});
    const mastIncoming=s.enemy.hits.get(playerMast.id)||0;if(playerMast.hp>0){playerMastBox.classList.toggle('v14-threat-active',mastIncoming>0);playerMastBox.classList.toggle('v12-lethal-threat',mastIncoming>=playerMast.hp);}
    playerRooms.filter(r=>r.isMagazine&&r.hp>0).forEach(mag=>{if(s.enemy.explodedMagazines?.has(mag.id))getEntityElement('player',mag.id)?.classList.add('v16-magazine-primed');});
    enemyRooms.forEach(room=>{if(room.hp<=0||room.row!==bottomRow('enemy'))return;if((s.player.hits.get(room.id)||0)>=room.hp)addFlood('enemy',room,'friendly');});
  }

  function arrow(a,b){if(b.kind==='mast')return a.actionType==='resetSails'?'⛵':'⛨';if(a.id===b.id)return a.actionType==='brace'?'⛨':'♥';return {'-1,-1':'↖','0,-1':'↑','1,-1':'↗','-1,0':'←','1,0':'→','-1,1':'↙','0,1':'↓','1,1':'↘'}[`${Math.sign(b.col-a.col)},${Math.sign(b.row-a.row)}`]||'•';}
  function renderWeapons(){
    playerRooms.filter(r=>r.weapon).forEach(room=>{const el=getEntityElement('player',room.id);if(!el)return;const ready=room.hp>0&&combatTurn.isReady(room.id);const dot=document.createElement('div');dot.className=`v12-ammo-status ${ready?'loaded':'empty'}${room.hp<=0?' disabled':''}`;dot.innerHTML=`<span>${ready?'●':'○'}</span>`;dot.title=room.hp<=0?'Disabled':ready?'Cannonball loaded':'Cannonball empty — loading';el.appendChild(dot);if(room.hp>0&&!ready){const b=document.createElement('div');b.className='loading-v4';b.innerHTML='<span class="wheel">↻</span><span>LOAD</span>';el.appendChild(b);}if(ready&&!Object.prototype.hasOwnProperty.call(state.playerIntents||{},room.id))el.classList.add('action-ready');});
  }
  function utilityPresentation(room,used,available){
    if(room.actionType==='repair')return {icon:'♥+',title:used?'Repair used this turn':available?'Repair available':'No repair target'};
    if(room.actionType==='quickLoad')return {icon:'↻+',title:used?'Quick Load used this turn':available?'Quick Load available':'No loading adjacent gun'};
    if(room.actionType==='resetSails')return {icon:'⛵↻',title:used?'Reset Sails used this turn':available?'Reset Sails available — refresh movement':'Sails do not need resetting'};
    return {icon:'⛨',title:used?'Brace used this turn':available?'Brace available — prevent first 1 incoming damage':'No unbraced target in reach'};
  }
  function renderUtilities(){
    if(!window.combatUtility)return;const selected=combatUtility.selected;
    playerRooms.filter(r=>utilityTypes.has(r.actionType)).forEach(room=>{const el=getEntityElement('player',room.id);if(!el)return;const used=combatUtility.isUsed(room.id),available=combatUtility.isAvailable(room),p=utilityPresentation(room,used,available);el.classList.add('v12-utility-room');if(used)el.classList.add('utility-used');else if(room.hp<=0||!available)el.classList.add('utility-unavailable');else el.classList.add('action-ready');const icon=document.createElement('div');icon.className=`v12-utility-icon ${room.actionType}${available&&!used?' ready':' faded'}${used?' spent':''}`;icon.textContent=p.icon;icon.title=p.title;el.appendChild(icon);});
    if(!selected)return;const source=playerRoom(selected);if(!source)return;const sourceEl=getEntityElement('player',source.id);sourceEl?.classList.add('utility-selected');if(source.actionType==='repair')sourceEl?.classList.add('v14-repair-source');
    const reachable=new Set(combatUtility.reachableRooms(source).map(r=>r.id)),eligible=new Set(combatUtility.eligibleTargets(source).map(r=>r.id));
    [...playerRooms,playerMast].forEach(target=>{const el=getEntityElement('player',target.id);if(!el)return;if(!reachable.has(target.id)){if(target.id!==source.id)el.classList.add('utility-outside-range');return;}el.classList.add('utility-reachable');if(eligible.has(target.id)){el.classList.add('utility-target');if(source.actionType==='repair')el.classList.add('v14-repair-target');}else el.classList.add('utility-reach-inactive');if(target.id===source.id&&source.actionType!=='repair'&&source.actionType!=='brace')return;const a=document.createElement('div');a.className=`utility-reach-arrow${eligible.has(target.id)?' active':''}`;a.textContent=arrow(source,target);a.title=eligible.has(target.id)?'Action can reach this target':'In range, but not applicable';el.appendChild(a);});
  }

  function renderMastStatus(s){
    playerMastBox.querySelectorAll('.v17-mast-action').forEach(n=>n.remove());let status;
    if(playerMast.hp<=0)status={kind:'disabled',icon:'✕',label:'DISABLED',title:'Mast destroyed — cannot manoeuvre'};
    else if(window.combatManoeuvre?.cooldown)status={kind:'cooldown',icon:'⛵',label:'RESETTING',title:'Sails resetting after last turn’s manoeuvre — movement unavailable this turn'};
    else if(s.moved)status={kind:'used',icon:'↔',label:'USED',title:'Manoeuvre planned — sails will need to reset next turn'};
    else if(Object.keys(state.playerIntents||{}).length)status={kind:'locked',icon:'↔',label:'LOCKED',title:'Alignment locked by firing plan'};
    else status={kind:'ready',icon:'↔',label:'READY',title:'Manoeuvre ready — move one track segment fore or aft'};
    const badge=document.createElement('div');badge.className=`v17-mast-action ${status.kind}`;badge.innerHTML=`<span>${status.icon}</span><b>${status.label}</b>`;badge.title=status.title;playerMastBox.appendChild(badge);
  }
  function normalizeGridAndName(){document.querySelectorAll('.room').forEach(el=>{el.classList.toggle('v14-last-col',el.dataset.lastCol==='true');el.classList.toggle('v14-last-row',el.dataset.lastRow==='true');});const enemyName=document.querySelector('.enemy-corner');if(enemyName){const stars=Math.max(0,Number(ENEMY_SHIP_SETUP.threatStars)||0);enemyName.textContent=`ENEMY — ${ENEMY_SHIP_SETUP.name}${stars?` — ${'★'.repeat(stars)}`:''}`;if(ENEMY_SHIP_SETUP.testExpectation)enemyName.title=ENEMY_SHIP_SETUP.testExpectation;}}

  // ---- Current-turn repair and Brace intention pips ----------------------
  function pipList(side,id){const el=getEntityElement(side,id);return el?[...el.querySelectorAll('.pips span')]:[];}
  function clearRepairPips(){document.querySelectorAll('.v13-repaired-heart,.v18-repair-intent-heart').forEach(pip=>{const wasEmpty=pip.dataset.v18WasEmpty==='1';delete pip.dataset.v18WasEmpty;pip.classList.remove('v13-repaired-heart','v18-repair-intent-heart');if(wasEmpty){pip.classList.add('damage-empty');pip.textContent='♡';pip.title='';}});}
  function markRepair(side,target,index,label){const pip=pipList(side,target.id)[index];if(!pip)return;if(pip.classList.contains('hit')||pip.classList.contains('intent-crosshair')||pip.classList.contains('prevented-mark')||pip.classList.contains('explosion-hit'))return;if(pip.classList.contains('damage-empty')){pip.dataset.v18WasEmpty='1';pip.classList.remove('damage-empty');}pip.classList.add('v18-repair-intent-heart');pip.textContent='♥+';pip.title=label;}
  function visibleEnemyActions(){return previewing()?(window.enemyAI?.visibleActions?.()||[]):(window.enemyAI?.currentActions?.()||window.enemyActionIntents||[]);}
  function renderRepairPips(){
    clearRepairPips();if(!planning())return;
    if(!previewing())(combatUtility?.plannedRepairs?.()||[]).forEach(plan=>{const target=playerRoom(plan.targetId);if(target&&target.hp>0)markRepair('player',target,plan.beforeHp,'Repair planned');});
    visibleEnemyActions().filter(a=>a.actionType==='repair'&&a.turn===currentTurn()).forEach(action=>{const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);if(!source||!target||target.hp<=0||target.hp>=target.max)return;if(window.enemyAI?.utilityIntentCancelled?.(action))return;markRepair('enemy',target,target.hp,'Enemy repair intended');});
  }
  function clearBracePips(){document.querySelectorAll('.v31-brace-heart').forEach(pip=>{pip.classList.remove('v31-brace-heart');if(pip.dataset.v31OldTitle!==undefined){pip.title=pip.dataset.v31OldTitle;delete pip.dataset.v31OldTitle;}});}
  function markBrace(side,target,label){const pips=pipList(side,target.id);if(!pips.length||target.hp<=0)return;const pip=pips[Math.max(0,Math.min(pips.length-1,target.hp-1))];if(!pip)return;if(pip.dataset.v31OldTitle===undefined)pip.dataset.v31OldTitle=pip.title||'';pip.classList.add('v31-brace-heart');pip.title=label;}
  function renderBracePips(){
    clearBracePips();if(!planning())return;
    if(!previewing())(combatUtility?.bracePlans?.()||[]).forEach(plan=>{const target=playerEntity(plan.targetId);if(target)markBrace('player',target,'BRACED — first 1 incoming damage this turn is prevented');});
    visibleEnemyActions().filter(a=>a.actionType==='brace'&&!a.consumed&&a.turn===currentTurn()).forEach(action=>{const target=enemyEntity(action.targetId);if(target&&!window.enemyAI?.utilityIntentCancelled?.(action))markBrace('enemy',target,'ENEMY BRACE — first 1 damage this turn is prevented');});
  }

  // ---- Explosion transition / dodge feedback -----------------------------
  const explosionOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');explosionOverlay.setAttribute('class','v16-explosion-link-overlay');explosionOverlay.setAttribute('aria-hidden','true');stage.appendChild(explosionOverlay);
  const explodingSeen=new Set(),dodgeSeen=new Set();
  const center=el=>{const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};};
  function clearExplosionAnimation(id){explosionOverlay.querySelectorAll(`[data-magazine-id="${id}"]`).forEach(n=>n.remove());getEntityElement('player',id)?.querySelectorAll('.v16-explosion-badge').forEach(n=>n.remove());}
  function animateExplosion(mag,s){
    const sourceEl=getEntityElement('player',mag.id);if(!sourceEl)return;clearExplosionAnimation(mag.id);const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.dataset.magazineId=mag.id;group.setAttribute('class','v16-explosion-group');const a=center(sourceEl);
    adjacentLiving(playerRooms,mag).filter(r=>(s.enemy.explosions.get(r.id)||0)>0).forEach(room=>{const targetEl=getEntityElement('player',room.id);if(!targetEl)return;const b=center(targetEl),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','v16-explosion-link');group.appendChild(line);targetEl.classList.add('v16-explosion-impact');setTimeout(()=>targetEl.classList.remove('v16-explosion-impact'),820);});
    explosionOverlay.appendChild(group);const badge=document.createElement('div');badge.className='v16-explosion-badge';badge.innerHTML='<span>✹</span><b>EXPLODING</b>';sourceEl.appendChild(badge);sourceEl.classList.add('v16-explosion-burst');showRoomTooltip(sourceEl,'Magazine will explode');setTimeout(()=>{group.remove();badge.remove();sourceEl.classList.remove('v16-explosion-burst');},900);
  }
  function renderExplosionTransitions(s){const active=s.enemy.explodedMagazines||new Set();active.forEach(id=>{const mag=playerRoom(id);if(mag&&!explodingSeen.has(id))animateExplosion(mag,s);});[...explodingSeen].forEach(id=>{if(!active.has(id)){explodingSeen.delete(id);clearExplosionAnimation(id);getEntityElement('player',id)?.classList.remove('v16-explosion-burst');}});active.forEach(id=>explodingSeen.add(id));}
  function showDodge(id){const el=getEntityElement('player',id);if(!el)return;el.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());const tip=document.createElement('div');tip.className='v15-dodged-tip';tip.textContent='DODGED';tip.title='Movement has taken this section out of the aimed shot.';el.appendChild(tip);setTimeout(()=>tip.classList.add('fade'),1900);setTimeout(()=>tip.remove(),2600);}
  function renderDodges(s){const current=new Set();s.enemy.dodges?.forEach((n,id)=>{if(n<=0||s.enemy.targetMap.has(id))return;current.add(id);if(!dodgeSeen.has(id))showDodge(id);});[...dodgeSeen].forEach(id=>{if(!current.has(id))dodgeSeen.delete(id);});current.forEach(id=>dodgeSeen.add(id));}
  window.combatDodgeFeedback={reset(){dodgeSeen.clear();document.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());}};

  // ---- Enemy repair cancellation -----------------------------------------
  const repairCancelOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');repairCancelOverlay.setAttribute('class','v15-repair-cancel-overlay');repairCancelOverlay.setAttribute('aria-hidden','true');stage.appendChild(repairCancelOverlay);
  function renderRepairCancellation(s){
    repairCancelOverlay.innerHTML='';document.querySelectorAll('.v15-repair-cancel-target').forEach(el=>el.classList.remove('v15-repair-cancel-target'));if(!planning()||previewing())return;
    (window.enemyAI?.currentActions?.()||window.enemyActionIntents||[]).filter(a=>a.actionType==='repair').forEach(action=>{const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);if(!source||!target||source.hp<=0||target.hp<=0||source.hidden&&!source.revealed)return;if(source.hp-(s.player.hits.get(source.id)||0)>0)return;const se=getEntityElement('enemy',source.id),te=getEntityElement('enemy',target.id);if(!se||!te)return;te.classList.add('v15-repair-cancel-target');const a=center(se),b=center(te),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','v15-repair-cancel-line');repairCancelOverlay.appendChild(line);const x=document.createElementNS('http://www.w3.org/2000/svg','text');x.setAttribute('x',(a.x+b.x)/2);x.setAttribute('y',(a.y+b.y)/2+6);x.setAttribute('text-anchor','middle');x.setAttribute('class','v15-repair-cancel-x');x.textContent='×';repairCancelOverlay.appendChild(x);});
  }

  // ---- Dev counters + persistent log -------------------------------------
  const ledger={balls:0,timber:0,pending:0,repairTurn:currentTurn(),ended:false};
  const pendingRepairs=()=>{try{return combatUtility?.plannedRepairs?.().length||0}catch{return 0;}};
  function syncTimber(){const t=currentTurn();if(t!==ledger.repairTurn){ledger.timber+=ledger.pending;ledger.pending=0;ledger.repairTurn=t;}ledger.pending=pendingRepairs();}
  function renderStats(){const host=document.querySelector('.player-corner');if(!host)return;let el=host.querySelector('.v22-dev-stats');if(!el){el=document.createElement('span');el.className='v22-dev-stats';el.title='Development counters only — ammo and Timber limits are not enforced';host.appendChild(el);}el.textContent=`BALLS FIRED ${ledger.balls} · TIMBER USED ${ledger.timber+ledger.pending}`;}
  const projectileLayer=stage.querySelector('.v3-projectile-layer');if(projectileLayer)new MutationObserver(records=>{let n=0;records.forEach(r=>r.addedNodes.forEach(node=>{if(node instanceof Element&&node.matches('.v3-ball.player'))n++;}));if(n){ledger.balls+=n;renderStats();}}).observe(projectileLayer,{childList:true});
  const log=stage.querySelector('.v3-log-lines'),archive=[],logIds=new Set();let logSerial=0,restoringLog=false;
  function archiveLine(node){if(!(node instanceof Element)||!node.matches('.v3-log-line'))return;if(!node.dataset.v27LogId)node.dataset.v27LogId=`l${++logSerial}`;if(logIds.has(node.dataset.v27LogId))return;logIds.add(node.dataset.v27LogId);archive.push({id:node.dataset.v27LogId,html:node.outerHTML});}
  function archiveTree(node){if(!(node instanceof Element))return;archiveLine(node);node.querySelectorAll?.('.v3-log-line').forEach(archiveLine);}
  function restoreLog(){if(!log||restoringLog||!archive.length)return;const present=new Set([...log.querySelectorAll('.v3-log-line')].map(n=>n.dataset.v27LogId).filter(Boolean));if(archive.every(x=>present.has(x.id)))return;restoringLog=true;log.innerHTML=archive.map(x=>x.html).join('');log.scrollTop=log.scrollHeight;restoringLog=false;}
  if(log){log.querySelectorAll('.v3-log-line').forEach(archiveLine);new MutationObserver(records=>{if(restoringLog)return;let removed=false;records.forEach(r=>{r.addedNodes.forEach(archiveTree);r.removedNodes.forEach(n=>{archiveTree(n);removed=true;});});if(removed)queueMicrotask(restoreLog);}).observe(log,{childList:true});}

  // ---- Action relationship tracer ----------------------------------------
  const traceOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');traceOverlay.classList.add('v24-action-readability-overlay');traceOverlay.setAttribute('aria-hidden','true');traceOverlay.innerHTML='<defs><marker id="v27GreenArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="v24-support-arrow-head"/></marker></defs>';stage.appendChild(traceOverlay);
  let hoverPlan=null,heldMode=null,replayTimer=null;const REPLAY_MS=2300;
  function clearLines(){traceOverlay.querySelectorAll('.v24-action-line').forEach(n=>n.remove());document.querySelectorAll('.v24-target-pulse,.v24-support-pulse').forEach(el=>el.classList.remove('v24-target-pulse','v24-support-pulse'));}
  function addLine(a,b,kind,green=false){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('pathLength','1');line.setAttribute('class',`v24-action-line ${kind}`);if(green)line.setAttribute('marker-end','url(#v27GreenArrow)');traceOverlay.appendChild(line);}
  function drawFriendly(sourceId,pulse=true){const targetId=state.playerIntents?.[sourceId],source=playerRoom(sourceId),target=targetId?sourceEntity('enemy',targetId):null,se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('enemy',target.id);if(!source||!target||!se||!te||!combatTurn.isReady(source.id))return;addLine(center(se),center(te),'friendly-fire');if(pulse){te.classList.add('v24-target-pulse');setTimeout(()=>te.classList.remove('v24-target-pulse'),760);}}
  function drawEnemy(sourceId){const source=sourceEntity('enemy',sourceId),intent=enemyIntents.find(i=>i.sourceId===sourceId&&!i.inactive),se=source&&getEntityElement('enemy',source.id);if(!source||!intent||!se||!combatTurn.isReady(source.id))return;const impact=projectedEnemyImpact(intent);let point;if(impact){const el=getEntityElement('player',impact.id);if(!el)return;point=center(el);}else{const pg=playerGrid.getBoundingClientRect(),sr=stage.getBoundingClientRect();point={x:worldColX(intent.targetWorld)+ROOM_W()/2,y:intent.lane==='mast'?pg.top-sr.top-34:laneY('player',intent.lane)+ROOM_H()/2};}addLine(center(se),point,'enemy-fire');}
  function supportPlan(sourceId){const plan=combatUtility?.supportPlans?.().find(p=>p.sourceId===sourceId&&p.targetId!==sourceId);return plan||null;}
  function drawSupport(plan){const source=playerRoom(plan.sourceId),target=playerEntity(plan.targetId),se=source&&getEntityElement('player',source.id),te=target&&getEntityElement('player',target.id);if(!source||!target||!se||!te)return;addLine(center(se),center(te),'support',true);te.classList.add('v24-support-pulse');setTimeout(()=>te.classList.remove('v24-support-pulse'),760);}
  function drawReadability(){clearLines();if(!planning()||previewing())return;if(heldMode==='enemy'){enemyRooms.filter(r=>r.weapon&&r.hp>0&&combatTurn.isReady(r.id)).forEach(r=>drawEnemy(r.id));return;}if(heldMode==='player'){Object.keys(state.playerIntents||{}).forEach(id=>drawFriendly(id,false));return;}if(hoverPlan?.kind==='fire')drawFriendly(hoverPlan.id);else if(hoverPlan?.kind==='support')drawSupport(hoverPlan.plan);}
  function reschedule(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;}if(hoverPlan||heldMode)replayTimer=setInterval(drawReadability,REPLAY_MS);}
  stage.addEventListener('pointerover',e=>{if(heldMode||!planning()||previewing())return;const el=e.target.closest?.('.room[data-side="player"]');if(!el||el.contains(e.relatedTarget))return;const id=el.dataset.id,r=playerRoom(id);if(r?.weapon&&state.playerIntents?.[id])hoverPlan={kind:'fire',id};else{const plan=supportPlan(id);if(!plan)return;hoverPlan={kind:'support',plan};}drawReadability();reschedule();},true);
  stage.addEventListener('pointerout',e=>{if(heldMode||!hoverPlan)return;const el=e.target.closest?.('.room[data-side="player"]');if(!el||el.contains(e.relatedTarget))return;hoverPlan=null;clearLines();reschedule();},true);
  window.addEventListener('keydown',e=>{if(e.repeat||!planning()||previewing())return;if(e.code==='KeyZ'){heldMode='enemy';hoverPlan=null;drawReadability();reschedule();}else if(e.code==='KeyX'){heldMode='player';hoverPlan=null;drawReadability();reschedule();}},true);
  window.addEventListener('keyup',e=>{if((e.code==='KeyZ'&&heldMode==='enemy')||(e.code==='KeyX'&&heldMode==='player')){heldMode=null;clearLines();reschedule();}},true);

  // ---- Intent replay -------------------------------------------------------
  const replay=document.createElement('button');replay.className='v24-replay-intents';replay.textContent='↻ INTENTS [I]';replay.title='Reset this turn and replay enemy intentions';stage.appendChild(replay);
  const placeReplay=()=>replay.style.top=`${trackRow.offsetTop+50}px`;
  function replayState(){replay.disabled=!planning()||previewing();placeReplay();}
  function replayIntents(){if(replay.disabled)return;clearLines();hoverPlan=null;heldMode=null;reschedule();document.dispatchEvent(new KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true,cancelable:true}));window.enemyAI?.replay?.();replayState();}
  replay.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();replayIntents();},true);
  window.addEventListener('keydown',e=>{if(e.code!=='KeyI'||e.repeat||!planning()||previewing())return;e.preventDefault();e.stopPropagation();replayIntents();},true);

  function renderCanonicalPlanning(){
    if(!planning())return;
    if(previewing()){
      // These are canonical intent-owned visuals, revealed from the same locked actions/source set.
      // No temporary duplicate pips or early full-turn prediction is created for the preview.
      renderRepairPips();renderBracePips();renderExplosionTransitions(previewSnapshot());return;
    }
    const s=snapshot();clearPlanningDecorations();renderThreats(s);renderWeapons();renderUtilities();renderMastStatus(s);renderRepairPips();renderBracePips();renderExplosionTransitions(s);renderDodges(s);renderRepairCancellation(s);normalizeGridAndName();syncTimber();renderStats();replayState();window.__combatPlanningSnapshot=s;
  }

  const oldRefresh=refresh;refresh=function(){oldRefresh();renderCanonicalPlanning();};
  let lastPreview=previewing();
  new MutationObserver(()=>{replayState();const now=previewing();if(!lastPreview&&now)clearLines();if(lastPreview&&!now){renderCanonicalPlanning();if(hoverPlan||heldMode)drawReadability();}lastPreview=now;}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',()=>{placeReplay();if(hoverPlan||heldMode)drawReadability();});
  window.addEventListener('combat-ended',()=>{if(!ledger.ended){syncTimber();ledger.timber+=ledger.pending;ledger.pending=0;ledger.ended=true;renderStats();}clearLines();if(replayTimer)clearInterval(replayTimer);repairCancelOverlay.innerHTML='';explosionOverlay.innerHTML='';replayState();});

  window.combatMatchup={enemyId:ENEMY_SHIP_SETUP.id,playerId:PLAYER_SHIP_SETUP.id,threatStars:Number(ENEMY_SHIP_SETUP.threatStars)||0,expectation:ENEMY_SHIP_SETUP.testExpectation||'',availableShips:()=>Object.keys(SHIP_SETUPS),urlFor({enemy=ENEMY_SHIP_SETUP.id,player=PLAYER_SHIP_SETUP.id}={}){const u=new URL(window.location.href);u.searchParams.set('enemy',enemy);u.searchParams.set('player',player);return u.toString();}};
  window.combatPlanningRuntime={snapshot,get diagnostics(){const s=snapshot();return{turn:s.turn,mastStart:s.mastStart,mastNow:s.mastNow,moved:s.moved,magazineUsed:combatUtility?.isUsed?.('p_mag')??null,magazineAvailable:playerRoom('p_mag')?combatUtility?.isAvailable?.(playerRoom('p_mag'))??null:null,weaponStates:Object.fromEntries(playerRooms.filter(r=>r.weapon).map(r=>[r.id,combatTurn.getWeaponState(r.id)])),enemyHits:Object.fromEntries(s.enemy.hits),enemyExplosions:Object.fromEntries(s.enemy.explosions),playerBraces:Object.fromEntries(s.enemy.braced||[]),enemyBraces:Object.fromEntries(s.player.braced||[]) };},restoreLog,render:renderCanonicalPlanning};

  placeReplay();refresh();
})();