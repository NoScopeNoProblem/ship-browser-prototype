(() => {
  const KEY='highSeasAdventure.v1';
  const VERSION=3;
  const Storage=window.HighSeasShipStorage||null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const defaultStores=()=>({food:6,cannonballs:6,timber:4});

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
      visitedNodeIds:['seabrook'],
      resolvedPoiIds:[],
      enemies:{},
      pendingCombat:null,
      lastCombat:null,
      lastSeenCombatAt:0,
      flags:{openingPortShown:false}
    };
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
        // v1/v2 migration: preserve exactly what the old global counters held and place it into
        // the new room-aware model. Do not silently grant the new starter loadout mid-run.
        next.storage=Storage.create(next.shipId,legacyStores);
      }
      next.stores=Storage.totals(next.storage);
    }else{
      next.storage=null;
      next.stores=legacyStores;
    }

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
        stores:{...(state.stores||{})},storage:state.storage?clone(state.storage):null
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
      state.version=next.version;
      state.stores={...next.stores};
      state.storage=next.storage?clone(next.storage):null;
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
        state.midPassage={
          fromNodeId:pending.approachFromNodeId,
          toNodeId:pending.encounterNodeId,
          reason:'fled'
        };
        state.currentNodeId=pending.encounterNodeId;
        state.plannedRoute=[];
        state.plannedDestinationId=null;
      }
      if(kind==='defeat')state.status='defeated';
      state.pendingCombat=null;
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
  function spendCannonball(amount=1){return consumeItem('cannonballs',amount);}
  function spendTimber(amount=1){return consumeItem('timber',amount);}
  function getStorage(){const state=load();return state.storage?clone(state.storage):null;}
  function getRoomStorage(roomId){
    const state=load();
    return Storage&&state.storage?Storage.roomSnapshot(state.storage,roomId):null;
  }
  function getUnassigned(){
    const state=load();
    return Storage&&state.storage?Storage.getUnassigned(state.storage):{};
  }
  function clearPendingCombat(){return update(state=>{state.pendingCombat=null;});}

  window.HighSeasAdventure={
    KEY,VERSION,freshState,load,save,newAdventure,update,beginCombat,recordCombatResult,
    addItem,consumeItem,spendCannonball,spendTimber,getStorage,getRoomStorage,getUnassigned,clearPendingCombat
  };
})();