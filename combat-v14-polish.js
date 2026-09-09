(() => {
  // v14: movement/dodge readability, repair-target language and generalized matchup labels.
  function enemyState(){
    try{return enemyIntentDistribution(playerIntentDistribution());}
    catch{return null;}
  }

  function clearV14Decorations(){
    document.querySelectorAll('.v14-dodged-tip').forEach(n=>n.remove());
    document.querySelectorAll('.v14-threat-active,.v14-repair-target,.v14-repair-source').forEach(el=>{
      el.classList.remove('v14-threat-active','v14-repair-target','v14-repair-source');
    });
  }

  function addDodgedTip(id){
    const el=getEntityElement('player',id);if(!el)return;
    const tip=document.createElement('div');
    tip.className='v14-dodged-tip';
    tip.textContent='DODGED';
    tip.title='This room was targeted at the start of the turn, but movement has taken it out of the shot.';
    el.appendChild(tip);
  }

  function decorateThreatsAndDodges(){
    const dist=enemyState();if(!dist)return;

    // A room is only labelled DODGED if it was an original target and is no longer hit by
    // any live enemy shot. If another weapon still threatens it, the red threat language wins.
    dist.dodges?.forEach((count,id)=>{
      if(count>0 && !(dist.targetMap?.has(id))) addDodgedTip(id);
    });

    // Every room currently receiving a live shot gets the same gently blinking red border,
    // including rooms that were targeted before movement and remain targeted afterwards.
    dist.targetMap?.forEach((_,id)=>getEntityElement('player',id)?.classList.add('v14-threat-active'));
  }

  function decorateRepairSelection(){
    if(!window.combatUtility)return;
    const selectedId=combatUtility.selected;
    const source=selectedId?playerRooms.find(r=>r.id===selectedId):null;
    if(!source||source.actionType!=='repair')return;

    getEntityElement('player',source.id)?.classList.add('v14-repair-source');
    combatUtility.eligibleTargets(source).forEach(room=>{
      getEntityElement('player',room.id)?.classList.add('v14-repair-target');
    });
  }

  function restoreUtilityReadinessAfterMove(){
    if(!window.combatUtility)return;
    playerRooms.filter(r=>r.actionType==='repair'||r.actionType==='quickLoad').forEach(room=>{
      const el=getEntityElement('player',room.id);if(!el)return;
      const available=room.hp>0&&!combatUtility.isUsed(room.id)&&combatUtility.eligibleTargets(room).length>0;
      if(available){
        el.classList.remove('utility-unavailable');
        el.classList.add('action-ready');
      }
    });
  }

  function normalizeGridBorders(){
    document.querySelectorAll('.room').forEach(el=>{
      el.classList.toggle('v14-last-col',el.dataset.lastCol==='true');
      el.classList.toggle('v14-last-row',el.dataset.lastRow==='true');
    });
  }

  function decorateThreatRating(){
    const enemyName=document.querySelector('.enemy-corner');if(!enemyName)return;
    const stars=Math.max(0,Number(ENEMY_SHIP_SETUP.threatStars)||0);
    enemyName.textContent=`ENEMY — ${ENEMY_SHIP_SETUP.name}${stars?` — ${'★'.repeat(stars)}`:''}`;
    if(ENEMY_SHIP_SETUP.testExpectation) enemyName.title=ENEMY_SHIP_SETUP.testExpectation;
  }

  function hideLegacyRepairFlash(){
    document.querySelectorAll('.v12-repair-pip,.v11-repair-pulse').forEach(n=>n.remove());
  }

  const baseRefresh=refresh;
  refresh=function(){
    clearV14Decorations();
    baseRefresh();
    hideLegacyRepairFlash();
    decorateThreatsAndDodges();
    decorateRepairSelection();
    restoreUtilityReadinessAfterMove();
    normalizeGridBorders();
    decorateThreatRating();
  };

  // Movement must not consume Carpenter or Magazine. Re-evaluate utility availability after
  // the position changes rather than carrying any stale visual/action state from movement.
  moveAft.addEventListener('click',()=>requestAnimationFrame(refresh));
  moveFore.addEventListener('click',()=>requestAnimationFrame(refresh));
  window.addEventListener('keydown',e=>{
    if(e.code==='ArrowLeft'||e.code==='ArrowRight')requestAnimationFrame(refresh);
  },true);

  window.combatMatchup={
    enemyId:ENEMY_SHIP_SETUP.id,
    playerId:PLAYER_SHIP_SETUP.id,
    threatStars:Number(ENEMY_SHIP_SETUP.threatStars)||0,
    expectation:ENEMY_SHIP_SETUP.testExpectation||'',
    availableShips:()=>Object.keys(SHIP_SETUPS),
    urlFor({enemy=ENEMY_SHIP_SETUP.id,player=PLAYER_SHIP_SETUP.id}={}){
      const u=new URL(window.location.href);u.searchParams.set('enemy',enemy);u.searchParams.set('player',player);return u.toString();
    }
  };

  refresh();
})();
