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
function pipsMarkup(entity, hits=0, dodges=0, prevented=0){
  const arr = [];
  for(let i=0;i<entity.max;i++){
    const alive = i < entity.hp;
    arr.push(alive ? '<span>♥</span>' : '<span class="empty">·</span>');
  }
  let cursor = entity.hp - 1;
  for(let i=0; i<hits && cursor>=0; i++,cursor--) arr[cursor] = '<span class="hit" title="Incoming damage">✕</span>';
  for(let i=0; i<dodges && cursor>=0; i++,cursor--) arr[cursor] = '<span class="dodged-mark" title="Avoided by movement">↝</span>';
  for(let i=0; i<prevented && cursor>=0; i++,cursor--) arr[cursor] = '<span class="prevented-mark" title="Prevented: enemy gun disabled">⊘</span>';
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
    c.className = 'track-cell';
    if(i===ENEMY_MAST_TRACK) c.classList.add('enemy-mast-col');
    if(i===state.playerMastTrack) c.classList.add('player-mast-col');
    if(i===ENEMY_MAST_TRACK && i===state.playerMastTrack) c.classList.add('shared-mast-col');
    trackRow.appendChild(c);
  }
}
function isPlayerEntityCurrentlyTargeted(id){
  return enemyIntents.some(intent => {
    const impact = projectedEnemyImpact(intent);
    return impact && impact.id===id;
  });
}
function makeRoom(r, side){
  const el = document.createElement('div');
  el.className = 'room' + (r.weapon ? ' weapon' : '');
  el.dataset.id = r.id;
  el.dataset.side = side;
  el.innerHTML = roomHtml(r);
  if(side==='player' && r.weapon){
    el.addEventListener('mouseenter',()=>{
      if(state.exterior || isPlayerEntityCurrentlyTargeted(r.id)) return;
      state.hoveredWeapon = {side, id:r.id};
      refresh();
    });
    el.addEventListener('mouseleave',()=>{
      if(state.hoveredWeapon && state.hoveredWeapon.id===r.id){ state.hoveredWeapon=null; refresh(); }
    });
    el.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(state.exterior) return;
      state.hoveredWeapon = null;
      state.selectedWeaponId = state.selectedWeaponId===r.id ? null : r.id;
      refresh();
    });
  }
  if(side==='enemy'){
    el.addEventListener('click',(e)=>{
      if(state.exterior || !state.selectedWeaponId) return;
      e.stopPropagation();
      if(isLegalTarget(r.id)) state.playerIntents[state.selectedWeaponId] = r.id;
      // Any enemy-room click ends the temporary targeting state, legal or not.
      state.selectedWeaponId = null;
      state.hoveredWeapon = null;
      refresh();
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
  enemyMastBox.onclick = null;
  playerMastBox.onclick = null;
  enemyMastBox.addEventListener('click',(e)=>{
    if(state.exterior || !state.selectedWeaponId) return;
    e.stopPropagation();
    if(isLegalTarget(enemyMast.id)) state.playerIntents[state.selectedWeaponId] = enemyMast.id;
    state.selectedWeaponId = null;
    state.hoveredWeapon = null;
    refresh();
  });
}
function positionShips(){
  const w = ROOM_W();
  enemyBlock.style.left = `${TRACK_LEFT + ENEMY_LEFTMOST*w}px`;
  playerBlock.style.left = `${TRACK_LEFT + playerLeftmost()*w}px`;
  // Keep the mast target rectangles in the prior visual location: centered over the ship.
  enemyMastBox.style.left = `${1.5*w - 24}px`;
  playerMastBox.style.left = `${1.5*w - 24}px`;
  moveAft.disabled = state.playerMastTrack <= PLAYER_MAST_MIN;
  moveFore.disabled = state.playerMastTrack >= PLAYER_MAST_MAX;
}
function worldColX(col){ return TRACK_LEFT + col*ROOM_W(); }
function laneY(side, lane){
  if(side==='player') return 340 + (lane==='mast' ? -56 : lane*ROOM_H());
  return 46 + (lane==='mast' ? -56 : lane*ROOM_H());
}
function clearClasses(){
  document.querySelectorAll('.enemy-intended,.dodged,.prevented,.focus-source,.focus-target,.friendly-focus-target,.valid-target,.selectable').forEach(el=>{
    el.classList.remove('enemy-intended','dodged','prevented','focus-source','focus-target','friendly-focus-target','valid-target','selectable');
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
