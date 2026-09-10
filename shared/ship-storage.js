(() => {
  const VERSION = 1;
  const ITEMS = Object.freeze({
    food: { id:'food', name:'Food', stackSize:12 },
    cannonballs: { id:'cannonballs', name:'Cannonballs', stackSize:3 },
    timber: { id:'timber', name:'Timber', stackSize:4 }
  });
  const ROOM_RULES = Object.freeze({
    storage: { label:'Hold', slots:3, accepts:['food','cannonballs','timber'] },
    magazine: { label:'Magazine', slots:2, accepts:['cannonballs'] },
    carpenter: { label:'Carpenter', slots:1, accepts:['timber'] }
  });
  const DEFAULT_LAYOUTS = Object.freeze({
    wayward: [
      { id:'p_hold1', type:'storage' },
      { id:'p_mag', type:'magazine' },
      { id:'p_carp', type:'carpenter' },
      { id:'p_hold2', type:'storage' }
    ]
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const itemIds = () => Object.keys(ITEMS);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const ruleFor = type => ROOM_RULES[type] || null;

  function emptyUnassigned(){
    return Object.fromEntries(itemIds().map(id => [id,0]));
  }

  function makeRoom(def){
    const rule = ruleFor(def.type);
    if(!rule) return null;
    return { id:def.id, type:def.type, slots:Array.from({length:rule.slots},()=>null) };
  }

  function blank(shipId='wayward'){
    const storage = { version:VERSION, shipId, rooms:{}, unassigned:emptyUnassigned() };
    for(const def of DEFAULT_LAYOUTS[shipId] || []){
      const room = makeRoom(def);
      if(room) storage.rooms[room.id] = room;
    }
    return storage;
  }

  function normalizeSlot(slot, roomType){
    if(!slot || !ITEMS[slot.item]) return null;
    const rule = ruleFor(roomType);
    if(!rule || !rule.accepts.includes(slot.item)) return null;
    const quantity = Math.max(0,number(slot.quantity));
    return quantity > 0 ? { item:slot.item, quantity } : null;
  }

  function normalize(raw, shipId='wayward'){
    const next = blank(shipId || raw?.shipId || 'wayward');
    next.shipId = shipId || raw?.shipId || next.shipId;
    if(raw?.rooms && typeof raw.rooms === 'object'){
      for(const [id,record] of Object.entries(raw.rooms)){
        const type = record?.type;
        const rule = ruleFor(type);
        if(!rule) continue;
        const room = { id, type, slots:Array.from({length:rule.slots},(_,i)=>normalizeSlot(record.slots?.[i],type)) };
        next.rooms[id] = room;
      }
    }
    for(const def of DEFAULT_LAYOUTS[next.shipId] || []){
      if(!next.rooms[def.id]){
        const room = makeRoom(def);
        if(room) next.rooms[def.id] = room;
      }
    }
    next.unassigned = emptyUnassigned();
    for(const id of itemIds()) next.unassigned[id] = number(raw?.unassigned?.[id]);
    return next;
  }

  function roomAllocated(room,itemId=null){
    return (room?.slots || []).reduce((sum,slot)=>sum + (slot && (!itemId || slot.item===itemId) ? number(slot.quantity) : 0),0);
  }

  function total(storage,itemId){
    let amount = number(storage?.unassigned?.[itemId]);
    for(const room of Object.values(storage?.rooms || {})) amount += roomAllocated(room,itemId);
    return amount;
  }

  function totals(storage){
    return Object.fromEntries(itemIds().map(id=>[id,total(storage,id)]));
  }

  function accepts(room,itemId){
    const rule = ruleFor(room?.type);
    return !!rule && rule.accepts.includes(itemId);
  }

  function compatibleRoomIds(storage,itemId){
    const priority = itemId==='cannonballs' ? ['magazine','storage'] : itemId==='timber' ? ['carpenter','storage'] : ['storage'];
    const rooms = Object.values(storage.rooms || {});
    const ordered=[];
    for(const type of priority) for(const room of rooms) if(room.type===type && accepts(room,itemId)) ordered.push(room.id);
    for(const room of rooms) if(accepts(room,itemId) && !ordered.includes(room.id)) ordered.push(room.id);
    return ordered;
  }

  function addItem(storage,itemId,amount,options={}){
    if(!ITEMS[itemId]) return 0;
    let remaining = Math.max(0,number(amount));
    if(!remaining) return 0;
    // New stock first clears any temporary shortage debt before occupying physical slots.
    if(number(storage.unassigned[itemId])<0){
      const settled=Math.min(-number(storage.unassigned[itemId]),remaining);
      storage.unassigned[itemId]+=settled;remaining-=settled;
    }
    const preferred = Array.isArray(options.preferredRoomIds) ? options.preferredRoomIds.filter(id=>storage.rooms?.[id] && accepts(storage.rooms[id],itemId)) : [];
    const order = [...preferred,...compatibleRoomIds(storage,itemId).filter(id=>!preferred.includes(id))];
    const stackSize = ITEMS[itemId].stackSize;

    for(const id of order){
      const room=storage.rooms[id];
      for(const slot of room.slots){
        if(!slot || slot.item!==itemId || remaining<=0) continue;
        const free=Math.max(0,stackSize-slot.quantity);
        const moved=Math.min(free,remaining);
        slot.quantity+=moved;remaining-=moved;
      }
    }
    for(const id of order){
      const room=storage.rooms[id];
      for(let i=0;i<room.slots.length && remaining>0;i++){
        if(room.slots[i]) continue;
        const moved=Math.min(stackSize,remaining);
        room.slots[i]={item:itemId,quantity:moved};remaining-=moved;
      }
    }
    if(remaining>0) storage.unassigned[itemId]=number(storage.unassigned[itemId])+remaining;
    return amount;
  }

  function removeItem(storage,itemId,amount,options={}){
    if(!ITEMS[itemId]) return 0;
    let remaining=Math.max(0,number(amount));
    if(!remaining) return 0;
    const preferred = Array.isArray(options.preferredRoomIds) ? options.preferredRoomIds.filter(id=>storage.rooms?.[id] && accepts(storage.rooms[id],itemId)) : [];
    const order=[...preferred,...compatibleRoomIds(storage,itemId).filter(id=>!preferred.includes(id))];

    for(const id of order){
      const room=storage.rooms[id];
      for(let i=0;i<room.slots.length && remaining>0;i++){
        const slot=room.slots[i];
        if(!slot || slot.item!==itemId) continue;
        const moved=Math.min(slot.quantity,remaining);
        slot.quantity-=moved;remaining-=moved;
        if(slot.quantity<=0) room.slots[i]=null;
      }
    }
    if(remaining>0){
      const loose=number(storage.unassigned[itemId]);
      if(loose>0){
        const moved=Math.min(loose,remaining);
        storage.unassigned[itemId]-=moved;remaining-=moved;
      }
    }
    // Capacity and shortage enforcement deliberately come later. A negative unassigned value
    // represents temporary prototype debt while the rest of the game is still allowed below 0.
    if(remaining>0) storage.unassigned[itemId]=number(storage.unassigned[itemId])-remaining;
    return amount;
  }

  function setTotal(storage,itemId,desired){
    if(!ITEMS[itemId]) return 0;
    const target=number(desired),current=total(storage,itemId),delta=target-current;
    if(delta>0)addItem(storage,itemId,delta);
    else if(delta<0)removeItem(storage,itemId,-delta);
    return total(storage,itemId);
  }

  function create(shipId='wayward',initialTotals={}){
    const storage=blank(shipId);
    for(const id of itemIds()) if(initialTotals[id]!==undefined) setTotal(storage,id,initialTotals[id]);
    return storage;
  }

  function roomSnapshot(storage,roomId){
    const room=storage?.rooms?.[roomId];
    if(!room)return null;
    const rule=ruleFor(room.type);
    return {
      id:room.id,
      type:room.type,
      label:rule?.label || room.type,
      accepts:[...(rule?.accepts || [])],
      slotCount:rule?.slots || 0,
      slots:clone(room.slots || [])
    };
  }

  function configureRooms(storage,roomDefs=[]){
    const nextRooms={};
    const displaced=emptyUnassigned();
    for(const def of roomDefs){
      const rule=ruleFor(def.type);if(!rule)continue;
      const previous=storage.rooms?.[def.id];
      const next={id:def.id,type:def.type,slots:Array.from({length:rule.slots},()=>null)};
      if(previous){
        for(const slot of previous.slots || []){
          if(!slot)continue;
          if(rule.accepts.includes(slot.item)){
            const targetIndex=next.slots.findIndex(s=>!s);
            if(targetIndex>=0)next.slots[targetIndex]={item:slot.item,quantity:slot.quantity};
            else displaced[slot.item]+=slot.quantity;
          }else displaced[slot.item]+=slot.quantity;
        }
      }
      nextRooms[def.id]=next;
    }
    for(const [id,room] of Object.entries(storage.rooms || {})){
      if(nextRooms[id])continue;
      for(const slot of room.slots || [])if(slot)displaced[slot.item]+=slot.quantity;
    }
    storage.rooms=nextRooms;
    for(const id of itemIds())storage.unassigned[id]=number(storage.unassigned[id])+displaced[id];
    return storage;
  }

  window.HighSeasShipStorage={
    VERSION,ITEMS,ROOM_RULES,create,normalize,totals,total,setTotal,addItem,removeItem,roomSnapshot,configureRooms,
    roomRule(type){const rule=ruleFor(type);return rule?clone(rule):null;},
    getUnassigned(storage){return clone(storage?.unassigned || emptyUnassigned());}
  };
})();