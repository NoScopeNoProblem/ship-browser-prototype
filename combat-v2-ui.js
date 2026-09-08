function playerIntentDistribution(){
  const hits=new Map(),targetMap=new Map();
  Object.entries(state.playerIntents).forEach(([wid,tid])=>{
    const weapon=sourceEntity('player',wid),target=sourceEntity('enemy',tid);
    if(!weapon || !target || weapon.loading) return;
    const dmg=weapons[weapon.weapon].damage;
    hits.set(tid,(hits.get(tid)||0)+dmg);
    if(!targetMap.has(tid)) targetMap.set(tid,[]);
    targetMap.get(tid).push({sourceId:wid,targetId:tid,damage:dmg});
  });
  return {hits,targetMap};
}

function disabledEnemySourcesFromPlan(playerState){
  const disabled=new Set();
  enemyRooms.filter(r=>r.weapon).forEach(r=>{
    const planned=playerState.hits.get(r.id)||0;
    if(r.hp-planned<=0) disabled.add(r.id);
  });
  return disabled;
}

function enemyIntentDistribution(playerState=playerIntentDistribution()){
  const hits=new Map(),dodges=new Map(),prevented=new Map();
  const targetMap=new Map(),preventedTargetMap=new Map(),missMap=[];
  const disabledSources=disabledEnemySourcesFromPlan(playerState);

  enemyIntents.forEach(intent=>{
    const current=projectedEnemyImpact(intent),original=originalEnemyImpact(intent);
    if(disabledSources.has(intent.sourceId)){
      if(current){
        prevented.set(current.id,(prevented.get(current.id)||0)+intent.damage);
        if(!preventedTargetMap.has(current.id)) preventedTargetMap.set(current.id,[]);
        preventedTargetMap.get(current.id).push(intent);
      }
      return;
    }
    if(current){
      hits.set(current.id,(hits.get(current.id)||0)+intent.damage);
      if(!targetMap.has(current.id)) targetMap.set(current.id,[]);
      targetMap.get(current.id).push(intent);
    }
    if(original && (!current || current.id!==original.id)) dodges.set(original.id,(dodges.get(original.id)||0)+intent.damage);
    if(!current && original) missMap.push(intent);
  });
  return {hits,dodges,prevented,targetMap,preventedTargetMap,missMap,disabledSources};
}

function renderPipsAndIntentChips(){
  document.querySelectorAll('.intent-stack,.miss-marker').forEach(el=>el.remove());
  const playerState=playerIntentDistribution();
  const enemyState=enemyIntentDistribution(playerState);

  playerRooms.forEach(r=>{
    const el=getEntityElement('player',r.id);
    el.querySelector('.pips').innerHTML=pipsMarkup(r,enemyState.hits.get(r.id)||0,enemyState.dodges.get(r.id)||0,enemyState.prevented.get(r.id)||0);
    if(enemyState.hits.get(r.id)) el.classList.add('enemy-intended');
    if(enemyState.dodges.get(r.id)) el.classList.add('dodged');
    if(enemyState.prevented.get(r.id)) el.classList.add('prevented');
    if(enemyState.targetMap.has(r.id)) addEnemyIntentStack(el,enemyState.targetMap.get(r.id),false);
    if(enemyState.preventedTargetMap.has(r.id)) addEnemyIntentStack(el,enemyState.preventedTargetMap.get(r.id),true);
  });
  playerMastPips.innerHTML=pipsMarkup(playerMast,enemyState.hits.get(playerMast.id)||0,enemyState.dodges.get(playerMast.id)||0,enemyState.prevented.get(playerMast.id)||0);
  if(enemyState.hits.get(playerMast.id)) playerMastBox.classList.add('enemy-intended');
  if(enemyState.dodges.get(playerMast.id)) playerMastBox.classList.add('dodged');
  if(enemyState.prevented.get(playerMast.id)) playerMastBox.classList.add('prevented');
  if(enemyState.targetMap.has(playerMast.id)) addEnemyIntentStack(playerMastBox,enemyState.targetMap.get(playerMast.id),false);
  if(enemyState.preventedTargetMap.has(playerMast.id)) addEnemyIntentStack(playerMastBox,enemyState.preventedTargetMap.get(playerMast.id),true);
  enemyState.missMap.forEach(addMissMarker);

  enemyRooms.forEach(r=>{
    const el=getEntityElement('enemy',r.id);
    el.querySelector('.pips').innerHTML=pipsMarkup(r,playerState.hits.get(r.id)||0,0,0);
    if(playerState.targetMap.has(r.id)) addFriendlyIntentStack(el,playerState.targetMap.get(r.id));
  });
  enemyMastPips.innerHTML=pipsMarkup(enemyMast,playerState.hits.get(enemyMast.id)||0,0,0);
  if(playerState.targetMap.has(enemyMast.id)) addFriendlyIntentStack(enemyMastBox,playerState.targetMap.get(enemyMast.id));
}

function beginIntentHover(side,sourceId){
  if(state.exterior) return;
  state.hoverIntent={side,sourceId};
  refresh();
}
function endIntentHover(){ state.hoverIntent=null; refresh(); }

function addEnemyIntentStack(targetEl,intents,prevented=false){
  let stack=targetEl.querySelector('.intent-stack.enemy-stack');
  if(!stack){ stack=document.createElement('div'); stack.className='intent-stack enemy-stack'; targetEl.appendChild(stack); }
  intents.forEach(intent=>{
    const src=sourceEntity('enemy',intent.sourceId);
    const chip=document.createElement('div');
    chip.className='intent-chip'+(prevented?' prevented':'');
    chip.title=prevented?`${weapons[src.weapon].name}: prevented by planned fire`:`${weapons[src.weapon].name}: ${intent.damage} incoming damage`;
    chip.innerHTML=iconMarkup(src.weapon,enemySuffix[src.id]||'',true);
    chip.addEventListener('mouseenter',e=>{e.stopPropagation();beginIntentHover('enemy',intent.sourceId);});
    chip.addEventListener('mouseleave',endIntentHover);
    stack.appendChild(chip);
  });
}

function addFriendlyIntentStack(targetEl,intents){
  let stack=targetEl.querySelector('.intent-stack.friendly-stack');
  if(!stack){ stack=document.createElement('div'); stack.className='intent-stack friendly-stack'; targetEl.appendChild(stack); }
  intents.forEach(intent=>{
    const src=sourceEntity('player',intent.sourceId);
    const chip=document.createElement('div');
    chip.className='intent-chip friendly';
    chip.innerHTML=iconMarkup(src.weapon,playerSuffix[src.id]||'',true);
    chip.addEventListener('mouseenter',e=>{e.stopPropagation();beginIntentHover('player',intent.sourceId);});
    chip.addEventListener('mouseleave',endIntentHover);
    stack.appendChild(chip);
  });
}

function addMissMarker(intent){
  const source=sourceEntity('enemy',intent.sourceId);
  const marker=document.createElement('div');
  marker.className='miss-marker';
  marker.dataset.sourceId=intent.sourceId;
  marker.style.left=`${worldColX(intent.targetWorld)+10}px`;
  marker.style.top=`${laneY('player',intent.lane)+34}px`;
  marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<span class="miss-text">MISS</span>`;
  marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',intent.sourceId));
  marker.addEventListener('mouseleave',endIntentHover);
  stage.appendChild(marker);
}

function drawArc(side,source){
  const weapon=weapons[source.weapon];
  const sw=sourceWorld(side,source);
  const sourceEl=getEntityElement(side,source.id);
  if(!sourceEl) return;
  const stageRect=stage.getBoundingClientRect();
  const sourceRect=sourceEl.getBoundingClientRect();
  const targetGrid=side==='enemy'?playerGrid:enemyGrid;
  const targetRect=targetGrid.getBoundingClientRect();
  const sx=sourceRect.left-stageRect.left+sourceRect.width/2;
  const sy=sourceRect.top-stageRect.top+sourceRect.height/2;
  const minX=worldColX(sw-weapon.arc);
  const maxX=worldColX(sw+weapon.arc+1);
  const targetTop=targetRect.top-stageRect.top;
  const targetBottom=targetRect.bottom-stageRect.top;
  const nearY=side==='enemy'?targetTop:targetBottom;
  const farY=side==='enemy'?targetBottom:targetTop;
  const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  poly.setAttribute('points',[[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(v=>v.join(',')).join(' '));
  let cls=`arc-path ${side==='enemy'?'enemy':'friendly'}`;
  if(state.selectedWeaponId===source.id || (state.hoverIntent&&state.hoverIntent.sourceId===source.id) || (state.hoveredWeapon&&state.hoveredWeapon.id===source.id)) cls+=' focus';
  if(state.selectedWeaponId===source.id) cls+=' selection';
  poly.setAttribute('class',cls);
  arcOverlay.appendChild(poly);
}

function highlightMissForSource(sourceId){
  const marker=stage.querySelector(`.miss-marker[data-source-id="${sourceId}"]`);
  if(marker) marker.classList.add('focus-miss');
}

function highlightOverview(side){
  const rooms=side==='enemy'?enemyRooms.filter(r=>r.weapon):playerRooms.filter(r=>r.weapon && !r.loading);
  rooms.forEach(r=>drawArc(side,r));
  if(side==='enemy'){
    const enemyState=enemyIntentDistribution(playerIntentDistribution());
    enemyState.targetMap.forEach((_,id)=>getEntityElement('player',id).classList.add('enemy-intended'));
    enemyState.preventedTargetMap.forEach((_,id)=>getEntityElement('player',id).classList.add('prevented'));
    weaponInfo.textContent='Enemy firing arcs';
    targetInfo.textContent='Red = incoming damage. Blue striped = avoided or prevented.';
  } else {
    const coverage=new Set();
    playerRooms.filter(r=>r.weapon && !r.loading).forEach(r=>getTargetsForWeapon('player',r).forEach(t=>coverage.add(t.id)));
    coverage.forEach(id=>getEntityElement('enemy',id).classList.add('friendly-focus-target'));
    weaponInfo.textContent='Friendly firing arcs';
    targetInfo.textContent='Blue rooms are currently in range. Loading guns are excluded.';
  }
}

function isLegalTarget(targetId){
  const wid=state.selectedWeaponId;
  if(!wid) return false;
  const weapon=sourceEntity('player',wid);
  if(!weapon || weapon.loading) return false;
  return getTargetsForWeapon('player',weapon).some(t=>t.id===targetId);
}

function renderSelection(){
  if(!state.selectedWeaponId) return;
  const weapon=sourceEntity('player',state.selectedWeaponId);
  if(!weapon || weapon.loading) return;
  getEntityElement('player',weapon.id).classList.add('selectable');
  drawArc('player',weapon);
  getTargetsForWeapon('player',weapon).forEach(t=>getEntityElement('enemy',t.id).classList.add('valid-target'));
  weaponInfo.innerHTML=`${iconMarkup(weapon.weapon,playerSuffix[weapon.id]||'',true)} ${weapons[weapon.weapon].name}`;
  targetInfo.textContent='Click a highlighted enemy room or mast to assign this shot. Out-of-range clicks cancel selection.';
}

function renderHoverWeapon(){
  if(!state.hoveredWeapon) return false;
  const entity=sourceEntity(state.hoveredWeapon.side,state.hoveredWeapon.id);
  if(!entity) return false;
  getEntityElement(state.hoveredWeapon.side,entity.id).classList.add('focus-source');

  if(entity.loading){
    weaponInfo.innerHTML=`${iconMarkup(entity.weapon,(state.hoveredWeapon.side==='enemy'?enemySuffix:playerSuffix)[entity.id]||'',true)} ${weapons[entity.weapon].name}`;
    targetInfo.textContent='LOADING — cannot fire this turn.';
    return true;
  }

  drawArc(state.hoveredWeapon.side,entity);
  if(state.hoveredWeapon.side==='enemy'){
    const enemyState=enemyIntentDistribution(playerIntentDistribution());
    const intent=enemyIntents.find(i=>i.sourceId===entity.id);
    if(!intent){
      weaponInfo.innerHTML=`${iconMarkup(entity.weapon,enemySuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`;
      targetInfo.textContent='No shot planned this turn.';
      return true;
    }
    const impact=projectedEnemyImpact(intent);
    if(impact){
      if(enemyState.disabledSources.has(entity.id)) getEntityElement('player',impact.id).classList.add('prevented');
      else getEntityElement('player',impact.id).classList.add('focus-target');
    } else highlightMissForSource(entity.id);
    weaponInfo.innerHTML=`${iconMarkup(entity.weapon,enemySuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`;
    if(enemyState.disabledSources.has(entity.id)) targetInfo.textContent=impact?`Intent prevented: your planned shot disables this gun before it fires at ${impact.name}.`:'Intent prevented: this gun is disabled before firing.';
    else targetInfo.textContent=impact?`${impact.name}: ${intent.damage} damage if not prevented.`:'This shot misses because there is no ship section in its aimed space.';
  } else {
    getTargetsForWeapon('player',entity).forEach(t=>getEntityElement('enemy',t.id).classList.add('friendly-focus-target'));
    weaponInfo.innerHTML=`${iconMarkup(entity.weapon,playerSuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`;
    targetInfo.textContent='Blue rooms are legal targets.';
  }
  return true;
}

function renderHoverIntent(){
  if(!state.hoverIntent) return false;
  const src=sourceEntity(state.hoverIntent.side,state.hoverIntent.sourceId);
  if(!src) return false;
  if(!src.loading) drawArc(state.hoverIntent.side,src);
  getEntityElement(state.hoverIntent.side,src.id).classList.add('focus-source');

  if(state.hoverIntent.side==='enemy'){
    const intent=enemyIntents.find(i=>i.sourceId===src.id);
    if(!intent){
      weaponInfo.innerHTML=`${iconMarkup(src.weapon,enemySuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
      targetInfo.textContent=src.loading?'LOADING — cannot fire this turn.':'No shot planned this turn.';
      return true;
    }
    const impact=projectedEnemyImpact(intent);
    const enemyState=enemyIntentDistribution(playerIntentDistribution());
    if(impact){
      if(enemyState.disabledSources.has(src.id)) getEntityElement('player',impact.id).classList.add('prevented');
      else getEntityElement('player',impact.id).classList.add('focus-target');
    } else highlightMissForSource(src.id);
    weaponInfo.innerHTML=`${iconMarkup(src.weapon,enemySuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
    if(enemyState.disabledSources.has(src.id)) targetInfo.textContent=impact?`Prevented before its shot reaches ${impact.name}.`:'Prevented before firing.';
    else targetInfo.textContent=impact?`${impact.name}: ${intent.damage} damage`:'MISS — movement leaves the aimed space empty.';
  } else {
    const targetId=state.playerIntents[src.id];
    if(targetId) getEntityElement('enemy',targetId).classList.add('friendly-focus-target');
    weaponInfo.innerHTML=`${iconMarkup(src.weapon,playerSuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
    targetInfo.textContent=targetId?`Planned shot: ${sourceEntity('enemy',targetId).name}`:'No target planned.';
  }
  return true;
}

function refresh(){
  clearClasses();
  arcOverlay.innerHTML='';
  renderTrack();
  positionShips();
  renderPipsAndIntentChips();

  if(state.exterior){
    document.body.classList.add('exterior-mode');
    weaponInfo.textContent='Exterior mode';
    targetInfo.textContent='Press H to return to targeting view.';
    return;
  }
  document.body.classList.remove('exterior-mode');

  if(state.overview==='enemy') highlightOverview('enemy');
  else if(state.overview==='player') highlightOverview('player');
  else if(state.selectedWeaponId) renderSelection();

  if(!renderHoverIntent()) renderHoverWeapon();
  if(!state.hoveredWeapon && !state.hoverIntent && !state.selectedWeaponId && !state.overview){
    weaponInfo.textContent='None';
    targetInfo.textContent='Hover an intent icon, or click one of your ready gun decks to plan a shot.';
  }
}

function onGlobalClick(e){
  if(state.exterior) return;
  const target=e.target;
  if(target.closest('.room[data-side="enemy"]') || target.closest('.mast-box.enemy-mast')) return;
  if(target.closest('.intent-chip') || target.closest('.miss-marker') || target.closest('.move-btn')) return;
  state.selectedWeaponId=null;
  state.hoveredWeapon=null;
  refresh();
}
