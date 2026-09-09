(() => {
  // v20: explicit damage typing + turn-snapshotted Mast aim feedback.
  // Damage markers now come from the damage model itself, not from a late DOM recolour pass.

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

  // Route normal intent pip rendering through the typed damage model. renderShips() still uses
  // ordinary hearts because it represents committed HP, not projected damage.
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
  // Snapshot the enemy's Mast aim when the player turn opens. This survives later retarget/UI
  // refreshes, so moving away always has an unambiguous original world-column to display.
  let aimTurn=null;
  let aimStart=null;
  const mastAimSnapshot=new Map();

  function currentTurn(){return window.combatTurn?.turn||1;}
  function planningStart(){return state.turnStartMast??window.combatTurn?.startMast??state.playerMastTrack;}

  function captureMastAims(force=false){
    if(window.combatEnded||window.combatTurn?.resolving)return;
    const turn=currentTurn(),start=planningStart();
    if(!force&&aimTurn===turn&&aimStart===start)return;
    mastAimSnapshot.clear();
    enemyIntents.forEach(intent=>{
      const source=sourceEntity('enemy',intent.sourceId);
      if(!source||!source.weapon||source.hp<=0)return;
      const aimedAtMast=intent.logicalTargetId===playerMast.id||intent.lane==='mast';
      if(!aimedAtMast)return;
      mastAimSnapshot.set(intent.sourceId,{world:Number.isFinite(intent.targetWorld)?intent.targetWorld:start,turn});
    });
    aimTurn=turn;aimStart=start;
  }

  function clearMastMissMarkers(){
    document.querySelectorAll('.v20-mast-miss-marker,.v19-mast-miss-marker,.v18-mast-miss-marker').forEach(n=>n.remove());
  }

  function sourceCancelledByPlan(source){
    try{return source.hp-(playerIntentDistribution()?.hits?.get(source.id)||0)<=0;}
    catch{return false;}
  }

  function renderMastMissMarkers(){
    clearMastMissMarkers();
    if(window.combatEnded||window.combatTurn?.resolving||document.body.classList.contains('v11-intent-preview-active'))return;
    captureMastAims();
    if(!mastAimSnapshot.size)return;

    const sr=stage.getBoundingClientRect(),pg=playerGrid.getBoundingClientRect();
    const baseY=pg.top-sr.top-26;
    let stackIndex=0;

    mastAimSnapshot.forEach((aim,sourceId)=>{
      if(aim.turn!==currentTurn()||state.playerMastTrack===aim.world)return;
      const source=sourceEntity('enemy',sourceId);
      if(!source||source.hp<=0||!source.weapon||!window.combatTurn?.isReady(source.id)||sourceCancelledByPlan(source))return;

      // The miss belongs to the empty world-column where the Mast was aimed at, immediately
      // above the player's room row and beside the Mast's new position.
      stage.querySelectorAll(`.miss-marker[data-source-id="${sourceId}"]`).forEach(n=>n.remove());
      const marker=document.createElement('div');
      marker.className='v20-mast-miss-marker';
      marker.dataset.sourceId=sourceId;
      marker.style.left=`${worldColX(aim.world)+ROOM_W()/2}px`;
      marker.style.top=`${baseY-stackIndex*32}px`;
      marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<b>MISS</b>`;
      marker.title=`${weapons[source.weapon]?.name||'Enemy cannon'} missed the Mast after manoeuvre`;
      marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',sourceId));
      marker.addEventListener('mouseleave',endIntentHover);
      stage.appendChild(marker);
      stackIndex++;
    });
  }

  const baseRefresh=refresh;
  refresh=function(){
    // A new turn can be observed before all older MutationObservers finish retargeting; defer a
    // forced snapshot one frame when the turn number changes, then render from that snapshot.
    if(aimTurn!==currentTurn()) requestAnimationFrame(()=>{captureMastAims(true);renderMastMissMarkers();});
    baseRefresh();
    renderMastMissMarkers();
  };

  const bodyObserver=new MutationObserver(()=>{
    if(!document.body.classList.contains('v3-resolving')&&!document.body.classList.contains('v11-intent-preview-active')){
      requestAnimationFrame(()=>{captureMastAims(true);renderMastMissMarkers();});
    }
  });
  bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  moveAft.addEventListener('click',()=>requestAnimationFrame(renderMastMissMarkers));
  moveFore.addEventListener('click',()=>requestAnimationFrame(renderMastMissMarkers));
  window.addEventListener('keydown',e=>{
    if(e.code==='ArrowLeft'||e.code==='ArrowRight'||e.code==='KeyR')requestAnimationFrame(renderMastMissMarkers);
  },true);
  window.addEventListener('resize',()=>requestAnimationFrame(renderMastMissMarkers));
  window.addEventListener('combat-ended',clearMastMissMarkers);

  captureMastAims(true);
  refresh();
})();
