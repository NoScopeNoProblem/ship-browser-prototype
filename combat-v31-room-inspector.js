(() => {
  const stageEl=document.getElementById('combatStage');
  const app=document.querySelector('.app');
  if(!stageEl||!app)return;

  const Adventure=window.HighSeasAdventure||null;
  const Storage=window.HighSeasShipStorage||null;
  let hovered=null;
  let locked=null;

  const panel=document.createElement('section');
  panel.className='panel v31-room-inspector';
  panel.innerHTML=`
    <div class="v31-inspector-identity">
      <div class="eyebrow">ROOM / SYSTEM</div>
      <div class="v31-inspector-title">Select or hover a room</div>
      <div class="v31-inspector-sub">Room information stays here while you inspect the battle.</div>
    </div>
    <div class="v31-inspector-details">
      <div class="eyebrow">DETAILS</div>
      <div class="v31-inspector-copy">Hover either ship to inspect weapons, support verbs and known room information.</div>
    </div>
    <div class="v31-inspector-storage">
      <div class="eyebrow">STORAGE</div>
      <div class="v31-inspector-slots"><span class="v31-empty-note">No storage selected.</span></div>
    </div>`;
  const statusPanel=document.querySelector('.status-panel');
  if(statusPanel)statusPanel.insertAdjacentElement('afterend',panel);else app.appendChild(panel);

  const titleEl=panel.querySelector('.v31-inspector-title');
  const subEl=panel.querySelector('.v31-inspector-sub');
  const copyEl=panel.querySelector('.v31-inspector-copy');
  const slotsEl=panel.querySelector('.v31-inspector-slots');

  function refFromTarget(target){
    const room=target?.closest?.('.room[data-side]');
    if(room)return {side:room.dataset.side,id:room.dataset.id,kind:'room'};
    const mast=target?.closest?.('.mast-box');
    if(mast?.id==='playerMastBox')return {side:'player',id:playerMast.id,kind:'mast'};
    if(mast?.id==='enemyMastBox')return {side:'enemy',id:enemyMast.id,kind:'mast'};
    return null;
  }

  function entityFor(ref){
    if(!ref)return null;
    if(ref.kind==='mast')return ref.side==='player'?playerMast:enemyMast;
    return sourceEntity(ref.side,ref.id);
  }

  function hiddenEnemy(ref,entity){
    return ref?.side==='enemy'&&ref.kind==='room'&&(entity?.name==='???'||(entity?.hidden&&!entity?.revealed));
  }

  function rangeText(range){
    if(range===0)return 'opposite column only';
    if(range===1)return 'opposite ±1 column';
    if(range===2)return 'opposite ±2 columns';
    return `±${range} columns`;
  }

  function weaponDescription(entity){
    const weapon=weapons?.[entity.weapon];
    if(!weapon)return 'Weapon data unavailable.';
    const cadence=weapon.cadence||{};
    const reload=Math.max(0,Number(cadence.reloadTurns)||0);
    const shots=Math.max(1,Number(cadence.shotsBeforeReload)||1);
    const initial=Math.max(0,Number(cadence.initialLoadTurns)||0);
    const damage=entity.weapon==='chain'&&weapon.mastDamage
      ? `${weapon.damage} room / ${weapon.mastDamage} Mast damage`
      : `${weapon.damage} damage`;
    const tempo=shots>1?`${shots} shots before a ${reload}-turn reload`:`${reload}-turn reload after firing`;
    return `${damage}. Range: ${rangeText(weapon.range??weapon.arc??0)}. ${tempo}.${initial?` Starts combat loading for ${initial} turn${initial===1?'':'s'}.`:''}`;
  }

  function roomDescription(entity){
    if(entity.weapon)return weaponDescription(entity);
    if(entity.kind==='storage')return 'General Hold. Three storage slots. Each slot holds one stack: up to 12 Food, 3 Cannonballs or 4 Timber.';
    if(entity.kind==='magazine')return 'Magazine. Two Cannonball-only slots (6 balls total at normal capacity). QUICK LOAD readies one orthogonally adjacent loading Gun Deck. Destroying it damages surrounding rooms.';
    if(entity.kind==='carpenter')return 'Carpenter. REPAIR restores 1 pip to this room or an adjacent living room. In Adventure combat, each repair now spends 1 Timber from voyage stores.';
    if(entity.kind==='sailmaster')return 'Sailmaster. RESET SAILS clears the Mast’s Resetting cooldown so Manoeuvre can be used again this turn.';
    if(entity.kind==='boatswain')return 'Boatswain. BRACE protects one reachable room or the Mast from the first 1 incoming damage this turn.';
    return entity.sub||'No active combat verb.';
  }

  function itemName(id){return Storage?.ITEMS?.[id]?.name||id;}
  function stackSize(id){return Storage?.ITEMS?.[id]?.stackSize||'?';}

  function renderSlots(ref,entity){
    slotsEl.innerHTML='';
    if(hiddenEnemy(ref,entity)){
      slotsEl.innerHTML='<span class="v31-empty-note">Unknown. Deal damage to reveal more information.</span>';
      return;
    }
    if(ref.side==='enemy'){
      const rule=Storage?.roomRule?.(entity.kind);
      if(!rule){slotsEl.innerHTML='<span class="v31-empty-note">No storage.</span>';return;}
      slotsEl.innerHTML=`<span class="v31-empty-note">${rule.slots} ${rule.slots===1?'slot':'slots'} · ${rule.accepts.map(itemName).join(' / ')}. Enemy contents remain unknown.</span>`;
      return;
    }

    const snapshot=Adventure?.getRoomStorage?.(entity.id);
    const rule=Storage?.roomRule?.(entity.kind);
    if(!snapshot){
      if(rule)slotsEl.innerHTML=`<span class="v31-empty-note">${rule.slots} ${rule.slots===1?'slot':'slots'} · ${rule.accepts.map(itemName).join(' / ')}. No Adventure cargo is linked to this Ship Battler room.</span>`;
      else slotsEl.innerHTML='<span class="v31-empty-note">No storage.</span>';
      return;
    }

    snapshot.slots.forEach((slot,index)=>{
      const chip=document.createElement('div');chip.className='v31-slot';
      if(slot){
        chip.innerHTML=`<span class="v31-slot-index">${index+1}</span><b>${itemName(slot.item)}</b><span>${slot.quantity} / ${stackSize(slot.item)}</span>`;
      }else{
        chip.classList.add('empty');
        const accepts=snapshot.accepts.length===1?itemName(snapshot.accepts[0]):'General';
        chip.innerHTML=`<span class="v31-slot-index">${index+1}</span><b>Empty</b><span>${accepts}</span>`;
      }
      slotsEl.appendChild(chip);
    });
  }

  function renderInspector(){
    document.querySelectorAll('.v31-inspected').forEach(el=>el.classList.remove('v31-inspected'));
    const ref=hovered||locked;
    const entity=entityFor(ref);
    if(!ref||!entity){
      titleEl.textContent='Select or hover a room';
      subEl.textContent='Click locks room information; hovering temporarily inspects another room.';
      copyEl.textContent='Weapons show damage, range and cadence. Support rooms explain their verb. Friendly storage shows its actual voyage contents.';
      slotsEl.innerHTML='<span class="v31-empty-note">No storage selected.</span>';
      return;
    }
    getEntityElement(ref.side,entity.id)?.classList.add('v31-inspected');

    if(hiddenEnemy(ref,entity)){
      titleEl.textContent='???';
      subEl.textContent='Unknown enemy room';
      copyEl.textContent='Deal damage to reveal more information.';
      renderSlots(ref,entity);
      return;
    }

    if(ref.kind==='mast'){
      titleEl.textContent='MAIN MAST';
      subEl.textContent=ref.side==='player'?'Your manoeuvre system':'Enemy manoeuvre structure';
      copyEl.textContent=ref.side==='player'
        ? `Integrity ${entity.hp}/${entity.max}. Manoeuvre shifts alignment by one track cell when READY. Destroying the Mast disables movement.`
        : `Integrity ${entity.hp}/${entity.max}. A Mast is a separate targetable structure; Chain deals extra Mast damage.`;
      slotsEl.innerHTML='<span class="v31-empty-note">No storage.</span>';
      return;
    }

    const weapon=entity.weapon?weapons?.[entity.weapon]:null;
    titleEl.textContent=weapon?.name||entity.name||entity.kind.toUpperCase();
    subEl.textContent=ref.side==='player'?'Friendly room':`Known enemy room · ${entity.hp}/${entity.max} integrity`;
    copyEl.textContent=roomDescription(entity);
    renderSlots(ref,entity);
  }

  function sameRef(a,b){return !!a&&!!b&&a.side===b.side&&a.id===b.id&&a.kind===b.kind;}

  stageEl.addEventListener('pointerover',event=>{
    const ref=refFromTarget(event.target);if(!ref)return;
    const related=refFromTarget(event.relatedTarget);
    if(sameRef(ref,related))return;
    hovered=ref;renderInspector();
  },true);
  stageEl.addEventListener('pointerout',event=>{
    const ref=refFromTarget(event.target);if(!ref)return;
    const related=refFromTarget(event.relatedTarget);
    if(sameRef(ref,related))return;
    if(sameRef(hovered,ref))hovered=null;
    renderInspector();
  },true);
  stageEl.addEventListener('click',event=>{
    const ref=refFromTarget(event.target);if(!ref)return;
    locked=ref;renderInspector();
  },false);

  function decorateFriendlyStorageLabels(){
    for(const entity of playerRooms||[]){
      const rule=Storage?.roomRule?.(entity.kind);if(!rule)continue;
      const el=getEntityElement('player',entity.id);if(!el)continue;
      let cap=el.querySelector('.room-capacity');
      if(!cap){cap=document.createElement('div');cap.className='room-capacity';el.appendChild(cap);}
      const snapshot=Adventure?.getRoomStorage?.(entity.id);
      if(!snapshot){cap.textContent=`${rule.slots} SLOT${rule.slots===1?'':'S'}`;continue;}
      if(entity.kind==='storage'){
        const used=snapshot.slots.filter(Boolean).length;
        cap.textContent=`${used} / ${snapshot.slotCount} SLOTS`;
      }else if(entity.kind==='magazine'){
        const qty=snapshot.slots.reduce((sum,slot)=>sum+(slot?.item==='cannonballs'?Number(slot.quantity)||0:0),0);
        cap.textContent=`BALLS ${qty} / 6`;
      }else if(entity.kind==='carpenter'){
        const qty=snapshot.slots.reduce((sum,slot)=>sum+(slot?.item==='timber'?Number(slot.quantity)||0:0),0);
        cap.textContent=`TIMBER ${qty} / 4`;
      }
    }
  }

  function fixFleeLabel(){
    const row=document.getElementById('trackRow');if(!row||typeof PLAYER_MAST_MIN==='undefined')return;
    const cells=[...row.children];if(!cells.length)return;
    const fleeIndex=Math.max(0,Number(PLAYER_MAST_MIN)-1);
    const destination=cells[fleeIndex];if(!destination)return;
    cells.forEach(cell=>cell.classList.remove('v31-flee-destination'));
    const oldEdge=cells[Number(PLAYER_MAST_MIN)];
    if(oldEdge&&oldEdge!==destination)oldEdge.classList.remove('v30-flee-track');
    destination.classList.add('v30-flee-track','v31-flee-destination');
    const label=row.querySelector('.v30-flee-label');
    if(label){
      if(label.parentElement!==destination)destination.appendChild(label);
      label.title='Moving into this track space flees the engagement and ends combat.';
    }
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function'){
    window.refresh=function(){
      const result=baseRefresh.apply(this,arguments);
      fixFleeLabel();
      decorateFriendlyStorageLabels();
      renderInspector();
      return result;
    };
  }
  window.addEventListener('adventure-storage-changed',()=>{decorateFriendlyStorageLabels();renderInspector();});
  fixFleeLabel();
  decorateFriendlyStorageLabels();
  renderInspector();
})();