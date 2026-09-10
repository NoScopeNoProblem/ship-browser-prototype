(() => {
  const Adventure=window.HighSeasAdventure,Voyage=window.HighSeasShipVoyage,World=window.HighSeasWorldDefinition;
  if(!Adventure||!Voyage||!World)return;
  Voyage.load();
  const modal=document.getElementById('modalCard'),openLocation=document.getElementById('openLocation'),sail=document.getElementById('sailNext');

  const quick=document.createElement('button');quick.type='button';quick.className='small-action v32-quick-repair';
  openLocation?.insertAdjacentElement('afterend',quick);
  function updateQuickRepair(){
    const state=Voyage.load(),missing=Voyage.missingBlips(state),timber=Number(state.stores?.timber)||0,carp=Voyage.carpenterFunctional(state);
    quick.textContent=missing?`CARPENTER · REPAIR ALL · 🪵 ${missing}`:'CARPENTER · SHIP FULLY REPAIRED';
    quick.disabled=!carp||missing===0||timber<missing;
    quick.title=!carp?"Carpenter's Workshop is destroyed":missing===0?'No damage to repair':timber<missing?`Need ${missing} Timber; ${timber} aboard`:`At-sea quick repair: repair all ${missing} remaining ship damage for ${missing} Timber`;
    const mast=Voyage.roomHealth('p_mast',state);
    if(sail&&mast?.hp<=0){sail.disabled=true;sail.title='Main Mast destroyed — repair it in Ship Management before sailing.';}
    else if(sail){sail.title='';const next=document.getElementById('nextLeg');if(next&&next.textContent.trim()!=='—'&&state.status==='active')sail.disabled=false;}
  }
  quick.addEventListener('click',()=>{const result=Voyage.repairAll();if(!result?.ok&&result?.reason)quick.title=result.reason;updateQuickRepair();const state=Voyage.load();const t=document.getElementById('timberValue');if(t)t.textContent=state.stores.timber;});

  function itemFromRow(row){
    const label=row.querySelector('strong')?.textContent?.toLowerCase()||'';
    if(label.includes('cannonball'))return ['cannonballs',World.market?.cannonballs?.amount||3];
    if(label.includes('timber'))return ['timber',World.market?.timber?.amount||4];
    if(label.includes('food'))return ['food',World.market?.food?.amount||12];
    if(label.includes('medicine')&&!label.includes('buyer'))return ['medicine',1];
    return null;
  }
  function decorateMarket(){
    if(!modal)return;
    const state=Voyage.load();
    const copy=modal.querySelector('.modal-head p');if(copy&&copy.textContent.includes('Storage limits are not enforced'))copy.textContent=copy.textContent.replace('Storage limits are not enforced in this map pass.','Purchases now respect fitted storage capacity; Auto-balance checks use total quantities and virtual compacting.');
    modal.querySelectorAll('.market-row').forEach(row=>{
      const entry=itemFromRow(row);if(!entry)return;const [itemId,amount]=entry,button=row.querySelector('button.buy,.medicine-trade-button');if(!button)return;
      const fit=Voyage.maxAdditional(itemId,amount,state),capacityBlocked=fit<amount;
      if(capacityBlocked){button.disabled=true;button.dataset.capacityBlocked='1';button.title=`Not enough compatible storage. ${fit}/${amount} would fit. ${state.shipSettings?.autoBalanceCargo?'Auto-balance capacity uses total quantities and virtual compacting.':''}`;}
      else if(button.dataset.capacityBlocked==='1'){button.disabled=false;delete button.dataset.capacityBlocked;button.title='';}
    });
  }
  modal?.addEventListener('click',event=>{
    const button=event.target.closest('button.buy,.medicine-trade-button');if(!button||button.disabled)return;
    setTimeout(()=>{const state=Voyage.load();if(state.shipSettings?.autoBalanceCargo)Voyage.rebalance();decorateMarket();updateQuickRepair();},0);
  });

  const itemNames={food:'Food',cannonballs:'Cannonballs',timber:'Timber',medicine:'Medicine'};
  function rewardDefinitionText(reward={}){
    const icons=window.HighSeasShipStorage?.ITEMS||{},parts=[];
    if(reward.coins)parts.push(`🪙 ${reward.coins} Coin`);
    for(const [id,q] of Object.entries(reward.stores||{}))parts.push(`${icons[id]?.icon||'•'} ${q} ${itemNames[id]||id}`);
    return parts.join(' · ')||'No stores';
  }
  function rewardParts(summary={}){
    const icons=window.HighSeasShipStorage?.ITEMS||{},parts=[];
    if(summary.coins)parts.push(`🪙 +${summary.coins} Coin`);
    for(const [id,q] of Object.entries(summary.accepted||{}))if(Number(q)>0)parts.push(`${icons[id]?.icon||'•'} +${q} ${itemNames[id]||id}`);
    return parts;
  }
  function decorateExploration(){
    if(!modal)return;
    const explore=[...modal.querySelectorAll('.modal-button')].find(b=>b.textContent.trim()==='EXPLORE');if(!explore)return;
    const state=Voyage.load(),reward=World.explorationRewards?.[state.currentNodeId];if(!reward)return;
    const copy=modal.querySelector('.modal-head p');
    if(copy&&!copy.dataset.v33RewardPreview){copy.dataset.v33RewardPreview='1';copy.textContent=`Explore this location to recover ${rewardDefinitionText(reward)}. Cargo is loaded only where it fits.`;}
  }
  function updateWorldHud(){
    const state=Voyage.load(),pairs={dayValue:state.day,coinValue:state.coins,foodValue:state.stores?.food,ballValue:state.stores?.cannonballs,timberValue:state.stores?.timber};
    for(const [id,value] of Object.entries(pairs)){const el=document.getElementById(id);if(el&&value!==undefined)el.textContent=value;}
  }
  function applyExplorationReward(button){
    if(!button||button.textContent.trim()!=='EXPLORE')return;
    const before=Voyage.load(),nodeId=before.currentNodeId,reward=World.explorationRewards?.[nodeId];if(!reward)return;
    // world.js resolves the POI first on the target click. Apply its physical reward afterwards so
    // the existing world closure keeps its resolved-node state while Adventure.save's revision
    // merge protects this newer cargo state on the next world save.
    setTimeout(()=>{
      const summary=Voyage.acceptReward(reward),accepted=rewardParts(summary),left=Object.entries(summary.leftBehind||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>`${q} ${itemNames[id]||id}`);
      updateWorldHud();
      const copy=modal?.querySelector('.modal-head p');
      if(copy){const flavour=reward.copy?`${reward.copy} `:'';copy.textContent=`${flavour}${accepted.length?`Recovered: ${accepted.join(' · ')}.`:'Nothing could be loaded.'}${left.length?` Left behind for lack of space: ${left.join(', ')}.`:''}`;}
    },0);
  }
  document.addEventListener('click',event=>{const b=event.target.closest?.('.modal-button');if(b)applyExplorationReward(b);});

  function injectScore(){
    if(!modal||modal.dataset.v32Score==='1')return;
    const h2=modal.querySelector('h2');if(!h2||h2.textContent.trim()!=='PARADISE BAY')return;
    const state=Voyage.load(),score=Voyage.scoreSummary(state),stats=state.scoreStats||{};
    const card=document.createElement('div');card.className='v32-final-score';
    card.innerHTML=`<span>PROTOTYPE SCORE LEDGER</span><div><b>Combat won</b><strong>10 × ${Number(stats.combatWins)||0} = ${score.baseCombatScore}</strong></div><div><b>No-damage finishes</b><strong>5 × ${Number(stats.noDamageCombats)||0} = ${score.noDamageBonus}</strong></div><div><b>Perfect combats</b><strong>5 × ${Number(stats.perfectCombats)||0} = ${score.perfectBonus}</strong></div><div class="total"><b>CURRENT IMPLEMENTED SCORE</b><strong>${score.total}</strong></div><small>This prototype ledger currently scores only implemented combat categories; voyage/discovery categories remain later.</small>`;
    const actionRow=modal.querySelector('.modal-actions');modal.insertBefore(card,actionRow||null);modal.dataset.v32Score='1';
  }

  function afterUiChange(){decorateMarket();decorateExploration();injectScore();updateQuickRepair();}
  const observer=new MutationObserver(afterUiChange);if(modal)observer.observe(modal,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(updateQuickRepair,0));
  window.addEventListener('adventure-storage-changed',afterUiChange);
  window.addEventListener('adventure-ship-changed',afterUiChange);
  afterUiChange();
})();