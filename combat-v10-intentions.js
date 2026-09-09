(() => {
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const preview={
    active:false,
    running:false,
    token:0,
    revealedSources:new Set(),
    revealedUtilities:new Set(),
    scheduled:null
  };

  window.enemyActionIntents=window.enemyActionIntents||structuredClone(ENEMY_SHIP_SETUP.utilityIntents||[]);

  const tracerOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  tracerOverlay.setAttribute('class','v10-intent-tracer-overlay');
  tracerOverlay.setAttribute('aria-hidden','true');
  stage.appendChild(tracerOverlay);

  const previewOverlay=document.createElement('div');
  previewOverlay.className='v10-intent-preview';
  previewOverlay.innerHTML=`
    <div class="v10-intent-card">
      <div class="v10-intent-turn">TURN <span>1</span></div>
      <div class="v10-intent-title">ENEMY INTENTIONS</div>
      <div class="v10-intent-detail">Reading the enemy line…</div>
    </div>`;
  stage.appendChild(previewOverlay);

  const turnEl=previewOverlay.querySelector('.v10-intent-turn span');
  const titleEl=previewOverlay.querySelector('.v10-intent-title');
  const detailEl=previewOverlay.querySelector('.v10-intent-detail');

  function currentTurn(){ return window.combatTurn?.turn||1; }
  function roomSide(room){ return playerRooms.includes(room)?'player':enemyRooms.includes(room)?'enemy':null; }
  function weaponState(room){
    if(!room?.weapon) return null;
    return window.combatTurn?.getWeaponState ? combatTurn.getWeaponState(room.id) : {mode:room.loading?'loading':'ready'};
  }
  function isReady(room){
    return !!(room&&room.weapon&&room.hp>0&&(weaponState(room)?.mode==='ready'));
  }
  function activeEnemyIntent(sourceId){
    return enemyIntents.find(intent=>intent.sourceId===sourceId&&!intent.inactive)||null;
  }
  function playerActionCommitted(){
    if(window.combatFactory?.hasCommittedPlayerAction) return combatFactory.hasCommittedPlayerAction();
    if(Object.keys(state.playerIntents||{}).length) return true;
    return !!(window.combatUtility&&playerRooms.some(room=>
      (room.actionType==='repair'||room.actionType==='quickLoad')&&combatUtility.isUsed(room.id)
    ));
  }

  // Remove another legacy id-prefix assumption from the public turn API.
  if(window.combatTurn){
    combatTurn.isReady=id=>{
      const room=[...playerRooms,...enemyRooms].find(r=>r.id===id);
      return isReady(room);
    };
  }

  // During the preview only intentions already revealed by the animation are allowed
  // into the normal deterministic damage/intent renderer.
  const previousEnemyIntentDistribution=enemyIntentDistribution;
  enemyIntentDistribution=function(playerState=playerIntentDistribution()){
    if(!preview.active) return previousEnemyIntentDistribution(playerState);
    const saved=enemyIntents.slice();
    const visible=saved.filter(intent=>preview.revealedSources.has(intent.sourceId));
    enemyIntents.splice(0,enemyIntents.length,...visible);
    try{
      return previousEnemyIntentDistribution(playerState);
    }finally{
      enemyIntents.splice(0,enemyIntents.length,...saved);
    }
  };

  function plannedDamageTo(id){
    try{return playerIntentDistribution()?.hits?.get(id)||0;}catch{return 0;}
  }
  function plannedCancelledSource(room){
    if(!room||room.hp<=0) return true;
    return room.hp-plannedDamageTo(room.id)<=0;
  }

  const utilityCancelSeen=new Map();

  function clearThreatDensity(){
    document.querySelectorAll('[data-threat-count]').forEach(el=>el.removeAttribute('data-threat-count'));
  }
  function decorateThreatDensity(){
    clearThreatDensity();
    let dist;
    try{dist=enemyIntentDistribution(playerIntentDistribution());}catch{return;}
    dist?.targetMap?.forEach((intents,id)=>{
      const el=getEntityElement('player',id);
      if(!el) return;
      el.dataset.threatCount=String(Math.max(1,Math.min(3,intents.length)));
    });
  }

  function clearOverviewSources(){
    document.querySelectorAll('.v10-overview-fire-enemy,.v10-overview-fire-player,.v10-overview-reload-enemy,.v10-overview-reload-player,.v10-overview-cancelled').forEach(el=>{
      el.classList.remove('v10-overview-fire-enemy','v10-overview-fire-player','v10-overview-reload-enemy','v10-overview-reload-player','v10-overview-cancelled');
    });
  }
  function decorateOverviewSources(){
    clearOverviewSources();
    const z=document.body.classList.contains('v9-z-held');
    const x=document.body.classList.contains('v9-x-held');
    if(z){
      enemyRooms.filter(room=>room.weapon).forEach(room=>{
        const el=getEntityElement('enemy',room.id);
        if(!el||room.hp<=0) return;
        if(room.loading){ el.classList.add('v10-overview-reload-enemy'); return; }
        const intent=activeEnemyIntent(room.id);
        if(!intent) return;
        if(plannedCancelledSource(room)) el.classList.add('v10-overview-cancelled');
        else el.classList.add('v10-overview-fire-enemy');
      });
    }
    if(x){
      playerRooms.filter(room=>room.weapon).forEach(room=>{
        const el=getEntityElement('player',room.id);
        if(!el||room.hp<=0) return;
        if(room.loading){ el.classList.add('v10-overview-reload-player'); return; }
        if(Object.prototype.hasOwnProperty.call(state.playerIntents||{},room.id)) el.classList.add('v10-overview-fire-player');
      });
    }
  }

  // Track cells remain exploratory until another action is committed. The player may
  // compare start-1, start, and start+1 repeatedly; the current occupied cell is never muted.
  const previousRenderTrack=renderTrack;
  renderTrack=function(){
    previousRenderTrack();
    const start=state.turnStartMast??window.combatTurn?.startMast??state.playerMastTrack;
    const locked=playerActionCommitted();
    [...trackRow.children].forEach((cell,index)=>{
      const inHull=index>=PLAYER_MAST_MIN&&index<=PLAYER_MAST_MAX;
      const inTurnRange=Math.abs(index-start)<=1;
      const isCurrent=index===state.playerMastTrack;
      const reachable=isCurrent||(!locked&&playerMast.hp>0&&inHull&&inTurnRange);
      cell.classList.toggle('track-unreachable',!reachable);
      cell.classList.toggle('track-reachable',reachable);
      cell.classList.toggle('track-current',isCurrent);
    });
  };

  function knownUtilitySource(source){
    return !!source&&(!source.hidden||source.revealed);
  }
  function utilityIntentCancelled(action){
    const source=enemyRooms.find(room=>room.id===action.sourceId)||null;
    if(!source) return true;
    if(source.hp<=0) return true;
    if(!knownUtilitySource(source)) return false;
    return source.hp-plannedDamageTo(source.id)<=0;
  }
  function utilityIntentVisible(action,index){
    if(!preview.active) return true;
    return preview.revealedUtilities.has(action.id||`${action.sourceId}:${action.actionType}:${action.targetId}:${index}`);
  }
  function decoratePreviewConcealment(){
    enemyRooms.filter(room=>room.weapon).forEach(room=>{
      const el=getEntityElement('enemy',room.id);
      if(!el) return;
      el.classList.toggle('v10-preview-unrevealed',preview.active&&!preview.revealedSources.has(room.id));
    });
  }

  function renderEnemyUtilityIntents(){
    document.querySelectorAll('.v10-enemy-action-chip').forEach(node=>node.remove());
    (window.enemyActionIntents||[]).forEach((action,index)=>{
      if(!utilityIntentVisible(action,index)) return;
      const target=enemyRooms.find(room=>room.id===action.targetId)||null;
      const targetEl=target?getEntityElement('enemy',target.id):null;
      if(!targetEl) return;
      const chip=document.createElement('div');
      const type=action.actionType==='repair'?'repair':'quickLoad';
      const cancelled=utilityIntentCancelled(action);
      const key=action.id||`${action.sourceId}:${action.actionType}:${action.targetId}:${index}`;
      const source=enemyRooms.find(room=>room.id===action.sourceId)||null;
      if(cancelled&&!utilityCancelSeen.get(key)&&knownUtilitySource(source)){
        setTimeout(()=>showRoomTooltip(targetEl,'Cancelled'),0);
      }
      utilityCancelSeen.set(key,cancelled);
      chip.className=`v10-enemy-action-chip ${type}${cancelled?' cancelled':''}`;
      chip.textContent=type==='repair'?'♥ REPAIR':'↻ QUICK LOAD';
      chip.title=cancelled?'Cancelled':(type==='repair'?'Enemy repair':'Enemy quick load');
      targetEl.appendChild(chip);
    });
  }

  function revealAnyDamagedUnknowns(){
    const revealed=[];
    enemyRooms.forEach(room=>{
      if(!room.hidden||room.revealed||room.hp>=room.max) return;
      room.revealed=true;
      room.name=room.revealName||'REVEALED ROOM';
      revealed.push(room.id);
    });
    return revealed;
  }

  const previousRefresh=refresh;
  refresh=function(){
    const newlyRevealed=revealAnyDamagedUnknowns();
    if(newlyRevealed.length) renderShips();
    previousRefresh();
    decorateThreatDensity();
    decoratePreviewConcealment();
    decorateOverviewSources();
    renderEnemyUtilityIntents();
    newlyRevealed.forEach(id=>{
      const el=getEntityElement('enemy',id);
      if(el) showRoomTooltip(el,'Revealed');
    });
  };

  function center(el){
    const sr=stage.getBoundingClientRect();
    const r=el.getBoundingClientRect();
    return {x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};
  }
  function intentEndpoint(intent,impact){
    if(impact){
      const el=getEntityElement('player',impact.id);
      if(el) return center(el);
    }
    if(intent.lane==='mast') return center(playerMastBox);
    const pg=playerGrid.getBoundingClientRect();
    const sg=stage.getBoundingClientRect();
    const rows=Math.max(1,PLAYER_SHIP_SETUP.rows||1);
    return {
      x:worldColX(intent.targetWorld)+ROOM_W()/2,
      y:pg.top-sg.top+(Number(intent.lane)+.5)*(pg.height/rows)
    };
  }
  async function animateIntentTrace(source,intent,impact,token){
    tracerOverlay.innerHTML='';
    const sourceEl=getEntityElement('enemy',source.id);
    if(!sourceEl) return;
    const a=center(sourceEl),b=intentEndpoint(intent,impact);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
    line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
    line.setAttribute('pathLength','1');
    line.setAttribute('class',`v10-intent-tracer${impact?'':' miss'}`);
    tracerOverlay.appendChild(line);
    sourceEl.classList.add('v10-preview-source');
    await wait(390);
    if(token!==preview.token) return;
    sourceEl.classList.remove('v10-preview-source');
  }
  function flashTarget(impact){
    if(!impact) return;
    const el=getEntityElement('player',impact.id);
    if(!el) return;
    el.classList.add('v10-preview-target-flash');
    setTimeout(()=>el.classList.remove('v10-preview-target-flash'),520);
  }
  function flashSource(room,kind){
    const el=getEntityElement('enemy',room.id);
    if(!el) return;
    el.classList.add(`v10-preview-${kind}`);
    setTimeout(()=>el.classList.remove(`v10-preview-${kind}`),520);
  }

  async function revealWeaponIntent(room,token){
    const label=weapons[room.weapon]?.name||room.name;
    if(room.hp<=0){
      detailEl.textContent=`${label} — DISABLED`;
      flashSource(room,'disabled');
      await wait(420);
      return;
    }
    if(room.loading){
      detailEl.textContent=`${label} — LOADING`;
      preview.revealedSources.add(room.id);
      refresh();
      flashSource(room,'loading');
      await wait(500);
      return;
    }

    const intent=activeEnemyIntent(room.id);
    if(!intent){
      detailEl.textContent=`${label} — HOLDING FIRE`;
      preview.revealedSources.add(room.id);
      refresh();
      await wait(420);
      return;
    }

    const impact=projectedEnemyImpact(intent);
    detailEl.textContent=impact?`${label} → ${impact.name}`:`${label} → MISS`;
    await animateIntentTrace(room,intent,impact,token);
    if(token!==preview.token) return;
    preview.revealedSources.add(room.id);
    refresh();
    flashTarget(impact);
    await wait(520);
  }

  async function revealUtilityIntent(action,index,token){
    const key=action.id||`${action.sourceId}:${action.actionType}:${action.targetId}:${index}`;
    const isRepair=action.actionType==='repair';
    detailEl.textContent=isRepair?'Enemy action — REPAIR':'Enemy action — QUICK LOAD';
    preview.revealedUtilities.add(key);
    refresh();
    const target=enemyRooms.find(room=>room.id===action.targetId);
    if(target){
      const el=getEntityElement('enemy',target.id);
      if(el){
        el.classList.add('v10-preview-green');
        setTimeout(()=>el.classList.remove('v10-preview-green'),620);
      }
    }
    await wait(620);
    if(token!==preview.token) return;
  }

  function previewItems(){
    const items=[];
    enemyRooms.filter(room=>room.weapon).forEach(room=>items.push({kind:'weapon',room,col:room.col,row:room.row}));
    (window.enemyActionIntents||[]).forEach((action,index)=>{
      const source=enemyRooms.find(room=>room.id===action.sourceId);
      items.push({kind:'utility',action,index,col:source?.col??999,row:source?.row??999});
    });
    return items.sort((a,b)=>(a.col-b.col)||(a.row-b.row)||(a.kind==='weapon'?-1:1));
  }

  async function runPreview(){
    if(preview.running||window.combatTurn?.resolving) return;
    preview.running=true;
    const token=++preview.token;
    preview.active=true;
    preview.revealedSources.clear();
    preview.revealedUtilities.clear();
    tracerOverlay.innerHTML='';
    turnEl.textContent=String(currentTurn());
    titleEl.textContent='ENEMY INTENTIONS';
    detailEl.textContent='Reading the enemy line…';
    previewOverlay.classList.add('visible');
    document.body.classList.add('v10-intent-preview-active');
    refresh();
    await wait(240);

    for(const item of previewItems()){
      if(token!==preview.token) return;
      if(item.kind==='weapon') await revealWeaponIntent(item.room,token);
      else await revealUtilityIntent(item.action,item.index,token);
    }
    if(token!==preview.token) return;

    // Once the reveal sequence is complete, show the full deterministic board state
    // while the YOUR TURN handoff is still locking controls.
    preview.active=false;
    tracerOverlay.innerHTML='';
    refresh();
    titleEl.textContent='YOUR TURN';
    detailEl.textContent='Make your move.';
    previewOverlay.classList.add('handoff');
    await wait(760);
    if(token!==preview.token) return;
    previewOverlay.classList.remove('visible','handoff');
    document.body.classList.remove('v10-intent-preview-active');
    preview.running=false;
    refresh();
  }

  function schedulePreview(delay=960){
    clearTimeout(preview.scheduled);
    ++preview.token;
    preview.running=false;
    preview.active=true;
    preview.revealedSources.clear();
    preview.revealedUtilities.clear();
    document.body.classList.add('v10-intent-preview-active');
    refresh();
    preview.scheduled=setTimeout(()=>{
      preview.active=false;
      runPreview();
    },delay);
  }

  // No player interaction leaks into the Into-the-Breach-style intention reveal.
  window.addEventListener('click',e=>{
    if(!document.body.classList.contains('v10-intent-preview-active')) return;
    e.preventDefault(); e.stopImmediatePropagation();
  },true);
  window.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('v10-intent-preview-active')) return;
    e.preventDefault(); e.stopImmediatePropagation();
  },true);

  // Z/X source-room cues are independent of the arc renderer.
  window.addEventListener('keydown',e=>{
    if(e.code==='KeyZ'||e.code==='KeyX') requestAnimationFrame(decorateOverviewSources);
  },true);
  window.addEventListener('keyup',e=>{
    if(e.code==='KeyZ'||e.code==='KeyX') requestAnimationFrame(()=>{clearOverviewSources();decorateOverviewSources();});
  },true);

  // If a planned shot will destroy a firing enemy gun before its action, acknowledge
  // the tactical cancellation immediately after the existing target click commits.
  stage.addEventListener('click',e=>{
    if(document.body.classList.contains('v10-intent-preview-active')||window.combatTurn?.resolving) return;
    const roomEl=e.target.closest&&e.target.closest('.room[data-side="enemy"]');
    const selected=state.selectedWeaponId;
    if(!roomEl||!selected) return;
    const target=enemyRooms.find(room=>room.id===roomEl.dataset.id);
    if(!target?.weapon||target.hp<=0||!isLegalTarget(target.id)) return;
    setTimeout(()=>{
      const intent=activeEnemyIntent(target.id);
      if(intent&&isReady(target)&&plannedCancelledSource(target)) showRoomTooltip(getEntityElement('enemy',target.id),'Cancelled');
      refresh();
    },0);
  },true);

  let wasResolving=document.body.classList.contains('v3-resolving');
  const turnObserver=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(!wasResolving&&now){
      clearTimeout(preview.scheduled);
      ++preview.token;
      preview.running=false;
      preview.active=false;
      previewOverlay.classList.remove('visible','handoff');
      document.body.classList.remove('v10-intent-preview-active');
      tracerOverlay.innerHTML='';
    }
    if(wasResolving&&!now) schedulePreview(960);
    wasResolving=now;
  });
  turnObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.combatIntentPreview={
    replay:()=>schedulePreview(0),
    get active(){return preview.active||preview.running;},
    registerEnemyAction(action){
      window.enemyActionIntents.push({...action});
      refresh();
    },
    utilityIntentCancelled,
    activeEnemyActions(){ return (window.enemyActionIntents||[]).filter(action=>!utilityIntentCancelled(action)); }
  };

  // Initial battle presentation: TURN overlay from v9, then intentions, then YOUR TURN.
  schedulePreview(980);
})();
