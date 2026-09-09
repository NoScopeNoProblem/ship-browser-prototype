(() => {
  let zHeld=false, xHeld=false, introTimer=null;
  let wasResolving=document.body.classList.contains('v3-resolving');

  const rangeOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  rangeOverlay.setAttribute('class','v9-range-overlay');
  rangeOverlay.setAttribute('aria-hidden','true');
  stage.appendChild(rangeOverlay);

  const endTurn=stage.querySelector('.v3-end-turn');
  const turnNumber=document.createElement('div');
  turnNumber.className='v9-turn-number';
  stage.appendChild(turnNumber);

  const turnIntro=document.createElement('div');
  turnIntro.className='v9-turn-intro';
  turnIntro.innerHTML='<div class="v9-turn-intro-card">TURN <span>1</span></div>';
  stage.appendChild(turnIntro);

  function currentTurn(){
    return window.combatTurn?.turn || 1;
  }

  function updateTurnNumber(){
    turnNumber.textContent=`TURN ${currentTurn()}`;
  }

  function showTurnIntro(){
    clearTimeout(introTimer);
    const n=currentTurn();
    turnIntro.querySelector('span').textContent=String(n);
    turnIntro.classList.add('visible');
    document.body.classList.add('v9-turn-intro-active');
    introTimer=setTimeout(()=>{
      turnIntro.classList.remove('visible');
      document.body.classList.remove('v9-turn-intro-active');
    },900);
  }

  // Turn-intro is a genuine short pause: no planning/movement/hotkeys leak through it.
  window.addEventListener('click',e=>{
    if(!document.body.classList.contains('v9-turn-intro-active')) return;
    e.preventDefault(); e.stopImmediatePropagation();
  },true);
  window.addEventListener('keydown',e=>{
    if(!document.body.classList.contains('v9-turn-intro-active')) return;
    e.preventDefault(); e.stopImmediatePropagation();
  },true);

  // Intended damage now reads as a targeting crosshair rather than committed damage.
  pipsMarkup=function(entity,hits=0,dodges=0,prevented=0){
    const arr=[];
    for(let i=0;i<entity.max;i++){
      arr.push(i<entity.hp?'<span>♥</span>':'<span class="damage-empty">♡</span>');
    }
    let cursor=entity.hp-1;
    for(let i=0;i<hits&&cursor>=0;i++,cursor--) arr[cursor]='<span class="hit intent-crosshair" title="Intended damage">⌖</span>';
    for(let i=0;i<dodges&&cursor>=0;i++,cursor--) arr[cursor]='<span class="dodged-mark" title="Avoided by movement">↝</span>';
    for(let i=0;i<prevented&&cursor>=0;i++,cursor--) arr[cursor]='<span class="prevented-mark" title="Prevented: enemy gun disabled">⊘</span>';
    return arr.join(' ');
  };

  // Robust fallback: any hidden enemy room that has actually lost HP is revealed.
  // This makes reveal data-driven and independent of which effect applied the damage.
  function revealDamagedUnknowns(){
    const ids=[];
    enemyRooms.forEach(room=>{
      if(!room.hidden||room.revealed||room.hp>=room.max) return;
      room.revealed=true;
      room.name=room.revealName||'REVEALED ROOM';
      ids.push(room.id);
    });
    return ids;
  }

  // Render reachable track positions from the turn start. Once movement is spent,
  // only the current mast position remains reachable for the rest of this turn.
  const previousRenderTrack=renderTrack;
  renderTrack=function(){
    previousRenderTrack();
    const start=state.turnStartMast ?? window.combatTurn?.startMast ?? state.playerMastTrack;
    [...trackRow.children].forEach((cell,index)=>{
      const outsideHullRange=index<PLAYER_MAST_MIN||index>PLAYER_MAST_MAX;
      let unreachable=outsideHullRange;
      if(playerMast.hp<=0) unreachable=unreachable||index!==state.playerMastTrack;
      else if(state.movedThisTurn) unreachable=unreachable||index!==state.playerMastTrack;
      else unreachable=unreachable||Math.abs(index-start)>1;
      cell.classList.toggle('track-unreachable',unreachable);
      cell.classList.toggle('track-reachable',!unreachable);
    });
  };

  function plannedDisabledEnemyGun(id){
    try{
      return !!enemyIntentDistribution(playerIntentDistribution())?.disabledSources?.has(id);
    }catch{return false;}
  }

  function activeEnemyIntent(id){
    return enemyIntents.find(i=>i.sourceId===id&&!i.inactive)||null;
  }

  function rangeKind(side,room){
    if(room.hp<=0) return 'disabled';
    if(room.loading) return 'loading';
    if(side==='enemy'){
      if(plannedDisabledEnemyGun(room.id)) return 'disabled';
      const intent=activeEnemyIntent(room.id);
      if(intent&&!projectedEnemyImpact(intent)) return 'miss';
    }
    return 'live';
  }

  function drawRange(side,room,kind){
    if(!room?.weapon) return;
    const sourceEl=getEntityElement(side,room.id);
    if(!sourceEl) return;
    const targetGrid=side==='enemy'?playerGrid:enemyGrid;
    const targetMast=side==='enemy'?playerMastBox:enemyMastBox;
    const sr=stage.getBoundingClientRect();
    const rr=sourceEl.getBoundingClientRect();
    const gr=targetGrid.getBoundingClientRect();
    const mr=targetMast.getBoundingClientRect();
    const range=weapons[room.weapon]?.range ?? weapons[room.weapon]?.arc ?? 0;
    const sw=sourceWorld(side,room);
    const sx=rr.left-sr.left+rr.width/2;
    const sy=rr.top-sr.top+rr.height/2;
    const minY=Math.min(gr.top,mr.top)-sr.top;
    const maxY=gr.bottom-sr.top;
    const above=sy<minY;
    const nearY=above?minY:maxY;
    const farY=above?maxY:minY;
    const minX=worldColX(sw-range);
    const maxX=worldColX(sw+range+1);
    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points',[[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(p=>p.join(',')).join(' '));
    poly.setAttribute('class',`v9-range ${side} ${kind}`);
    poly.dataset.sourceId=room.id;
    rangeOverlay.appendChild(poly);
  }

  function renderHeldRanges(){
    rangeOverlay.innerHTML='';
    if(zHeld){
      enemyRooms.filter(r=>r.weapon).forEach(room=>drawRange('enemy',room,rangeKind('enemy',room)));
    }
    if(xHeld){
      playerRooms.filter(r=>r.weapon).forEach(room=>drawRange('player',room,rangeKind('player',room)));
    }
  }

  // Existing single-gun hover arcs stay in use. Classify them after they render so a
  // shot that will miss reads as grey/dashed rather than as a live red threat.
  function classifyExistingEnemyArcs(){
    document.querySelectorAll('.v4-arc.enemy[data-source-id]').forEach(arc=>{
      arc.classList.remove('miss','loading');
      const room=sourceEntity('enemy',arc.dataset.sourceId);
      if(!room) return;
      const kind=rangeKind('enemy',room);
      if(kind==='miss') arc.classList.add('miss');
      if(kind==='loading') arc.classList.add('loading');
      if(kind==='disabled') arc.classList.add('disabled');
    });
  }

  function decoratePlannedGunUse(){
    document.querySelectorAll('.action-used').forEach(el=>el.classList.remove('action-used'));
    playerRooms.filter(r=>r.weapon).forEach(room=>{
      if(!Object.prototype.hasOwnProperty.call(state.playerIntents||{},room.id)) return;
      const el=getEntityElement('player',room.id);
      if(!el) return;
      el.classList.remove('action-ready');
      el.classList.add('action-used');
    });
  }

  // Recreate generic status badges without relying on p_/e_ id prefixes.
  function normalizeRoomStatusBadges(){
    document.querySelectorAll('.loading-v4').forEach(n=>n.remove());
    [...playerRooms,...enemyRooms].filter(r=>r.weapon&&r.hp>0&&r.loading).forEach(room=>{
      const side=playerRooms.includes(room)?'player':'enemy';
      const el=getEntityElement(side,room.id);
      if(!el) return;
      const badge=document.createElement('div');
      badge.className='loading-v4';
      badge.innerHTML='<span class="wheel">↻</span><span>LOAD</span>';
      el.appendChild(badge);
    });

    document.querySelectorAll('.destroyed-gun-badge').forEach(n=>n.remove());
    [...playerRooms,...enemyRooms].filter(r=>r.weapon&&r.hp<=0).forEach(room=>{
      const side=playerRooms.includes(room)?'player':'enemy';
      const el=getEntityElement(side,room.id);
      if(!el) return;
      const badge=document.createElement('div');
      badge.className='destroyed-gun-badge';
      badge.innerHTML='<span>✕</span><b>DISABLED</b>';
      el.appendChild(badge);
    });
  }

  const previousRefresh=refresh;
  refresh=function(){
    const revealed=revealDamagedUnknowns();
    if(revealed.length) renderShips();
    previousRefresh();
    decoratePlannedGunUse();
    normalizeRoomStatusBadges();
    classifyExistingEnemyArcs();
    updateTurnNumber();
    if(zHeld||xHeld) renderHeldRanges();
    revealed.forEach(id=>{
      const el=getEntityElement('enemy',id);
      if(el) showRoomTooltip(el,'Revealed');
    });
  };

  // The v4 hover layer renders during pointer events without necessarily going through
  // the final refresh wrapper, so classify it one frame later as well.
  stage.addEventListener('pointerover',()=>requestAnimationFrame(classifyExistingEnemyArcs),true);

  window.addEventListener('keydown',e=>{
    if(document.body.classList.contains('v9-turn-intro-active')||document.body.classList.contains('v3-resolving')) return;
    if(e.code==='KeyZ'){
      zHeld=true;
      document.body.classList.add('v9-range-held','v9-z-held');
      renderHeldRanges();
    }else if(e.code==='KeyX'){
      xHeld=true;
      document.body.classList.add('v9-range-held','v9-x-held');
      renderHeldRanges();
    }
  },true);
  window.addEventListener('keyup',e=>{
    if(e.code==='KeyZ') zHeld=false;
    if(e.code==='KeyX') xHeld=false;
    if(!zHeld&&!xHeld){
      document.body.classList.remove('v9-range-held','v9-z-held','v9-x-held');
      rangeOverlay.innerHTML='';
    }else{
      document.body.classList.toggle('v9-z-held',zHeld);
      document.body.classList.toggle('v9-x-held',xHeld);
      renderHeldRanges();
    }
  },true);

  const observer=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(wasResolving&&!now){
      updateTurnNumber();
      showTurnIntro();
    }
    wasResolving=now;
  });
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});

  updateTurnNumber();
  renderShips();
  refresh();
  setTimeout(showTurnIntro,120);
})();
