(() => {
  const stageEl=document.getElementById('combatStage');
  const app=document.querySelector('.app');
  if(!stageEl||!app)return;

  const Adventure=window.HighSeasAdventure||null;
  const Storage=window.HighSeasShipStorage||null;
  const isAdventure=new URLSearchParams(window.location.search).get('mode')==='adventure';
  let hovered=null,locked=null;

  const statusPanel=document.querySelector('.status-panel');
  const panel=document.createElement('section');
  panel.className='panel v31-room-inspector';
  panel.innerHTML=`
    <div class="v31-inspector-art art-hold" aria-hidden="true"></div>
    <div class="v31-inspector-identity">
      <div class="eyebrow">ROOM / SYSTEM</div>
      <div class="v31-inspector-title">Select or hover a room</div>
      <div class="v31-inspector-sub">Room information stays here while you inspect the battle.</div>
      <div class="v31-inspector-copy">Weapons show damage, range and cadence. Support rooms explain their verb. Friendly storage shows actual voyage contents.</div>
    </div>
    <div class="v31-live-effect"></div>
    <div class="v31-inspector-storage">
      <div class="eyebrow">STORAGE</div>
      <div class="v31-inspector-slots"><span class="v31-empty-note">No storage selected.</span></div>
    </div>`;
  const live=panel.querySelector('.v31-live-effect');
  if(statusPanel){
    [...statusPanel.children].forEach(child=>live.appendChild(child));
    statusPanel.replaceWith(panel);
  }else app.appendChild(panel);

  const artEl=panel.querySelector('.v31-inspector-art');
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
  function combatSelectionRef(){
    const utilityId=window.combatUtility?.selected;
    if(utilityId)return {side:'player',id:utilityId,kind:'room'};
    if(state?.selectedWeaponId)return {side:'player',id:state.selectedWeaponId,kind:'room'};
    return null;
  }
  function entityFor(ref){if(!ref)return null;if(ref.kind==='mast')return ref.side==='player'?playerMast:enemyMast;return sourceEntity(ref.side,ref.id);}
  function hiddenEnemy(ref,entity){return ref?.side==='enemy'&&ref.kind==='room'&&(entity?.name==='???'||(entity?.hidden&&!entity?.revealed));}
  function sameRef(a,b){return !!a&&!!b&&a.side===b.side&&a.id===b.id&&a.kind===b.kind;}
  function rangeText(range){if(range===0)return 'opposite column';if(range===1)return 'opposite ±1 column';if(range===2)return 'opposite ±2 columns';return `±${range} columns`;}
  function itemInfo(id){return Storage?.ITEMS?.[id]||{name:id,icon:'•',stackSize:'?'};}

  function artClass(entity,ref){
    if(ref?.kind==='mast')return 'art-mast';
    if(entity?.weapon==='heavy')return 'art-heavy';
    if(entity?.weapon)return 'art-standard';
    if(entity?.kind==='magazine')return 'art-magazine';
    if(entity?.kind==='carpenter'||entity?.kind==='boatswain')return 'art-carpenter';
    if(entity?.kind==='storage')return 'art-hold';
    return 'art-mast';
  }
  function setArt(entity,ref){artEl.className=`v31-inspector-art ${hiddenEnemy(ref,entity)?'art-unknown':artClass(entity,ref)}`;}

  function weaponDescription(entity){
    const weapon=weapons?.[entity.weapon];if(!weapon)return 'Weapon data unavailable.';
    const cadence=weapon.cadence||{},reload=Math.max(0,Number(cadence.reloadTurns)||0),shots=Math.max(1,Number(cadence.shotsBeforeReload)||1),initial=Math.max(0,Number(cadence.initialLoadTurns)||0);
    const damage=entity.weapon==='chain'&&weapon.mastDamage?`${weapon.damage} room / ${weapon.mastDamage} Mast damage`:`${weapon.damage} damage`;
    const tempo=shots>1?`${shots} shots before a ${reload}-turn reload`:`${reload}-turn reload after firing`;
    return `${damage}. Range: ${rangeText(weapon.range??weapon.arc??0)}. ${tempo}.${initial?` Starts combat loading for ${initial} turn${initial===1?'':'s'}.`:''}`;
  }
  function roomDescription(entity){
    if(entity.weapon)return weaponDescription(entity);
    if(entity.kind==='storage')return 'General Storage. Three cargo slots. Each slot holds up to 12 Food, 3 Cannonballs, 4 Timber, or one Medicine crate. CARGO LOST: destroying this Hold destroys everything stored in it.';
    if(entity.kind==='magazine')return 'Magazine. Two Cannonball-only slots, up to 3 balls in each. QUICK LOAD readies one orthogonally adjacent loading Gun Deck. Destroying the Magazine damages surrounding rooms.';
    if(entity.kind==='carpenter')return 'Carpenter. One Timber-only slot holding up to 4. REPAIR restores 1 ship damage to a living room and spends 1 Timber in Adventure combat.';
    if(entity.kind==='sailmaster')return 'Sailmaster. RESET SAILS clears the Mast Resetting cooldown so Manoeuvre can be used again this turn.';
    if(entity.kind==='boatswain')return 'Boatswain. One Timber-only slot holding up to 4. BRACE protects one reachable room or the Mast from the first 1 incoming damage this turn and spends 1 Timber in Adventure combat. Once prepared, Brace still applies even if the Boatswain is destroyed before enemy fire.';
    return entity.sub||'No active combat verb.';
  }

  function slotChip(slot,index){
    const chip=document.createElement('div');chip.className=`v31-slot${slot?'':' empty'}`;
    if(slot){const item=itemInfo(slot.item);chip.innerHTML=`<span class="v31-slot-index">${index+1}</span><span class="v31-item-icon">${item.icon}</span><b>${item.name}</b><span class="v31-item-count">×${slot.quantity}</span>`;}
    else chip.innerHTML=`<span class="v31-slot-index">${index+1}</span><span class="v31-item-icon">·</span><b>Empty</b>`;
    return chip;
  }

  function renderSlots(ref,entity){
    slotsEl.innerHTML='';
    if(hiddenEnemy(ref,entity)){slotsEl.innerHTML='<span class="v31-empty-note">??? · Deal damage to reveal more information.</span>';return;}
    const rule=Storage?.roomRule?.(entity.kind);
    if(!rule){slotsEl.innerHTML='<span class="v31-empty-note">No storage.</span>';return;}
    if(ref.side==='enemy'){
      slotsEl.innerHTML=`<span class="v31-empty-note">${rule.slots} ${rule.slots===1?'slot':'slots'} · ${rule.accepts.map(id=>itemInfo(id).name).join(' / ')}. Enemy contents remain unknown.</span>`;return;
    }
    if(!isAdventure){
      for(let i=0;i<rule.slots;i++)slotsEl.appendChild(slotChip(null,i));
      const note=document.createElement('span');note.className='v31-empty-note';note.textContent='Standalone Ship Battler does not consume voyage cargo.';slotsEl.appendChild(note);return;
    }
    const snapshot=Adventure?.getRoomStorage?.(entity.id);
    if(!snapshot){slotsEl.innerHTML='<span class="v31-empty-note">No linked voyage storage.</span>';return;}
    snapshot.slots.forEach((slot,index)=>slotsEl.appendChild(slotChip(slot,index)));
  }

  function renderInspector(){
    document.querySelectorAll('.v31-inspected').forEach(el=>el.classList.remove('v31-inspected'));
    const ref=hovered||combatSelectionRef()||locked,entity=entityFor(ref);
    if(!ref||!entity){
      artEl.className='v31-inspector-art art-hold';titleEl.textContent='Select or hover a room';subEl.textContent='Click locks information; hovering temporarily inspects another room.';copyEl.textContent='Weapons show damage, range and cadence. Support rooms explain their verb. Friendly storage shows actual voyage contents.';slotsEl.innerHTML='<span class="v31-empty-note">No storage selected.</span>';return;
    }
    getEntityElement(ref.side,entity.id)?.classList.add('v31-inspected');setArt(entity,ref);
    if(hiddenEnemy(ref,entity)){
      titleEl.textContent='???';subEl.textContent='Unknown enemy room';copyEl.textContent='Deal damage to reveal more information.';renderSlots(ref,entity);return;
    }
    if(ref.kind==='mast'){
      titleEl.textContent='MAIN MAST';subEl.textContent=ref.side==='player'?'Your manoeuvre system':'Enemy manoeuvre structure';copyEl.textContent=ref.side==='player'?`Integrity ${entity.hp}/${entity.max}. Manoeuvre shifts alignment by one track cell when READY. Destroying the Mast disables movement.`:`Integrity ${entity.hp}/${entity.max}. The Mast is a separate targetable structure; Chain deals extra Mast damage.`;slotsEl.innerHTML='<span class="v31-empty-note">No storage.</span>';return;
    }
    const weapon=entity.weapon?weapons?.[entity.weapon]:null;titleEl.textContent=weapon?.name||entity.name||entity.kind.toUpperCase();subEl.textContent=ref.side==='player'?'Friendly room':`Known enemy room · ${entity.hp}/${entity.max} integrity`;copyEl.textContent=roomDescription(entity);renderSlots(ref,entity);
  }

  stageEl.addEventListener('pointerover',event=>{const ref=refFromTarget(event.target);if(!ref)return;const related=refFromTarget(event.relatedTarget);if(sameRef(ref,related))return;hovered=ref;renderInspector();},true);
  stageEl.addEventListener('pointerout',event=>{const ref=refFromTarget(event.target);if(!ref)return;const related=refFromTarget(event.relatedTarget);if(sameRef(ref,related))return;if(sameRef(hovered,ref))hovered=null;renderInspector();},true);
  stageEl.addEventListener('click',event=>{const ref=refFromTarget(event.target);if(!ref)return;locked=ref;renderInspector();},false);

  function decorateFriendlyStorageLabels(){
    for(const entity of playerRooms||[]){
      const rule=Storage?.roomRule?.(entity.kind);if(!rule)continue;const el=getEntityElement('player',entity.id);if(!el)continue;
      let cap=el.querySelector('.room-capacity');if(!cap){cap=document.createElement('div');cap.className='room-capacity';el.appendChild(cap);}
      const snapshot=isAdventure?Adventure?.getRoomStorage?.(entity.id):null;
      if(!snapshot){cap.textContent=`${rule.slots} SLOT${rule.slots===1?'':'S'}`;continue;}
      if(entity.kind==='storage'){const used=snapshot.slots.filter(Boolean).length;cap.textContent=`${used} / ${snapshot.slotCount} SLOTS`;}
      else if(entity.kind==='magazine'){const qty=snapshot.slots.reduce((sum,slot)=>sum+(slot?.item==='cannonballs'?Number(slot.quantity)||0:0),0);cap.textContent=`BALLS ${qty} / 6`;}
      else if(entity.kind==='carpenter'||entity.kind==='boatswain'){const qty=snapshot.slots.reduce((sum,slot)=>sum+(slot?.item==='timber'?Number(slot.quantity)||0:0),0);cap.textContent=`TIMBER ${qty} / 4`;}
    }
  }

  function fixFleeLabel(){
    const row=document.getElementById('trackRow');if(!row||typeof PLAYER_MAST_MIN==='undefined')return;const cells=[...row.children];if(!cells.length)return;
    const fleeIndex=Math.max(0,Number(PLAYER_MAST_MIN)-1),destination=cells[fleeIndex];if(!destination)return;
    cells.forEach(cell=>cell.classList.remove('v31-flee-destination'));const oldEdge=cells[Number(PLAYER_MAST_MIN)];if(oldEdge&&oldEdge!==destination)oldEdge.classList.remove('v30-flee-track');destination.classList.add('v30-flee-track','v31-flee-destination');
    const label=row.querySelector('.v30-flee-label');if(label){if(label.parentElement!==destination)destination.appendChild(label);label.title='Moving into this track space flees the engagement and ends combat.';}
  }

  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function')window.refresh=function(){const result=baseRefresh.apply(this,arguments);fixFleeLabel();decorateFriendlyStorageLabels();renderInspector();return result;};
  window.addEventListener('adventure-storage-changed',()=>{decorateFriendlyStorageLabels();renderInspector();});
  fixFleeLabel();decorateFriendlyStorageLabels();renderInspector();
})();