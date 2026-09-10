(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const Voyage=window.HighSeasShipVoyage||null;
  const shipUrl=()=>new URL('../ship/?postCombat=1',window.location.href).toString();
  const worldUrl=()=>new URL('../world/',window.location.href).toString();

  // This sits in the top-right combat HUD, not below the fold. Adventure mode only.
  const resources=document.createElement('div');
  resources.className='adventure-resource-counter v32-visible-stores';
  resources.innerHTML=`
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">⚫</span><span class="adventure-resource-label">CANNONBALLS</span><strong class="adventure-resource-value" data-resource="cannonballs">0</strong></div>
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">🪵</span><span class="adventure-resource-label">TIMBER</span><strong class="adventure-resource-value" data-resource="timber">0</strong></div>`;
  resources.title='Voyage stores: every cannon fired spends 1 Cannonball; each planned Carpenter Repair spends 1 Timber. These are your persistent adventure stores.';
  document.body.appendChild(resources);

  const used={cannonballs:0,timber:0};
  const cargoLost={};
  const seenDestroyed=new Set();
  [...(typeof playerRooms!=='undefined'?playerRooms:[]),...(typeof enemyRooms!=='undefined'?enemyRooms:[])].forEach(room=>{if(room.kind==='storage'&&room.hp<=0)seenDestroyed.add(room.id);});

  function mergeLost(next={}){for(const [item,qty] of Object.entries(next||{}))cargoLost[item]=(cargoLost[item]||0)+(Number(qty)||0);}
  function updateResources(){
    const stores=Adventure.load().stores||{};
    const balls=resources.querySelector('[data-resource="cannonballs"]'),timber=resources.querySelector('[data-resource="timber"]');
    if(balls)balls.textContent=stores.cannonballs??0;if(timber)timber.textContent=stores.timber??0;
  }
  updateResources();window.addEventListener('adventure-storage-changed',updateResources);

  function showCargoLost(side,room,lost={}){
    const el=typeof getEntityElement==='function'?getEntityElement(side,room.id):null;
    if(!el)return;
    const parts=Object.entries(lost).filter(([,qty])=>qty>0).map(([item,qty])=>`${qty} ${item==='cannonballs'?'Cannonball':item}${qty===1?'':'s'}`);
    el.classList.add('v32-cargo-lost');
    el.title=side==='player'?(parts.length?`CARGO LOST — ${parts.join(', ')}. Destroying a Hold destroys everything stored in it.`:'CARGO LOST — destroying a Hold destroys everything stored in it.'):'CARGO LOST — a destroyed enemy Hold loses its contents.';
    if(typeof showRoomTooltip==='function')showRoomTooltip(el,'CARGO LOST');
  }

  function syncDestroyedHolds(){
    if(!Voyage)return;
    let needsCapture=false;
    for(const side of ['player','enemy']){
      const rooms=side==='player'?playerRooms:enemyRooms;
      for(const room of rooms){
        if(room.kind!=='storage'||room.hp>0||seenDestroyed.has(room.id))continue;
        seenDestroyed.add(room.id);
        if(side==='player')needsCapture=true;else showCargoLost(side,room,{});
      }
    }
    if(needsCapture){
      const result=Voyage.captureCombat(playerRooms,playerMast)||{};mergeLost(result.cargoLost);
      for(const room of playerRooms.filter(r=>r.kind==='storage'&&r.hp<=0))if(seenDestroyed.has(room.id))showCargoLost('player',room,result.cargoLost||{});
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

  const repairLedger=new Set(),committedRepairs=new Set();
  let wasResolving=!!window.combatTurn?.resolving;
  const repairKey=plan=>`${window.combatTurn?.turn||1}:${plan.sourceId}:${plan.targetId}`;
  function syncRepairSpend(){
    if(!window.combatUtility?.plannedRepairs)return;
    const current=new Set(combatUtility.plannedRepairs().map(repairKey));
    for(const key of current){if(repairLedger.has(key))continue;repairLedger.add(key);Adventure.spendTimber(1);used.timber+=1;}
    for(const key of [...repairLedger]){
      if(current.has(key))continue;repairLedger.delete(key);
      if(committedRepairs.has(key))committedRepairs.delete(key);
      else{Adventure.addItem('timber',1,{preferredRoomIds:['p_carp','p_hold1','p_hold2']});used.timber=Math.max(0,used.timber-1);}
    }
    updateResources();
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function')window.refresh=function(){const result=baseRefresh.apply(this,arguments);syncRepairSpend();syncDestroyedHolds();return result;};
  const phaseObserver=new MutationObserver(()=>{
    const now=!!window.combatTurn?.resolving;
    if(!wasResolving&&now){syncRepairSpend();for(const key of repairLedger)committedRepairs.add(key);}wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  let ending=false;
  window.addEventListener('combat-ended',event=>{
    if(ending)return;ending=true;syncRepairSpend();syncDestroyedHolds();
    const finalCapture=Voyage?.captureCombat?.(playerRooms,playerMast)||{};mergeLost(finalCapture.cargoLost);
    const finalUndamaged=[playerMast,...playerRooms].every(entity=>entity.hp>=entity.max);
    const resultTier=finalUndamaged?(used.timber===0?'perfect':'noDamage'):'standard';
    const detail={...(event.detail||{}),report:{resourcesUsed:{...used},cargoLost:{...cargoLost},resultTier,finalUndamaged}};
    Adventure.recordCombatResult(detail);
    if(Voyage&&(detail.kind==='sunk'||detail.kind==='surrender'||detail.kind==='victory'))Voyage.recordCombatScore(resultTier);
    setTimeout(()=>{window.location.href=shipUrl();},180);
  });

  const endButton=document.querySelector('.v28-end-combat');
  endButton?.addEventListener('click',event=>{
    if(endButton.textContent!=='CONFIRM END?')return;
    event.preventDefault();event.stopImmediatePropagation();Voyage?.captureCombat?.(playerRooms,playerMast);Adventure.clearPendingCombat();window.location.href=worldUrl();
  },true);

  syncDestroyedHolds();
})();