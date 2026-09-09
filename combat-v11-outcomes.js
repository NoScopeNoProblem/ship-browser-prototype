(() => {
  window.combatEnded=false;
  let surrenderRefused=false,offerPromise=null,offerResolve=null,fleePromise=null,fleeResolve=null;

  const overlay=document.createElement('div');
  overlay.className='v11-outcome-overlay';
  overlay.innerHTML=`<div class="v11-outcome-card"><div class="v11-outcome-kicker"></div><div class="v11-outcome-title"></div><div class="v11-outcome-copy"></div><div class="v11-outcome-actions"></div></div>`;
  stage.appendChild(overlay);
  const kicker=overlay.querySelector('.v11-outcome-kicker'),title=overlay.querySelector('.v11-outcome-title'),copy=overlay.querySelector('.v11-outcome-copy'),actions=overlay.querySelector('.v11-outcome-actions');

  function bottomRooms(side){const rooms=side==='enemy'?enemyRooms:playerRooms,setup=side==='enemy'?ENEMY_SHIP_SETUP:PLAYER_SHIP_SETUP,row=(setup.rows||1)-1;return rooms.filter(r=>r.row===row);}
  function sinkThreshold(side){const rooms=bottomRooms(side);return Math.floor(rooms.length/2)+1;}
  function actualSunk(side){return bottomRooms(side).filter(r=>r.hp<=0).length>=sinkThreshold(side);}
  function allEnemyGunsDestroyed(){const guns=enemyRooms.filter(r=>r.weapon);return guns.length>0&&guns.every(r=>r.hp<=0);}
  function plannedHits(){try{return playerIntentDistribution()?.hits||new Map();}catch{return new Map();}}
  function projectedHp(entity,hits){return Math.max(0,entity.hp-(hits.get(entity.id)||0));}

  function projectedEnemyGunsDestroyed(){
    const hits=plannedHits(),guns=enemyRooms.filter(r=>r.weapon);return guns.length>0&&guns.every(r=>projectedHp(r,hits)<=0);
  }
  function projectedEnemySunk(){
    const hits=plannedHits();let destroyed=0;
    for(const room of bottomRooms('enemy')){
      if(room.hp<=0){destroyed++;continue;}
      // Do not let an unrevealed Magazine disclose its blast/sink implications during planning.
      if(room.isMagazine&&room.hidden&&!room.revealed)continue;
      if(projectedHp(room,hits)<=0)destroyed++;
    }
    return destroyed>=sinkThreshold('enemy');
  }

  function enemyCanHitAfter(hits=new Map()){
    return enemyRooms.filter(r=>r.weapon&&projectedHp(r,hits)>0).some(gun=>getTargetsForWeapon('enemy',gun).some(t=>t&&t.hp>0));
  }
  function playerCanEventuallySink(hits=new Map(),planning=false){
    const bottom=bottomRooms('enemy'),threshold=sinkThreshold('enemy');let destroyed=0;
    const reachable=new Set();
    bottom.forEach(room=>{
      if(room.hp<=0){destroyed++;return;}
      if(planning&&room.isMagazine&&room.hidden&&!room.revealed)return;
      if(projectedHp(room,hits)<=0){destroyed++;return;}
    });
    if(destroyed>=threshold)return true;
    playerRooms.filter(r=>r.weapon&&r.hp>0).forEach(gun=>{
      getTargetsForWeapon('player',gun).forEach(target=>{
        if(target&&target.kind!=='mast'&&target.row===ENEMY_SHIP_SETUP.rows-1&&projectedHp(target,hits)>0)reachable.add(target.id);
      });
    });
    return destroyed+reachable.size>=threshold;
  }
  function sittingDuckPossible(hits=new Map(),planning=false){
    if(projectedHp(enemyMast,hits)>0)return false;
    if(enemyCanHitAfter(hits))return false;
    return playerCanEventuallySink(hits,planning);
  }
  function strategicSurrenderPossible(){return sittingDuckPossible(new Map(),false);}
  function projectedSittingDuck(){const hits=plannedHits();return sittingDuckPossible(hits,true);}

  function lockCombat(){
    document.body.classList.add('v11-combat-ended');const end=stage.querySelector('.v3-end-turn');if(end)end.disabled=true;moveAft.disabled=true;moveFore.disabled=true;
    document.body.classList.remove('v11-intent-preview-active','v9-turn-intro-active','v11-surrender-offer','v11-flee-offer');stage.querySelector('.v11-intent-preview')?.classList.remove('visible','handoff');
  }
  function endCombat(kind){
    if(window.combatEnded)return;window.combatEnded=true;lockCombat();actions.innerHTML='';
    if(kind==='defeat')kicker.textContent='DEFEAT';
    else if(kind==='fled')kicker.textContent='COMBAT ENDED';
    else kicker.textContent='VICTORY';
    if(kind==='surrender'){title.textContent='ENEMY SURRENDERED';copy.textContent='The enemy strikes its colours. The ship is yours to take.';}
    else if(kind==='sunk'){title.textContent='ENEMY SHIP SUNK';copy.textContent='Too much of the lower deck is gone. She slips beneath the water.';}
    else if(kind==='fled'){title.textContent='YOU FLED';copy.textContent='You break away from the engagement and make sail for open water.';}
    else{title.textContent='YOUR SHIP SUNK';copy.textContent='More than half of the lower deck is lost.';}
    overlay.classList.remove('offer','flee-offer');overlay.classList.add('visible','final');window.dispatchEvent(new CustomEvent('combat-ended',{detail:{kind}}));
  }

  function offerSurrender(reason){
    if(window.combatEnded||surrenderRefused)return Promise.resolve(false);if(offerPromise)return offerPromise;
    kicker.textContent='ENEMY SIGNAL';title.textContent='SURRENDER OFFERED';copy.textContent=reason||'The enemy offers to strike its colours.';actions.innerHTML='';
    const accept=document.createElement('button');accept.textContent='ACCEPT SURRENDER';accept.className='v11-accept';
    const refuse=document.createElement('button');refuse.textContent='REFUSE — KEEP FIRING';refuse.className='v11-refuse';actions.append(accept,refuse);overlay.classList.add('visible','offer');document.body.classList.add('v11-surrender-offer');
    offerPromise=new Promise(resolve=>{offerResolve=resolve;});
    accept.addEventListener('click',e=>{e.stopPropagation();overlay.classList.remove('offer');document.body.classList.remove('v11-surrender-offer');const resolve=offerResolve;offerResolve=null;offerPromise=null;endCombat('surrender');resolve?.(true);});
    refuse.addEventListener('click',e=>{e.stopPropagation();surrenderRefused=true;overlay.classList.remove('visible','offer');document.body.classList.remove('v11-surrender-offer');const resolve=offerResolve;offerResolve=null;offerPromise=null;refresh();resolve?.(false);});
    return offerPromise;
  }

  function offerFlee(){
    if(window.combatEnded||window.combatTurn?.resolving)return Promise.resolve(false);if(fleePromise)return fleePromise;
    kicker.textContent='MANOEUVRE';title.textContent='FLEE?';copy.textContent='Break away from the engagement and end combat?';actions.innerHTML='';
    const confirm=document.createElement('button');confirm.textContent='FLEE — END COMBAT';confirm.className='v11-accept';
    const cancel=document.createElement('button');cancel.textContent='CANCEL';cancel.className='v11-refuse';actions.append(confirm,cancel);
    overlay.classList.remove('offer');overlay.classList.add('visible','flee-offer');document.body.classList.add('v11-flee-offer');
    fleePromise=new Promise(resolve=>{fleeResolve=resolve;});
    confirm.addEventListener('click',e=>{e.stopPropagation();document.body.classList.remove('v11-flee-offer');const resolve=fleeResolve;fleeResolve=null;fleePromise=null;endCombat('fled');resolve?.(true);});
    cancel.addEventListener('click',e=>{e.stopPropagation();overlay.classList.remove('visible','flee-offer');document.body.classList.remove('v11-flee-offer');const resolve=fleeResolve;fleeResolve=null;fleePromise=null;refresh();resolve?.(false);});
    return fleePromise;
  }

  async function maybeOfferPlanningSurrender(){
    if(window.combatEnded||surrenderRefused||window.combatTurn?.resolving||document.body.classList.contains('v11-intent-preview-active'))return false;
    // All checks use the complete current plan, so two separate lethal targets can together trigger surrender.
    if(projectedEnemyGunsDestroyed())return offerSurrender('Your planned volley will silence every working cannon. They offer to strike their colours.');
    if(projectedEnemySunk())return offerSurrender('Your planned volley would leave more than half the lower deck destroyed. They offer surrender before you send them under.');
    if(projectedSittingDuck())return offerSurrender('Your planned volley leaves them a sitting duck: no mast, no gun that can reach you, and no way to stop you finishing the ship.');
    return false;
  }

  stage.addEventListener('click',e=>{
    if(window.combatEnded||surrenderRefused)return;const selected=state.selectedWeaponId;if(!selected)return;const room=e.target.closest&&e.target.closest('.room[data-side="enemy"]'),mast=e.target.closest&&e.target.closest('#enemyMastBox'),targetId=room?.dataset.id||(mast?enemyMast.id:null);if(!targetId)return;
    setTimeout(()=>{if(state.playerIntents?.[selected]===targetId)maybeOfferPlanningSurrender();},0);
  },true);
  moveAft.addEventListener('click',()=>setTimeout(()=>maybeOfferPlanningSurrender(),0));moveFore.addEventListener('click',()=>setTimeout(()=>maybeOfferPlanningSurrender(),0));
  window.addEventListener('keydown',e=>{if(e.code==='ArrowLeft'||e.code==='ArrowRight')setTimeout(()=>maybeOfferPlanningSurrender(),0);},true);

  async function afterDamage({side}){
    if(side==='player'&&actualSunk('player')){endCombat('defeat');return {combatEnded:true};}
    if(side==='enemy'){
      if(actualSunk('enemy')){endCombat('sunk');return {combatEnded:true};}
      if(!surrenderRefused&&allEnemyGunsDestroyed()){
        const accepted=await offerSurrender('Every working cannon is gone. The enemy offers to strike its colours.');if(accepted)return {combatEnded:true};
      }
      if(!surrenderRefused&&strategicSurrenderPossible()){
        const accepted=await offerSurrender('Their mast is gone and no surviving gun can reach you. They are a sitting duck.');if(accepted)return {combatEnded:true};
      }
    }
    return {combatEnded:false};
  }

  window.combatHooks={
    async beforeEnemyFire(ctx){if(window.enemyAI?.resolveBeforeEnemyFire)await enemyAI.resolveBeforeEnemyFire(ctx);},
    async afterEnemyFire(ctx){if(window.enemyAI?.afterEnemyFire)await enemyAI.afterEnemyFire(ctx);},
    afterDamage
  };

  function promptActive(){return document.body.classList.contains('v11-surrender-offer')||document.body.classList.contains('v11-flee-offer');}
  window.addEventListener('click',e=>{if(!promptActive())return;if(e.target.closest?.('.v11-outcome-overlay'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(!promptActive())return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('click',e=>{if(!window.combatEnded)return;if(e.target.closest?.('.v11-outcome-overlay'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(!window.combatEnded)return;e.preventDefault();e.stopImmediatePropagation();},true);

  window.combatOutcome={isSunk:actualSunk,sinkThreshold,offerSurrender,offerFlee,endCombat,get surrenderRefused(){return surrenderRefused;},get ended(){return window.combatEnded;}};
})();
