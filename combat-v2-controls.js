function moveLeft(){ if(state.playerMastTrack > PLAYER_MAST_MIN){ state.playerMastTrack--; refresh(); } }
function moveRight(){ if(state.playerMastTrack < PLAYER_MAST_MAX){ state.playerMastTrack++; refresh(); } }
moveAft.addEventListener('click',(e)=>{e.stopPropagation(); moveLeft();});
moveFore.addEventListener('click',(e)=>{e.stopPropagation(); moveRight();});
document.addEventListener('click', onGlobalClick);
document.addEventListener('keydown',(e)=>{
  const k = e.key.toLowerCase();
  if(k==='arrowleft'){e.preventDefault(); moveLeft(); return;}
  if(k==='arrowright'){e.preventDefault(); moveRight(); return;}
  if(k==='z'){ state.overview='enemy'; refresh(); return; }
  if(k==='x'){ state.overview='player'; refresh(); return; }
  if(k==='h' && !e.repeat){ state.exterior = !state.exterior; state.overview = null; state.selectedWeaponId = null; refresh(); }
});
document.addEventListener('keyup',(e)=>{
  const k = e.key.toLowerCase();
  if((k==='z' && state.overview==='enemy') || (k==='x' && state.overview==='player')){ state.overview = null; refresh(); }
});
window.addEventListener('resize', refresh);

renderShips();
refresh();
