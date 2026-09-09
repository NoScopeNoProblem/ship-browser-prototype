function clearPlayerTurnPlans(){
  state.playerIntents={};
  state.selectedWeaponId=null;
  state.hoveredWeapon=null;
  state.hoverIntent=null;
}

function movementBlockedReason(direction){
  if(playerMast.hp<=0) return 'Mast destroyed';
  const minThisTurn=Math.max(PLAYER_MAST_MIN,state.turnStartMast-1);
  const maxThisTurn=Math.min(PLAYER_MAST_MAX,state.turnStartMast+1);
  if(direction<0 && state.playerMastTrack<=minThisTurn) return state.playerMastTrack<=PLAYER_MAST_MIN ? null : 'Movement used';
  if(direction>0 && state.playerMastTrack>=maxThisTurn) return state.playerMastTrack>=PLAYER_MAST_MAX ? null : 'Movement used';
  return null;
}

function moveLeft(){
  const reason=movementBlockedReason(-1);
  if(reason){ showRoomTooltip(playerMastBox,reason); refresh(); return; }
  if(state.playerMastTrack>PLAYER_MAST_MIN){
    clearPlayerTurnPlans();
    state.playerMastTrack--;
    refresh();
  }
}
function moveRight(){
  const reason=movementBlockedReason(1);
  if(reason){ showRoomTooltip(playerMastBox,reason); refresh(); return; }
  if(state.playerMastTrack<PLAYER_MAST_MAX){
    clearPlayerTurnPlans();
    state.playerMastTrack++;
    refresh();
  }
}
function resetTurn(){
  state.playerMastTrack=state.turnStartMast;
  state.playerIntents={};
  state.selectedWeaponId=null;
  state.hoveredWeapon=null;
  state.hoverIntent=null;
  state.overview=null;
  state.exterior=false;
  refresh();
}

moveAft.addEventListener('click',e=>{e.stopPropagation();moveLeft();});
moveFore.addEventListener('click',e=>{e.stopPropagation();moveRight();});
document.addEventListener('click',onGlobalClick);

document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='arrowleft'){e.preventDefault();if(!e.repeat)moveLeft();return;}
  if(k==='arrowright'){e.preventDefault();if(!e.repeat)moveRight();return;}
  if(k==='r' && !e.repeat){e.preventDefault();resetTurn();return;}
  if(k==='z'){state.overview='enemy';refresh();return;}
  if(k==='x'){state.overview='player';refresh();return;}
  if(k==='h' && !e.repeat){state.exterior=!state.exterior;state.overview=null;state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;refresh();}
});

document.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();
  if((k==='z'&&state.overview==='enemy')||(k==='x'&&state.overview==='player')){state.overview=null;refresh();}
});
window.addEventListener('resize',refresh);

renderShips();
refresh();
