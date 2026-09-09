(() => {
  const dodgeSeen=new Set(),repairCancelSeen=new Set(),idleRepairShown=new Set(),predictedPlayerExplosions=new Set();
  let trackedTurn=window.combatTurn?.turn||1;
  const repairCancelOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  repairCancelOverlay.setAttribute('class','v15-repair-cancel-overlay');repairCancelOverlay.setAttribute('aria-hidden','true');stage.appendChild(repairCancelOverlay);
  const explosionOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  explosionOverlay.setAttribute('class','v16-explosion-link-overlay');explosionOverlay.setAttribute('aria-hidden','true');stage.appendChild(explosionOverlay);
  const currentTurn=()=>window.combatTurn?.turn||1;
  const knownRoom=room=>!!room&&(!room.hidden||room.revealed);
  const enemyRoom=id=>enemyRooms.find(r=>r.id===id)||null;
  function center(el){const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};}
  function states(){try{const player=playerIntentDistribution(),enemy=enemyIntentDistribution(player);return{player,enemy};}catch{return null;}}

  function clearDodgeFeedback(){
    dodgeSeen.clear();
    document.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());
    document.querySelectorAll('.v17-dodge-pulse').forEach(el=>el.classList.remove('v17-dodge-pulse'));
  }
  function resetTurn(){const turn=currentTurn();if(turn===trackedTurn)return;trackedTurn=turn;clearDodgeFeedback();repairCancelSeen.clear();idleRepairShown.clear();}
  function showDodge(id){const el=getEntityElement('player',id);if(!el)return;el.querySelectorAll('.v15-dodged-tip').forEach(n=>n.remove());const tip=document.createElement('div');tip.className='v15-dodged-tip';tip.textContent='DODGED';tip.title='Movement has taken this section out of the aimed shot.';el.appendChild(tip);setTimeout(()=>tip.classList.add('fade'),1900);setTimeout(()=>tip.remove(),2600);}
  function decorateDodges(enemyState){document.querySelectorAll('.v14-dodged-tip').forEach(n=>n.remove());if(!enemyState)return;const current=new Set();enemyState.dodges?.forEach((count,id)=>{if(count<=0||enemyState.targetMap?.has(id))return;current.add(id);if(!dodgeSeen.has(id))showDodge(id);});[...dodgeSeen].forEach(id=>{if(!current.has(id))dodgeSeen.delete(id);});current.forEach(id=>dodgeSeen.add(id));}

  function adjacent8Player(mag){return playerRooms.filter(r=>r.id!==mag.id&&r.hp>0&&Math.abs(r.col-mag.col)<=1&&Math.abs(r.row-mag.row)<=1);}
  function clearExplosionAnimation(id){
    explosionOverlay.querySelectorAll(`[data-magazine-id="${id}"]`).forEach(n=>n.remove());
    getEntityElement('player',id)?.querySelectorAll('.v16-explosion-badge').forEach(n=>n.remove());
  }
  function animateProjectedMagazine(mag,affected){
    const sourceEl=getEntityElement('player',mag.id);if(!sourceEl)return;
    clearExplosionAnimation(mag.id);
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.dataset.magazineId=mag.id;group.setAttribute('class','v16-explosion-group');
    const a=center(sourceEl);
    affected.forEach(room=>{
      const targetEl=getEntityElement('player',room.id);if(!targetEl)return;const b=center(targetEl);
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','v16-explosion-link');group.appendChild(line);
      targetEl.classList.remove('v16-explosion-impact');void targetEl.offsetWidth;targetEl.classList.add('v16-explosion-impact');setTimeout(()=>targetEl.classList.remove('v16-explosion-impact'),820);
    });
    explosionOverlay.appendChild(group);
    const badge=document.createElement('div');badge.className='v16-explosion-badge';badge.innerHTML='<span>✹</span><b>EXPLODING</b>';sourceEl.appendChild(badge);
    sourceEl.classList.remove('v16-explosion-burst');void sourceEl.offsetWidth;sourceEl.classList.add('v16-explosion-burst');
    showRoomTooltip(sourceEl,'Magazine will explode');
    setTimeout(()=>{group.remove();badge.remove();sourceEl.classList.remove('v16-explosion-burst');},900);
  }
  function decorateExplosions(s){
    document.querySelectorAll('.v15-explosion-threat').forEach(el=>el.classList.remove('v15-explosion-threat'));
    document.querySelectorAll('.v16-magazine-primed').forEach(el=>el.classList.remove('v16-magazine-primed'));
    if(!s||window.combatTurn?.resolving||window.combatEnded)return;
    s.player?.explosions?.forEach((count,id)=>{if(count>0)getEntityElement('enemy',id)?.classList.add('v15-explosion-threat');});
    s.enemy?.explosions?.forEach((count,id)=>{if(count>0)getEntityElement('player',id)?.classList.add('v15-explosion-threat');});

    const active=new Set();
    playerRooms.filter(r=>r.isMagazine&&r.hp>0).forEach(mag=>{
      const incoming=s.enemy?.hits?.get(mag.id)||0;
      if(incoming<mag.hp)return;
      active.add(mag.id);
      const el=getEntityElement('player',mag.id);if(el)el.classList.add('v16-magazine-primed');
      const affected=adjacent8Player(mag).filter(room=>(s.enemy?.explosions?.get(room.id)||0)>0);
      if(!predictedPlayerExplosions.has(mag.id))animateProjectedMagazine(mag,affected);
    });
    [...predictedPlayerExplosions].forEach(id=>{if(!active.has(id)){predictedPlayerExplosions.delete(id);clearExplosionAnimation(id);}});
    active.forEach(id=>predictedPlayerExplosions.add(id));
  }

  function renderRepairCancellation(s){repairCancelOverlay.innerHTML='';document.querySelectorAll('.v15-repair-cancel-target').forEach(el=>el.classList.remove('v15-repair-cancel-target'));if(!s||window.combatTurn?.resolving||window.combatEnded)return;const current=new Set(),actions=window.enemyAI?.currentActions?.()||window.enemyActionIntents||[];actions.filter(a=>a.actionType==='repair').forEach(action=>{const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);if(!source||!target||source.hp<=0||target.hp<=0||!knownRoom(source))return;if(source.hp-(s.player?.hits?.get(source.id)||0)>0)return;const se=getEntityElement('enemy',source.id),te=getEntityElement('enemy',target.id);if(!se||!te)return;const key=`${source.id}:${target.id}`;current.add(key);te.classList.add('v15-repair-cancel-target');const a=center(se),b=center(te),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','v15-repair-cancel-line');repairCancelOverlay.appendChild(line);const x=document.createElementNS('http://www.w3.org/2000/svg','text');x.setAttribute('x',(a.x+b.x)/2);x.setAttribute('y',(a.y+b.y)/2+6);x.setAttribute('text-anchor','middle');x.setAttribute('class','v15-repair-cancel-x');x.textContent='×';repairCancelOverlay.appendChild(x);if(!repairCancelSeen.has(key)){showRoomTooltip(te,'Repair cancelled');repairCancelSeen.add(key);}});[...repairCancelSeen].forEach(key=>{if(!current.has(key))repairCancelSeen.delete(key);});}
  function showIdleRepair(){if(!document.body.classList.contains('v11-intent-preview-active')||window.combatEnded)return;const actions=window.enemyAI?.currentActions?.()||window.enemyActionIntents||[];enemyRooms.filter(r=>r.actionType==='repair'&&r.hp>0&&knownRoom(r)).forEach(source=>{const key=`${currentTurn()}:${source.id}`;if(idleRepairShown.has(key)||actions.some(a=>a.actionType==='repair'&&a.sourceId===source.id))return;const damaged=enemyRooms.some(target=>target.hp>0&&target.hp<target.max&&Math.abs(target.col-source.col)<=1&&Math.abs(target.row-source.row)<=1);if(damaged)return;idleRepairShown.add(key);const el=getEntityElement('enemy',source.id);if(el)setTimeout(()=>{if(document.body.classList.contains('v11-intent-preview-active'))showRoomTooltip(el,'No repair needed');},300);});}
  function decorate(){resetTurn();const s=states();decorateDodges(s?.enemy);decorateExplosions(s);renderRepairCancellation(s);showIdleRepair();}
  const baseRefresh=refresh;refresh=function(){baseRefresh();decorate();};
  stage.addEventListener('click',e=>{if(window.combatTurn?.resolving||window.combatEnded||document.body.classList.contains('v11-intent-preview-active'))return;const selected=state.selectedWeaponId;if(!selected)return;const room=e.target.closest&&e.target.closest('.room[data-side="enemy"]'),mast=e.target.closest&&e.target.closest('#enemyMastBox'),targetId=room?.dataset.id||(mast?enemyMast.id:null);if(!targetId)return;setTimeout(()=>{if(state.playerIntents?.[selected]!==targetId)return;const el=getEntityElement('enemy',targetId);if(!el)return;el.classList.remove('v15-player-target-flash');void el.offsetWidth;el.classList.add('v15-player-target-flash');setTimeout(()=>el.classList.remove('v15-player-target-flash'),720);},0);},true);
  window.addEventListener('resize',()=>requestAnimationFrame(decorate));moveAft.addEventListener('click',()=>requestAnimationFrame(decorate));moveFore.addEventListener('click',()=>requestAnimationFrame(decorate));
  window.addEventListener('keydown',e=>{if(e.code==='KeyR'&&!e.repeat)clearDodgeFeedback();},true);
  new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('combat-ended',()=>{repairCancelOverlay.innerHTML='';explosionOverlay.innerHTML='';clearDodgeFeedback();document.querySelectorAll('.v15-player-target-flash,.v15-explosion-threat,.v15-repair-cancel-target,.v16-magazine-primed,.v16-explosion-burst,.v16-explosion-impact').forEach(el=>el.classList.remove('v15-player-target-flash','v15-explosion-threat','v15-repair-cancel-target','v16-magazine-primed','v16-explosion-burst','v16-explosion-impact'));});
  window.combatDodgeFeedback={reset:clearDodgeFeedback};
  refresh();
})();
