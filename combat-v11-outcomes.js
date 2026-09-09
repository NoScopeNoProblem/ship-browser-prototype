(() => {
  window.combatEnded=false;
  let surrenderRefused=false;
  let offerPromise=null;
  let offerResolve=null;

  const overlay=document.createElement('div');
  overlay.className='v11-outcome-overlay';
  overlay.innerHTML=`<div class="v11-outcome-card"><div class="v11-outcome-kicker"></div><div class="v11-outcome-title"></div><div class="v11-outcome-copy"></div><div class="v11-outcome-actions"></div></div>`;
  stage.appendChild(overlay);
  const kicker=overlay.querySelector('.v11-outcome-kicker'),title=overlay.querySelector('.v11-outcome-title'),copy=overlay.querySelector('.v11-outcome-copy'),actions=overlay.querySelector('.v11-outcome-actions');

  function bottomRooms(side){
    const rooms=side==='enemy'?enemyRooms:playerRooms,setup=side==='enemy'?ENEMY_SHIP_SETUP:PLAYER_SHIP_SETUP,row=(setup.rows||1)-1;
    return rooms.filter(r=>r.row===row);
  }
  function sinkThreshold(side){const rooms=bottomRooms(side);return Math.floor(rooms.length/2)+1;}
  function actualSunk(side){return bottomRooms(side).filter(r=>r.hp<=0).length>=sinkThreshold(side);}
  function allEnemyGunsDestroyed(){const guns=enemyRooms.filter(r=>r.weapon);return guns.length>0&&guns.every(r=>r.hp<=0);}
  function plannedHits(){try{return playerIntentDistribution()?.hits||new Map();}catch{return new Map();}}

  function projectedEnemyGunsDestroyed(){
    const hits=plannedHits(),guns=enemyRooms.filter(r=>r.weapon);return guns.length>0&&guns.every(r=>r.hp-(hits.get(r.id)||0)<=0);
  }
  function projectedEnemySunk(){
    const hits=plannedHits();let destroyed=0;
    for(const room of bottomRooms('enemy')){
      if(room.hp<=0){destroyed++;continue;}
      if(room.isMagazine&&room.hidden&&!room.revealed)continue;
      if(room.hp-(hits.get(room.id)||0)<=0)destroyed++;
    }
    return destroyed>=sinkThreshold('enemy');
  }

  function enemyCanEverHitFromHere(){
    return enemyRooms.filter(r=>r.weapon&&r.hp>0).some(gun=>getTargetsForWeapon('enemy',gun).some(t=>t&&t.hp>0));
  }
  function playerCanForceSink(){
    const bottom=bottomRooms('enemy').map(r=>({room:r,hp:r.hp})),threshold=sinkThreshold('enemy');
    let destroyed=bottom.filter(x=>x.hp<=0).length;
    const guns=playerRooms.filter(r=>r.weapon&&r.hp>0&&window.combatTurn?.isReady(r.id)).sort((a,b)=>(weapons[b.weapon]?.damage||0)-(weapons[a.weapon]?.damage||0));
    for(const gun of guns){
      const targets=getTargetsForWeapon('player',gun).filter(t=>t&&t.kind!=='mast'&&t.row===ENEMY_SHIP_SETUP.rows-1&&t.hp>0);
      const candidates=bottom.filter(x=>x.hp>0&&targets.some(t=>t.id===x.room.id)).sort((a,b)=>a.hp-b.hp);
      if(!candidates.length)continue;
      const target=candidates[0];target.hp=Math.max(0,target.hp-(weapons[gun.weapon]?.damage||1));if(target.hp===0)destroyed++;
      if(destroyed>=threshold)return true;
    }
    return destroyed>=threshold;
  }
  function strategicSurrenderPossible(){return enemyMast.hp<=0&&!enemyCanEverHitFromHere()&&playerCanForceSink();}

  function lockCombat(){
    document.body.classList.add('v11-combat-ended');
    const end=stage.querySelector('.v3-end-turn');if(end)end.disabled=true;moveAft.disabled=true;moveFore.disabled=true;
    document.body.classList.remove('v11-intent-preview-active','v9-turn-intro-active');
    stage.querySelector('.v11-intent-preview')?.classList.remove('visible','handoff');
  }
  function endCombat(kind){
    if(window.combatEnded)return;window.combatEnded=true;lockCombat();actions.innerHTML='';kicker.textContent=kind==='defeat'?'DEFEAT':'VICTORY';
    if(kind==='surrender'){title.textContent='ENEMY SURRENDERED';copy.textContent='The enemy strikes its colours. The ship is yours to take.';}
    else if(kind==='sunk'){title.textContent='ENEMY SHIP SUNK';copy.textContent='Too much of the lower deck is gone. She slips beneath the water.';}
    else{title.textContent='YOUR SHIP SUNK';copy.textContent='More than half of the lower deck is lost.';}
    overlay.classList.add('visible','final');
    window.dispatchEvent(new CustomEvent('combat-ended',{detail:{kind}}));
  }

  function offerSurrender(reason){
    if(window.combatEnded||surrenderRefused)return Promise.resolve(false);
    if(offerPromise)return offerPromise;
    kicker.textContent='ENEMY SIGNAL';title.textContent='SURRENDER OFFERED';copy.textContent=reason||'The enemy offers to strike its colours.';actions.innerHTML='';
    const accept=document.createElement('button');accept.textContent='ACCEPT SURRENDER';accept.className='v11-accept';
    const refuse=document.createElement('button');refuse.textContent='REFUSE — KEEP FIRING';refuse.className='v11-refuse';
    actions.append(accept,refuse);overlay.classList.add('visible','offer');document.body.classList.add('v11-surrender-offer');
    offerPromise=new Promise(resolve=>{offerResolve=resolve;});
    accept.addEventListener('click',e=>{e.stopPropagation();overlay.classList.remove('offer');document.body.classList.remove('v11-surrender-offer');const resolve=offerResolve;offerResolve=null;offerPromise=null;endCombat('surrender');resolve?.(true);});
    refuse.addEventListener('click',e=>{e.stopPropagation();surrenderRefused=true;overlay.classList.remove('visible','offer');document.body.classList.remove('v11-surrender-offer');const resolve=offerResolve;offerResolve=null;offerPromise=null;refresh();resolve?.(false);});
    return offerPromise;
  }

  async function maybeOfferPlanningSurrender(){
    if(window.combatEnded||surrenderRefused||window.combatTurn?.resolving||document.body.classList.contains('v11-intent-preview-active'))return false;
    if(projectedEnemyGunsDestroyed())return offerSurrender('Your planned volley will silence the last working cannon. They offer to strike their colours.');
    if(projectedEnemySunk())return offerSurrender('Your planned shot would leave more than half the lower deck destroyed. They offer surrender before you send them under.');
    if(strategicSurrenderPossible())return offerSurrender('Their mast is gone, they cannot bring a gun to bear, and you can finish the ship at will.');
    return false;
  }

  stage.addEventListener('click',e=>{
    if(window.combatEnded||surrenderRefused)return;const selected=state.selectedWeaponId;if(!selected)return;const room=e.target.closest&&e.target.closest('.room[data-side="enemy"]'),mast=e.target.closest&&e.target.closest('#enemyMastBox');const targetId=room?.dataset.id||(mast?enemyMast.id:null);if(!targetId)return;
    setTimeout(()=>{if(state.playerIntents?.[selected]===targetId)maybeOfferPlanningSurrender();},0);
  },true);
  moveAft.addEventListener('click',()=>setTimeout(()=>maybeOfferPlanningSurrender(),0));
  moveFore.addEventListener('click',()=>setTimeout(()=>maybeOfferPlanningSurrender(),0));
  window.addEventListener('keydown',e=>{if(e.code==='ArrowLeft'||e.code==='ArrowRight')setTimeout(()=>maybeOfferPlanningSurrender(),0);},true);

  async function afterDamage({side}){
    if(side==='player'&&actualSunk('player')){endCombat('defeat');return {combatEnded:true};}
    if(side==='enemy'){
      if(actualSunk('enemy')){endCombat('sunk');return {combatEnded:true};}
      if(!surrenderRefused&&allEnemyGunsDestroyed()){
        const accepted=await offerSurrender('Every working cannon is gone. The enemy offers to strike its colours.');
        if(accepted)return {combatEnded:true};
      }
      if(!surrenderRefused&&strategicSurrenderPossible()){
        const accepted=await offerSurrender('Their mast is gone and no surviving gun can reach you. They can only wait to be sunk.');
        if(accepted)return {combatEnded:true};
      }
    }
    return {combatEnded:false};
  }

  window.combatHooks={
    async beforeEnemyFire(ctx){if(window.enemyAI?.resolveBeforeEnemyFire)await enemyAI.resolveBeforeEnemyFire(ctx);},
    async afterEnemyFire(ctx){if(window.enemyAI?.afterEnemyFire)await enemyAI.afterEnemyFire(ctx);},
    afterDamage
  };

  window.addEventListener('click',e=>{if(!document.body.classList.contains('v11-surrender-offer'))return;if(e.target.closest?.('.v11-outcome-overlay'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(!document.body.classList.contains('v11-surrender-offer'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('click',e=>{if(!window.combatEnded)return;if(e.target.closest?.('.v11-outcome-overlay'))return;e.preventDefault();e.stopImmediatePropagation();},true);
  window.addEventListener('keydown',e=>{if(!window.combatEnded)return;e.preventDefault();e.stopImmediatePropagation();},true);

  window.combatOutcome={isSunk:actualSunk,sinkThreshold,offerSurrender,get surrenderRefused(){return surrenderRefused;},get ended(){return window.combatEnded;}};
})();
