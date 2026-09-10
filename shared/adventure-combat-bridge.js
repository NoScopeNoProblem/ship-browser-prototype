(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const worldUrl=()=>new URL('../world/',window.location.href).toString();

  const resources=document.createElement('div');
  resources.className='adventure-resource-counter';
  Object.assign(resources.style,{position:'fixed',right:'18px',bottom:'16px',zIndex:'95',display:'flex',gap:'12px',padding:'8px 10px',border:'1px solid #4b5c67',borderRadius:'6px',background:'#0c151dee',color:'#e8edf2',font:'800 10px/1.2 system-ui',letterSpacing:'.09em',boxShadow:'0 5px 18px #0008'});
  resources.innerHTML='<span data-resource="cannonballs"></span><span data-resource="timber"></span>';
  document.body.appendChild(resources);

  function updateResources(){
    const stores=Adventure.load().stores;
    const balls=resources.querySelector('[data-resource="cannonballs"]');
    const timber=resources.querySelector('[data-resource="timber"]');
    if(balls)balls.textContent=`CANNONBALLS  ${stores.cannonballs}`;
    if(timber)timber.textContent=`TIMBER  ${stores.timber}`;
    resources.title='Voyage stores. Capacity and shortage enforcement are deliberately deferred for this prototype pass.';
  }
  updateResources();
  window.addEventListener('adventure-storage-changed',updateResources);

  // Ammunition belongs to persistent voyage state. In the current combat rules every actual
  // player shot reaches afterDamage because the enemy does not manoeuvre; cancelled plans do not.
  window.combatHooks=window.combatHooks||{};
  const baseAfterDamage=window.combatHooks.afterDamage;
  window.combatHooks.afterDamage=async function(ctx){
    const actualPlayerShot=ctx?.side==='enemy'&&ctx?.source?.weapon&&typeof playerRooms!=='undefined'&&playerRooms.includes(ctx.source);
    if(actualPlayerShot)Adventure.consumeItem('cannonballs',1);
    updateResources();
    return baseAfterDamage?baseAfterDamage(ctx):false;
  };

  // Repair is currently applied during the reversible planning phase. Mirror that transaction
  // into voyage Timber: spend when the repair is planned, refund if R removes the plan, and keep
  // the spend once resolution begins. This can disappear when Repair becomes a first-class action
  // in the planned clean combat-state architecture.
  const repairLedger=new Set();
  const committedRepairs=new Set();
  let wasResolving=!!window.combatTurn?.resolving;
  const repairKey=plan=>`${window.combatTurn?.turn||1}:${plan.sourceId}:${plan.targetId}`;

  function syncRepairSpend(){
    if(!window.combatUtility?.plannedRepairs)return;
    const current=new Set(combatUtility.plannedRepairs().map(repairKey));
    for(const key of current){
      if(repairLedger.has(key))continue;
      repairLedger.add(key);
      Adventure.consumeItem('timber',1);
    }
    for(const key of [...repairLedger]){
      if(current.has(key))continue;
      repairLedger.delete(key);
      if(committedRepairs.has(key))committedRepairs.delete(key);
      else Adventure.addItem('timber',1);
    }
    updateResources();
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function'){
    window.refresh=function(){
      const result=baseRefresh.apply(this,arguments);
      syncRepairSpend();
      return result;
    };
  }

  const phaseObserver=new MutationObserver(()=>{
    const now=!!window.combatTurn?.resolving;
    if(!wasResolving&&now){
      syncRepairSpend();
      for(const key of repairLedger)committedRepairs.add(key);
    }
    wasResolving=now;
  });
  phaseObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('combat-ended',event=>{
    syncRepairSpend();
    Adventure.recordCombatResult(event.detail||{});
    queueMicrotask(()=>{
      const actions=document.querySelector('.v11-outcome-actions');if(!actions)return;
      actions.innerHTML='';actions.classList.add('v28-final-actions');
      const back=document.createElement('button');back.type='button';back.className='v28-return';back.textContent='RETURN TO MAP';
      back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.location.href=worldUrl();});
      actions.appendChild(back);
    });
  });

  const endButton=document.querySelector('.v28-end-combat');
  endButton?.addEventListener('click',event=>{
    if(endButton.textContent!=='CONFIRM END?')return;
    event.preventDefault();event.stopImmediatePropagation();Adventure.clearPendingCombat();window.location.href=worldUrl();
  },true);
})();