(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const worldUrl=()=>new URL('../world/',window.location.href).toString();

  const resources=document.createElement('div');
  resources.className='adventure-resource-counter';
  resources.innerHTML=`
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">⚫</span><span class="adventure-resource-label">CANNONBALLS</span><strong class="adventure-resource-value" data-resource="cannonballs">0</strong></div>
    <div class="adventure-resource-chip"><span class="adventure-resource-icon">🪵</span><span class="adventure-resource-label">TIMBER</span><strong class="adventure-resource-value" data-resource="timber">0</strong></div>`;
  resources.title='Voyage stores. Firing spends Cannonballs; Repair spends Timber. Capacity and shortage enforcement are still deferred.';
  document.body.appendChild(resources);

  function updateResources(){
    const stores=Adventure.load().stores;
    const balls=resources.querySelector('[data-resource="cannonballs"]'),timber=resources.querySelector('[data-resource="timber"]');
    if(balls)balls.textContent=stores.cannonballs;if(timber)timber.textContent=stores.timber;
  }
  updateResources();window.addEventListener('adventure-storage-changed',updateResources);

  window.combatHooks=window.combatHooks||{};
  const baseAfterDamage=window.combatHooks.afterDamage;
  window.combatHooks.afterDamage=async function(ctx){
    const actualPlayerShot=ctx?.side==='enemy'&&ctx?.source?.weapon&&typeof playerRooms!=='undefined'&&playerRooms.includes(ctx.source);
    if(actualPlayerShot)Adventure.spendCannonball(1);
    updateResources();return baseAfterDamage?baseAfterDamage(ctx):false;
  };

  const repairLedger=new Set(),committedRepairs=new Set();
  let wasResolving=!!window.combatTurn?.resolving;
  const repairKey=plan=>`${window.combatTurn?.turn||1}:${plan.sourceId}:${plan.targetId}`;

  function syncRepairSpend(){
    if(!window.combatUtility?.plannedRepairs)return;
    const current=new Set(combatUtility.plannedRepairs().map(repairKey));
    for(const key of current){if(repairLedger.has(key))continue;repairLedger.add(key);Adventure.spendTimber(1);}
    for(const key of [...repairLedger]){
      if(current.has(key))continue;repairLedger.delete(key);
      if(committedRepairs.has(key))committedRepairs.delete(key);else Adventure.addItem('timber',1,{preferredRoomIds:['p_carp','p_hold1','p_hold2']});
    }
    updateResources();
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function')window.refresh=function(){const result=baseRefresh.apply(this,arguments);syncRepairSpend();return result;};
  const phaseObserver=new MutationObserver(()=>{
    const now=!!window.combatTurn?.resolving;
    if(!wasResolving&&now){syncRepairSpend();for(const key of repairLedger)committedRepairs.add(key);}wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('combat-ended',event=>{
    syncRepairSpend();Adventure.recordCombatResult(event.detail||{});
    queueMicrotask(()=>{
      const actions=document.querySelector('.v11-outcome-actions');if(!actions)return;
      actions.innerHTML='';actions.classList.add('v28-final-actions');
      const back=document.createElement('button');back.type='button';back.className='v28-return';back.textContent='RETURN TO MAP';
      back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.location.href=worldUrl();});actions.appendChild(back);
    });
  });

  const endButton=document.querySelector('.v28-end-combat');
  endButton?.addEventListener('click',event=>{if(endButton.textContent!=='CONFIRM END?')return;event.preventDefault();event.stopImmediatePropagation();Adventure.clearPendingCombat();window.location.href=worldUrl();},true);
})();
