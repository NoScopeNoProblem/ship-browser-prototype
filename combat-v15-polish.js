(() => {
  // v15: transient dodge feedback, player-target confirmation, utility cancellation chains.
  const dodgeSeen = new Set();
  const repairCancelSeen = new Set();
  const idleRepairShown = new Set();
  let trackedTurn = window.combatTurn?.turn || 1;

  const repairCancelOverlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
  repairCancelOverlay.setAttribute('class','v15-repair-cancel-overlay');
  repairCancelOverlay.setAttribute('aria-hidden','true');
  stage.appendChild(repairCancelOverlay);

  function currentTurn(){ return window.combatTurn?.turn || 1; }
  function knownRoom(room){ return !!room && (!room.hidden || room.revealed); }
  function enemyRoom(id){ return enemyRooms.find(r => r.id === id) || null; }
  function roomCenter(el){
    const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
    return {x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};
  }
  function combatStates(){
    try{
      const player=playerIntentDistribution();
      const enemy=enemyIntentDistribution(player);
      return {player,enemy};
    }catch{return null;}
  }
  function plannedDamageTo(id,playerState=null){
    const stateNow=playerState || combatStates()?.player;
    return stateNow?.hits?.get(id) || 0;
  }

  function resetTurnCachesIfNeeded(){
    const turn=currentTurn();
    if(turn===trackedTurn)return;
    trackedTurn=turn;
    dodgeSeen.clear();
    repairCancelSeen.clear();
    idleRepairShown.clear();
    document.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());
  }

  function showTransientDodge(id){
    const el=getEntityElement('player',id);if(!el)return;
    el.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());
    const tip=document.createElement('div');
    tip.className='v15-dodged-tip';
    tip.textContent='DODGED';
    tip.title='Movement has taken this section out of the aimed shot.';
    el.appendChild(tip);
    setTimeout(()=>tip.classList.add('fade'),1900);
    setTimeout(()=>tip.remove(),2600);
  }

  function decorateDodges(enemyState){
    document.querySelectorAll('.v14-dodged-tip').forEach(n=>n.remove());
    if(!enemyState)return;
    const current=new Set();
    enemyState.dodges?.forEach((count,id)=>{
      if(count<=0 || enemyState.targetMap?.has(id))return;
      current.add(id);
      if(!dodgeSeen.has(id))showTransientDodge(id);
    });
    [...dodgeSeen].forEach(id=>{if(!current.has(id))dodgeSeen.delete(id);});
    current.forEach(id=>dodgeSeen.add(id));
  }

  function decorateExplosionThreats(states){
    document.querySelectorAll('.v15-explosion-threat').forEach(el=>el.classList.remove('v15-explosion-threat'));
    if(!states || window.combatTurn?.resolving || window.combatEnded)return;
    states.player?.explosions?.forEach((count,id)=>{
      if(count>0)getEntityElement('enemy',id)?.classList.add('v15-explosion-threat');
    });
    states.enemy?.explosions?.forEach((count,id)=>{
      if(count>0)getEntityElement('player',id)?.classList.add('v15-explosion-threat');
    });
  }

  function renderRepairCancellation(states){
    repairCancelOverlay.innerHTML='';
    document.querySelectorAll('.v15-repair-cancel-target').forEach(el=>el.classList.remove('v15-repair-cancel-target'));
    if(!states || window.combatTurn?.resolving || window.combatEnded)return;

    const currentCancelled=new Set();
    const actions=window.enemyAI?.currentActions?.() || window.enemyActionIntents || [];
    actions.filter(a=>a.actionType==='repair').forEach(action=>{
      const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);
      if(!source||!target||source.hp<=0||target.hp<=0||!knownRoom(source))return;
      if(source.hp-plannedDamageTo(source.id,states.player)>0)return;

      const sourceEl=getEntityElement('enemy',source.id),targetEl=getEntityElement('enemy',target.id);
      if(!sourceEl||!targetEl)return;
      const key=`${action.sourceId}:${action.targetId}`;currentCancelled.add(key);
      targetEl.classList.add('v15-repair-cancel-target');

      const a=roomCenter(sourceEl),b=roomCenter(targetEl);
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
      line.setAttribute('class','v15-repair-cancel-line');
      repairCancelOverlay.appendChild(line);
      const x=document.createElementNS('http://www.w3.org/2000/svg','text');
      x.setAttribute('x',(a.x+b.x)/2);x.setAttribute('y',(a.y+b.y)/2+6);x.setAttribute('text-anchor','middle');
      x.setAttribute('class','v15-repair-cancel-x');x.textContent='×';repairCancelOverlay.appendChild(x);

      if(!repairCancelSeen.has(key)){
        showRoomTooltip(targetEl,'Repair cancelled');
        repairCancelSeen.add(key);
      }
    });
    [...repairCancelSeen].forEach(key=>{if(!currentCancelled.has(key))repairCancelSeen.delete(key);});
  }

  function maybeShowIdleRepair(){
    if(!document.body.classList.contains('v11-intent-preview-active') || window.combatEnded)return;
    const actions=window.enemyAI?.currentActions?.() || window.enemyActionIntents || [];
    enemyRooms.filter(r=>r.actionType==='repair'&&r.hp>0&&knownRoom(r)).forEach(source=>{
      const key=`${currentTurn()}:${source.id}`;
      if(idleRepairShown.has(key))return;
      const hasRepair=actions.some(a=>a.actionType==='repair'&&a.sourceId===source.id);
      if(hasRepair)return;
      const hasDamagedReach=enemyRooms.some(target=>
        target.hp>0&&target.hp<target.max&&
        Math.abs(target.col-source.col)<=1&&Math.abs(target.row-source.row)<=1
      );
      if(hasDamagedReach)return;
      idleRepairShown.add(key);
      const el=getEntityElement('enemy',source.id);
      if(el)setTimeout(()=>{
        if(document.body.classList.contains('v11-intent-preview-active'))showRoomTooltip(el,'No repair needed');
      },300);
    });
  }

  function decorateAll(){
    resetTurnCachesIfNeeded();
    const states=combatStates();
    decorateDodges(states?.enemy);
    decorateExplosionThreats(states);
    renderRepairCancellation(states);
    maybeShowIdleRepair();
  }

  const baseRefresh=refresh;
  refresh=function(){
    baseRefresh();
    decorateAll();
  };

  // Confirm a newly assigned player target with a short red border flash.
  stage.addEventListener('click',e=>{
    if(window.combatTurn?.resolving||window.combatEnded||document.body.classList.contains('v11-intent-preview-active'))return;
    const selected=state.selectedWeaponId;if(!selected)return;
    const room=e.target.closest&&e.target.closest('.room[data-side="enemy"]');
    const mast=e.target.closest&&e.target.closest('#enemyMastBox');
    const targetId=room?.dataset.id||(mast?enemyMast.id:null);if(!targetId)return;
    setTimeout(()=>{
      if(state.playerIntents?.[selected]!==targetId)return;
      const el=getEntityElement('enemy',targetId);if(!el)return;
      el.classList.remove('v15-player-target-flash');
      void el.offsetWidth;
      el.classList.add('v15-player-target-flash');
      setTimeout(()=>el.classList.remove('v15-player-target-flash'),720);
    },0);
  },true);

  // Keep cancellation links geometrically correct if the board is resized.
  window.addEventListener('resize',()=>requestAnimationFrame(decorateAll));
  moveAft.addEventListener('click',()=>requestAnimationFrame(decorateAll));
  moveFore.addEventListener('click',()=>requestAnimationFrame(decorateAll));

  const bodyObserver=new MutationObserver(()=>requestAnimationFrame(decorateAll));
  bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('combat-ended',()=>{
    repairCancelOverlay.innerHTML='';
    document.querySelectorAll('.v15-dodged-tip,.v15-player-target-flash').forEach(n=>n.remove?.());
  });

  refresh();
})();
