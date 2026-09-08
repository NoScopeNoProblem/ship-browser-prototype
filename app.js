const weapons={
  standard:{name:'Standard Cannon',arc:1,detail:'Opposite + 1 adjacent'},
  heavy:{name:'Heavy Cannon',arc:1,detail:'Opposite + 1 adjacent'},
  long:{name:'Long Gun',arc:2,detail:'Opposite + 2 adjacent'},
  repeater:{name:'Repeater Cannon',arc:1,detail:'Opposite + 1 adjacent'}
};

// Abstract weapon marks: geometric silhouettes, deliberately without carriage wheels.
const weaponIcons={
  standard:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="4" y="5" width="9" height="8"/><path d="M13 9H31M31 6V12"/></svg>`,
  heavy:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="4" y="4" width="12" height="10"/><path d="M16 6H29V12H16M29 5V13"/></svg>`,
  long:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="3" y="6" width="7" height="6"/><path d="M10 9H34M30 6V12"/></svg>`,
  repeater:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="4" y="4" width="9" height="10"/><path d="M13 6H29M13 12H29M31 5L34 3M31 9H35M31 13L34 15"/></svg>`
};

const enemyRooms=[
  {id:'e-standard',name:'Standard',sub:'Cannon',pips:'♥ ♥',weapon:'standard',row:0,col:0},
  {id:'e-heavy',name:'Heavy',sub:'Cannon',pips:'♥ ♥ ♥ ♥',weapon:'heavy',row:0,col:1},
  {id:'e-repeater',name:'Repeater',sub:'Cannon',pips:'♥ ♥ ♥',weapon:'repeater',row:0,col:2},
  {id:'e-long',name:'Long Gun',sub:'',pips:'♥ ♥',weapon:'long',row:0,col:3},
  {id:'e-unknown-a',name:'Unknown',sub:'',pips:'♥ ♥',row:1,col:0},
  {id:'e-carpenter',name:'Carpenter',sub:'',pips:'♥ ♥',row:1,col:1,capacity:'Timber 3/4'},
  {id:'e-unknown-b',name:'Unknown',sub:'',pips:'♥ ♥',row:1,col:2},
  {id:'e-hold',name:'Hold',sub:'',pips:'♥ ♥',row:1,col:3,capacity:'Cargo 2/3'}
];

const playerRooms=[
  {id:'p-standard',name:'Standard',sub:'Gun Deck',pips:'♥ ♥ ♥',weapon:'standard',row:0,col:0,capacity:'2 loaded'},
  {id:'p-magazine',name:'Magazine',sub:'',pips:'♥ <span class="hit">✕</span>',row:0,col:1,capacity:'6 / 6'},
  {id:'p-heavy',name:'Heavy',sub:'Gun Deck',pips:'♥ ♥ ♥',weapon:'heavy',row:0,col:2,capacity:'Ready'},
  {id:'p-hold-left',name:'General Hold',sub:'',pips:'♥ <span class="hit">✕</span>',row:1,col:0,capacity:'2 / 3'},
  {id:'p-carpenter',name:'Carpenter',sub:'',pips:'♥ ♥',row:1,col:1,capacity:'Timber 4/4'},
  {id:'p-hold-right',name:'General Hold',sub:'',pips:'♥ ♥',row:1,col:2,capacity:'1 / 3'}
];

const masts={
  enemy:{id:'enemy-mast',name:'Mast',kind:'mast',side:'enemy',col:2},
  player:{id:'player-mast',name:'Mast',kind:'mast',side:'player',col:1}
};

function assignWeaponInstances(rooms){
  const totals={};
  const seen={};
  for(const room of rooms){if(room.weapon)totals[room.weapon]=(totals[room.weapon]||0)+1;}
  for(const room of rooms){
    if(!room.weapon)continue;
    seen[room.weapon]=(seen[room.weapon]||0)+1;
    room.instance=totals[room.weapon]>1?String.fromCharCode(64+seen[room.weapon]):'';
  }
}
assignWeaponInstances(enemyRooms);
assignWeaponInstances(playerRooms);

// Intent is fixed before the player moves. If movement takes the target out of arc,
// the badge remains but fades to show the shot has been evaded.
const enemyIntents=[
  {side:'enemy',sourceId:'e-standard',targetId:'p-hold-left'},
  {side:'enemy',sourceId:'e-heavy',targetId:'player-mast'},
  {side:'enemy',sourceId:'e-repeater',targetId:'p-magazine'},
  {side:'enemy',sourceId:'e-long',targetId:'p-carpenter'}
];
const playerIntents=[]; // Target selection will populate this in a later pass.

const state={offset:1,min:-2,max:4,hoveredWeapon:null,hoveredTargetId:null,heldSide:null,aestheticMode:false};

const enemyGrid=document.getElementById('enemyGrid');
const playerGrid=document.getElementById('playerGrid');
const playerBlock=document.getElementById('playerBlock');
const stage=document.getElementById('combatStage');
const svg=document.getElementById('arcOverlay');
const weaponInfo=document.getElementById('weaponInfo');
const targetInfo=document.getElementById('targetInfo');
const aft=document.getElementById('moveAft');
const fore=document.getElementById('moveFore');
const scale=document.getElementById('trackScale');
const enemyMastEl=document.getElementById('enemyMast');
const playerMastEl=document.getElementById('playerMast');

function iconMarkup(type,instance='',small=false){
  return `<span class="weapon-icon${small?' small':''}" title="${weapons[type].name}${instance?' '+instance:''}">${weaponIcons[type]}${instance?`<span class="weapon-instance">${instance}</span>`:''}</span>`;
}

function roomsForSide(side){return side==='enemy'?enemyRooms:playerRooms;}
function gridForSide(side){return side==='enemy'?enemyGrid:playerGrid;}
function mastForSide(side){return masts[side];}
function mastElementForSide(side){return side==='enemy'?enemyMastEl:playerMastEl;}
function oppositeSide(side){return side==='enemy'?'player':'enemy';}
function intentsForSide(side){return side==='enemy'?enemyIntents:playerIntents;}

function weaponRoomById(side,id){return roomsForSide(side).find(r=>r.id===id&&r.weapon);}
function targetObjectById(id){
  if(id===masts.enemy.id)return masts.enemy;
  if(id===masts.player.id)return masts.player;
  return [...enemyRooms,...playerRooms].find(r=>r.id===id)||null;
}
function targetElementById(id){
  if(id===masts.enemy.id)return enemyMastEl;
  if(id===masts.player.id)return playerMastEl;
  return document.querySelector(`.room[data-target-id="${id}"]`);
}

function makeRoom(r,side){
  const el=document.createElement('div');
  el.className='room'+(r.weapon?' weapon':'');
  el.dataset.side=side;
  el.dataset.col=r.col;
  el.dataset.row=r.row;
  el.dataset.targetId=r.id;
  if(r.weapon)el.dataset.weapon=r.weapon;

  const title=r.weapon
    ? `<div class="weapon-heading">${iconMarkup(r.weapon,r.instance)}<div><div class="room-title">${r.name}${r.instance?` ${r.instance}`:''}</div><div class="room-sub">${r.sub||''}</div></div></div>`
    : `<div class="room-title">${r.name}</div><div class="room-sub">${r.sub||''}</div>`;
  el.innerHTML=`${title}<div class="room-pips">${r.pips}</div>${r.capacity?`<div class="room-capacity">${r.capacity}</div>`:''}`;

  el.addEventListener('mouseenter',()=>{
    if(state.aestheticMode)return;
    state.hoveredTargetId=r.id;
    if(r.weapon)state.hoveredWeapon={side,room:r,el};
    refreshVisuals();
  });
  el.addEventListener('mouseleave',()=>{
    if(state.hoveredTargetId===r.id)state.hoveredTargetId=null;
    if(state.hoveredWeapon&&state.hoveredWeapon.room===r)state.hoveredWeapon=null;
    if(!state.aestheticMode)refreshVisuals();
  });
  return el;
}

function renderShips(){
  enemyGrid.innerHTML='';
  playerGrid.innerHTML='';
  enemyRooms.forEach(r=>enemyGrid.appendChild(makeRoom(r,'enemy')));
  playerRooms.forEach(r=>playerGrid.appendChild(makeRoom(r,'player')));
}

function wireMastTarget(el,side){
  el.addEventListener('mouseenter',()=>{
    if(state.aestheticMode)return;
    state.hoveredTargetId=masts[side].id;
    refreshVisuals();
  });
  el.addEventListener('mouseleave',()=>{
    if(state.hoveredTargetId===masts[side].id)state.hoveredTargetId=null;
    if(!state.aestheticMode)refreshVisuals();
  });
}

function roomWidth(){
  const el=enemyGrid.querySelector('.room');
  return el?el.getBoundingClientRect().width:132;
}

function renderTrack(){
  const w=roomWidth();
  aft.disabled=state.offset<=state.min;
  fore.disabled=state.offset>=state.max;
  playerBlock.style.transform=`translateX(${(state.offset-1)*w}px)`;
  scale.innerHTML='';
  for(let i=state.min;i<=state.max;i++){
    const t=document.createElement('div');
    t.className='track-tick'+(i===state.offset?' active':'');
    scale.appendChild(t);
  }
  renderIntentBadges();
  refreshVisuals();
}

function worldCol(side,obj){
  return side==='player'?state.offset+obj.col:obj.col;
}

function targetObjectsForFiringSide(firingSide){
  const targetSide=oppositeSide(firingSide);
  return [...roomsForSide(targetSide),mastForSide(targetSide)];
}

function targetsInRange(side,room){
  const sourceWorld=worldCol(side,room);
  const arc=weapons[room.weapon].arc;
  return targetObjectsForFiringSide(side).filter(target=>Math.abs(worldCol(oppositeSide(side),target)-sourceWorld)<=arc);
}

function isTargetInRange(side,room,target){
  return targetsInRange(side,room).some(t=>t.id===target.id);
}

function clearTransientVisuals(){
  document.querySelectorAll('.targetable,.source-active,.intent-source-highlight,.intent-active-target,.intent-focus-target,.intent-evaded-target').forEach(el=>{
    el.classList.remove('targetable','source-active','intent-source-highlight','intent-active-target','intent-focus-target','intent-evaded-target');
  });
  svg.innerHTML='';
}

function clearVisuals(){
  clearTransientVisuals();
  weaponInfo.textContent='None';
  targetInfo.textContent='Hover a cannon or threatened room.';
}

function highlightRangeTargets(side,room){
  const targets=targetsInRange(side,room);
  for(const target of targets){
    const el=targetElementById(target.id);
    if(el)el.classList.add('targetable');
  }
  return targets;
}

function targetSurfaceBounds(firingSide){
  const targetSide=oppositeSide(firingSide);
  const grid=gridForSide(targetSide);
  const mast= mastElementForSide(targetSide);
  const gr=grid.getBoundingClientRect();
  const mr=mast.getBoundingClientRect();
  const sr=stage.getBoundingClientRect();
  return {
    gridRect:gr,
    minY:Math.min(gr.top,mr.top)-sr.top,
    maxY:Math.max(gr.bottom,mr.bottom)-sr.top,
    stageRect:sr
  };
}

function drawTheoreticalArc(side,room,sourceEl,mode='single',focus=false){
  const targetSide=oppositeSide(side);
  const targetGrid=gridForSide(targetSide);
  const firstTarget=targetGrid.querySelector('.room');
  if(!firstTarget)return;
  const {gridRect:gr,minY,maxY,stageRect:sr}=targetSurfaceBounds(side);
  const src=sourceEl.getBoundingClientRect();
  const cw=firstTarget.getBoundingClientRect().width;
  const sourceWorld=worldCol(side,room);
  const baseWorld=targetSide==='player'?state.offset:0;
  const arc=weapons[room.weapon].arc;
  const minWorld=sourceWorld-arc;
  const maxWorld=sourceWorld+arc;
  const minX=gr.left-sr.left+(minWorld-baseWorld)*cw;
  const maxX=gr.left-sr.left+(maxWorld-baseWorld+1)*cw;
  const sx=src.left+src.width/2-sr.left;
  const sy=src.top+src.height/2-sr.top;
  const sourceAbove=sy<minY;
  const nearY=sourceAbove?minY:maxY;
  const farY=sourceAbove?maxY:minY;
  const p=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  p.setAttribute('points',[[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(x=>x.join(',')).join(' '));
  p.setAttribute('class',`arc-path ${mode}${focus?' focus':''}`);
  svg.appendChild(p);
}

function intentForSource(side,sourceId){return intentsForSide(side).find(i=>i.sourceId===sourceId)||null;}

function applyIntentForSource(side,room,strong=true){
  const intent=intentForSource(side,room.id);
  if(!intent)return null;
  const target=targetObjectById(intent.targetId);
  const targetEl=targetElementById(intent.targetId);
  if(!target||!targetEl)return null;
  const active=isTargetInRange(side,room,target);
  targetEl.classList.add(active?(strong?'intent-focus-target':'intent-active-target'):'intent-evaded-target');
  return {intent,target,active};
}

function showSingleArc(side,room,sourceEl){
  clearTransientVisuals();
  const targets=highlightRangeTargets(side,room);
  sourceEl.classList.add('source-active');
  drawTheoreticalArc(side,room,sourceEl,'single');

  const intentResult=applyIntentForSource(side,room,true);
  if(side==='player')addIncomingSourceHighlights(room.id);

  const w=weapons[room.weapon];
  weaponInfo.innerHTML=`${iconMarkup(room.weapon,room.instance,true)} <span>${w.name}${room.instance?` ${room.instance}`:''} — ${w.detail}</span>`;
  if(intentResult){
    targetInfo.textContent=`Intent: ${intentResult.target.name} · ${intentResult.active?'in arc':'evaded by alignment'}`;
  }else{
    const roomTargets=targets.filter(t=>t.kind!=='mast').length;
    const mastTarget=targets.some(t=>t.kind==='mast');
    targetInfo.textContent=`${roomTargets} room${roomTargets===1?'':'s'}${mastTarget?' + mast':''} in range`;
  }
}

function addIncomingSourceHighlights(targetId){
  const matches=enemyIntents.filter(i=>i.targetId===targetId);
  for(const intent of matches){
    const source=weaponRoomById('enemy',intent.sourceId);
    if(!source)continue;
    const sourceEl=enemyGrid.querySelector(`.room[data-target-id="${source.id}"]`);
    if(sourceEl)sourceEl.classList.add('intent-source-highlight');
  }
}

function showIncomingSources(targetId){
  clearTransientVisuals();
  const matches=enemyIntents.filter(i=>i.targetId===targetId);
  const target=targetObjectById(targetId);
  const targetEl=targetElementById(targetId);
  if(!matches.length||!target||!targetEl){
    weaponInfo.textContent='No enemy intent';
    targetInfo.textContent='This room is not currently targeted.';
    return;
  }

  let anyActive=false;
  const names=[];
  for(const intent of matches){
    const source=weaponRoomById('enemy',intent.sourceId);
    if(!source)continue;
    const sourceEl=enemyGrid.querySelector(`.room[data-target-id="${source.id}"]`);
    if(sourceEl)sourceEl.classList.add('intent-source-highlight');
    const active=isTargetInRange('enemy',source,target);
    anyActive=anyActive||active;
    names.push(`${weapons[source.weapon].name}${source.instance?` ${source.instance}`:''}${active?'':' (evaded)'}`);
  }
  targetEl.classList.add(anyActive?'intent-focus-target':'intent-evaded-target');
  weaponInfo.textContent='Incoming fire';
  targetInfo.textContent=names.join(' · ');
}

function applyIntentOverview(side){
  for(const intent of intentsForSide(side)){
    const source=weaponRoomById(side,intent.sourceId);
    const target=targetObjectById(intent.targetId);
    const targetEl=targetElementById(intent.targetId);
    if(!source||!target||!targetEl)continue;
    targetEl.classList.add(isTargetInRange(side,source,target)?'intent-active-target':'intent-evaded-target');
  }
}

function showAllArcs(side,focusedRoom=null){
  clearTransientVisuals();
  const rooms=roomsForSide(side);
  const grid=gridForSide(side);
  const mode=side==='player'?'friendly-overview':'enemy-overview';

  for(const room of rooms.filter(r=>r.weapon)){
    const sourceEl=grid.querySelector(`.room[data-target-id="${room.id}"]`);
    if(!sourceEl)continue;
    sourceEl.classList.add('source-active');
    drawTheoreticalArc(side,room,sourceEl,mode,focusedRoom===room);
  }

  applyIntentOverview(side);
  if(focusedRoom)applyIntentForSource(side,focusedRoom,true);

  weaponInfo.textContent=side==='player'?'Friendly firing arcs':'Enemy firing arcs + intent';
  targetInfo.textContent=side==='player'?'Hold X · hover a gun to inspect':'Hold Z · icons mark intended targets';
}

function renderIntentBadges(){
  document.querySelectorAll('.intent-badges').forEach(el=>el.remove());
  const grouped=new Map();
  for(const intent of enemyIntents){
    if(!grouped.has(intent.targetId))grouped.set(intent.targetId,[]);
    grouped.get(intent.targetId).push(intent);
  }

  for(const [targetId,intents] of grouped.entries()){
    const targetEl=targetElementById(targetId);
    if(!targetEl)continue;
    const holder=document.createElement('div');
    holder.className='intent-badges';
    for(const intent of intents){
      const source=weaponRoomById('enemy',intent.sourceId);
      const target=targetObjectById(targetId);
      if(!source||!target)continue;
      const active=isTargetInRange('enemy',source,target);
      const badge=document.createElement('span');
      badge.className='intent-badge'+(active?'':' evaded');
      badge.title=`${weapons[source.weapon].name}${source.instance?` ${source.instance}`:''} → ${target.name}${active?'':' (currently out of arc)'}`;
      badge.innerHTML=iconMarkup(source.weapon,source.instance,true);
      holder.appendChild(badge);
    }
    targetEl.appendChild(holder);
  }
}

function refreshVisuals(){
  if(state.aestheticMode){
    clearTransientVisuals();
    weaponInfo.textContent='Exterior view';
    targetInfo.textContent='Press H to return to targeting view.';
    return;
  }
  if(state.heldSide){
    const focus=state.hoveredWeapon&&state.hoveredWeapon.side===state.heldSide?state.hoveredWeapon.room:null;
    showAllArcs(state.heldSide,focus);
    return;
  }
  if(state.hoveredWeapon){
    showSingleArc(state.hoveredWeapon.side,state.hoveredWeapon.room,state.hoveredWeapon.el);
    return;
  }
  if(state.hoveredTargetId&&targetObjectById(state.hoveredTargetId)?.side!=='enemy'){
    showIncomingSources(state.hoveredTargetId);
    return;
  }
  clearVisuals();
}

function moveLeft(){if(state.offset>state.min){state.offset--;renderTrack();}}
function moveRight(){if(state.offset<state.max){state.offset++;renderTrack();}}
function toggleExterior(){
  state.aestheticMode=!state.aestheticMode;
  state.heldSide=null;
  state.hoveredWeapon=null;
  state.hoveredTargetId=null;
  stage.classList.toggle('aesthetic-mode',state.aestheticMode);
  refreshVisuals();
}

aft.onclick=moveLeft;
fore.onclick=moveRight;

window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(key==='arrowleft'){
    e.preventDefault();
    if(!e.repeat)moveLeft();
    return;
  }
  if(key==='arrowright'){
    e.preventDefault();
    if(!e.repeat)moveRight();
    return;
  }
  if(e.repeat)return;
  if(key==='h'){toggleExterior();return;}
  if(state.aestheticMode)return;
  if(key==='z'){state.heldSide='enemy';showAllArcs('enemy');}
  if(key==='x'){state.heldSide='player';showAllArcs('player');}
});

window.addEventListener('keyup',e=>{
  if(state.aestheticMode)return;
  const key=e.key.toLowerCase();
  if((key==='z'&&state.heldSide==='enemy')||(key==='x'&&state.heldSide==='player')){
    state.heldSide=null;
    refreshVisuals();
  }
});

window.addEventListener('blur',()=>{
  state.heldSide=null;
  if(!state.aestheticMode)refreshVisuals();
});
window.addEventListener('resize',renderTrack);

renderShips();
wireMastTarget(enemyMastEl,'enemy');
wireMastTarget(playerMastEl,'player');
renderTrack();
