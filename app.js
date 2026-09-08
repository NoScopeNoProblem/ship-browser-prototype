const weapons={
  standard:{name:'Standard Cannon',arc:1,detail:'Opposite + 1 adjacent'},
  heavy:{name:'Heavy Cannon',arc:1,detail:'Opposite + 1 adjacent'},
  long:{name:'Long Gun',arc:2,detail:'Opposite + 2 adjacent'},
  repeater:{name:'Repeater Cannon',arc:1,detail:'Opposite + 1 adjacent'}
};

const weaponIcons={
  standard:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="5" y="7" width="17" height="5" rx="2"/><rect x="21" y="8" width="8" height="3" rx="1"/><circle cx="11" cy="14" r="2.4"/><circle cx="21" cy="14" r="2.4"/></svg>`,
  heavy:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="4" y="5" width="19" height="8" rx="3"/><rect x="22" y="7" width="8" height="4" rx="1"/><circle cx="10" cy="15" r="2.5"/><circle cx="22" cy="15" r="2.5"/></svg>`,
  long:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="3" y="8" width="27" height="3" rx="1.5"/><rect x="28" y="8" width="5" height="3" rx="1"/><circle cx="10" cy="14" r="2.2"/><circle cx="23" cy="14" r="2.2"/></svg>`,
  repeater:`<svg viewBox="0 0 36 18" aria-hidden="true"><rect x="5" y="6" width="17" height="3" rx="1.5"/><rect x="5" y="10" width="17" height="3" rx="1.5"/><rect x="21" y="7" width="7" height="5" rx="1"/><circle cx="10" cy="15" r="2.2"/><circle cx="21" cy="15" r="2.2"/><circle cx="31" cy="6" r="1.3"/><circle cx="34" cy="9" r="1.3"/><circle cx="31" cy="12" r="1.3"/></svg>`
};

const enemyRooms=[
  {name:'Standard',sub:'Cannon',pips:'♥ ♥',weapon:'standard',row:0,col:0},
  {name:'Heavy',sub:'Cannon',pips:'♥ ♥ ♥ ♥',weapon:'heavy',row:0,col:1},
  {name:'Repeater',sub:'Cannon',pips:'♥ ♥ ♥',weapon:'repeater',row:0,col:2},
  {name:'Long Gun',sub:'',pips:'♥ ♥',weapon:'long',row:0,col:3},
  {name:'Unknown',sub:'',pips:'♥ ♥',row:1,col:0},
  {name:'Carpenter',sub:'',pips:'♥ ♥',row:1,col:1,capacity:'Timber 3/4'},
  {name:'Unknown',sub:'',pips:'♥ ♥',row:1,col:2},
  {name:'Hold',sub:'',pips:'♥ ♥',row:1,col:3,capacity:'Cargo 2/3'}
];

const playerRooms=[
  {name:'Standard',sub:'Gun Deck',pips:'♥ ♥ ♥',weapon:'standard',row:0,col:0,capacity:'2 loaded'},
  {name:'Magazine',sub:'',pips:'♥ <span class="hit">✕</span>',row:0,col:1,capacity:'6 / 6'},
  {name:'Heavy',sub:'Gun Deck',pips:'♥ ♥ ♥',weapon:'heavy',row:0,col:2,capacity:'Ready'},
  {name:'General Hold',sub:'',pips:'♥ <span class="hit">✕</span>',row:1,col:0,capacity:'2 / 3'},
  {name:'Carpenter',sub:'',pips:'♥ ♥',row:1,col:1,capacity:'Timber 4/4'},
  {name:'General Hold',sub:'',pips:'♥ ♥',row:1,col:2,capacity:'1 / 3'}
];

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

const state={offset:1,min:-2,max:4,hovered:null,heldSide:null};
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

function iconMarkup(type,instance='',small=false){
  return `<span class="weapon-icon${small?' small':''}" title="${weapons[type].name}${instance?' '+instance:''}">${weaponIcons[type]}${instance?`<span class="weapon-instance">${instance}</span>`:''}</span>`;
}

function makeRoom(r,side){
  const el=document.createElement('div');
  el.className='room'+(r.weapon?' weapon':'');
  el.dataset.side=side;
  el.dataset.col=r.col;
  el.dataset.row=r.row;
  if(r.weapon)el.dataset.weapon=r.weapon;
  const title=r.weapon
    ? `<div class="weapon-heading">${iconMarkup(r.weapon,r.instance)}<div><div class="room-title">${r.name}${r.instance?` ${r.instance}`:''}</div><div class="room-sub">${r.sub||''}</div></div></div>`
    : `<div class="room-title">${r.name}</div><div class="room-sub">${r.sub||''}</div>`;
  el.innerHTML=`${title}<div class="room-pips">${r.pips}</div>${r.capacity?`<div class="room-capacity">${r.capacity}</div>`:''}`;
  if(r.weapon){
    el.addEventListener('mouseenter',()=>{
      state.hovered={side,room:r,el};
      if(!state.heldSide)showSingleArc(side,r,el);
      else if(state.heldSide===side)showAllArcs(side,r);
    });
    el.addEventListener('mouseleave',()=>{
      state.hovered=null;
      if(state.heldSide)showAllArcs(state.heldSide);
      else clearVisuals();
    });
  }
  return el;
}

function renderShips(){
  enemyGrid.innerHTML='';
  playerGrid.innerHTML='';
  enemyRooms.forEach(r=>enemyGrid.appendChild(makeRoom(r,'enemy')));
  playerRooms.forEach(r=>playerGrid.appendChild(makeRoom(r,'player')));
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
  refreshVisuals();
}

function sourceWorldCol(side,room){return side==='player'?state.offset+room.col:room.col;}
function targetBaseWorld(side){return side==='player'?0:state.offset;}

function targetRooms(side,room){
  const w=weapons[room.weapon];
  const sourceWorld=sourceWorldCol(side,room);
  const rooms=side==='player'?enemyRooms:playerRooms;
  return rooms.filter(r=>{
    const targetWorld=side==='player'?r.col:state.offset+r.col;
    return Math.abs(targetWorld-sourceWorld)<=w.arc;
  });
}

function targetElement(side,target){
  const grid=side==='player'?enemyGrid:playerGrid;
  return grid.querySelector(`.room[data-col="${target.col}"][data-row="${target.row}"]`);
}

function clearHighlights(){
  document.querySelectorAll('.room.targetable,.room.source-active,.room.threat-1,.room.threat-2,.room.threat-3,.room.threat-4,.room.coverage-1,.room.coverage-2,.room.coverage-3,.room.coverage-4').forEach(el=>{
    el.classList.remove('targetable','source-active','threat-1','threat-2','threat-3','threat-4','coverage-1','coverage-2','coverage-3','coverage-4');
  });
  document.querySelectorAll('.target-sources').forEach(el=>el.remove());
}

function clearVisuals(){
  clearHighlights();
  svg.innerHTML='';
  weaponInfo.textContent='None';
  targetInfo.textContent='Hover a cannon.';
}

function highlightTargets(side,room){
  const targets=targetRooms(side,room);
  for(const target of targets){
    const el=targetElement(side,target);
    if(el)el.classList.add('targetable');
  }
  return targets;
}

function drawTheoreticalArc(side,room,sourceEl,mode='single',focus=false){
  const targetGrid=side==='player'?enemyGrid:playerGrid;
  const firstTarget=targetGrid.querySelector('.room');
  if(!firstTarget)return;
  const sr=stage.getBoundingClientRect();
  const src=sourceEl.getBoundingClientRect();
  const gr=targetGrid.getBoundingClientRect();
  const cw=firstTarget.getBoundingClientRect().width;
  const w=weapons[room.weapon];
  const sourceWorld=sourceWorldCol(side,room);
  const baseWorld=targetBaseWorld(side);
  const minWorld=sourceWorld-w.arc;
  const maxWorld=sourceWorld+w.arc;
  const minX=gr.left-sr.left+(minWorld-baseWorld)*cw;
  const maxX=gr.left-sr.left+(maxWorld-baseWorld+1)*cw;
  const minY=gr.top-sr.top;
  const maxY=gr.bottom-sr.top;
  const sx=src.left+src.width/2-sr.left;
  const sy=src.top+src.height/2-sr.top;
  const above=sy<minY;
  const nearY=above?minY:maxY;
  const farY=above?maxY:minY;
  const p=document.createElementNS('http://www.w3.org/2000/svg','polygon');
  p.setAttribute('points',[[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(x=>x.join(',')).join(' '));
  p.setAttribute('class',`arc-path ${mode}${focus?' focus':''}`);
  svg.appendChild(p);
}

function showSingleArc(side,room,sourceEl){
  clearVisuals();
  highlightTargets(side,room);
  sourceEl.classList.add('source-active');
  drawTheoreticalArc(side,room,sourceEl,'single');
  const w=weapons[room.weapon];
  const targets=targetRooms(side,room);
  const cols=[...new Set(targets.map(t=>t.col+1))].sort((a,b)=>a-b);
  weaponInfo.innerHTML=`${iconMarkup(room.weapon,room.instance,true)} <span>${w.name}${room.instance?` ${room.instance}`:''} — ${w.detail}</span>`;
  targetInfo.textContent=cols.length?`Columns ${cols.join(', ')}`:'No legal targets at this alignment.';
}

function showAllArcs(side,focusedRoom=null){
  clearVisuals();
  const rooms=side==='player'?playerRooms:enemyRooms;
  const grid=side==='player'?playerGrid:enemyGrid;
  const targetMap=new Map();
  const mode=side==='player'?'friendly-overview':'enemy-overview';

  for(const r of rooms.filter(r=>r.weapon)){
    const sourceEl=grid.querySelector(`.room[data-col="${r.col}"][data-row="${r.row}"]`);
    if(!sourceEl)continue;
    sourceEl.classList.add('source-active');
    const focus=focusedRoom===r;
    drawTheoreticalArc(side,r,sourceEl,mode,focus);
    for(const target of targetRooms(side,r)){
      const el=targetElement(side,target);
      if(!el)continue;
      if(!targetMap.has(el))targetMap.set(el,[]);
      targetMap.get(el).push(r);
    }
  }

  for(const [el,sources] of targetMap.entries()){
    const level=Math.min(4,sources.length);
    el.classList.add(side==='player'?`coverage-${level}`:`threat-${level}`);
    const chips=document.createElement('div');
    chips.className='target-sources';
    chips.innerHTML=sources.map(r=>iconMarkup(r.weapon,r.instance,true)).join('');
    el.appendChild(chips);
  }

  if(focusedRoom){
    weaponInfo.innerHTML=`${iconMarkup(focusedRoom.weapon,focusedRoom.instance,true)} <span>${weapons[focusedRoom.weapon].name}${focusedRoom.instance?` ${focusedRoom.instance}`:''}</span>`;
    targetInfo.textContent='Focused while overview is held';
  }else{
    weaponInfo.textContent=side==='player'?'All friendly firing arcs':'All enemy firing arcs';
    targetInfo.textContent=side==='player'?'Hold X · hover a gun to isolate':'Hold Z · hover a gun to isolate';
  }
}

function refreshVisuals(){
  if(state.heldSide){
    const focus=state.hovered&&state.hovered.side===state.heldSide?state.hovered.room:null;
    showAllArcs(state.heldSide,focus);
    return;
  }
  if(state.hovered){showSingleArc(state.hovered.side,state.hovered.room,state.hovered.el);return;}
  clearVisuals();
}

function moveLeft(){if(state.offset>state.min){state.offset--;renderTrack();}}
function moveRight(){if(state.offset<state.max){state.offset++;renderTrack();}}
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
  if(key==='z'){state.heldSide='enemy';showAllArcs('enemy');}
  if(key==='x'){state.heldSide='player';showAllArcs('player');}
});

window.addEventListener('keyup',e=>{
  const key=e.key.toLowerCase();
  if((key==='z'&&state.heldSide==='enemy')||(key==='x'&&state.heldSide==='player')){
    state.heldSide=null;
    refreshVisuals();
  }
});

window.addEventListener('blur',()=>{state.heldSide=null;refreshVisuals();});
window.addEventListener('resize',renderTrack);

renderShips();
renderTrack();
