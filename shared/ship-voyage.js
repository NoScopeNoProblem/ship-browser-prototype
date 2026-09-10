(() => {
  const Adventure=window.HighSeasAdventure;
  const Storage=window.HighSeasShipStorage;
  if(!Adventure||!Storage)return;

  const clone=value=>JSON.parse(JSON.stringify(value));
  const HEALTH_DEF=Object.freeze({
    mast:{id:'p_mast',max:3},
    rooms:{
      p_std:{id:'p_std',max:3,kind:'gun'},
      p_mag:{id:'p_mag',max:2,kind:'magazine'},
      p_heavy:{id:'p_heavy',max:3,kind:'gun'},
      p_hold1:{id:'p_hold1',max:2,kind:'storage'},
      p_carp:{id:'p_carp',max:2,kind:'carpenter'},
      p_hold2:{id:'p_hold2',max:2,kind:'storage'}
    }
  });
  const HOLD_IDS=Object.keys(HEALTH_DEF.rooms).filter(id=>HEALTH_DEF.rooms[id].kind==='storage');

  function defaultHealth(){
    const rooms={};
    for(const [id,def] of Object.entries(HEALTH_DEF.rooms))rooms[id]={hp:def.max,max:def.max,kind:def.kind};
    return {mast:{hp:HEALTH_DEF.mast.max,max:HEALTH_DEF.mast.max},rooms};
  }
  function defaultScore(){return {combatWins:0,noDamageCombats:0,perfectCombats:0,combatBonus:0};}
  function ensureState(state){
    state.shipHealth=state.shipHealth&&typeof state.shipHealth==='object'?state.shipHealth:defaultHealth();
    state.shipHealth.mast={...defaultHealth().mast,...(state.shipHealth.mast||{})};
    state.shipHealth.mast.max=HEALTH_DEF.mast.max;state.shipHealth.mast.hp=Math.max(0,Math.min(HEALTH_DEF.mast.max,Number(state.shipHealth.mast.hp??HEALTH_DEF.mast.max)));
    state.shipHealth.rooms=state.shipHealth.rooms&&typeof state.shipHealth.rooms==='object'?state.shipHealth.rooms:{};
    for(const [id,def] of Object.entries(HEALTH_DEF.rooms)){
      const existing=state.shipHealth.rooms[id]||{};
      state.shipHealth.rooms[id]={hp:Math.max(0,Math.min(def.max,Number(existing.hp??def.max))),max:def.max,kind:def.kind};
    }
    state.shipSettings=state.shipSettings||{};
    if(typeof state.shipSettings.autoBalanceCargo!=='boolean')state.shipSettings.autoBalanceCargo=true;
    state.scoreStats={...defaultScore(),...(state.scoreStats||{})};
    state.inventoryRevision=Number(state.inventoryRevision)||0;
    return state;
  }
  function load(){
    let state=Adventure.load();
    if(!state.shipHealth||typeof state.shipSettings?.autoBalanceCargo!=='boolean'||!state.scoreStats){state=Adventure.update(ensureState);}
    else ensureState(state);
    return state;
  }
  function emitShip(state){
    try{window.dispatchEvent(new CustomEvent('adventure-ship-changed',{detail:{shipHealth:clone(state.shipHealth),scoreStats:clone(state.scoreStats)}}));}catch{}
  }
  function update(mutator){
    let result;
    const state=Adventure.update(s=>{ensureState(s);result=mutator(s);});
    ensureState(state);emitShip(state);return {state,result};
  }
  function missingBlips(state=load()){
    ensureState(state);let missing=state.shipHealth.mast.max-state.shipHealth.mast.hp;
    for(const room of Object.values(state.shipHealth.rooms))missing+=room.max-room.hp;
    return missing;
  }
  function carpenterFunctional(state=load()){return Number(state.shipHealth?.rooms?.p_carp?.hp)>0;}
  function roomHealth(id,state=load()){ensureState(state);return id==='p_mast'?clone(state.shipHealth.mast):clone(state.shipHealth.rooms[id]||null);}

  function cargoLostFromHoldInState(state,roomId){
    const room=state.storage?.rooms?.[roomId];
    if(!room||room.type!=='storage')return {};
    const lost={};
    for(let i=0;i<room.slots.length;i++){
      const slot=room.slots[i];if(!slot)continue;
      lost[slot.item]=(lost[slot.item]||0)+(Number(slot.quantity)||0);room.slots[i]=null;
    }
    state.stores=Storage.totals(state.storage);
    const medCount=Math.max(0,Math.floor(Number(state.stores.medicine)||0));
    if(state.trade?.medicineLots)state.trade.medicineLots=state.trade.medicineLots.slice(0,medCount);
    return lost;
  }

  function applyToCombat(playerRooms,playerMast){
    const state=load();
    for(const room of playerRooms||[]){const saved=state.shipHealth.rooms?.[room.id];if(saved)room.hp=Math.max(0,Math.min(room.max,Number(saved.hp)));}
    if(playerMast)playerMast.hp=Math.max(0,Math.min(playerMast.max,Number(state.shipHealth.mast.hp)));
    return clone(state.shipHealth);
  }

  function captureCombat(playerRooms,playerMast){
    const roomHp=Object.fromEntries((playerRooms||[]).map(room=>[room.id,Math.max(0,Math.min(room.max,Number(room.hp)||0))]));
    const mastHp=playerMast?Math.max(0,Math.min(playerMast.max,Number(playerMast.hp)||0)):null;
    return update(state=>{
      const cargoLost={};
      for(const [id,hp] of Object.entries(roomHp)){
        const saved=state.shipHealth.rooms[id];if(!saved)continue;
        if(saved.kind==='storage'&&saved.hp>0&&hp<=0){
          const lost=cargoLostFromHoldInState(state,id);
          for(const [item,qty] of Object.entries(lost))cargoLost[item]=(cargoLost[item]||0)+qty;
        }
        saved.hp=hp;
      }
      if(mastHp!==null)state.shipHealth.mast.hp=mastHp;
      return {cargoLost,shipHealth:clone(state.shipHealth)};
    }).result;
  }

  function canRepair(state){return carpenterFunctional(state);}
  function repairOne(targetId){
    return update(state=>{
      if(!canRepair(state))return {ok:false,reason:"Carpenter's Workshop is destroyed"};
      const target=targetId==='p_mast'?state.shipHealth.mast:state.shipHealth.rooms[targetId];
      if(!target)return {ok:false,reason:'Unknown ship section'};
      if(target.hp>=target.max)return {ok:false,reason:'Already fully repaired'};
      if(Number(state.stores.timber)<1)return {ok:false,reason:'Requires 1 Timber'};
      Storage.removeItem(state.storage,'timber',1,{preferredRoomIds:['p_carp','p_hold1','p_hold2']});state.stores=Storage.totals(state.storage);target.hp+=1;
      return {ok:true,cost:1,targetId,hp:target.hp,max:target.max};
    }).result;
  }
  function repairAll(){
    return update(state=>{
      if(!canRepair(state))return {ok:false,reason:"Carpenter's Workshop is destroyed"};
      const missing=missingBlips(state);
      if(!missing)return {ok:false,reason:'Ship is already fully repaired'};
      if(Number(state.stores.timber)<missing)return {ok:false,reason:`Requires ${missing} Timber`,required:missing};
      Storage.removeItem(state.storage,'timber',missing,{preferredRoomIds:['p_carp','p_hold1','p_hold2']});state.stores=Storage.totals(state.storage);
      state.shipHealth.mast.hp=state.shipHealth.mast.max;
      for(const room of Object.values(state.shipHealth.rooms))room.hp=room.max;
      return {ok:true,cost:missing};
    }).result;
  }

  function roomAliveForStorage(state,roomId){
    const hp=state.shipHealth?.rooms?.[roomId]?.hp;
    return hp===undefined||hp>0;
  }
  function compactSlotNeed(state,totals){
    const liveMagazine=state.storage?.rooms?.p_mag&&roomAliveForStorage(state,'p_mag')?state.storage.rooms.p_mag.slots.length:0;
    const liveCarp=state.storage?.rooms?.p_carp&&roomAliveForStorage(state,'p_carp')?state.storage.rooms.p_carp.slots.length:0;
    const holdSlots=HOLD_IDS.filter(id=>state.storage?.rooms?.[id]&&roomAliveForStorage(state,id)).reduce((sum,id)=>sum+state.storage.rooms[id].slots.length,0);
    const ballDedicated=liveMagazine*Storage.ITEMS.cannonballs.stackSize;
    const timberDedicated=liveCarp*Storage.ITEMS.timber.stackSize;
    const remainder={...totals};
    remainder.cannonballs=Math.max(0,(Number(totals.cannonballs)||0)-ballDedicated);
    remainder.timber=Math.max(0,(Number(totals.timber)||0)-timberDedicated);
    let general=0;
    for(const itemId of Object.keys(Storage.ITEMS))general+=Math.ceil(Math.max(0,Number(remainder[itemId])||0)/Storage.ITEMS[itemId].stackSize);
    return {general,holdSlots,fit:general<=holdSlots};
  }
  function physicalAdditional(itemId,amount,state){
    amount=Math.max(0,Math.floor(Number(amount)||0));if(!amount)return 0;
    let capacity=0;
    for(const [roomId,room] of Object.entries(state.storage?.rooms||{})){
      if(!roomAliveForStorage(state,roomId))continue;
      const rule=Storage.roomRule(room.type);if(!rule?.accepts?.includes(itemId))continue;
      for(const slot of room.slots||[]){
        if(!slot)capacity+=Storage.ITEMS[itemId].stackSize;
        else if(slot.item===itemId)capacity+=Math.max(0,Storage.ITEMS[itemId].stackSize-(Number(slot.quantity)||0));
      }
    }
    return Math.min(amount,capacity);
  }
  function maxAdditional(itemId,amount,state=load()){
    amount=Math.max(0,Math.floor(Number(amount)||0));if(!amount)return 0;
    if(!state.shipSettings?.autoBalanceCargo)return physicalAdditional(itemId,amount,state);
    const totals=Storage.totals(state.storage);
    for(let add=amount;add>=0;add--){const next={...totals,[itemId]:(Number(totals[itemId])||0)+add};if(compactSlotNeed(state,next).fit)return add;}
    return 0;
  }

  function repackBalancedInState(state){
    const totals=Storage.totals(state.storage);
    const storage=state.storage;
    for(const room of Object.values(storage.rooms||{}))room.slots=room.slots.map(()=>null);
    storage.unassigned=Object.fromEntries(Object.keys(Storage.ITEMS).map(id=>[id,0]));

    function placeDedicated(roomId,itemId){
      const room=storage.rooms?.[roomId];if(!room||!roomAliveForStorage(state,roomId))return 0;
      let left=Math.max(0,Number(totals[itemId])||0),placed=0;
      for(let i=0;i<room.slots.length&&left>0;i++){
        const q=Math.min(Storage.ITEMS[itemId].stackSize,left);room.slots[i]={item:itemId,quantity:q};left-=q;placed+=q;
      }
      return placed;
    }
    const dedicated={cannonballs:placeDedicated('p_mag','cannonballs'),timber:placeDedicated('p_carp','timber')};
    const holdIds=HOLD_IDS.filter(id=>storage.rooms?.[id]&&roomAliveForStorage(state,id));
    const remainders={};for(const id of Object.keys(Storage.ITEMS))remainders[id]=Math.max(0,(Number(totals[id])||0)-(dedicated[id]||0));

    const nextFree=id=>storage.rooms[id].slots.findIndex(s=>!s);
    function placeAcrossHolds(itemId,quantity){
      let left=quantity;if(left<=0)return 0;
      const cap=Storage.ITEMS[itemId].stackSize;
      while(left>0){
        const available=holdIds.filter(id=>nextFree(id)>=0);if(!available.length)break;
        const round=Math.min(left,available.length*cap);
        const base=Math.floor(round/available.length),extra=round%available.length;
        available.forEach((id,i)=>{const q=Math.min(cap,base+(i<extra?1:0));if(q<=0)return;storage.rooms[id].slots[nextFree(id)]={item:itemId,quantity:q};left-=q;});
      }
      return quantity-left;
    }
    for(const itemId of ['medicine','food','cannonballs','timber']){
      const placed=placeAcrossHolds(itemId,remainders[itemId]);storage.unassigned[itemId]=remainders[itemId]-placed;
    }
    state.stores=Storage.totals(storage);return storage;
  }
  function placePhysicalInState(state,itemId,amount){
    let left=Math.max(0,Math.floor(Number(amount)||0));
    const roomIds=[];
    for(const preferred of itemId==='cannonballs'?['p_mag']:itemId==='timber'?['p_carp']:[]){if(state.storage?.rooms?.[preferred])roomIds.push(preferred);}
    for(const id of HOLD_IDS)if(state.storage?.rooms?.[id]&&!roomIds.includes(id))roomIds.push(id);
    for(const id of Object.keys(state.storage?.rooms||{}))if(!roomIds.includes(id))roomIds.push(id);
    for(const roomId of roomIds){
      if(!roomAliveForStorage(state,roomId))continue;
      const room=state.storage.rooms[roomId],rule=Storage.roomRule(room.type);if(!rule?.accepts?.includes(itemId))continue;
      for(const slot of room.slots){if(left<=0)break;if(slot?.item!==itemId)continue;const free=Storage.ITEMS[itemId].stackSize-slot.quantity,moved=Math.min(free,left);slot.quantity+=moved;left-=moved;}
      for(let i=0;i<room.slots.length&&left>0;i++){if(room.slots[i])continue;const q=Math.min(Storage.ITEMS[itemId].stackSize,left);room.slots[i]={item:itemId,quantity:q};left-=q;}
    }
    state.stores=Storage.totals(state.storage);return amount-left;
  }
  function bumpInventory(state){state.inventoryRevision=(Number(state.inventoryRevision)||0)+1;}
  function rebalance(){return update(state=>{if(state.shipSettings.autoBalanceCargo)repackBalancedInState(state);bumpInventory(state);return {ok:true};}).result;}
  function setAutoBalance(enabled){return update(state=>{state.shipSettings.autoBalanceCargo=!!enabled;if(enabled)repackBalancedInState(state);bumpInventory(state);return {ok:true,enabled:!!enabled};}).result;}

  function addCapped(itemId,amount,{balanceAfter=true}={}){
    return update(state=>{
      const wanted=Math.max(0,Math.floor(Number(amount)||0)),accepted=maxAdditional(itemId,wanted,state),left=wanted-accepted;
      if(accepted){
        if(state.shipSettings.autoBalanceCargo){state.storage.unassigned[itemId]=(Number(state.storage.unassigned[itemId])||0)+accepted;repackBalancedInState(state);}
        else placePhysicalInState(state,itemId,accepted);
        state.stores=Storage.totals(state.storage);bumpInventory(state);
      }
      return {accepted,left};
    }).result;
  }
  function acceptReward(reward={}){
    const summary={coins:Math.max(0,Number(reward.coins)||0),accepted:{},leftBehind:{}};
    update(state=>{
      state.coins+=summary.coins;
      for(const [itemId,raw] of Object.entries(reward.stores||{})){
        const wanted=Math.max(0,Math.floor(Number(raw)||0)),fit=maxAdditional(itemId,wanted,state);
        if(fit){
          if(state.shipSettings.autoBalanceCargo){state.storage.unassigned[itemId]=(Number(state.storage.unassigned[itemId])||0)+fit;repackBalancedInState(state);}
          else placePhysicalInState(state,itemId,fit);
        }
        summary.accepted[itemId]=fit;summary.leftBehind[itemId]=wanted-fit;state.stores=Storage.totals(state.storage);
      }
      bumpInventory(state);
    });
    return summary;
  }
  function recordCombatScore(resultTier){
    return update(state=>{
      state.scoreStats.combatWins+=1;
      if(resultTier==='noDamage'||resultTier==='perfect'){state.scoreStats.noDamageCombats+=1;state.scoreStats.combatBonus+=5;}
      if(resultTier==='perfect'){state.scoreStats.perfectCombats+=1;state.scoreStats.combatBonus+=5;}
      return clone(state.scoreStats);
    }).result;
  }
  function scoreSummary(state=load()){
    const s=state.scoreStats||defaultScore();
    return {baseCombatScore:(Number(s.combatWins)||0)*10,noDamageBonus:(Number(s.noDamageCombats)||0)*5,perfectBonus:(Number(s.perfectCombats)||0)*5,total:(Number(s.combatWins)||0)*10+(Number(s.combatBonus)||0)};
  }

  function purchaseBundle(itemId,amount,cost){
    return update(state=>{
      const wanted=Math.max(0,Math.floor(Number(amount)||0)),price=Math.max(0,Number(cost)||0);
      if(state.coins<price)return {ok:false,reason:'Not enough coin'};
      const fit=maxAdditional(itemId,wanted,state);if(fit<wanted)return {ok:false,reason:'Not enough storage capacity',fit};
      state.coins-=price;
      if(state.shipSettings.autoBalanceCargo){state.storage.unassigned[itemId]=(Number(state.storage.unassigned[itemId])||0)+wanted;repackBalancedInState(state);}
      else placePhysicalInState(state,itemId,wanted);
      state.stores=Storage.totals(state.storage);bumpInventory(state);return {ok:true,accepted:wanted,cost:price};
    }).result;
  }
  function markCombatReportResolved(extra={}){
    return update(state=>{
      if(!state.lastCombat)return {ok:false};
      state.lastCombat={...state.lastCombat,...extra,rewardResolved:true};state.lastSeenCombatAt=state.lastCombat.endedAt||Date.now();return {ok:true};
    }).result;
  }
  function advanceDay(days){
    return update(state=>{
      const whole=Math.max(0,Math.round(Number(days)||0));
      if(!whole)return state.day;
      state.day+=whole;
      const World=window.HighSeasWorldDefinition;
      const foodRate=Math.max(0,Number(World?.ships?.[state.shipId]?.foodPerDay)||4);
      if(Storage&&state.storage){Storage.removeItem(state.storage,'food',foodRate*whole,{preferredRoomIds:['p_hold1','p_hold2']});state.stores=Storage.totals(state.storage);}
      if(World?.enemies){
        for(const def of World.enemies){
          const e=state.enemies?.[def.id];if(!e?.active)continue;
          while(state.day>=Number(e.nextMoveDay||Infinity)){e.routeIndex=(Number(e.routeIndex)||0)+1;e.routeIndex%=def.route.length;e.nodeId=def.route[e.routeIndex];e.nextMoveDay+=def.moveIntervalDays;}
        }
      }
      bumpInventory(state);return state.day;
    }).result;
  }

  // World keeps a long-lived in-memory state. If another screen/helper changes inventory while
  // that page is open, preserve the newer inventory on its next Adventure.save call.
  const publicSave=Adventure.save.bind(Adventure);
  Adventure.save=function(state){
    if(state&&typeof state==='object'){
      const latest=Adventure.load();
      if((Number(latest.inventoryRevision)||0)>(Number(state.inventoryRevision)||0)){
        state.inventoryRevision=latest.inventoryRevision;state.storage=clone(latest.storage);state.stores={...latest.stores};
        state.coins=latest.coins;state.trade=clone(latest.trade);state.shipSettings={...latest.shipSettings};state.shipHealth=clone(latest.shipHealth);state.scoreStats=clone(latest.scoreStats);
      }
    }
    return publicSave(state);
  };

  window.HighSeasShipVoyage={HEALTH_DEF,HOLD_IDS,ensureState,load,missingBlips,carpenterFunctional,roomHealth,repairOne,repairAll,
    applyToCombat,captureCombat,maxAdditional,addCapped,rebalance,setAutoBalance,acceptReward,purchaseBundle,markCombatReportResolved,advanceDay,recordCombatScore,scoreSummary};
})();