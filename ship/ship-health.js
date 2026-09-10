(() => {
  const Adventure=window.HighSeasAdventure, Voyage=window.HighSeasShipVoyage;
  if(!Adventure||!Voyage)return;
  const grid=document.getElementById('shipGrid'),mast=document.getElementById('mastCard'),side=document.querySelector('.management-side');
  if(!grid||!mast||!side)return;

  function pips(health){
    if(!health)return '';
    let html='';for(let i=0;i<health.max;i++)html+=`<span class="${i<health.hp?'live':'lost'}">${i<health.hp?'♥':'♡'}</span>`;
    return html;
  }
  function repairButton(id,health,state){
    if(!health||health.hp>=health.max)return null;
    const button=document.createElement('button');button.type='button';button.className='v32-repair-one';button.textContent='REPAIR +1 · 🪵 1';
    const carpenter=Voyage.carpenterFunctional(state),timber=Number(state.stores?.timber)||0;
    button.disabled=!carpenter||timber<1;
    button.title=!carpenter?"Requires a working Carpenter's Workshop":timber<1?'Requires 1 Timber':'Repair one damage blip at sea for 1 Timber';
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const result=Voyage.repairOne(id);if(!result?.ok&&result?.reason)button.title=result.reason;decorate();});
    return button;
  }
  function decorateRoom(roomEl,id,state){
    roomEl.querySelectorAll('.v32-health-strip,.v32-repair-one').forEach(el=>el.remove());
    const health=Voyage.roomHealth(id,state);if(!health)return;
    roomEl.classList.toggle('v32-damaged',health.hp<health.max);roomEl.classList.toggle('v32-destroyed',health.hp<=0);
    const strip=document.createElement('div');strip.className='v32-health-strip';strip.innerHTML=`<span class="v32-health-label">INTEGRITY</span><span class="v32-health-pips">${pips(health)}</span>`;roomEl.appendChild(strip);
    const button=repairButton(id,health,state);if(button)roomEl.appendChild(button);
    if(health.hp<=0&&id.startsWith('p_hold'))roomEl.title='DESTROYED HOLD — all cargo stored here was lost. Repair the room before it can carry stores again.';
  }
  function decorateMast(state){
    mast.querySelectorAll('.v32-health-pips,.v32-repair-one').forEach(el=>el.remove());
    const old=mast.querySelector(':scope > b');if(old)old.style.display='none';
    const health=Voyage.roomHealth('p_mast',state),pip=document.createElement('span');pip.className='v32-health-pips mast-pips';pip.innerHTML=pips(health);mast.appendChild(pip);
    mast.classList.toggle('v32-damaged',health.hp<health.max);mast.classList.toggle('v32-destroyed',health.hp<=0);
    const button=repairButton('p_mast',health,state);if(button)mast.appendChild(button);
  }

  const repairCard=document.createElement('section');repairCard.className='v32-repair-card';
  const balanceCard=document.createElement('section');balanceCard.className='v32-balance-card';
  const first=side.firstElementChild;side.insertBefore(repairCard,first);side.insertBefore(balanceCard,first);

  function renderControls(state){
    const missing=Voyage.missingBlips(state),timber=Number(state.stores?.timber)||0,carpenter=Voyage.carpenterFunctional(state);
    repairCard.innerHTML=`<span class="side-kicker">AT-SEA REPAIRS</span><strong>Carpenter quick repair</strong><p>${missing?`${missing} damage blip${missing===1?'':'s'} remain. Each costs 1 Timber.`:'The Wayward is fully repaired.'}</p><button type="button" class="v32-repair-all">REPAIR ALL${missing?` · 🪵 ${missing}`:''}</button>`;
    const all=repairCard.querySelector('button');all.disabled=!carpenter||missing===0||timber<missing;
    all.title=!carpenter?"Carpenter's Workshop must be functional":missing===0?'No damage to repair':timber<missing?`Need ${missing} Timber; ${timber} aboard`:`Repair all ${missing} missing blips for ${missing} Timber`;
    all.addEventListener('click',()=>{Voyage.repairAll();decorate();});

    balanceCard.innerHTML=`<div><span class="side-kicker">STORAGE RISK</span><strong>Auto-balance between Holds</strong><p>When there is space, resources split between cargo Holds so one destroyed Hold does not wipe the whole stack. Shops still calculate capacity from total quantities and virtual compacting, so this balancing never creates a false “no space” result.</p></div><label class="toggle v32-balance-toggle" title="When there is space, resources split between cargo Holds. Shop and reward capacity checks look at total quantities and how tightly they could be compacted, not the current split."><input type="checkbox"><span></span></label><button type="button" class="v32-balance-now">BALANCE NOW</button>`;
    const toggle=balanceCard.querySelector('input');toggle.checked=!!state.shipSettings?.autoBalanceCargo;
    toggle.addEventListener('change',()=>{Voyage.setAutoBalance(toggle.checked);decorate();});
    balanceCard.querySelector('.v32-balance-now').addEventListener('click',()=>{Voyage.rebalance();decorate();});
  }

  function decorate(){
    const state=Voyage.load();
    grid.querySelectorAll('.room-card[data-room-id]').forEach(el=>decorateRoom(el,el.dataset.roomId,state));
    decorateMast(state);renderControls(state);
  }

  document.getElementById('sortNow')?.addEventListener('click',event=>{
    const state=Voyage.load();if(!state.shipSettings?.autoBalanceCargo)return;
    event.preventDefault();event.stopImmediatePropagation();Voyage.rebalance();decorate();
  },true);

  window.addEventListener('adventure-storage-changed',()=>setTimeout(decorate,0));
  window.addEventListener('adventure-ship-changed',()=>setTimeout(decorate,0));
  setTimeout(()=>{const state=Voyage.load();if(state.shipSettings?.autoBalanceCargo)Voyage.rebalance();decorate();},0);
})();