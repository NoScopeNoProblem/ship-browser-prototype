(() => {
  // v17: Mast Manoeuvre is a capability with a one-turn recovery cadence.
  // The turn-start alignment is private to this system. Other UI/intent observers may update
  // compatibility state, but they cannot redefine whether the player has manoeuvred this turn.
  const manoeuvre={
    cooldown:false,
    pendingCooldown:false,
    wasResolving:document.body.classList.contains('v3-resolving'),
    anchorTurn:window.combatTurn?.turn||1,
    turnStartMast:state.playerMastTrack
  };

  const currentTurn=()=>window.combatTurn?.turn||1;
  function syncTurnAnchor(){
    const turn=currentTurn();
    if(turn!==manoeuvre.anchorTurn){
      manoeuvre.anchorTurn=turn;
      manoeuvre.turnStartMast=state.playerMastTrack;
    }
    return manoeuvre.turnStartMast;
  }
  const movedThisTurn=()=>state.playerMastTrack!==syncTurnAnchor();
  const hasFiringPlan=()=>Object.keys(state.playerIntents||{}).length>0;

  function blockedReason(){
    if(playerMast.hp<=0)return 'Mast destroyed';
    if(manoeuvre.cooldown)return 'Moved last turn — sails resetting';
    if(hasFiringPlan())return 'Firing plan committed';
    return null;
  }

  function showBlocked(){
    const reason=blockedReason();
    if(reason)showRoomTooltip(playerMastBox,reason);
    return !!reason;
  }

  function movementBounds(){
    const start=syncTurnAnchor();
    return {min:Math.max(PLAYER_MAST_MIN,start-1),max:Math.min(PLAYER_MAST_MAX,start+1)};
  }

  function fleeAttempt(direction){
    return (direction<0&&state.playerMastTrack===PLAYER_MAST_MIN)||(direction>0&&state.playerMastTrack===PLAYER_MAST_MAX);
  }

  function canStep(direction){
    const target=state.playerMastTrack+direction,bounds=movementBounds();
    return target>=bounds.min&&target<=bounds.max&&target>=PLAYER_MAST_MIN&&target<=PLAYER_MAST_MAX;
  }

  function offerFlee(){
    if(window.combatOutcome?.offerFlee)combatOutcome.offerFlee();
    else showRoomTooltip(playerMastBox,'Flee route unavailable');
  }

  const baseMoveLeft=moveLeft,baseMoveRight=moveRight;
  moveLeft=function(){
    syncTurnAnchor();
    if(showBlocked()){refresh();return;}
    if(fleeAttempt(-1)){offerFlee();return;}
    if(canStep(-1))window.combatDodgeFeedback?.reset?.();
    baseMoveLeft();
  };
  moveRight=function(){
    syncTurnAnchor();
    if(showBlocked()){refresh();return;}
    if(fleeAttempt(1)){offerFlee();return;}
    if(canStep(1))window.combatDodgeFeedback?.reset?.();
    baseMoveRight();
  };

  function mastStatus(){
    syncTurnAnchor();
    if(playerMast.hp<=0)return {kind:'disabled',icon:'✕',label:'DISABLED',title:'Mast destroyed — cannot manoeuvre'};
    if(manoeuvre.cooldown)return {kind:'cooldown',icon:'⛵',label:'RESETTING',title:'Sails resetting after last turn’s manoeuvre — movement unavailable this turn'};
    if(movedThisTurn())return {kind:'used',icon:'↔',label:'USED',title:'Manoeuvre planned — sails will need to reset next turn'};
    if(hasFiringPlan())return {kind:'locked',icon:'↔',label:'LOCKED',title:'Alignment locked by firing plan'};
    return {kind:'ready',icon:'↔',label:'READY',title:'Manoeuvre ready — move one track segment fore or aft'};
  }

  function decorateMastStatus(){
    playerMastBox.querySelectorAll('.v17-mast-action').forEach(n=>n.remove());
    const status=mastStatus(),badge=document.createElement('div');
    badge.className=`v17-mast-action ${status.kind}`;
    badge.innerHTML=`<span>${status.icon}</span><b>${status.label}</b>`;
    badge.title=status.title;
    playerMastBox.appendChild(badge);
  }

  function decorateMovementControls(){
    const bounds=movementBounds();
    const blocked=!!blockedReason();
    if(blocked){
      moveAft.disabled=false;moveFore.disabled=false;
      moveAft.classList.add('v17-move-blocked');moveFore.classList.add('v17-move-blocked');
      moveAft.setAttribute('aria-disabled','true');moveFore.setAttribute('aria-disabled','true');
    }else{
      moveAft.classList.remove('v17-move-blocked');moveFore.classList.remove('v17-move-blocked');
      moveAft.removeAttribute('aria-disabled');moveFore.removeAttribute('aria-disabled');
      const fleeLeft=state.playerMastTrack===PLAYER_MAST_MIN;
      const fleeRight=state.playerMastTrack===PLAYER_MAST_MAX;
      moveAft.disabled=state.playerMastTrack<=bounds.min&&!fleeLeft;
      moveFore.disabled=state.playerMastTrack>=bounds.max&&!fleeRight;
      moveAft.classList.toggle('v17-flee-edge',fleeLeft);
      moveFore.classList.toggle('v17-flee-edge',fleeRight);
      if(fleeLeft)moveAft.title='Flee this engagement';else moveAft.removeAttribute('title');
      if(fleeRight)moveFore.title='Flee this engagement';else moveFore.removeAttribute('title');
    }

    trackRow.classList.toggle('v17-manoeuvre-cooldown',manoeuvre.cooldown);
    if(manoeuvre.cooldown){
      [...trackRow.children].forEach((cell,index)=>{
        const current=index===state.playerMastTrack;
        cell.classList.remove('track-reachable');
        cell.classList.toggle('track-unreachable',!current);
        if(current)cell.classList.remove('track-unreachable');
      });
    }
  }

  function syncDodgePulse(){
    document.querySelectorAll('.v17-dodge-pulse').forEach(el=>el.classList.remove('v17-dodge-pulse'));
    stage.querySelectorAll('.v15-dodged-tip').forEach(tip=>{
      const host=tip.closest('.room,.mast-box');
      if(host)host.classList.add('v17-dodge-pulse');
    });
  }

  const baseRefresh=refresh;
  refresh=function(){
    syncTurnAnchor();
    baseRefresh();
    decorateMastStatus();
    decorateMovementControls();
    syncDodgePulse();
  };

  const phaseObserver=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(!manoeuvre.wasResolving&&now){
      manoeuvre.pendingCooldown=movedThisTurn();
    }
    if(manoeuvre.wasResolving&&!now&&!window.combatEnded){
      manoeuvre.cooldown=manoeuvre.pendingCooldown;
      manoeuvre.pendingCooldown=false;
      manoeuvre.anchorTurn=currentTurn();
      manoeuvre.turnStartMast=state.playerMastTrack;
      state.turnStartMast=manoeuvre.turnStartMast;
      refresh();
    }
    manoeuvre.wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  const dodgeObserver=new MutationObserver(syncDodgePulse);
  dodgeObserver.observe(stage,{childList:true,subtree:true});

  window.combatManoeuvre={
    get cooldown(){return manoeuvre.cooldown;},
    get movedThisTurn(){return movedThisTurn();},
    get status(){return mastStatus().kind;},
    get turn(){return currentTurn();},
    get startMast(){return syncTurnAnchor();},
    clearCooldown(){manoeuvre.cooldown=false;manoeuvre.pendingCooldown=false;refresh();},
    canMove(){return !blockedReason();}
  };

  refresh();
})();
