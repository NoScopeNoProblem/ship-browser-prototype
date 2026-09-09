(() => {
  // v20: explicit damage typing + pure Mast MISS presentation.
  // This module no longer owns, snapshots, or observes movement state. Mast misses are derived
  // directly from the locked enemy intent plus the current alignment every time refresh runs.

  const DAMAGE_TYPES = Object.freeze({
    cannon: Object.freeze({id:'cannon', symbol:'⌖', className:'hit intent-crosshair damage-type-cannon', title:'Cannon fire'}),
    explosive: Object.freeze({id:'explosive', symbol:'✹', className:'explosion-hit damage-type-explosive', title:'Magazine explosion: +1 damage'})
  });

  function typedDistribution(dist){
    if(!dist || !(dist.hits instanceof Map)) return dist;
    const damageTypes = new Map();
    dist.hits.forEach((total,id) => {
      const existing = dist.damageTypes instanceof Map ? dist.damageTypes.get(id) : null;
      if(Array.isArray(existing) && existing.length === total){
        damageTypes.set(id,[...existing]);
        return;
      }
      const explosive = Math.max(0,Math.min(total,Number(dist.explosions?.get(id)||0)));
      const direct = Math.max(0,total-explosive);
      damageTypes.set(id,[...Array(direct).fill('cannon'),...Array(explosive).fill('explosive')]);
    });
    return {...dist,damageTypes};
  }

  const basePlayerIntentDistribution = playerIntentDistribution;
  playerIntentDistribution = function(){
    return typedDistribution(basePlayerIntentDistribution());
  };

  const baseEnemyIntentDistribution = enemyIntentDistribution;
  enemyIntentDistribution = function(playerState = playerIntentDistribution()){
    return typedDistribution(baseEnemyIntentDistribution(playerState));
  };

  function damageTypesFor(dist,id){
    if(!dist) return [];
    const explicit = dist.damageTypes instanceof Map ? dist.damageTypes.get(id) : null;
    if(Array.isArray(explicit)) return [...explicit];
    const total = Number(dist.hits?.get(id)||0);
    const explosive = Math.max(0,Math.min(total,Number(dist.explosions?.get(id)||0)));
    return [...Array(Math.max(0,total-explosive)).fill('cannon'),...Array(explosive).fill('explosive')];
  }

  function renderIntentPips(entity,dist,id,{prevented=0}={}){
    const arr=[];
    for(let i=0;i<entity.max;i++) arr.push(i<entity.hp?'<span>♥</span>':'<span class="damage-empty">♡</span>');
    let cursor=entity.hp-1;
    damageTypesFor(dist,id).forEach(typeId => {
      if(cursor<0) return;
      const type=DAMAGE_TYPES[typeId]||DAMAGE_TYPES.cannon;
      arr[cursor]=`<span class="${type.className}" data-damage-type="${type.id}" title="${type.title}">${type.symbol}</span>`;
      cursor--;
    });
    for(let i=0;i<prevented&&cursor>=0;i++,cursor--){
      arr[cursor]='<span class="prevented-mark" title="Prevented: enemy action cancelled">⊘</span>';
    }
    return arr.join(' ');
  }

  window.combatDamage = {
    types:DAMAGE_TYPES,
    typedDistribution,
    damageTypesFor,
    renderIntentPips
  };

  // Route projected pips through the typed damage model. Committed HP remains ordinary hearts.
  let damageRenderContext=null;
  const basePipsMarkup=pipsMarkup;
  pipsMarkup=function(entity,hits=0,dodges=0,prevented=0){
    if(!damageRenderContext || hits<=0) return basePipsMarkup(entity,hits,dodges,prevented);
    const playerEntity=entity===playerMast||playerRooms.includes(entity);
    const dist=playerEntity?damageRenderContext.enemy:damageRenderContext.player;
    return renderIntentPips(entity,dist,entity.id,{prevented});
  };

  const baseRenderPipsAndIntentChips=renderPipsAndIntentChips;
  renderPipsAndIntentChips=function(){
    let playerState,enemyState;
    try{
      playerState=playerIntentDistribution();
      enemyState=enemyIntentDistribution(playerState);
      damageRenderContext={player:playerState,enemy:enemyState};
      return baseRenderPipsAndIntentChips();
    }finally{
      damageRenderContext=null;
    }
  };

  // ---- Mast MISS feedback -------------------------------------------------
  // No private aim snapshot. The enemy intent itself is the locked aim for the turn; current
  // alignment determines whether that world-space shot now misses the Mast.
  function clearMastMissMarkers(){
    document.querySelectorAll('.v20-mast-miss-marker,.v19-mast-miss-marker,.v18-mast-miss-marker').forEach(n=>n.remove());
  }

  function sourceCancelledByPlan(source){
    try{return source.hp-(playerIntentDistribution()?.hits?.get(source.id)||0)<=0;}
    catch{return false;}
  }

  function mastMissIntents(){
    if(window.combatEnded||window.combatTurn?.resolving||document.body.classList.contains('v11-intent-preview-active'))return [];
    return enemyIntents.filter(intent=>{
      if(intent?.inactive)return false;
      const source=sourceEntity('enemy',intent.sourceId);
      if(!source||source.hp<=0||!source.weapon||!window.combatTurn?.isReady(source.id)||sourceCancelledByPlan(source))return false;
      const aimedAtMast=intent.logicalTargetId===playerMast.id||intent.lane==='mast';
      if(!aimedAtMast)return false;
      // If the current Mast still occupies the locked world-space aim, it is not a miss.
      return !projectedEnemyImpact(intent);
    });
  }

  function renderMastMissMarkers(){
    clearMastMissMarkers();
    const misses=mastMissIntents();
    if(!misses.length)return;
    const sr=stage.getBoundingClientRect(),pg=playerGrid.getBoundingClientRect();
    const baseY=pg.top-sr.top-26;
    misses.forEach((intent,index)=>{
      const source=sourceEntity('enemy',intent.sourceId);if(!source)return;
      stage.querySelectorAll(`.miss-marker[data-source-id="${source.id}"]`).forEach(n=>n.remove());
      const marker=document.createElement('div');
      marker.className='v20-mast-miss-marker';
      marker.dataset.sourceId=source.id;
      marker.style.left=`${worldColX(intent.targetWorld)+ROOM_W()/2}px`;
      marker.style.top=`${baseY-index*32}px`;
      marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<b>MISS</b>`;
      marker.title=`${weapons[source.weapon]?.name||'Enemy cannon'} missed the Mast after manoeuvre`;
      marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',source.id));
      marker.addEventListener('mouseleave',endIntentHover);
      stage.appendChild(marker);
    });
  }

  const baseRefresh=refresh;
  refresh=function(){
    baseRefresh();
    renderMastMissMarkers();
  };

  window.addEventListener('combat-ended',clearMastMissMarkers);
  refresh();
})();