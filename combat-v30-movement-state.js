(() => {
  // v30: authoritative manoeuvre state.
  // One private turn-start anchor + one current alignment. Movement changes only current alignment.
  // All legacy state.turnStartMast reads are redirected here; legacy writes are ignored/diagnosed.
  if(!window.combatTurn) return;

  const movement={
    anchorTurn:combatTurn.turn,
    turnStartMast:state.playerMastTrack,
    cooldown:false,
    pendingCooldown:false,
    wasResolving:combatTurn.resolving,
    legacyStartWrites:0
  };

  function syncAnchor(){
    if(combatTurn.turn!==movement.anchorTurn){
      movement.anchorTurn=combatTurn.turn;
      movement.turnStartMast=state.playerMastTrack;
    }
    return movement.turnStartMast;
  }
  const startMast=()=>syncAnchor();
  const movedThisTurn=()=>state.playerMastTrack!==startMast();
  const hasFiringPlan=()=>Object.keys(state.playerIntents||{}).length>0;

  Object.defineProperty(state,'turnStartMast',{
    configurable:true,
    enumerable:true,
    get(){return startMast();},
    set(value){if(Number(value)!==Number(startMast()))movement.legacyStartWrites++;}
  });
  Object.defineProperty(state,'movedThisTurn',{
    configurable:true,
    enumerable:false,
    get(){return movedThisTurn();},
    set(){}
  });

  function blockedReason(){
    if(window.combatEnded)return 'Combat ended';
    if(combatTurn.resolving)return 'Combat resolving';
    if(document.body.classList.contains('v11-intent-preview-active'))return 'Enemy intentions';
    if(playerMast.hp<=0)return 'Mast destroyed';
    if(movement.cooldown)return 'Moved last turn — sails resetting';
    if(hasFiringPlan())return 'Firing plan committed';
    return null;
  }

  function bounds(){
    const start=startMast();
    return {min:Math.max(PLAYER_MAST_MIN,start-1),max:Math.min(PLAYER_MAST_MAX,start+1)};
  }

  function fleeAttempt(direction){
    return (direction<0&&state.playerMastTrack===PLAYER_MAST_MIN)||(direction>0&&state.playerMastTrack===PLAYER_MAST_MAX);
  }

  function canStep(direction){
    const target=state.playerMastTrack+direction,b=bounds();
    return target>=b.min&&target<=b.max&&target>=PLAYER_MAST_MIN&&target<=PLAYER_MAST_MAX;
  }

  function showBlocked(reason){if(reason)showRoomTooltip(playerMastBox,reason);refresh();}

  function emitAlignmentChange(previous,current){
    window.dispatchEvent(new CustomEvent('combat-alignment-changed',{detail:{
      turn:combatTurn.turn,startMast:startMast(),previousMast:previous,currentMast:current,moved:movedThisTurn()
    }}));
  }

  function move(direction){
    const reason=blockedReason();
    if(reason){showBlocked(reason);return;}
    if(fleeAttempt(direction)){
      if(window.combatOutcome?.offerFlee)combatOutcome.offerFlee();
      else showRoomTooltip(playerMastBox,'Flee route unavailable');
      return;
    }
    if(!canStep(direction)){showBlocked('Movement used');return;}

    const previous=state.playerMastTrack;
    clearPlayerTurnPlans();
    window.combatDodgeFeedback?.reset?.();
    state.playerMastTrack+=direction;
    emitAlignmentChange(previous,state.playerMastTrack);
    refresh();
  }

  moveLeft=function(){move(-1);};
  moveRight=function(){move(1);};

  function status(){
    if(playerMast.hp<=0)return {kind:'disabled',icon:'✕',label:'DISABLED',title:'Mast destroyed — cannot manoeuvre'};
    if(movement.cooldown)return {kind:'cooldown',icon:'⛵',label:'RESETTING',title:'Sails resetting after last turn’s manoeuvre — movement unavailable this turn'};
    if(movedThisTurn())return {kind:'used',icon:'↔',label:'USED',title:'Manoeuvre planned — sails will need to reset next turn'};
    if(hasFiringPlan())return {kind:'locked',icon:'↔',label:'LOCKED',title:'Alignment locked by firing plan'};
    return {kind:'ready',icon:'↔',label:'READY',title:'Manoeuvre ready — move one track segment fore or aft'};
  }

  function decorateMast(){
    playerMastBox.querySelectorAll('.v17-mast-action').forEach(n=>n.remove());
    const s=status(),badge=document.createElement('div');
    badge.className=`v17-mast-action ${s.kind}`;
    badge.innerHTML=`<span>${s.icon}</span><b>${s.label}</b>`;
    badge.title=`${s.title} · start ${startMast()+1} / current ${state.playerMastTrack+1}`;
    playerMastBox.appendChild(badge);
  }

  function decorateTrackAndButtons(){
    const b=bounds(),blocked=!!blockedReason();
    const fleeLeft=!blocked&&state.playerMastTrack===PLAYER_MAST_MIN;
    const fleeRight=!blocked&&state.playerMastTrack===PLAYER_MAST_MAX;

    moveAft.classList.toggle('v17-move-blocked',blocked);
    moveFore.classList.toggle('v17-move-blocked',blocked);
    moveAft.classList.toggle('v17-flee-edge',fleeLeft);
    moveFore.classList.toggle('v17-flee-edge',fleeRight);
    if(blocked){
      moveAft.disabled=false;moveFore.disabled=false;
      moveAft.setAttribute('aria-disabled','true');moveFore.setAttribute('aria-disabled','true');
    }else{
      moveAft.removeAttribute('aria-disabled');moveFore.removeAttribute('aria-disabled');
      moveAft.disabled=state.playerMastTrack<=b.min&&!fleeLeft;
      moveFore.disabled=state.playerMastTrack>=b.max&&!fleeRight;
    }
    if(fleeLeft)moveAft.title='Flee this engagement';else if(!blocked)moveAft.removeAttribute('title');
    if(fleeRight)moveFore.title='Flee this engagement';else if(!blocked)moveFore.removeAttribute('title');

    trackRow.classList.toggle('v17-manoeuvre-cooldown',movement.cooldown);
    [...trackRow.children].forEach((cell,index)=>{
      const current=index===state.playerMastTrack;
      let reachable=false;
      if(current)reachable=true;
      else if(!blocked&&index>=b.min&&index<=b.max&&index>=PLAYER_MAST_MIN&&index<=PLAYER_MAST_MAX)reachable=true;
      cell.classList.toggle('track-reachable',reachable);
      cell.classList.toggle('track-unreachable',!reachable);
    });
  }

  const baseRefresh=refresh;
  refresh=function(){baseRefresh();syncAnchor();decorateMast();decorateTrackAndButtons();};

  const phaseObserver=new MutationObserver(()=>{
    const now=combatTurn.resolving;
    if(!movement.wasResolving&&now)movement.pendingCooldown=movedThisTurn();
    if(movement.wasResolving&&!now&&!window.combatEnded){
      movement.cooldown=movement.pendingCooldown;
      movement.pendingCooldown=false;
      syncAnchor();
      refresh();
    }
    movement.wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  function resetSails(){
    if(playerMast.hp<=0||!movement.cooldown)return false;
    movement.cooldown=false;
    movement.pendingCooldown=false;
    refresh();
    return true;
  }
  function setCooldown(value){
    movement.cooldown=!!value;
    if(!movement.cooldown)movement.pendingCooldown=false;
    refresh();
  }

  window.combatManoeuvre={
    get cooldown(){return movement.cooldown;},
    get movedThisTurn(){return movedThisTurn();},
    get status(){return status().kind;},
    get turn(){return combatTurn.turn;},
    get startMast(){return startMast();},
    clearCooldown(){movement.cooldown=false;movement.pendingCooldown=false;refresh();},
    resetSails,
    setCooldown,
    canMove(){return !blockedReason();},
    get diagnostics(){return{
      turn:combatTurn.turn,anchorTurn:movement.anchorTurn,startMast:startMast(),currentMast:state.playerMastTrack,
      moved:movedThisTurn(),status:status().kind,cooldown:movement.cooldown,legacyStartWrites:movement.legacyStartWrites
    };}
  };

  refresh();
})();