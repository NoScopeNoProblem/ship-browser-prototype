(() => {
  if(typeof window.enemyIntentDistribution!=='function')return;

  const baseEnemyIntentDistribution=window.enemyIntentDistribution;
  function damageForIntent(intent,targetId){
    const source=typeof sourceEntity==='function'?sourceEntity('enemy',intent?.sourceId):null;
    const target=typeof sourceEntity==='function'?sourceEntity('player',targetId):null;
    const weapon=source?.weapon?weapons?.[source.weapon]:null;
    if(target?.kind==='mast'&&Number.isFinite(Number(weapon?.mastDamage)))return Number(weapon.mastDamage);
    return Math.max(0,Number(intent?.damage??weapon?.damage??0)||0);
  }
  function normalizeIntentMap(map){
    if(!(map instanceof Map))return {map,total:new Map()};
    const next=new Map(),total=new Map();
    map.forEach((intents,targetId)=>{
      const normalized=(intents||[]).map(intent=>({...intent,damage:damageForIntent(intent,targetId)}));
      next.set(targetId,normalized);
      total.set(targetId,normalized.reduce((sum,intent)=>sum+(Number(intent.damage)||0),0));
    });
    return {map:next,total};
  }

  window.enemyIntentDistribution=function(playerState){
    const dist=baseEnemyIntentDistribution(playerState);
    // v27 deliberately falls back to the legacy projection while the sequential enemy-intention
    // reveal is active. Normalize that one presentation path so target-specific weapon damage
    // (notably Chain Shot's 2 Mast damage) is visible before the reveal animation ends.
    if(!document.body.classList.contains('v11-intent-preview-active')||!dist)return dist;
    const active=normalizeIntentMap(dist.targetMap);
    const prevented=normalizeIntentMap(dist.preventedTargetMap);
    if(active.map instanceof Map){dist.targetMap=active.map;dist.hits=active.total;}
    if(prevented.map instanceof Map&&dist.preventedTargetMap instanceof Map){dist.preventedTargetMap=prevented.map;dist.prevented=prevented.total;}
    if(Array.isArray(dist.missMap))dist.missMap=dist.missMap.map(intent=>({...intent,damage:damageForIntent(intent,intent.logicalTargetId)}));
    return dist;
  };

  // Enemy Brace is prepared during the intention phase, before the player's volley resolves.
  // Once armed, destroying the Boatswain later in that volley does not revoke the protection.
  if(window.enemyAI?.currentActions){
    enemyAI.braceCount=function(targetId){
      const target=typeof sourceEntity==='function'?sourceEntity('enemy',targetId):null;
      if(!target||target.hp<=0)return 0;
      return enemyAI.currentActions().some(action=>action.actionType==='brace'&&action.targetId===targetId&&action.armed&&!action.consumed)?1:0;
    };
  }

  function fixPreparedBracePresentation(){
    document.querySelectorAll('.v11-enemy-action-chip.brace').forEach(chip=>{
      chip.classList.remove('cancelled');
      chip.title='Enemy Brace — prepared before firing; remains active even if the Boatswain is destroyed.';
    });
  }
  const baseRefresh=window.refresh;
  if(typeof baseRefresh==='function')window.refresh=function(){const result=baseRefresh.apply(this,arguments);fixPreparedBracePresentation();return result;};
  const observer=new MutationObserver(fixPreparedBracePresentation);
  const stage=document.getElementById('combatStage');if(stage)observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  fixPreparedBracePresentation();
})();
