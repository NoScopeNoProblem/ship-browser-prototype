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
    quick.title=!carp?"Carpenter's Workshop is destroyed":missing===0?'No damage to repair':timber<missing?`Need ${missing} Timber; ${timber} aboard`:`At-sea quick repair: restore all ${missing} missing blips for ${missing} Timber`;
    const mast=Voyage.roomHealth('p_mast',state);if(sail&&mast?.hp<=0){sail.disabled=true;sail.title='Main Mast destroyed — repair it in Ship Management before sailing.';}
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

  function injectScore(){
    if(!modal||modal.dataset.v32Score==='1')return;
    const h2=modal.querySelector('h2');if(!h2||h2.textContent.trim()!=='PARADISE BAY')return;
    const state=Voyage.load(),score=Voyage.scoreSummary(state),stats=state.scoreStats||{};
    const card=document.createElement('div');card.className='v32-final-score';
    card.innerHTML=`<span>PROTOTYPE SCORE LEDGER</span><div><b>Combat won</b><strong>10 × ${Number(stats.combatWins)||0} = ${score.baseCombatScore}</strong></div><div><b>No-damage finishes</b><strong>5 × ${Number(stats.noDamageCombats)||0} = ${score.noDamageBonus}</strong></div><div><b>Perfect combats</b><strong>5 × ${Number(stats.perfectCombats)||0} = ${score.perfectBonus}</strong></div><div class="total"><b>CURRENT IMPLEMENTED SCORE</b><strong>${score.total}</strong></div><small>This prototype ledger currently scores only implemented combat categories; voyage/discovery categories remain later.</small>`;
    const actionRow=modal.querySelector('.modal-actions');modal.insertBefore(card,actionRow||null);modal.dataset.v32Score='1';
  }

  function afterUiChange(){decorateMarket();injectScore();updateQuickRepair();}
  const observer=new MutationObserver(afterUiChange);if(modal)observer.observe(modal,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(updateQuickRepair,0));
  window.addEventListener('adventure-storage-changed',afterUiChange);
  window.addEventListener('adventure-ship-changed',afterUiChange);
  afterUiChange();
})();