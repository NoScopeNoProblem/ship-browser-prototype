(() => {
  const KEY='highSeasAdventure.v1';
  const VERSION=2;
  const clone=value=>JSON.parse(JSON.stringify(value));

  function freshState(){
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
      stores:{food:0,cannonballs:6,timber:4},
      visitedNodeIds:['seabrook'],
      resolvedPoiIds:[],
      enemies:{},
      pendingCombat:null,
      lastCombat:null,
      lastSeenCombatAt:0,
      flags:{openingPortShown:false}
    };
  }

  function normalize(raw){
    const base=freshState();
    if(!raw||typeof raw!=='object')return base;
    const next={...base,...raw};
    next.version=VERSION;
    next.stores={...base.stores,...(raw.stores||{})};
    // Existing prototype saves started these at zero. Only a genuinely new run receives
    // the new starting ammunition/Timber loadout; never silently grant stores mid-run.
    next.visitedNodeIds=Array.isArray(raw.visitedNodeIds)?[...new Set(raw.visitedNodeIds)]:base.visitedNodeIds;
    next.resolvedPoiIds=Array.isArray(raw.resolvedPoiIds)?[...new Set(raw.resolvedPoiIds)]:[];
    next.enemies=raw.enemies&&typeof raw.enemies==='object'?clone(raw.enemies):{};
    next.flags={...base.flags,...(raw.flags||{})};
    next.plannedRoute=Array.isArray(raw.plannedRoute)?raw.plannedRoute.filter(Boolean):[];
    next.lastLeg=raw.lastLeg&&typeof raw.lastLeg==='object'?clone(raw.lastLeg):null;
    next.midPassage=raw.midPassage&&typeof raw.midPassage==='object'?clone(raw.midPassage):null;
    return next;
  }

  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}
    catch{return freshState();}
  }
  function save(state){localStorage.setItem(KEY,JSON.stringify(normalize(state)));return state;}
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
        // Mid-passage is a consequence state, never a selectable map node. From here either
        // endpoint costs exactly one whole day to reach.
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

  function spendCannonball(amount=1){
    return update(state=>{state.stores.cannonballs-=Math.max(0,Number(amount)||0);});
  }
  function clearPendingCombat(){return update(state=>{state.pendingCombat=null;});}

  window.HighSeasAdventure={KEY,VERSION,freshState,load,save,newAdventure,update,beginCombat,recordCombatResult,spendCannonball,clearPendingCombat};
})();