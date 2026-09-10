(() => {
  const KEY='highSeasAdventure.v1';
  const VERSION=4;
  const Storage=window.HighSeasShipStorage||null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const defaultStores=()=>({food:6,cannonballs:6,timber:4,medicine:0});
  const defaultShipSettings=()=>({autoSortSpecialStores:true});
  const defaultTrade=()=>({medicineLots:[]});

  function freshState(){
    const stores=defaultStores();
    return {
      version:VERSION,
      runId:`run_${Date.now().toString(36)}`,
      status:'active',
      day:1,
      shipId:'wayward',
      currentNodeId:'seabrook',
      plannedDestinationId:null,
      plannedRoute:[],
      lastLeg:null,
      midPassage:null,
      coins:3,
      stores,
      storage:Storage?Storage.create('wayward',stores):null,
      shipSettings:defaultShipSettings(),
      trade:defaultTrade(),
      visitedNodeIds:['seabrook'],
      resolvedPoiIds:[],
      enemies:{},
      pendingCombat:null,
      lastCombat:null,
      lastSeenCombatAt:0,
      flags:{openingPortShown:false}
    };
  }

  function normalizeMedicineLots(rawLots,count){
    const lots=Array.isArray(rawLots)?rawLots.filter(l=>l&&Number.isFinite(Number(l.boughtDay))).map(l=>({
      id:String(l.id||`med_${l.boughtDay}_${Math.random().toString(36).slice(2,7)}`),
      boughtDay:Number(l.boughtDay),
      premiumUntilDay:Number(l.premiumUntilDay)||Number(l.boughtDay)+8,
      graceUntilDay:Number(l.graceUntilDay)||Number(l.boughtDay)+10
    })):[];
    const wanted=Math.max(0,Math.floor(Number(count)||0));
    while(lots.length<wanted){
      const day=1;lots.push({id:`legacy_med_${lots.length}`,boughtDay:day,premiumUntilDay:day+8,graceUntilDay:day+10});
    }
    return lots.slice(0,wanted);
  }

  function normalize(raw,{storesAreAuthoritative=false}={}){
    const base=freshState();
    if(!raw||typeof raw!=='object')return base;
    const next={...base,...raw};
    next.version=VERSION;
    const legacyStores={...base.stores,...(raw.stores||{})};

    if(Storage){
      if(raw.storage&&typeof raw.storage==='object'){
        next.storage=Storage.normalize(raw.storage,next.shipId);
        if(storesAreAuthoritative){
          for(const itemId of Object.keys(Storage.ITEMS)) Storage.setTotal(next.storage,itemId,legacyStores[itemId]);
        }
      }else{
        next.storage=Storage.create(next.shipId,legacyStores);
      }
      next.stores=Storage.totals(next.storage);
    }else{
      next.storage=null;
      next.stores=legacyStores;
    }

    next.shipSettings={...defaultShipSettings(),...(raw.shipSettings||{})};
    next.trade={...defaultTrade(),...(raw.trade||{})};
    next.trade.medicineLots=normalizeMedicineLots(next.trade.medicineLots,next.stores.medicine);
    next.visitedNodeIds=Array.isArray(raw.visitedNodeIds)?[...new Set(raw.visitedNodeIds)]:base.visitedNodeIds;
    next.resolvedPoiIds=Array.isArray(raw.resolvedPoiIds)?[...new Set(raw.resolvedPoiIds)]:[];
    next.enemies=raw.enemies&&typeof raw.enemies==='object'?clone(raw.enemies):{};
    next.flags={...base.flags,...(raw.flags||{})};
    next.plannedRoute=Array.isArray(raw.plannedRoute)?raw.plannedRoute.filter(Boolean):[];
    next.lastLeg=raw.lastLeg&&typeof raw.lastLeg==='object'?clone(raw.lastLeg):null;
    next.midPassage=raw.midPassage&&typeof raw.midPassage==='object'?clone(raw.midPassage):null;
    return next;
  }

  function emitStorageChanged(state){
    try{
      window.dispatchEvent(new CustomEvent('adventure-storage-changed',{detail:{
        stores:{...(state.stores||{})},storage:state.storage?clone(state.storage):null,shipSettings:{...(state.shipSettings||{})}
      }}));
    }catch{}
  }

  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}
    catch{return freshState();}
  }
  function save(state){
    const next=normalize(state,{storesAreAuthoritative:true});
    localStorage.setItem(KEY,JSON.stringify(next));
    if(state&&typeof state==='object'){
      Object.assign(state,next);
      state.stores={...next.stores};
      state.storage=next.storage?clone(next.storage):null;
      state.shipSettings={...next.shipSettings};
      state.trade=clone(next.trade);
    }
    emitStorageChanged(next);
    return state||next;
  }
  function newAdventure(){const state=freshState();save(state);return state;}
  function update(mutator){const state=load();mutator(state);save(state);return state;}

  function beginCombat({enemyId,enemySetupId,encounterNodeId,approachFromNodeId,name,threat}){
    return update(state=>{
      state.pendingCombat={enemyId,enemySetupId,encounterNodeId,approachFromNodeId,name,threat,startedAt:Date.now()};
    });
  }

  function recordCombatResult(detail={}){
    return update(state=>{
      const pending=state.pendingCombat;
      const kind=detail.kind||'unknown';
      state.lastCombat={...pending,...detail,kind,rewardResolved:false,endedAt:Date.now()};
      if(pending?.enemyId&&(kind==='sunk'||kind==='surrender'||kind==='victory')){
        state.enemies[pending.enemyId]={...(state.enemies[pending.enemyId]||{}),active:false,defeated:true};
      }
      if(kind==='fled'&&pending?.approachFromNodeId&&pending?.encounterNodeId&&pending.approachFromNodeId!==pending.encounterNodeId){
        state.midPassage={fromNodeId:pending.approachFromNodeId,toNodeId:pending.encounterNodeId,reason:'fled'};
        state.currentNodeId=pending.encounterNodeId;
        state.plannedRoute=[];state.plannedDestinationId=null;
      }
      if(kind==='defeat')state.status='defeated';
      state.pendingCombat=null;
      if(Storage&&state.storage&&state.shipSettings?.autoSortSpecialStores){
        Storage.sortStorage(state.storage);state.stores=Storage.totals(state.storage);
      }
    });
  }

  function changeItem(itemId,delta,options={}){
    const amount=Number(delta)||0;
    return update(state=>{
      if(Storage&&state.storage){
        if(amount>=0)Storage.addItem(state.storage,itemId,amount,options);
        else Storage.removeItem(state.storage,itemId,-amount,options);
        state.stores=Storage.totals(state.storage);
      }else if(state.stores&&Object.prototype.hasOwnProperty.call(state.stores,itemId)){
        state.stores[itemId]=(Number(state.stores[itemId])||0)+amount;
      }
    });
  }
  function addItem(itemId,amount=1,options={}){return changeItem(itemId,Math.max(0,Number(amount)||0),options);}
  function consumeItem(itemId,amount=1,options={}){return changeItem(itemId,-Math.max(0,Number(amount)||0),options);}
  function spendCannonball(amount=1){return consumeItem('cannonballs',amount,{preferredRoomIds:['p_mag','p_hold1','p_hold2']});}
  function spendTimber(amount=1){return consumeItem('timber',amount,{preferredRoomIds:['p_carp','p_hold1','p_hold2']});}

  function getStorage(){const state=load();return state.storage?clone(state.storage):null;}
  function getRoomStorage(roomId){const state=load();return Storage&&state.storage?Storage.roomSnapshot(state.storage,roomId):null;}
  function getUnassigned(){const state=load();return Storage&&state.storage?Storage.getUnassigned(state.storage):{};}

  function moveCargo(fromRoomId,fromSlotIndex,toRoomId,toSlotIndex){
    let result={ok:false,reason:'Storage unavailable'};
    update(state=>{
      if(!Storage||!state.storage)return;
      result=Storage.moveStack(state.storage,fromRoomId,Number(fromSlotIndex),toRoomId,Number(toSlotIndex));
      state.stores=Storage.totals(state.storage);
    });
    return result;
  }
  function sortCargo(){
    return update(state=>{if(Storage&&state.storage){Storage.sortStorage(state.storage);state.stores=Storage.totals(state.storage);}});
  }
  function setAutoSort(enabled){
    return update(state=>{
      state.shipSettings=state.shipSettings||defaultShipSettings();
      state.shipSettings.autoSortSpecialStores=!!enabled;
      if(enabled&&Storage&&state.storage){Storage.sortStorage(state.storage);state.stores=Storage.totals(state.storage);}
    });
  }

  function medicinePriceForLot(lot,day){
    if(!lot)return 0;
    if(day<=Number(lot.premiumUntilDay))return 3;
    if(day<=Number(lot.graceUntilDay))return 2;
    return 1;
  }
  function medicineOffer(state=load()){
    const lots=[...(state.trade?.medicineLots||[])].sort((a,b)=>a.boughtDay-b.boughtDay);
    const lot=lots[0]||null;
    return lot?{lot:clone(lot),price:medicinePriceForLot(lot,state.day),daysLeft:Number(lot.premiumUntilDay)-state.day}:null;
  }
  function buyMedicine(){
    let result={ok:false,reason:'Not enough coin'};
    update(state=>{
      if(state.currentNodeId!=='seabrook'){result={ok:false,reason:'Medicine is sold at Seabrook'};return;}
      if(state.coins<1)return;
      state.coins-=1;
      if(Storage&&state.storage){Storage.addItem(state.storage,'medicine',1,{preferredRoomIds:['p_hold1','p_hold2']});state.stores=Storage.totals(state.storage);}
      else state.stores.medicine=(Number(state.stores.medicine)||0)+1;
      state.trade=state.trade||defaultTrade();state.trade.medicineLots=state.trade.medicineLots||[];
      state.trade.medicineLots.push({id:`med_${Date.now().toString(36)}_${state.trade.medicineLots.length}`,boughtDay:state.day,premiumUntilDay:state.day+8,graceUntilDay:state.day+10});
      result={ok:true,premiumUntilDay:state.day+8,graceUntilDay:state.day+10};
    });
    return result;
  }
  function sellMedicine(){
    let result={ok:false,reason:'No Medicine to sell'};
    update(state=>{
      if(state.currentNodeId!=='sunreach'){result={ok:false,reason:'Sunreach is buying this Medicine'};return;}
      const lots=[...(state.trade?.medicineLots||[])].sort((a,b)=>a.boughtDay-b.boughtDay);
      const lot=lots[0];if(!lot||Number(state.stores.medicine)<=0)return;
      const price=medicinePriceForLot(lot,state.day);
      state.coins+=price;
      if(Storage&&state.storage){Storage.removeItem(state.storage,'medicine',1,{preferredRoomIds:['p_hold1','p_hold2']});state.stores=Storage.totals(state.storage);}
      else state.stores.medicine-=1;
      state.trade.medicineLots=(state.trade.medicineLots||[]).filter(x=>x.id!==lot.id);
      result={ok:true,price,lot:clone(lot)};
    });
    return result;
  }

  function clearPendingCombat(){return update(state=>{state.pendingCombat=null;});}

  window.HighSeasAdventure={
    KEY,VERSION,freshState,load,save,newAdventure,update,beginCombat,recordCombatResult,
    addItem,consumeItem,spendCannonball,spendTimber,getStorage,getRoomStorage,getUnassigned,
    moveCargo,sortCargo,setAutoSort,medicineOffer,buyMedicine,sellMedicine,clearPendingCombat
  };
})();