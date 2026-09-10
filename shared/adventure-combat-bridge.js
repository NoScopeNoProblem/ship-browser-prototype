(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const Voyage=window.HighSeasShipVoyage||null;
  const shipUrl=()=>new URL('../ship/?postCombat=1',window.location.href).toString();
  const worldUrl=()=>new URL('../world/',window.location.href).toString();
  const startingDamage=Voyage?.missingBlips?.(Voyage.load())||0;

  // This sits in the top-right combat HUD, not below the fold. Adventure mode only.
  const resources=document.createElement('div');
  resources.className='adventure-resource-counter v32-visible-stores';
  resources.innerHTML=`
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">🍗</span><span class="adventure-resource-label">FOOD</span><strong class="adventure-resource-value" data-resource="food">0</strong></div>
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">⚫</span><span class="adventure-resource-label">CANNONBALLS</span><strong class="adventure-resource-value" data-resource="cannonballs">0</strong></div>
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">🪵</span><span class="adventure-resource-label">TIMBER</span><strong class="adventure-resource-value" data-resource="timber">0</strong></div>`;
  resources.title='Persistent voyage stores. Food does not affect the current combat; firing spends Cannonballs, while Carpenter Repair and Boatswain Brace each spend Timber. Hover friendly storage rooms to see their exact physical contents.';
  document.body.appendChild(resources);

  const used={cannonballs:0,timber:0};
  let repairTimberSpent=0;
  const cargoLost={};
  const seenDestroyed=new Set();
  [...(typeof playerRooms!=='undefined'?playerRooms:[]),...(typeof enemyRooms!=='undefined'?enemyRooms:[])].forEach(room=>{if(room.kind==='storage'&&room.hp<=0)seenDestroyed.add(room.id);});

  function mergeLost(next={}){for(const [item,qty] of Object.entries(next||{}))cargoLost[item]=(cargoLost[item]||0)+(Number(qty)||0);}
  function updateResources(){
    const stores=Adventure.load().stores||{};
    const food=resources.querySelector('[data-resource="food"]'),balls=resources.querySelector('[data-resource="cannonballs"]'),timber=resources.querySelector('[data-resource="timber"]');
    if(food)food.textContent=stores.food??0;if(balls)balls.textContent=stores.cannonballs??0;if(timber)timber.textContent=stores.timber??0;
  }
  updateResources();window.addEventListener('adventure-storage-changed',updateResources);

  function showCargoLost(side,room,lost={},pulse=true){
    const el=typeof getEntityElement==='function'?getEntityElement(side,room.id):null;
    if(!el)return;
    const parts=Object.entries(lost).filter(([,qty])=>qty>0).map(([item,qty])=>`${qty} ${item==='cannonballs'?'Cannonball':item}${qty===1?'':'s'}`);
    el.classList.add('v32-cargo-lost');
    el.title=side==='player'?(parts.length?`CARGO LOST — ${parts.join(', ')}. Destroying a Hold destroys everything stored in it.`:'CARGO LOST — destroying a Hold destroys everything stored in it.'):'CARGO LOST — a destroyed enemy Hold loses its contents.';
    if(pulse&&typeof showRoomTooltip==='function')showRoomTooltip(el,'CARGO LOST');
  }

  function syncDestroyedHolds(){
    if(!Voyage)return;
    let needsCapture=false;
    for(const side of ['player','enemy']){
      const rooms=side==='player'?playerRooms:enemyRooms;
      for(const room of rooms){
        if(room.kind!=='storage'||room.hp>0)continue;
        const isNew=!seenDestroyed.has(room.id);if(isNew)seenDestroyed.add(room.id);
        if(side==='player'){if(isNew)needsCapture=true;else showCargoLost(side,room,{},false);}
        else showCargoLost(side,room,{},isNew);
      }
    }
    if(needsCapture){
      const result=Voyage.captureCombat(playerRooms,playerMast)||{};mergeLost(result.cargoLost);
      for(const room of playerRooms.filter(r=>r.kind==='storage'&&r.hp<=0))if(seenDestroyed.has(room.id))showCargoLost('player',room,result.cargoLost||{},true);
    }
  }

  window.combatHooks=window.combatHooks||{};
  const baseAfterDamage=window.combatHooks.afterDamage;
  window.combatHooks.afterDamage=async function(ctx){
    const actualPlayerShot=ctx?.side==='enemy'&&ctx?.source?.weapon&&typeof playerRooms!=='undefined'&&playerRooms.includes(ctx.source);
    if(actualPlayerShot){Adventure.spendCannonball(1);used.cannonballs+=1;}
    if(ctx?.side==='player'&&Voyage){const result=Voyage.captureCombat(playerRooms,playerMast)||{};mergeLost(result.cargoLost);}
    syncDestroyedHolds();updateResources();
    return baseAfterDamage?baseAfterDamage(ctx):false;
  };

  const timberLedger=new Map(),committedTimber=new Set();
  let wasResolving=!!window.combatTurn?.resolving;
  const timberKey=(type,plan)=>`${window.combatTurn?.turn||1}:${type}:${plan.sourceId}:${plan.targetId}`;
  function timberPlans(){
    const plans=[];
    if(window.combatUtility?.plannedRepairs)for(const plan of combatUtility.plannedRepairs())plans.push({type:'repair',...plan});
    if(window.combatUtility?.bracePlans)for(const plan of combatUtility.bracePlans())plans.push({type:'brace',...plan});
    return plans;
  }
  function syncTimberSpend(){
    const current=new Map(timberPlans().map(plan=>[timberKey(plan.type,plan),plan]));
    for(const [key,plan] of current){
      if(timberLedger.has(key))continue;
      timberLedger.set(key,plan);
      Adventure.consumeItem('timber',1,{preferredRoomIds:[plan.sourceId,'p_carp','p_hold1','p_hold2']});
      used.timber+=1;if(plan.type==='repair')repairTimberSpent+=1;
    }
    for(const [key,plan] of [...timberLedger]){
      if(current.has(key))continue;
      timberLedger.delete(key);
      if(committedTimber.has(key)){committedTimber.delete(key);continue;}
      Adventure.addItem('timber',1,{preferredRoomIds:[plan.sourceId,'p_carp','p_hold1','p_hold2']});
      used.timber=Math.max(0,used.timber-1);if(plan.type==='repair')repairTimberSpent=Math.max(0,repairTimberSpent-1);
    }
    updateResources();
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function')window.refresh=function(){const result=baseRefresh.apply(this,arguments);syncTimberSpend();syncDestroyedHolds();return result;};
  const phaseObserver=new MutationObserver(()=>{
    const now=!!window.combatTurn?.resolving;
    if(!wasResolving&&now){syncTimberSpend();for(const key of timberLedger.keys())committedTimber.add(key);}wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  let ending=false;
  window.addEventListener('combat-ended',event=>{
    if(ending)return;ending=true;
    // The core outcome card becomes visible immediately before this event. Hide that legacy final
    // card synchronously so Adventure mode transitions straight to the ship report without a flash.
    document.body.classList.add('v33-adventure-exit');
    syncTimberSpend();syncDestroyedHolds();
    const finalCapture=Voyage?.captureCombat?.(playerRooms,playerMast)||{};mergeLost(finalCapture.cargoLost);
    const finalState=Voyage?.load?.();
    const damageRemaining=Voyage?.missingBlips?.(finalState)||0;
    const damageTaken=Math.max(0,damageRemaining-startingDamage+repairTimberSpent);
    const finalUndamaged=damageRemaining===0;
    const kind=event.detail?.kind||'unknown',won=kind==='sunk'||kind==='surrender'||kind==='victory';
    const resultTier=won&&finalUndamaged?(used.timber===0?'perfect':'noDamage'):'standard';
    const detail={...(event.detail||{}),report:{resourcesUsed:{...used},cargoLost:{...cargoLost},resultTier,finalUndamaged,startingDamage,damageTaken,damageRemaining}};
    Adventure.recordCombatResult(detail);
    if(Voyage&&(detail.kind==='sunk'||detail.kind==='surrender'||detail.kind==='victory'))Voyage.recordCombatScore(resultTier);
    window.location.replace(shipUrl());
  });

  const endButton=document.querySelector('.v28-end-combat');
  endButton?.addEventListener('click',event=>{
    if(endButton.textContent!=='CONFIRM END?')return;
    event.preventDefault();event.stopImmediatePropagation();Voyage?.captureCombat?.(playerRooms,playerMast);Adventure.clearPendingCombat();window.location.href=worldUrl();
  },true);

  syncDestroyedHolds();
})();
