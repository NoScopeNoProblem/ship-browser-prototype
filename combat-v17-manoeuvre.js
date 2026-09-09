(() => {
  // v17: Mast Manoeuvre is a capability with a one-turn recovery cadence.
  // Movement remains previewable during the active turn; only the final non-zero move at
  // End Turn triggers next turn's cooldown. Returning to the turn-start position is not a manoeuvre.
  const manoeuvre={
    cooldown:false,
    pendingCooldown:false,
    wasResolving:document.body.classList.contains('v3-resolving')
  };

  const currentTurn=()=>window.combatTurn?.turn||1;
  const movedThisTurn=()=>state.playerMastTrack!==state.turnStartMast;
  const hasFiringPlan=()=>Object.keys(state.playerIntents||{}).length>0;

  function blockedReason(){
    if(playerMast.hp<=0)return 'Mast destroyed';
    if(manoeuvre.cooldown)return 'Moved last turn — trimming sails';
    if(hasFiringPlan())return 'Firing plan committed';
    return null;
  }

  function showBlocked(){
    const reason=blockedReason();
    if(reason)showRoomTooltip(playerMastBox,reason);
    return !!reason;
  }

  // Wrap the generalized movement functions so keyboard and button input share the same rule.
  const baseMoveLeft=moveLeft,baseMoveRight=moveRight;
  moveLeft=function(){
    if(showBlocked()){refresh();return;}
    baseMoveLeft();
  };
  moveRight=function(){
    if(showBlocked()){refresh();return;}
    baseMoveRight();
  };

  function mastStatus(){
    if(playerMast.hp<=0)return {kind:'disabled',icon:'✕',label:'DISABLED',title:'Mast destroyed — cannot manoeuvre'};
    if(manoeuvre.cooldown)return {kind:'cooldown',icon:'⛵',label:'TRIMMING',title:'Trimming sails — manoeuvre unavailable this turn'};
    if(movedThisTurn())return {kind:'used',icon:'↔',label:'USED',title:'Manoeuvre planned — next turn will be spent trimming sails'};
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

  function movementBounds(){
    if(window.combatFactory?.turnMovementBounds)return combatFactory.turnMovementBounds();
    const start=state.turnStartMast;
    return {min:Math.max(PLAYER_MAST_MIN,start-1),max:Math.min(PLAYER_MAST_MAX,start+1)};
  }

  function decorateMovementControls(){
    const bounds=movementBounds();
    const blocked=!!blockedReason();

    // During a meaningful blocked state leave the arrows clickable so they can explain why.
    // At a true hull/turn boundary they remain natively disabled because there is no hidden rule to explain.
    if(blocked){
      moveAft.disabled=false;moveFore.disabled=false;
      moveAft.classList.add('v17-move-blocked');moveFore.classList.add('v17-move-blocked');
      moveAft.setAttribute('aria-disabled','true');moveFore.setAttribute('aria-disabled','true');
    }else{
      moveAft.classList.remove('v17-move-blocked');moveFore.classList.remove('v17-move-blocked');
      moveAft.removeAttribute('aria-disabled');moveFore.removeAttribute('aria-disabled');
      moveAft.disabled=state.playerMastTrack<=bounds.min;
      moveFore.disabled=state.playerMastTrack>=bounds.max;
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
    baseRefresh();
    decorateMastStatus();
    decorateMovementControls();
    syncDodgePulse();
  };

  // Resolution start commits the final planned alignment. Resolution end opens the next turn.
  const phaseObserver=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(!manoeuvre.wasResolving&&now){
      manoeuvre.pendingCooldown=movedThisTurn();
    }
    if(manoeuvre.wasResolving&&!now&&!window.combatEnded){
      manoeuvre.cooldown=manoeuvre.pendingCooldown;
      manoeuvre.pendingCooldown=false;
      refresh();
    }
    manoeuvre.wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  // Dodge tooltips are transient, so keep the blue pulse exactly as long as the tooltip exists.
  const dodgeObserver=new MutationObserver(syncDodgePulse);
  dodgeObserver.observe(stage,{childList:true,subtree:true});

  window.combatManoeuvre={
    get cooldown(){return manoeuvre.cooldown;},
    get movedThisTurn(){return movedThisTurn();},
    get status(){return mastStatus().kind;},
    get turn(){return currentTurn();},
    clearCooldown(){manoeuvre.cooldown=false;manoeuvre.pendingCooldown=false;refresh();},
    canMove(){return !blockedReason();}
  };

  refresh();
})();
