(() => {
  const VERSION = 2;
  const ITEMS = Object.freeze({
    food: { id:'food', name:'Food', stackSize:12, icon:'🍗' },
    cannonballs: { id:'cannonballs', name:'Cannonballs', stackSize:3, icon:'⚫' },
    timber: { id:'timber', name:'Timber', stackSize:4, icon:'🪵' },
    medicine: { id:'medicine', name:'Medicine', stackSize:1, icon:'🌿' }
  });
  const ROOM_RULES = Object.freeze({
    storage: { label:'General Storage', icon:'🛢️', slots:3, accepts:['food','cannonballs','timber','medicine'] },
    magazine: { label:'Magazine', icon:'⚫', slots:2, accepts:['cannonballs'] },
    carpenter: { label:"Carpenter's Workshop", icon:'🪵', slots:1, accepts:['timber'] }
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
    const quantity = Math.min(ITEMS[slot.item].stackSize,Math.max(0,number(slot.quantity)));
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

  function priorityTypes(itemId){
    if(itemId==='cannonballs') return ['magazine','storage'];
    if(itemId==='timber') return ['carpenter','storage'];
    return ['storage'];
  }

  function compatibleRoomIds(storage,itemId,preferred=[]){
    const rooms = Object.values(storage?.rooms || {});
    const preferredIds=(preferred||[]).filter(id=>storage.rooms?.[id]&&accepts(storage.rooms[id],itemId));
    const ordered=[...preferredIds];
    for(const type of priorityTypes(itemId)){
      for(const room of rooms) if(room.type===type&&accepts(room,itemId)&&!ordered.includes(room.id)) ordered.push(room.id);
    }
    for(const room of rooms) if(accepts(room,itemId)&&!ordered.includes(room.id)) ordered.push(room.id);
    return ordered;
  }

  function repackItem(storage,itemId,options={}){
    if(!ITEMS[itemId])return 0;
    const desired=total(storage,itemId);
    let positive=Math.max(0,desired);
    const debt=Math.min(0,desired);
    for(const room of Object.values(storage.rooms||{})){
      for(let i=0;i<room.slots.length;i++) if(room.slots[i]?.item===itemId) room.slots[i]=null;
    }
    storage.unassigned[itemId]=debt;
    if(!positive)return desired;

    const empty=[];
    for(const roomId of compatibleRoomIds(storage,itemId,options.preferredRoomIds)){
      const room=storage.rooms[roomId];
      for(let i=0;i<room.slots.length;i++) if(!room.slots[i]) empty.push({room,index:i});
    }
    const stackSize=ITEMS[itemId].stackSize;
    const placeable=Math.min(positive,empty.length*stackSize);
    const usedCount=Math.min(empty.length,Math.ceil(placeable/stackSize));
    if(usedCount>0){
      const base=Math.floor(placeable/usedCount),extra=placeable%usedCount;
      for(let i=0;i<usedCount;i++) empty[i].room.slots[empty[i].index]={item:itemId,quantity:base+(i<extra?1:0)};
    }
    positive-=placeable;
    if(positive>0)storage.unassigned[itemId]+=positive;
    return desired;
  }

  function addItem(storage,itemId,amount,options={}){
    if(!ITEMS[itemId]) return 0;
    let remaining=Math.max(0,number(amount));
    if(!remaining)return 0;
    if(number(storage.unassigned[itemId])<0){
      const settled=Math.min(-number(storage.unassigned[itemId]),remaining);
      storage.unassigned[itemId]+=settled;remaining-=settled;
    }
    if(remaining>0)storage.unassigned[itemId]=number(storage.unassigned[itemId])+remaining;
    repackItem(storage,itemId,options);
    return amount;
  }

  function removeItem(storage,itemId,amount,options={}){
    if(!ITEMS[itemId]) return 0;
    let remaining=Math.max(0,number(amount));
    if(!remaining) return 0;
    const order=compatibleRoomIds(storage,itemId,options.preferredRoomIds);
    for(const id of order){
      const room=storage.rooms[id];
      for(let i=0;i<room.slots.length&&remaining>0;i++){
        const slot=room.slots[i];
        if(!slot||slot.item!==itemId)continue;
        const moved=Math.min(slot.quantity,remaining);
        slot.quantity-=moved;remaining-=moved;
        if(slot.quantity<=0)room.slots[i]=null;
      }
    }
    if(remaining>0){
      const loose=number(storage.unassigned[itemId]);
      if(loose>0){
        const moved=Math.min(loose,remaining);
        storage.unassigned[itemId]-=moved;remaining-=moved;
      }
    }
    if(remaining>0)storage.unassigned[itemId]=number(storage.unassigned[itemId])-remaining;
    return amount;
  }

  function setTotal(storage,itemId,desired){
    if(!ITEMS[itemId]) return 0;
    const target=number(desired),current=total(storage,itemId),delta=target-current;
    if(delta>0)addItem(storage,itemId,delta);
    else if(delta<0)removeItem(storage,itemId,-delta);
    return total(storage,itemId);
  }

  function sortStorage(storage){
    const current=totals(storage);
    const shipId=storage.shipId||'wayward';
    const fresh=blank(shipId);
    storage.version=VERSION;storage.shipId=shipId;storage.rooms=fresh.rooms;storage.unassigned=emptyUnassigned();
    // Specialized stores claim their dedicated rooms first. Medicine is hold-only and gets
    // a physical slot before bulk Food; capacity overflow remains in unassigned for now.
    for(const itemId of ['cannonballs','timber','medicine','food']){
      const amount=number(current[itemId]);
      if(amount>=0){storage.unassigned[itemId]=amount;repackItem(storage,itemId);}
      else storage.unassigned[itemId]=amount;
    }
    return storage;
  }

  function create(shipId='wayward',initialTotals={}){
    const storage=blank(shipId);
    for(const id of itemIds()) if(initialTotals[id]!==undefined) storage.unassigned[id]=number(initialTotals[id]);
    sortStorage(storage);
    return storage;
  }

  function roomSnapshot(storage,roomId){
    const room=storage?.rooms?.[roomId];
    if(!room)return null;
    const rule=ruleFor(room.type);
    return {id:room.id,type:room.type,label:rule?.label||room.type,icon:rule?.icon||'',accepts:[...(rule?.accepts||[])],slotCount:rule?.slots||0,slots:clone(room.slots||[])};
  }

  function slotAt(storage,roomId,index){
    const room=storage?.rooms?.[roomId];
    if(!room||index<0||index>=room.slots.length)return null;
    return room.slots[index];
  }

  function canMoveStack(storage,fromRoomId,fromIndex,toRoomId,toIndex){
    const sourceRoom=storage?.rooms?.[fromRoomId],targetRoom=storage?.rooms?.[toRoomId];
    if(!sourceRoom||!targetRoom)return {ok:false,reason:'Unknown room'};
    if(fromIndex<0||fromIndex>=sourceRoom.slots.length||toIndex<0||toIndex>=targetRoom.slots.length)return {ok:false,reason:'Unknown slot'};
    const source=sourceRoom.slots[fromIndex];
    if(!source)return {ok:false,reason:'Source slot is empty'};
    if(!accepts(targetRoom,source.item))return {ok:false,reason:`${ITEMS[source.item].name} cannot be stored there`};
    const target=targetRoom.slots[toIndex];
    if(!target)return {ok:true,mode:'move'};
    if(target.item===source.item&&target.quantity<ITEMS[source.item].stackSize)return {ok:true,mode:'merge'};
    if(target.item!==source.item&&accepts(sourceRoom,target.item))return {ok:true,mode:'swap'};
    return {ok:false,reason:'That slot cannot accept this stack'};
  }

  function moveStack(storage,fromRoomId,fromIndex,toRoomId,toIndex){
    if(fromRoomId===toRoomId&&fromIndex===toIndex)return {ok:true,mode:'same'};
    const check=canMoveStack(storage,fromRoomId,fromIndex,toRoomId,toIndex);
    if(!check.ok)return check;
    const sourceRoom=storage.rooms[fromRoomId],targetRoom=storage.rooms[toRoomId];
    const source=sourceRoom.slots[fromIndex],target=targetRoom.slots[toIndex];
    if(check.mode==='move'){
      targetRoom.slots[toIndex]=source;sourceRoom.slots[fromIndex]=null;
    }else if(check.mode==='merge'){
      const free=ITEMS[source.item].stackSize-target.quantity;
      const moved=Math.min(free,source.quantity);
      target.quantity+=moved;source.quantity-=moved;
      if(source.quantity<=0)sourceRoom.slots[fromIndex]=null;
    }else if(check.mode==='swap'){
      targetRoom.slots[toIndex]=source;sourceRoom.slots[fromIndex]=target;
    }
    return {ok:true,mode:check.mode};
  }

  function configureRooms(storage,roomDefs=[]){
    const nextRooms={},displaced=emptyUnassigned();
    for(const def of roomDefs){
      const rule=ruleFor(def.type);if(!rule)continue;
      const previous=storage.rooms?.[def.id];
      const next={id:def.id,type:def.type,slots:Array.from({length:rule.slots},()=>null)};
      if(previous){
        for(const slot of previous.slots||[]){
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
    for(const [id,room] of Object.entries(storage.rooms||{})){
      if(nextRooms[id])continue;
      for(const slot of room.slots||[])if(slot)displaced[slot.item]+=slot.quantity;
    }
    storage.rooms=nextRooms;
    for(const id of itemIds())storage.unassigned[id]=number(storage.unassigned[id])+displaced[id];
    return storage;
  }

  window.HighSeasShipStorage={
    VERSION,ITEMS,ROOM_RULES,create,normalize,totals,total,setTotal,addItem,removeItem,repackItem,sortStorage,
    roomSnapshot,moveStack,canMoveStack,configureRooms,
    roomRule(type){const rule=ruleFor(type);return rule?clone(rule):null;},
    getUnassigned(storage){return clone(storage?.unassigned||emptyUnassigned());},
    item(itemId){return ITEMS[itemId]?clone(ITEMS[itemId]):null;}
  };
})();