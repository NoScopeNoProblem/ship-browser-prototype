(() => {
  // v18: keep planning-state feedback derived from current turn state rather than stale DOM.
  const currentTurn=()=>window.combatTurn?.turn||1;
  const enemyRoom=id=>enemyRooms.find(r=>r.id===id)||null;
  const playerRoom=id=>playerRooms.find(r=>r.id===id)||null;

  function roomPips(side,id){
    const el=getEntityElement(side,id);return el?[...el.querySelectorAll('.pips span')]:[];
  }

  function clearLegacyRepairMarks(){
    document.querySelectorAll('.v13-repaired-heart').forEach(pip=>{
      pip.classList.remove('v13-repaired-heart');
      if(!pip.classList.contains('damage-empty')&&!pip.classList.contains('hit')&&!pip.classList.contains('intent-crosshair')&&!pip.classList.contains('prevented-mark')&&!pip.classList.contains('explosion-hit')){
        pip.textContent='♥';pip.title='';
      }
    });
  }

  function markRepairPip(side,target,index,label){
    const pips=roomPips(side,target.id),pip=pips[index];if(!pip)return;
    // Incoming damage language owns a pip if both effects collide on that exact blip.
    if(pip.classList.contains('hit')||pip.classList.contains('intent-crosshair')||pip.classList.contains('prevented-mark')||pip.classList.contains('explosion-hit'))return;
    pip.classList.add('v18-repair-intent-heart');pip.textContent='♥+';pip.title=label;
  }

  function clearRepairIntentPips(){
    document.querySelectorAll('.v18-repair-intent-heart').forEach(pip=>{
      pip.classList.remove('v18-repair-intent-heart');
      if(!pip.classList.contains('damage-empty')&&!pip.classList.contains('hit')&&!pip.classList.contains('intent-crosshair')&&!pip.classList.contains('prevented-mark')&&!pip.classList.contains('explosion-hit')){
        pip.textContent=pip.classList.contains('damage-empty')?'♡':'♥';pip.title='';
      }
    });
  }

  function decorateRepairIntentPips(){
    clearLegacyRepairMarks();clearRepairIntentPips();
    if(window.combatTurn?.resolving||window.combatEnded)return;

    // Player repair has already changed prototype HP during planning; show the restored blip
    // green only until this turn resolves, then it becomes a normal heart.
    const playerRepairs=window.combatUtility?.plannedRepairs?.()||[];
    playerRepairs.forEach(plan=>{
      const target=playerRoom(plan.targetId);if(!target||target.hp<=0)return;
      markRepairPip('player',target,plan.beforeHp,'Repair planned');
    });

    // Enemy repair is an intention. Show the first missing blip as the proposed green heart.
    const actions=(window.enemyAI?.currentActions?.()||window.enemyActionIntents||[]).filter(a=>a.actionType==='repair'&&a.turn===currentTurn());
    actions.forEach(action=>{
      const source=enemyRoom(action.sourceId),target=enemyRoom(action.targetId);if(!source||!target||target.hp<=0||target.hp>=target.max)return;
      const cancelled=window.enemyAI?.utilityIntentCancelled?.(action)??false;if(cancelled)return;
      markRepairPip('enemy',target,target.hp,'Enemy repair intended');
    });
  }

  function explosionPipContainer(side,id){
    if(id===enemyMast.id)return enemyMastPips;if(id===playerMast.id)return playerMastPips;
    return getEntityElement(side,id)?.querySelector('.pips')||null;
  }
  function markExplosionPipsLast(side,dist){
    (dist?.explosions||new Map()).forEach((count,id)=>{
      const entity=sourceEntity(side,id),container=explosionPipContainer(side,id);if(!entity||!container)return;
      const pips=[...container.querySelectorAll('span')];
      for(let i=0;i<count;i++){
        const index=entity.hp-1-i;if(index<0||!pips[index])continue;
        const pip=pips[index];pip.className='explosion-hit';pip.textContent='✹';pip.title='Magazine explosion: +1 damage';
      }
    });
  }
  function decorateExplosionPipsLast(){
    if(window.combatTurn?.resolving||window.combatEnded)return;
    try{
      const playerState=playerIntentDistribution(),enemyState=enemyIntentDistribution(playerState);
      markExplosionPipsLast('enemy',playerState);markExplosionPipsLast('player',enemyState);
    }catch{}
  }

  function clearMastMissMarkers(){document.querySelectorAll('.v18-mast-miss-marker').forEach(n=>n.remove());}
  function decorateMastMiss(){
    clearMastMissMarkers();
    if(window.combatTurn?.resolving||window.combatEnded||document.body.classList.contains('v11-intent-preview-active'))return;
    let misses=[];try{misses=enemyIntentDistribution(playerIntentDistribution())?.missMap||[];}catch{return;}
    misses.filter(intent=>intent.lane==='mast').forEach(intent=>{
      const source=sourceEntity('enemy',intent.sourceId);if(!source)return;
      // Suppress the older marker for this source and put MISS into the now-empty world column
      // where the Mast was originally aimed, leaving the moved Mast's hearts unobscured.
      stage.querySelectorAll(`.miss-marker[data-source-id="${intent.sourceId}"]`).forEach(n=>n.style.display='none');
      const sr=stage.getBoundingClientRect(),mr=playerMastBox.getBoundingClientRect();
      const marker=document.createElement('div');marker.className='v18-mast-miss-marker';marker.dataset.sourceId=intent.sourceId;
      marker.style.left=`${worldColX(intent.targetWorld)+ROOM_W()/2}px`;marker.style.top=`${mr.top-sr.top+Math.max(24,mr.height*.42)}px`;
      marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<b>MISS</b>`;
      marker.title=`${weapons[source.weapon]?.name||'Enemy cannon'} missed after manoeuvre`;
      marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',intent.sourceId));marker.addEventListener('mouseleave',endIntentHover);
      stage.appendChild(marker);
    });
  }

  function hideObsoleteMastMisses(){
    const live=new Set([...document.querySelectorAll('.v18-mast-miss-marker')].map(n=>n.dataset.sourceId));
    document.querySelectorAll('.miss-marker').forEach(n=>{if(!live.has(n.dataset.sourceId))n.style.display='';});
  }

  function decorateAll(){
    decorateRepairIntentPips();
    decorateExplosionPipsLast();
    decorateMastMiss();
    hideObsoleteMastMisses();
  }

  const baseRefresh=refresh;
  refresh=function(){baseRefresh();decorateAll();};

  // Re-run after movement because world-space misses and explosion chains can change without HP changing.
  moveAft.addEventListener('click',()=>requestAnimationFrame(refresh));
  moveFore.addEventListener('click',()=>requestAnimationFrame(refresh));
  window.addEventListener('keydown',e=>{if(e.code==='ArrowLeft'||e.code==='ArrowRight'||e.code==='KeyR')requestAnimationFrame(refresh);},true);
  window.addEventListener('combat-ended',()=>{clearMastMissMarkers();clearRepairIntentPips();});

  refresh();
})();
