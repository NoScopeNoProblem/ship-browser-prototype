(() => {
  const Adventure=window.HighSeasAdventure;if(!Adventure)return;
  const modal=document.getElementById('modalCard');if(!modal)return;

  function reloadIntoPort(){
    try{sessionStorage.setItem('highSeasReopenPort','1');}catch{}
    window.location.reload();
  }

  function makeButton(label,disabled,onClick){
    const b=document.createElement('button');b.type='button';b.className='modal-button buy medicine-trade-button';b.textContent=label;b.disabled=disabled;b.addEventListener('click',onClick);return b;
  }

  function inject(){
    const counter=modal.querySelector('.market-counter');if(!counter||counter.querySelector('[data-medicine-trade]'))return;
    const state=Adventure.load();
    if(state.currentNodeId!=='seabrook'&&state.currentNodeId!=='sunreach')return;

    const row=document.createElement('div');row.className='market-row medicine-market-row';row.dataset.medicineTrade='1';
    const info=document.createElement('div');
    const owned=document.createElement('div');owned.className='market-owned';owned.innerHTML=`<span>ON HAND</span><b>${Number(state.stores.medicine)||0}</b>`;

    if(state.currentNodeId==='seabrook'){
      info.innerHTML='<strong><span class="medicine-herb">🌿</span> MEDICINE</strong><span>1 crate · 1 coin · Hold only</span><small>Sunreach pays 3 coin within 8 days. Days 9–10 pay 2; older medicine pays 1.</small>';
      row.append(info,owned,makeButton('BUY 1 · 1 COIN',state.coins<1,()=>{const r=Adventure.buyMedicine();if(r.ok)reloadIntoPort();}));
    }else{
      const offer=Adventure.medicineOffer(state);
      const price=offer?.price||0;
      const freshness=offer?offer.daysLeft>=0?`${offer.daysLeft}d left at premium`:state.day<=offer.lot.graceUntilDay?'grace price':'stale':'No crate aboard';
      info.innerHTML=`<strong><span class="medicine-herb">🌿</span> MEDICINE BUYER</strong><span>${offer?`Next crate pays ${price} coin`:'Bring Medicine from Seabrook'}</span><small>${freshness}</small>`;
      row.append(info,owned,makeButton(offer?`SELL 1 · +${price} COIN`:'NOTHING TO SELL',!offer,()=>{const r=Adventure.sellMedicine();if(r.ok)reloadIntoPort();}));
    }
    counter.appendChild(row);
  }

  const observer=new MutationObserver(inject);observer.observe(modal,{childList:true,subtree:true});
  window.addEventListener('adventure-storage-changed',inject);
  inject();

  let reopen=false;try{reopen=sessionStorage.getItem('highSeasReopenPort')==='1';if(reopen)sessionStorage.removeItem('highSeasReopenPort');}catch{}
  if(reopen)setTimeout(()=>document.getElementById('openLocation')?.click(),40);
})();
