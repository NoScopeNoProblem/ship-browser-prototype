(() => {
  const KEY = 'highSeasAdventure.v1';
  const VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));

  function freshState(){
    return {
      version: VERSION,
      runId: `run_${Date.now().toString(36)}`,
      status: 'active',
      day: 1,
      shipId: 'wayward',
      currentNodeId: 'seabrook',
      plannedDestinationId: null,
      coins: 3,
      stores: {food:0, cannonballs:0, timber:0},
      visitedNodeIds: ['seabrook'],
      resolvedPoiIds: [],
      enemies: {},
      pendingCombat: null,
      lastCombat: null,
      lastSeenCombatAt: 0,
      flags: {openingPortShown:false}
    };
  }

  function normalize(raw){
    const base=freshState();
    if(!raw || typeof raw!=='object') return base;
    const next={...base,...raw};
    next.version=VERSION;
    next.stores={...base.stores,...(raw.stores||{})};
    next.visitedNodeIds=Array.isArray(raw.visitedNodeIds)?[...new Set(raw.visitedNodeIds)]:base.visitedNodeIds;
    next.resolvedPoiIds=Array.isArray(raw.resolvedPoiIds)?[...new Set(raw.resolvedPoiIds)]:[];
    next.enemies=raw.enemies&&typeof raw.enemies==='object'?clone(raw.enemies):{};
    next.flags={...base.flags,...(raw.flags||{})};
    return next;
  }

  function load(){
    try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'));}
    catch{return freshState();}
  }
  function save(state){localStorage.setItem(KEY,JSON.stringify(normalize(state)));return state;}
  function newAdventure(){const state=freshState();save(state);return state;}
  function update(mutator){const state=load();mutator(state);save(state);return state;}
  function beginCombat({enemyId,enemySetupId,encounterNodeId,name,threat}){
    return update(state=>{state.pendingCombat={enemyId,enemySetupId,encounterNodeId,name,threat,startedAt:Date.now()};});
  }
  function recordCombatResult(detail={}){
    return update(state=>{
      const pending=state.pendingCombat;
      const kind=detail.kind||'unknown';
      state.lastCombat={...pending,...detail,kind,endedAt:Date.now()};
      if(pending?.enemyId && (kind==='sunk'||kind==='surrender'||kind==='victory')){
        state.enemies[pending.enemyId]={...(state.enemies[pending.enemyId]||{}),active:false,defeated:true};
      }
      if(kind==='defeat')state.status='defeated';
      state.pendingCombat=null;
    });
  }
  function clearPendingCombat(){return update(state=>{state.pendingCombat=null;});}

  window.HighSeasAdventure={KEY,VERSION,freshState,load,save,newAdventure,update,beginCombat,recordCombatResult,clearPendingCombat};
})();