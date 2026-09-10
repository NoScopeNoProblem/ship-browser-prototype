(() => {
  const Adventure=window.HighSeasAdventure;
  if(!Adventure)return;

  const clone=value=>JSON.parse(JSON.stringify(value));
  const baseLoad=Adventure.load.bind(Adventure);
  const tracked=new Set();

  function normalizeCompletedReport(state){
    const last=state?.lastCombat;
    if(!last)return state;
    const completed=last.rewardResolved||last.postCombat?.stage==='done';
    if(completed&&Number(last.endedAt)>Number(state.lastSeenCombatAt||0))state.lastSeenCombatAt=Number(last.endedAt)||state.lastSeenCombatAt;
    return state;
  }
  function overwrite(target,source){
    for(const key of Object.keys(target))if(!Object.prototype.hasOwnProperty.call(source,key))delete target[key];
    Object.assign(target,clone(source));
    return target;
  }
  function sync(){
    const latest=normalizeCompletedReport(baseLoad());
    for(const ref of [...tracked]){
      if(!ref||typeof ref!=='object'){tracked.delete(ref);continue;}
      overwrite(ref,latest);
    }
    return latest;
  }

  Adventure.load=function(){
    const state=normalizeCompletedReport(baseLoad());
    tracked.add(state);
    return state;
  };

  for(const method of ['buyMedicine','sellMedicine']){
    if(typeof Adventure[method]!=='function')continue;
    const base=Adventure[method].bind(Adventure);
    Adventure[method]=function(){const result=base(...arguments);sync();return result;};
  }

  window.HighSeasWorldStateSync={sync};
})();
