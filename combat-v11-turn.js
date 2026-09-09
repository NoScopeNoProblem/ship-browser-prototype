(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function cadenceFor(room){ return weapons[room?.weapon]?.cadence || {initialLoadTurns:0,reloadTurns:1,shotsBeforeReload:1}; }
  function initialWeaponState(room){
    const cadence=cadenceFor(room); const shots=Math.max(1,cadence.shotsBeforeReload||1);
    if((cadence.initialLoadTurns||0)>0) return {mode:'loading',remaining:cadence.initialLoadTurns,shotsLeft:shots};
    return {mode:'ready',shotsLeft:shots};
  }
  const weaponStates={};
  [...playerRooms,...enemyRooms].filter(r=>r.weapon).forEach(r=>{ weaponStates[r.id]=initialWeaponState(r); });
  const phase={resolving:false,turn:1,startMast:state.playerMastTrack,weapon:weaponStates};
  const baseRefresh=refresh;

  function roomForWeaponId(id){ return [...playerRooms,...enemyRooms].find(r=>r.id===id)||null; }
  function wstate(id){ if(!phase.weapon[id]) phase.weapon[id]=initialWeaponState(roomForWeaponId(id)); return phase.weapon[id]; }
  function isReady(room){ return !!(room&&room.weapon&&room.hp>0&&wstate(room.id).mode==='ready'); }
  function syncLoadingFlags(){ [...playerRooms,...enemyRooms].filter(r=>r.weapon).forEach(r=>{r.loading=wstate(r.id).mode!=='ready';}); }

  window.combatTurn={
    isReady(id){ return isReady(roomForWeaponId(id)); },
    getWeaponState(id){ return {...wstate(id)}; },
    setWeaponState(id,next){ phase.weapon[id]={...next}; syncLoadingFlags(); },
    setReady(id){ const room=roomForWeaponId(id); const shots=Math.max(1,cadenceFor(room).shotsBeforeReload||1); phase.weapon[id]={mode:'ready',shotsLeft:shots}; syncLoadingFlags(); },
    setLoading(id,turns){ const room=roomForWeaponId(id); const shots=Math.max(1,cadenceFor(room).shotsBeforeReload||1); phase.weapon[id]={mode:'loading',remaining:Math.max(1,turns||1),shotsLeft:shots}; syncLoadingFlags(); },
    get turn(){return phase.turn;}, get resolving(){return phase.resolving;}, get startMast(){return phase.startMast;}
  };

  function baselineEntityAt(lane,worldCol){
    const left=phase.startMast-PLAYER_MAST_LOCAL_COL;
    if(lane==='mast') return worldCol===phase.startMast?playerMast:null;
    return playerRooms.find(r=>r.row===lane&&left+r.col===worldCol)||null;
  }
  enemyIntents.forEach(intent=>{ if(!intent.logicalTargetId){ const target=baselineEntityAt(intent.lane,intent.targetWorld); intent.logicalTargetId=target?target.id:null; } });
  function baselineImpact(intent){ return baselineEntityAt(intent.lane,intent.targetWorld); }
  function retargetEnemyIntents(){
    const left=phase.startMast-PLAYER_MAST_LOCAL_COL;
    enemyIntents.forEach(intent=>{
      if(!intent.logicalTargetId) return; const target=sourceEntity('player',intent.logicalTargetId); if(!target) return;
      if(target.kind==='mast'){ intent.lane='mast'; intent.targetWorld=phase.startMast; }
      else { intent.lane=target.row; intent.targetWorld=left+target.col; }
    });
  }

  pipsMarkup=function(entity,hits=0,dodges=0,prevented=0){
    const arr=[]; for(let i=0;i<entity.max;i++) arr.push(i<entity.hp?'<span>♥</span>':'<span class="damage-empty">♡</span>');
    let cursor=entity.hp-1;
    for(let i=0;i<hits&&cursor>=0;i++,cursor--) arr[cursor]='<span class="hit">✕</span>';
    for(let i=0;i<dodges&&cursor>=0;i++,cursor--) arr[cursor]='<span class="dodged-mark">↝</span>';
    for(let i=0;i<prevented&&cursor>=0;i++,cursor--) arr[cursor]='<span class="prevented-mark">⊘</span>';
    return arr.join(' ');
  };

  playerIntentDistribution=function(){
    const hits=new Map(),targetMap=new Map();
    Object.entries(state.playerIntents).forEach(([wid,tid])=>{
      const weapon=sourceEntity('player',wid),target=sourceEntity('enemy',tid); if(!weapon||!target||!isReady(weapon)) return;
      const damage=weapons[weapon.weapon].damage; hits.set(tid,(hits.get(tid)||0)+damage);
      if(!targetMap.has(tid)) targetMap.set(tid,[]); targetMap.get(tid).push({sourceId:wid,targetId:tid,damage});
    });
    return {hits,targetMap};
  };

  enemyIntentDistribution=function(playerState=playerIntentDistribution()){
    const hits=new Map(),dodges=new Map(),prevented=new Map(),targetMap=new Map(),preventedTargetMap=new Map(),missMap=[],disabledSources=new Set();
    enemyRooms.filter(r=>r.weapon).forEach(r=>{ const planned=playerState.hits.get(r.id)||0; if(r.hp-planned<=0) disabledSources.add(r.id); });
    enemyIntents.forEach(intent=>{
      const source=sourceEntity('enemy',intent.sourceId); if(!source||source.hp<=0||!isReady(source)||intent.inactive) return;
      const current=projectedEnemyImpact(intent),original=baselineImpact(intent);
      if(disabledSources.has(intent.sourceId)){
        if(current){ prevented.set(current.id,(prevented.get(current.id)||0)+intent.damage); if(!preventedTargetMap.has(current.id)) preventedTargetMap.set(current.id,[]); preventedTargetMap.get(current.id).push(intent); }
        return;
      }
      if(current){ hits.set(current.id,(hits.get(current.id)||0)+intent.damage); if(!targetMap.has(current.id)) targetMap.set(current.id,[]); targetMap.get(current.id).push(intent); }
      if(original&&(!current||current.id!==original.id)) dodges.set(original.id,(dodges.get(original.id)||0)+intent.damage);
      if(!current&&original) missMap.push(intent);
    });
    return {hits,dodges,prevented,targetMap,preventedTargetMap,missMap,disabledSources};
  };

  addEnemyIntentStack=function(targetEl,intents,prevented=false){
    let stack=targetEl.querySelector('.intent-stack.enemy-stack'); if(!stack){stack=document.createElement('div');stack.className='intent-stack enemy-stack';targetEl.appendChild(stack);}
    intents.forEach(intent=>{ const src=sourceEntity('enemy',intent.sourceId); if(!src)return; const chip=document.createElement('div'); chip.className='intent-chip'+(prevented?' prevented':''); chip.dataset.sourceId=intent.sourceId; chip.dataset.side='enemy'; chip.title=prevented?`${weapons[src.weapon].name}: prevented`:`${weapons[src.weapon].name}: ${intent.damage} incoming damage`; chip.innerHTML=iconMarkup(src.weapon,enemySuffix[src.id]||'',true); chip.addEventListener('mouseenter',e=>{e.stopPropagation();beginIntentHover('enemy',intent.sourceId);}); chip.addEventListener('mouseleave',endIntentHover); stack.appendChild(chip); });
  };
  addFriendlyIntentStack=function(targetEl,intents){
    let stack=targetEl.querySelector('.intent-stack.friendly-stack'); if(!stack){stack=document.createElement('div');stack.className='intent-stack friendly-stack';targetEl.appendChild(stack);}
    intents.forEach(intent=>{ const src=sourceEntity('player',intent.sourceId); if(!src)return; const chip=document.createElement('div'); chip.className='intent-chip friendly'; chip.dataset.sourceId=intent.sourceId; chip.dataset.side='player'; chip.innerHTML=iconMarkup(src.weapon,playerSuffix[src.id]||'',true); chip.addEventListener('mouseenter',e=>{e.stopPropagation();beginIntentHover('player',intent.sourceId);}); chip.addEventListener('mouseleave',endIntentHover); stack.appendChild(chip); });
  };
  addMissMarker=function(intent){
    const source=sourceEntity('enemy',intent.sourceId); if(!source)return; const marker=document.createElement('div'); marker.className='miss-marker'; marker.dataset.sourceId=intent.sourceId; marker.style.left=`${worldColX(intent.targetWorld)+10}px`; marker.style.top=`${laneY('player',intent.lane)+34}px`; marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<span class="miss-text">MISS</span>`; marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',intent.sourceId)); marker.addEventListener('mouseleave',endIntentHover); stage.appendChild(marker);
  };

  function clearIntentFocusOnly(){ arcOverlay.innerHTML=''; document.querySelectorAll('.focus-source,.focus-target,.friendly-focus-target,.v3-focus-miss').forEach(el=>el.classList.remove('focus-source','focus-target','friendly-focus-target','v3-focus-miss')); }
  function showIntentFocus(side,sourceId){
    clearIntentFocusOnly(); const src=sourceEntity(side,sourceId); if(!src)return; const srcEl=getEntityElement(side,src.id); if(srcEl)srcEl.classList.add('focus-source');
    if(!isReady(src)){ weaponInfo.innerHTML=`${iconMarkup(src.weapon,'',true)} ${weapons[src.weapon].name}`; targetInfo.textContent='LOADING — cannot fire this turn.'; return; }
    drawArc(side,src);
    if(side==='enemy'){
      const intent=enemyIntents.find(i=>i.sourceId===src.id&&!i.inactive),impact=intent?projectedEnemyImpact(intent):null,enemyState=enemyIntentDistribution(playerIntentDistribution());
      if(impact){const targetEl=getEntityElement('player',impact.id);if(enemyState.disabledSources.has(src.id))targetEl.classList.add('prevented');else targetEl.classList.add('focus-target');}
      else if(intent){const miss=stage.querySelector(`.miss-marker[data-source-id="${src.id}"]`);if(miss)miss.classList.add('v3-focus-miss');}
      weaponInfo.innerHTML=`${iconMarkup(src.weapon,enemySuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
      if(!intent)targetInfo.textContent='No shot planned this turn.'; else if(enemyState.disabledSources.has(src.id))targetInfo.textContent=impact?`Prevented before its shot reaches ${impact.name}.`:'Prevented before firing.'; else targetInfo.textContent=impact?`${impact.name}: ${intent.damage} damage`:'MISS — the aimed space is empty.';
    }else{
      const targetId=state.playerIntents[src.id]; if(targetId)getEntityElement('enemy',targetId).classList.add('friendly-focus-target'); weaponInfo.innerHTML=`${iconMarkup(src.weapon,playerSuffix[src.id]||'',true)} ${weapons[src.weapon].name}`; targetInfo.textContent=targetId?`Planned shot: ${sourceEntity('enemy',targetId).name}`:'No target planned.';
    }
  }
  beginIntentHover=function(side,sourceId){ if(state.exterior||phase.resolving)return; state.hoverIntent={side,sourceId}; showIntentFocus(side,sourceId); };
  endIntentHover=function(){ state.hoverIntent=null; if(!phase.resolving)refresh(); };
  stage.addEventListener('pointerover',e=>{const chip=e.target.closest&&e.target.closest('.intent-chip[data-source-id]');if(!chip||phase.resolving)return;beginIntentHover(chip.dataset.side||'enemy',chip.dataset.sourceId);},true);
  stage.addEventListener('pointerout',e=>{const chip=e.target.closest&&e.target.closest('.intent-chip[data-source-id]');if(!chip||phase.resolving)return;if(chip.contains(e.relatedTarget))return;endIntentHover();},true);

  renderSelection=function(){
    if(!state.selectedWeaponId)return; const weapon=sourceEntity('player',state.selectedWeaponId); if(!weapon||!isReady(weapon)){state.selectedWeaponId=null;return;} getEntityElement('player',weapon.id).classList.add('selectable'); drawArc('player',weapon); getTargetsForWeapon('player',weapon).forEach(t=>getEntityElement('enemy',t.id).classList.add('valid-target')); weaponInfo.innerHTML=`${iconMarkup(weapon.weapon,playerSuffix[weapon.id]||'',true)} ${weapons[weapon.weapon].name}`; targetInfo.textContent='Click a highlighted enemy room or mast to assign this shot. Out-of-range clicks cancel selection.';
  };
  renderHoverWeapon=function(){
    if(!state.hoveredWeapon)return false; const entity=sourceEntity(state.hoveredWeapon.side,state.hoveredWeapon.id); if(!entity)return false; const sourceEl=getEntityElement(state.hoveredWeapon.side,entity.id); if(state.hoveredWeapon.side==='player')sourceEl.classList.add('selectable');else sourceEl.classList.add('focus-source');
    if(!isReady(entity)){weaponInfo.innerHTML=`${iconMarkup(entity.weapon,'',true)} ${weapons[entity.weapon].name}`;targetInfo.textContent=entity.hp<=0?'DISABLED — cannot fire.':'LOADING — cannot fire this turn.';return true;}
    drawArc(state.hoveredWeapon.side,entity);
    if(state.hoveredWeapon.side==='enemy'){
      const intent=enemyIntents.find(i=>i.sourceId===entity.id&&!i.inactive); if(!intent){weaponInfo.innerHTML=`${iconMarkup(entity.weapon,enemySuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`;targetInfo.textContent='No shot planned this turn.';return true;} const impact=projectedEnemyImpact(intent); if(impact)getEntityElement('player',impact.id).classList.add('focus-target'); else {const miss=stage.querySelector(`.miss-marker[data-source-id="${entity.id}"]`);if(miss)miss.classList.add('v3-focus-miss');} weaponInfo.innerHTML=`${iconMarkup(entity.weapon,enemySuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`; targetInfo.textContent=impact?`${impact.name}: ${intent.damage} damage if not prevented.`:'MISS — the aimed space is empty.';
    }else{getTargetsForWeapon('player',entity).forEach(t=>getEntityElement('enemy',t.id).classList.add('friendly-focus-target'));weaponInfo.innerHTML=`${iconMarkup(entity.weapon,playerSuffix[entity.id]||'',true)} ${weapons[entity.weapon].name}`;targetInfo.textContent='Blue rooms are legal targets.';}
    return true;
  };
  renderHoverIntent=function(){if(!state.hoverIntent)return false;showIntentFocus(state.hoverIntent.side,state.hoverIntent.sourceId);return true;};
  highlightOverview=function(side){
    const rooms=(side==='enemy'?enemyRooms:playerRooms).filter(r=>r.weapon&&isReady(r));rooms.forEach(r=>drawArc(side,r));
    if(side==='enemy'){const es=enemyIntentDistribution(playerIntentDistribution());es.targetMap.forEach((_,id)=>getEntityElement('player',id).classList.add('enemy-intended'));es.preventedTargetMap.forEach((_,id)=>getEntityElement('player',id).classList.add('prevented'));weaponInfo.textContent='Enemy firing arcs';targetInfo.textContent='Red = incoming damage. Loading guns are excluded.';}
    else{const coverage=new Set();rooms.forEach(r=>getTargetsForWeapon('player',r).forEach(t=>coverage.add(t.id)));coverage.forEach(id=>getEntityElement('enemy',id).classList.add('friendly-focus-target'));weaponInfo.textContent='Friendly firing arcs';targetInfo.textContent='Blue = currently targetable. Loading guns are excluded.';}
  };
  function decorate(){document.querySelectorAll('.dodge-v3,.loading-v3').forEach(n=>n.remove());[...playerRooms,playerMast].forEach(e=>{const el=getEntityElement('player',e.id);if(!el||!el.classList.contains('dodged'))return;const d=document.createElement('div');d.className='dodge-v3';d.title='Attack dodged by movement';d.innerHTML='<span class="shot">●</span><span class="shield">⤴</span><span class="dodge-word">DODGED</span>';el.appendChild(d);});}
  refresh=function(){syncLoadingFlags();baseRefresh();decorate();};

  function tooltipAt(el,text){const r=el.getBoundingClientRect();const tip=document.createElement('div');tip.className='not-range-v3';tip.textContent=text;tip.style.left=`${r.left+r.width/2}px`;tip.style.top=`${r.top+10}px`;document.body.appendChild(tip);setTimeout(()=>tip.remove(),820);}
  enemyGrid.addEventListener('click',e=>{if(phase.resolving||!state.selectedWeaponId)return;const room=e.target.closest('.room[data-side="enemy"]');if(room&&!isLegalTarget(room.dataset.id))tooltipAt(room,'Not in range');},true);
  enemyMastEl.addEventListener('click',()=>{if(state.selectedWeaponId&&!isLegalTarget(enemyMast.id))tooltipAt(enemyMastEl,'Not in range');},true);

  function clearPlansForMove(){state.playerIntents={};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;}
  const baseMoveLeft=moveLeft,baseMoveRight=moveRight;
  moveLeft=function(){if(phase.resolving)return;clearPlansForMove();baseMoveLeft();};
  moveRight=function(){if(phase.resolving)return;clearPlansForMove();baseMoveRight();};

  const endTurn=document.createElement('button');endTurn.className='v3-end-turn';endTurn.textContent='END TURN';stage.appendChild(endTurn);
  const logPanel=document.createElement('div');logPanel.className='v3-combat-log';const logHead=document.createElement('div');logHead.className='v3-log-head';const logTitle=document.createElement('span');logTitle.textContent='COMBAT LOG';const logToggle=document.createElement('button');logToggle.className='v3-log-toggle';logToggle.textContent='−';logToggle.title='Minimise combat log';const logLines=document.createElement('div');logLines.className='v3-log-lines';logHead.append(logTitle,logToggle);logPanel.append(logHead,logLines);stage.appendChild(logPanel);logToggle.addEventListener('click',e=>{e.stopPropagation();const mini=logPanel.classList.toggle('minimized');logToggle.textContent=mini?'+':'−';});
  const phaseLabel=document.createElement('div');phaseLabel.className='v3-combat-phase';phaseLabel.textContent='COMBAT PHASE';stage.appendChild(phaseLabel);const projectileLayer=document.createElement('div');projectileLayer.className='v3-projectile-layer';stage.appendChild(projectileLayer);const floatLayer=document.createElement('div');floatLayer.className='v3-float-layer';stage.appendChild(floatLayer);

  const cannonAudio=document.createElement('audio');cannonAudio.preload='auto';cannonAudio.crossOrigin='anonymous';cannonAudio.src='https://upload.wikimedia.org/wikipedia/commons/transcoded/2/2d/01_Salute_Cannon_Reveille.ogg/01_Salute_Cannon_Reveille.ogg.mp3';document.body.appendChild(cannonAudio);
  let audioCtx=null;
  function getAudioCtx(){if(!audioCtx||audioCtx.state==='closed')audioCtx=new (window.AudioContext||window.webkitAudioContext)();return audioCtx;}
  function noiseBurst(duration,volume,filterType,frequency){try{const c=getAudioCtx();if(c.state==='suspended')c.resume();const len=Math.max(1,Math.floor(c.sampleRate*duration));const buf=c.createBuffer(1,len,c.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=Math.random()*2-1;const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=buf;filter.type=filterType;filter.frequency.value=frequency;const now=c.currentTime;gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);src.connect(filter).connect(gain).connect(c.destination);src.start(now);}catch{}}
  function splashSound(){noiseBurst(.48,.22,'lowpass',1500);} function splinterSound(){noiseBurst(.24,.28,'highpass',1050);setTimeout(()=>noiseBurst(.14,.14,'bandpass',2800),45);} function synthCannon(){try{const c=getAudioCtx(),len=Math.floor(c.sampleRate*.42),b=c.createBuffer(1,len,c.sampleRate),a=b.getChannelData(0);for(let i=0;i<len;i++){const t=i/c.sampleRate;a[i]=(Math.random()*2-1)*Math.exp(-t*11)+Math.sin(2*Math.PI*56*t)*.55*Math.exp(-t*9)}const s=c.createBufferSource(),g=c.createGain();s.buffer=b;g.gain.value=.21;s.connect(g).connect(c.destination);s.start();}catch{}}
  function cannonSound(){try{cannonAudio.pause();cannonAudio.currentTime=0;cannonAudio.volume=.38;const p=cannonAudio.play();if(p&&p.catch)p.catch(synthCannon);setTimeout(()=>cannonAudio.pause(),650);}catch{synthCannon();}}

  function logLine(html){const line=document.createElement('div');line.className='v3-log-line';line.innerHTML=html;logLines.appendChild(line);logLines.scrollTop=logLines.scrollHeight;}
  const colorSpan=(side,text)=>`<span class="v3-log-${side}">${text}</span>`;
  function center(el){const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};}
  function missPoint(intent){
    const pg=playerGrid.getBoundingClientRect(),sg=stage.getBoundingClientRect();
    if(intent.lane==='mast'){
      const mast=playerMastBox.getBoundingClientRect();
      return {x:worldColX(intent.targetWorld)+roomWidth()/2,y:mast.top-sg.top+mast.height/2};
    }
    const rows=Math.max(1,PLAYER_SHIP_SETUP.rows||1);
    return{x:worldColX(intent.targetWorld)+roomWidth()/2,y:pg.top-sg.top+(Number(intent.lane)+.5)*(pg.height/rows)};
  }
  async function animateBall(fromEl,to,side,outcome){const a=center(fromEl),b=to instanceof Element?center(to):to;const ball=document.createElement('div');ball.className=`v3-ball ${side}`;ball.style.left=`${a.x}px`;ball.style.top=`${a.y}px`;projectileLayer.appendChild(ball);cannonSound();await wait(20);ball.style.transform=`translate(${b.x-a.x}px,${b.y-a.y}px)`;await wait(360);if(outcome==='miss')splashSound();else splinterSound();ball.style.opacity='0';await wait(90);ball.remove();}
  async function floatNote(el,text,cls=''){const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();const note=document.createElement('div');note.className=`v3-resolve-note ${cls}`;note.textContent=text;note.style.left=`${r.left-sr.left+r.width/2}px`;note.style.top=`${r.top-sr.top+r.height/2}px`;floatLayer.appendChild(note);await wait(520);note.remove();}
  function applyDamage(entity,amount){const before=entity.hp;entity.hp=Math.max(0,entity.hp-amount);return before>0&&entity.hp===0;}
  function setLoadingAfterFire(room){const cadence=cadenceFor(room),s=wstate(room.id),shots=Math.max(1,cadence.shotsBeforeReload||1);s.shotsLeft=(s.shotsLeft??shots)-1;if(s.shotsLeft<=0){const reloadTurns=Math.max(0,cadence.reloadTurns??1);if(reloadTurns>0){s.mode='loading';s.remaining=reloadTurns;}else{s.mode='ready';}s.shotsLeft=shots;}else{s.mode='ready';}}
  function finishLoadsThatStartedTurn(loadingIds){loadingIds.forEach(id=>{const s=wstate(id);if(s.mode!=='loading')return;s.remaining=(s.remaining||1)-1;if(s.remaining<=0){const room=roomForWeaponId(id);s.mode='ready';delete s.remaining;s.shotsLeft=Math.max(1,cadenceFor(room).shotsBeforeReload||1);}});}

  function resetTurn(){if(phase.resolving||window.combatEnded)return;state.playerMastTrack=phase.startMast;state.turnStartMast=phase.startMast;state.playerIntents={};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;state.overview=null;state.exterior=false;document.body.classList.remove('exterior-mode');logLines.innerHTML='';refresh();}
  function endResolutionForCombatEnd(){phase.resolving=false;endTurn.disabled=true;phaseLabel.classList.remove('visible');document.body.classList.remove('v3-resolving');renderShips();refresh();}
  async function runAfterDamageHook(context){if(!window.combatHooks?.afterDamage)return false;const result=await window.combatHooks.afterDamage(context);return !!(result===true||result?.combatEnded||window.combatEnded);}

  async function resolveTurn(){
    if(phase.resolving||window.combatEnded)return;phase.resolving=true;document.body.classList.add('v3-resolving');endTurn.disabled=true;phaseLabel.classList.add('visible');logLines.innerHTML='';
    const resolvingTurn=phase.turn,plans={...state.playerIntents},loadingAtStart=new Set(Object.keys(phase.weapon).filter(id=>wstate(id).mode==='loading'));
    state.playerIntents={};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;state.overview=null;refresh();logLine(`<b>Turn ${resolvingTurn} resolves.</b>`);

    for(const room of playerRooms.filter(r=>r.weapon).sort((a,b)=>(a.col-b.col)||(a.row-b.row))){
      if(room.hp<=0)continue;
      if(!isReady(room)){await floatNote(getEntityElement('player',room.id),'LOADING');logLine(`${colorSpan('player',weapons[room.weapon].name)} is loading.`);continue;}
      const targetId=plans[room.id];if(!targetId)continue;const target=sourceEntity('enemy',targetId);if(!target||target.hp<=0)continue;
      await animateBall(getEntityElement('player',room.id),getEntityElement('enemy',target.id),'player','hit');
      const destroyed=applyDamage(target,weapons[room.weapon].damage);renderShips();refresh();
      logLine(`${colorSpan('player',weapons[room.weapon].name)} fires at ${colorSpan('enemy',target.name)} doing ${weapons[room.weapon].damage} damage. ${target.hp} of ${target.max} blips left${destroyed?` <b>(${target.name} destroyed — action cancelled)</b>`:''}.`);
      if(destroyed)await floatNote(getEntityElement('enemy',target.id),'DESTROYED','destroyed');
      setLoadingAfterFire(room);loadingAtStart.delete(room.id);
      if(await runAfterDamageHook({side:'enemy',entity:target,source:room,turn:resolvingTurn,destroyed,logLine,floatNote})){endResolutionForCombatEnd();return;}
      await wait(110);
    }

    await wait(120);
    if(window.combatHooks?.beforeEnemyFire){await window.combatHooks.beforeEnemyFire({turn:resolvingTurn,logLine,floatNote,wait});refresh();}
    if(window.combatEnded){endResolutionForCombatEnd();return;}
    await wait(80);

    for(const room of enemyRooms.filter(r=>r.weapon).sort((a,b)=>(a.col-b.col)||(a.row-b.row))){
      if(room.hp<=0){await floatNote(getEntityElement('enemy',room.id),'DISABLED','disabled');logLine(`${colorSpan('enemy',weapons[room.weapon].name)} is disabled — action cancelled.`);continue;}
      if(!isReady(room)){await floatNote(getEntityElement('enemy',room.id),'LOADING');logLine(`${colorSpan('enemy',weapons[room.weapon].name)} is loading.`);continue;}
      const intent=enemyIntents.find(i=>i.sourceId===room.id&&!i.inactive);if(!intent)continue;const impact=projectedEnemyImpact(intent);
      if(!impact){await animateBall(getEntityElement('enemy',room.id),missPoint(intent),'enemy','miss');logLine(`${colorSpan('enemy',weapons[room.weapon].name)} fires and ${colorSpan('player','misses')}.`);setLoadingAfterFire(room);loadingAtStart.delete(room.id);await wait(90);continue;}
      await animateBall(getEntityElement('enemy',room.id),getEntityElement('player',impact.id),'enemy','hit');
      const destroyed=applyDamage(impact,intent.damage);renderShips();refresh();logLine(`${colorSpan('enemy',weapons[room.weapon].name)} fires at ${colorSpan('player',impact.name)} doing ${intent.damage} damage. ${impact.hp} of ${impact.max} blips left${destroyed?` <b>(${impact.name} destroyed)</b>`:''}.`);setLoadingAfterFire(room);loadingAtStart.delete(room.id);
      if(await runAfterDamageHook({side:'player',entity:impact,source:room,turn:resolvingTurn,destroyed,logLine,floatNote})){endResolutionForCombatEnd();return;}
      await wait(110);
    }

    if(window.combatHooks?.afterEnemyFire){await window.combatHooks.afterEnemyFire({turn:resolvingTurn,logLine,floatNote,wait});refresh();}
    if(window.combatEnded){endResolutionForCombatEnd();return;}
    finishLoadsThatStartedTurn(loadingAtStart);phase.turn++;phase.startMast=state.playerMastTrack;state.turnStartMast=state.playerMastTrack;retargetEnemyIntents();phase.resolving=false;endTurn.disabled=false;phaseLabel.classList.remove('visible');document.body.classList.remove('v3-resolving');renderShips();refresh();
  }

  endTurn.addEventListener('click',resolveTurn);
  window.addEventListener('keydown',e=>{if(phase.resolving||window.combatEnded)return;if(e.code==='KeyZ'){e.preventDefault();e.stopPropagation();state.hoverIntent=null;state.hoveredWeapon=null;state.overview='enemy';refresh();}else if(e.code==='KeyX'){e.preventDefault();e.stopPropagation();state.hoverIntent=null;state.hoveredWeapon=null;state.overview='player';refresh();}else if(e.code==='KeyR'&&!e.repeat){e.preventDefault();e.stopPropagation();resetTurn();}},true);
  window.addEventListener('keyup',e=>{if(e.code==='KeyZ'&&state.overview==='enemy'){e.preventDefault();e.stopPropagation();state.overview=null;refresh();}else if(e.code==='KeyX'&&state.overview==='player'){e.preventDefault();e.stopPropagation();state.overview=null;refresh();}},true);

  syncLoadingFlags();refresh();
})();