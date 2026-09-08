function playerLeftmost(){ return state.playerMastTrack - PLAYER_MAST_LOCAL_COL; }
function playerWorldCol(localCol){ return playerLeftmost() + localCol; }
function entityAtWorld(lane, worldCol){
  if (lane === 'mast') return worldCol === state.playerMastTrack ? playerMast : null;
  return playerRooms.find(r => r.row === lane && playerWorldCol(r.col) === worldCol) || null;
}
function enemyWorldCol(localCol){ return ENEMY_LEFTMOST + localCol; }
function getEnemyByWorld(lane, worldCol){
  if (lane === 'mast') return worldCol === enemyMast.col ? enemyMast : null;
  return enemyRooms.find(r => r.row === lane && enemyWorldCol(r.col) === worldCol) || null;
}
function sourceEntity(side,id){
  const arr = side==='enemy'?enemyRooms:playerRooms;
  return arr.find(r=>r.id===id) || (side==='enemy'&&id===enemyMast.id?enemyMast:(side==='player'&&id===playerMast.id?playerMast:null));
}
function sourceWorld(side, entity){
  if(entity.kind==='mast') return side==='enemy'?enemyMast.col:state.playerMastTrack;
  return side==='enemy'?enemyWorldCol(entity.col):playerWorldCol(entity.col);
}
function getTargetsForWeapon(side, weaponEntity){
  const w = weapons[weaponEntity.weapon];
  const sw = sourceWorld(side, weaponEntity);
  const results = [];
  if(side==='player'){
    enemyRooms.forEach(r => { if(Math.abs(enemyWorldCol(r.col)-sw) <= w.arc) results.push(r); });
    if(Math.abs(enemyMast.col-sw) <= w.arc) results.push(enemyMast);
  } else {
    playerRooms.forEach(r => { if(Math.abs(playerWorldCol(r.col)-sw) <= w.arc) results.push(r); });
    if(Math.abs(state.playerMastTrack-sw) <= w.arc) results.push(playerMast);
  }
  return results;
}
function projectedEnemyImpact(intent){ return entityAtWorld(intent.lane, intent.targetWorld); }
function originalEnemyImpact(intent){
  const originalLeftmost = INITIAL_PLAYER_MAST_TRACK - PLAYER_MAST_LOCAL_COL;
  if(intent.lane === 'mast') return intent.targetWorld === INITIAL_PLAYER_MAST_TRACK ? playerMast : null;
  return playerRooms.find(r => r.row === intent.lane && originalLeftmost + r.col === intent.targetWorld) || null;
}
function iconMarkup(type, suffix='', small=false){
  const d = weapons[type];
  return `<span class="weapon-icon${small?' small':''}" title="${d.name}${suffix?' '+suffix:''}">${d.icon}${suffix?`<span class="weapon-label">${suffix}</span>`:''}</span>`;
}
function pipsMarkup(entity, hits=0, dodges=0){
  const arr = [];
  for(let i=0;i<entity.max;i++){
    const alive = i < entity.hp;
    arr.push(alive ? '<span>♥</span>' : '<span class="empty">·</span>');
  }
  let placed = 0;
  for(let i=entity.hp-1; i>=0 && placed<hits; i--, placed++) arr[i] = '<span class="hit">✕</span>';
  placed = 0;
  for(let i=entity.hp-1-hits; i>=0 && placed<dodges; i--, placed++) arr[i] = '<span class="dodged-mark">↝</span>';
  return arr.join(' ');
}
function roomHtml(r){
  const heading = r.weapon ? `<div class="weapon-heading">${iconMarkup(r.weapon,'',false)}<div><div class="room-title">${r.name}</div><div class="room-sub">${r.sub||''}</div></div></div>` : `<div class="room-title">${r.name}</div><div class="room-sub">${r.sub||''}</div>`;
  return `${heading}<div class="pips">${pipsMarkup(r)}</div>${r.capacity?`<div class="room-capacity">${r.capacity}</div>`:''}`;
}
function renderTrack(){
  trackRow.innerHTML='';
  for(let i=0;i<TRACK_COLS;i++){
    const c = document.createElement('div');
    c.className = 'track-cell' + (i===state.playerMastTrack ? ' mast-col' : '');
    trackRow.appendChild(c);
  }
}
function makeRoom(r, side){
  const el = document.createElement('div');
  el.className = 'room' + (r.weapon ? ' weapon' : '');
  el.dataset.id = r.id;
  el.dataset.side = side;
  el.innerHTML = roomHtml(r);
  if(side==='player' && r.weapon){
    el.addEventListener('mouseenter',()=>{ if(state.exterior) return; state.hoveredWeapon = {side, id:r.id}; refresh();});
    el.addEventListener('mouseleave',()=>{ if(state.hoveredWeapon && state.hoveredWeapon.id===r.id){ state.hoveredWeapon=null; refresh(); }});
    el.addEventListener('click',(e)=>{ e.stopPropagation(); if(state.exterior) return; state.selectedWeaponId = state.selectedWeaponId===r.id ? null : r.id; state.hoveredWeapon = {side, id:r.id}; refresh(); });
  }
  if(side==='enemy'){
    el.addEventListener('mouseenter',()=>{ if(state.exterior) return; if(state.selectedWeaponId){ state.hoverEnemyTarget = r.id; refresh(); }});
    el.addEventListener('mouseleave',()=>{ if(state.hoverEnemyTarget===r.id){ state.hoverEnemyTarget = null; refresh(); }});
    el.addEventListener('click',(e)=>{
      if(state.exterior) return;
      if(state.selectedWeaponId && isLegalTarget(r.id)){
        e.stopPropagation();
        state.playerIntents[state.selectedWeaponId] = r.id;
        state.selectedWeaponId = null;
        state.hoverEnemyTarget = null;
        refresh();
      }
    });
  }
  return el;
}
function renderShips(){
  enemyGrid.innerHTML=''; playerGrid.innerHTML='';
  enemyRooms.forEach(r => enemyGrid.appendChild(makeRoom(r,'enemy')));
  playerRooms.forEach(r => playerGrid.appendChild(makeRoom(r,'player')));
  enemyMastPips.innerHTML = pipsMarkup(enemyMast);
  playerMastPips.innerHTML = pipsMarkup(playerMast);
  enemyMastBox.onclick = ()=>{};
  playerMastBox.onclick = ()=>{};
  enemyMastBox.addEventListener('click',(e)=>{
    if(state.selectedWeaponId && isLegalTarget(enemyMast.id)){
      e.stopPropagation(); state.playerIntents[state.selectedWeaponId] = enemyMast.id; state.selectedWeaponId = null; refresh();
    }
  });
}
function positionShips(){
  const w = ROOM_W();
  enemyBlock.style.left = `${TRACK_LEFT + ENEMY_LEFTMOST*w}px`;
  playerBlock.style.left = `${TRACK_LEFT + playerLeftmost()*w}px`;
  enemyMastBox.style.left = `${ENEMY_MAST_COL*w + (w-48)/2}px`;
  playerMastBox.style.left = `${PLAYER_MAST_LOCAL_COL*w + (w-48)/2}px`;
  moveAft.disabled = state.playerMastTrack <= PLAYER_MAST_MIN;
  moveFore.disabled = state.playerMastTrack >= PLAYER_MAST_MAX;
}
function worldColX(col){ return TRACK_LEFT + col*ROOM_W(); }
function laneY(side, lane){
  if(side==='player') return 340 + (lane==='mast' ? -56 : lane*ROOM_H());
  return 46 + (lane==='mast' ? 152 : lane*ROOM_H());
}
function clearClasses(){
  document.querySelectorAll('.enemy-intended,.dodged,.focus-source,.focus-target,.friendly-focus-target,.valid-target,.selectable').forEach(el=>{
    el.classList.remove('enemy-intended','dodged','focus-source','focus-target','friendly-focus-target','valid-target','selectable');
  });
}
function getEntityElement(side,id){
  if(side==='enemy' && id===enemyMast.id) return enemyMastBox;
  if(side==='player' && id===playerMast.id) return playerMastBox;
  const root = side==='enemy'?enemyGrid:playerGrid;
  return root.querySelector(`.room[data-id="${id}"]`);
}
function groupedWeaponSuffixes(arr){
  const counts = {};
  arr.forEach(r => { if(r.weapon) counts[r.weapon] = (counts[r.weapon]||0)+1; });
  const seen = {};
  const result = {};
  arr.forEach(r=>{
    if(!r.weapon) return;
    if((counts[r.weapon]||0)>1){
      seen[r.weapon] = (seen[r.weapon]||0)+1;
      result[r.id] = String.fromCharCode(64+seen[r.weapon]);
    } else result[r.id] = '';
  });
  return result;
}
const enemySuffix = groupedWeaponSuffixes(enemyRooms);
const playerSuffix = groupedWeaponSuffixes(playerRooms);
