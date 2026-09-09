(() => {
  // v30: canonical movement state.
  // combatTurn.startMast is the sole turn-start alignment. state.playerMastTrack is the sole
  // current alignment. Older modules may still read/write state.turnStartMast, but that property
  // is now a compatibility view of combatTurn.startMast and cannot become a second source of truth.
  if(!window.combatTurn) return;

  const movement={cooldown:false,pendingCooldown:false,wasResolving:combatTurn.resolving,legacyStartWrites:0};
  const startMast=()=>combatTurn.startMast;
  const movedThisTurn=()=>state.playerMastTrack!==startMast();
  const hasFiringPlan=()=>Object.keys(state.playerIntents||{}).length>0;

  // Retire the mutable compatibility copy. Several older modules wrote this at different moments
  // (reset, turn end, observers), which allowed renderers to disagree about whether movement had
  // happened. All of those reads now resolve to the combat turn's immutable start alignment.
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

  function showBlocked(reason){
    if(reason)showRoomTooltip(playerMastBox,reason);
    refresh();
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

    // Movement never mutates utility use, weapon cadence, incoming intent data, or turn start.
    // It changes one value only: current alignment. Everything else is re-derived by refresh().
    clearPlayerTurnPlans();
    window.combatDodgeFeedback?.reset?.();
    state.playerMastTrack+=direction;
    refresh();
  }

  // Replace the accumulated movement wrappers with one implementation. Existing button/key
  // listeners call these globals at event time, so no extra movement listeners are needed.
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
    badge.title=s.title;
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
      // Keep blocked arrows clickable so the existing tooltip explains why movement is unavailable.
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
  refresh=function(){
    baseRefresh();
    decorateMast();
    decorateTrackAndButtons();
  };

  const phaseObserver=new MutationObserver(()=>{
    const now=combatTurn.resolving;
    if(!movement.wasResolving&&now)movement.pendingCooldown=movedThisTurn();
    if(movement.wasResolving&&!now&&!window.combatEnded){
      movement.cooldown=movement.pendingCooldown;
      movement.pendingCooldown=false;
      refresh();
    }
    movement.wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.combatManoeuvre={
    get cooldown(){return movement.cooldown;},
    get movedThisTurn(){return movedThisTurn();},
    get status(){return status().kind;},
    get turn(){return combatTurn.turn;},
    get startMast(){return startMast();},
    clearCooldown(){movement.cooldown=false;movement.pendingCooldown=false;refresh();},
    canMove(){return !blockedReason();},
    get diagnostics(){return{turn:combatTurn.turn,startMast:startMast(),currentMast:state.playerMastTrack,moved:movedThisTurn(),cooldown:movement.cooldown,legacyStartWrites:movement.legacyStartWrites};}
  };

  refresh();
})();
