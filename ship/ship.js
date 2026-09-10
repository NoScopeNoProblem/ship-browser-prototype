(() => {
  const Adventure=window.HighSeasAdventure,Storage=window.HighSeasShipStorage;
  if(!Adventure||!Storage)return;

  const ROOM_DEFS=[
    {id:'p_std',type:'gun',name:'STANDARD GUN DECK',row:0,col:0,art:'standard',weapon:'standard',range:1,detail:'Standard Cannon · 1 damage · range ±1 · fires once, then reloads for 1 turn.'},
    {id:'p_mag',type:'magazine',name:'MAGAZINE',row:0,col:1,art:'magazine',flavour:'⚫',detail:'Two Cannonball-only storage slots. Up to 3 balls per slot. In combat it can QUICK LOAD an adjacent loading gun.'},
    {id:'p_heavy',type:'gun',name:'HEAVY GUN DECK',row:0,col:2,art:'heavy',weapon:'heavy',range:1,detail:'Heavy Cannon · 2 damage · range ±1 · begins combat loading, then reloads for 1 turn after firing.'},
    {id:'p_hold1',type:'storage',name:'GENERAL STORAGE',row:1,col:0,art:'hold',flavour:'🛢️',detail:'Three flexible cargo slots. Each slot holds one item type: 12 Food, 3 Cannonballs, 4 Timber or 1 Medicine.'},
    {id:'p_carp',type:'carpenter',name:"CARPENTER'S WORKSHOP",row:1,col:1,art:'carpenter',flavour:'🪵',detail:'One Timber-only storage slot holding up to 4 Timber. Timber is spent when the Carpenter repairs combat damage.'},
    {id:'p_hold2',type:'storage',name:'GENERAL STORAGE',row:1,col:2,art:'hold',flavour:'🛢️',detail:'Three flexible cargo slots. Each slot holds one item type: 12 Food, 3 Cannonballs, 4 Timber or 1 Medicine.'}
  ];
  const byId=id=>ROOM_DEFS.find(r=>r.id===id);
  const els={grid:document.getElementById('shipGrid'),track:document.getElementById('faintTrack'),range:document.getElementById('rangeOverlay'),day:document.getElementById('dayValue'),coin:document.getElementById('coinValue'),food:document.getElementById('foodValue'),balls:document.getElementById('ballValue'),timber:document.getElementById('timberValue'),toggle:document.getElementById('autoSortToggle'),sort:document.getElementById('sortNow'),overflow:document.getElementById('overflowStrip'),art:document.getElementById('inspectorArt'),title:document.getElementById('inspectorTitle'),text:document.getElementById('inspectorText'),slots:document.getElementById('inspectorSlots'),special:document.getElementById('specialCargo')};
  let inspectedId='p_hold1',picked=null;

  function itemInfo(id){return Storage.ITEMS[id]||{name:id,icon:'•',stackSize:'?'};}
  function slotMarkup(slot,index){
    if(!slot)return `<span class="slot-num">${index+1}</span>`;
    const item=itemInfo(slot.item);
    return `<span class="slot-num">${index+1}</span><span class="item-icon">${item.icon}</span><span class="item-count">×${slot.quantity}</span>`;
  }
  function storageFor(roomId,state){return Storage.roomSnapshot(state.storage,roomId);}

  function renderTrack(){
    els.track.innerHTML='';
    for(let i=0;i<7;i++){const c=document.createElement('span');if(i>=2&&i<=4)c.classList.add('ship-footprint');els.track.appendChild(c);}
  }

  function attemptMove(targetRoomId,targetIndex){
    if(!picked)return;
    const result=Adventure.moveCargo(picked.roomId,picked.index,targetRoomId,targetIndex);
    if(!result.ok){
      const target=els.grid.querySelector(`.slot[data-room-id="${targetRoomId}"][data-slot-index="${targetIndex}"]`);
      if(target){target.title=result.reason||'Cannot store that here';target.animate([{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:180});}
      return;
    }
    picked=null;render();
  }

  function setPicked(roomId,index){
    const state=Adventure.load(),slot=state.storage?.rooms?.[roomId]?.slots?.[index];
    picked=slot?{roomId,index}:null;render();
  }

  function decorateValidSlots(state){
    if(!picked)return;
    els.grid.querySelectorAll('.slot').forEach(el=>{
      const roomId=el.dataset.roomId,index=Number(el.dataset.slotIndex);
      if(roomId===picked.roomId&&index===picked.index){el.classList.add('selected');return;}
      const check=Storage.canMoveStack(state.storage,picked.roomId,picked.index,roomId,index);
      el.classList.add(check.ok?'valid':'invalid');
    });
  }

  function wireSlot(el,roomId,index,state){
    const slot=state.storage?.rooms?.[roomId]?.slots?.[index];
    el.addEventListener('click',event=>{event.stopPropagation();if(picked)attemptMove(roomId,index);else if(slot)setPicked(roomId,index);});
    if(slot){
      el.draggable=true;
      el.addEventListener('dragstart',event=>{picked={roomId,index};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`${roomId}:${index}`);decorateValidSlots(Adventure.load());});
      el.addEventListener('dragend',()=>{picked=null;render();});
    }
    el.addEventListener('dragover',event=>{if(!picked)return;const check=Storage.canMoveStack(Adventure.load().storage,picked.roomId,picked.index,roomId,index);if(check.ok){event.preventDefault();event.dataTransfer.dropEffect='move';}});
    el.addEventListener('drop',event=>{event.preventDefault();attemptMove(roomId,index);});
  }

  function renderRooms(state){
    els.grid.innerHTML='';
    for(const def of ROOM_DEFS){
      const room=document.createElement('section');room.className=`room-card art-${def.art}${def.type==='gun'?' gun':''}${inspectedId===def.id?' inspected':''}`;room.style.gridColumn=String(def.col+1);room.style.gridRow=String(def.row+1);room.dataset.roomId=def.id;
      room.innerHTML=`<div class="room-title">${def.name}</div>${def.flavour?`<div class="room-flavour">${def.flavour}</div>`:''}<div class="room-slots"></div>`;
      if(def.type==='gun')room.dataset.gunNote=def.weapon==='heavy'?'◆  Heavy Cannon · hold X for range':'●  Standard Cannon · hold X for range';
      const slotRow=room.querySelector('.room-slots');
      const snapshot=storageFor(def.id,state);
      if(snapshot){
        snapshot.slots.forEach((slot,index)=>{const el=document.createElement('div');el.className=`slot${slot?' filled':''}`;el.dataset.roomId=def.id;el.dataset.slotIndex=String(index);el.innerHTML=slotMarkup(slot,index);wireSlot(el,def.id,index,state);slotRow.appendChild(el);});
      }
      room.addEventListener('pointerenter',()=>{inspectedId=def.id;renderInspector(state);els.grid.querySelectorAll('.room-card').forEach(x=>x.classList.toggle('inspected',x.dataset.roomId===def.id));});
      room.addEventListener('click',()=>{inspectedId=def.id;renderInspector(Adventure.load());});
      els.grid.appendChild(room);
    }
    decorateValidSlots(state);
  }

  function renderInspector(state){
    const def=byId(inspectedId)||ROOM_DEFS[0],snapshot=storageFor(def.id,state);
    els.art.className=`inspector-art art-${def.art}`;els.title.textContent=def.name;els.text.textContent=def.detail;els.slots.innerHTML='';
    if(snapshot){
      snapshot.slots.forEach((slot,index)=>{const el=document.createElement('div');el.className=`slot${slot?' filled':''}`;el.innerHTML=slotMarkup(slot,index);els.slots.appendChild(el);});
    }else els.slots.innerHTML='<span style="color:#aab8bf;font-size:13px">No cargo slots in this room.</span>';
    const med=Number(state.stores.medicine)||0;
    els.special.textContent=med?`🌿 Medicine aboard: ${med} crate${med===1?'':'s'} · Hold only`:'No Medicine aboard.';
  }

  function renderOverflow(state){
    const overflow=Storage.getUnassigned(state.storage),parts=[];
    for(const [id,value] of Object.entries(overflow)){if(Number(value)!==0){const item=itemInfo(id);parts.push(`${item.icon} ${item.name} ${value>0?'+':''}${value}`);}}
    els.overflow.hidden=!parts.length;els.overflow.innerHTML=parts.length?`<b>PROTOTYPE OVERFLOW / DEBT</b>${parts.join(' · ')} · Capacity limits are not enforced yet.`:'';
  }

  function renderHud(state){els.day.textContent=state.day;els.coin.textContent=state.coins;els.food.textContent=state.stores.food;els.balls.textContent=state.stores.cannonballs;els.timber.textContent=state.stores.timber;els.toggle.checked=!!state.shipSettings?.autoSortSpecialStores;}

  function renderRange(){
    const svg=els.range,canvas=document.getElementById('shipCanvas'),grid=els.grid;if(!svg||!canvas||!grid)return;
    const cr=canvas.getBoundingClientRect(),gr=grid.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${cr.width} ${cr.height}`);svg.innerHTML='';
    const trackLeft=cr.width*.04,cell=(cr.width*.92)/7,targetY=42;
    for(const def of ROOM_DEFS.filter(r=>r.type==='gun')){
      const el=grid.querySelector(`[data-room-id="${def.id}"]`);if(!el)continue;const rr=el.getBoundingClientRect();
      const sx=rr.left-cr.left+rr.width/2,sy=rr.top-cr.top+rr.height*.45;
      const worldCol=2+def.col,min=Math.max(0,worldCol-def.range),max=Math.min(6,worldCol+def.range);
      const x1=trackLeft+min*cell,x2=trackLeft+(max+1)*cell;
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('points',`${sx},${sy} ${x1},${targetY} ${x2},${targetY}`);if(def.weapon==='heavy')poly.setAttribute('class','heavy');svg.appendChild(poly);
    }
  }

  function render(){const state=Adventure.load();renderHud(state);renderRooms(state);renderInspector(state);renderOverflow(state);requestAnimationFrame(renderRange);}
  els.sort.addEventListener('click',()=>{Adventure.sortCargo();picked=null;render();});
  els.toggle.addEventListener('change',()=>{Adventure.setAutoSort(els.toggle.checked);picked=null;render();});
  document.addEventListener('click',event=>{if(picked&&!event.target.closest('.slot')){picked=null;render();}});
  window.addEventListener('keydown',event=>{if(event.code==='KeyX'&&!event.repeat){els.range.classList.add('visible');}});
  window.addEventListener('keyup',event=>{if(event.code==='KeyX')els.range.classList.remove('visible');});
  window.addEventListener('blur',()=>els.range.classList.remove('visible'));
  window.addEventListener('resize',()=>requestAnimationFrame(renderRange));
  window.addEventListener('adventure-storage-changed',render);
  renderTrack();render();
})();
