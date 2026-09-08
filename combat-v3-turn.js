(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const phase = {
    resolving:false,
    turn:1,
    startMast: state.playerMastTrack,
    startPlans:{},
    weapon:{
      p_std:{mode:'ready'}, p_heavy:{mode:'loading',remaining:1},
      e_std:{mode:'ready'}, e_heavy:{mode:'loading',remaining:1},
      e_rep:{mode:'ready',burstLeft:2}, e_long:{mode:'ready'}
    }
  };

  // Preserve the first-turn logical enemy targets. At the start of later turns
  // the enemy re-aims at these rooms from the player's new starting alignment.
  enemyIntents.forEach(intent => {
    const original = originalEnemyImpact(intent);
    intent.logicalTargetId = original ? original.id : null;
  });

  const renderSelectionBase = renderSelection;
  const renderHoverWeaponBase = renderHoverWeapon;
  const refreshBase = refresh;

  function wstate(id){ return phase.weapon[id] || {mode:'ready'}; }
  function ready(room){ return room && room.weapon && room.hp>0 && wstate(room.id).mode==='ready'; }

  // Persistent damage in a new turn is shown as an empty red heart rather than a dot.
  pipsMarkup = function(entity, hits=0, dodges=0, prevented=0){
    const arr=[];
    for(let i=0;i<entity.max;i++){
      arr.push(i<entity.hp ? '<span>♥</span>' : '<span class="damage-empty">♡</span>');
    }
    let cursor=entity.hp-1;
    for(let i=0;i<hits && cursor>=0;i++,cursor--) arr[cursor]='<span class="hit">✕</span>';
    for(let i=0;i<dodges && cursor>=0;i++,cursor--) arr[cursor]='<span class="dodged-mark">↝</span>';
    for(let i=0;i<prevented && cursor>=0;i++,cursor--) arr[cursor]='<span class="prevented-mark">⊘</span>';
    return arr.join(' ');
  };

  function baselineImpact(intent){
    const baselineLeft = phase.startMast - PLAYER_MAST_LOCAL_COL;
    if(intent.lane==='mast') return intent.targetWorld===phase.startMast ? playerMast : null;
    return playerRooms.find(r => r.row===intent.lane && baselineLeft+r.col===intent.targetWorld) || null;
  }

  function retargetEnemyIntents(){
    const left = phase.startMast - PLAYER_MAST_LOCAL_COL;
    enemyIntents.forEach(intent => {
      if(!intent.logicalTargetId) return;
      const target = sourceEntity('player', intent.logicalTargetId);
      if(!target) return;
      if(target.kind==='mast'){
        intent.lane='mast';
        intent.targetWorld=phase.startMast;
      } else {
        intent.lane=target.row;
        intent.targetWorld=left+target.col;
      }
    });
  }

  playerIntentDistribution = function(){
    const hits=new Map(),targetMap=new Map();
    Object.entries(state.playerIntents).forEach(([wid,tid])=>{
      const room=sourceEntity('player',wid),target=sourceEntity('enemy',tid);
      if(!room||!target||!ready(room))return;
      const dmg=weapons[room.weapon].damage;
      hits.set(tid,(hits.get(tid)||0)+dmg);
      if(!targetMap.has(tid))targetMap.set(tid,[]);
      targetMap.get(tid).push({sourceId:wid,targetId:tid,damage:dmg});
    });
    return {hits,targetMap};
  };

  enemyIntentDistribution = function(ps=playerIntentDistribution()){
    const hits=new Map(),dodges=new Map(),prevented=new Map(),targetMap=new Map(),preventedTargetMap=new Map(),missMap=[];
    const disabled=new Set();
    enemyRooms.filter(r=>r.weapon).forEach(r=>{
      const planned=ps.hits.get(r.id)||0;
      if(r.hp-planned<=0)disabled.add(r.id);
    });

    enemyIntents.forEach(intent=>{
      const src=sourceEntity('enemy',intent.sourceId);
      if(!src||src.hp<=0||!ready(src))return;
      const cur=projectedEnemyImpact(intent),orig=baselineImpact(intent);
      if(disabled.has(intent.sourceId)){
        if(cur){
          prevented.set(cur.id,(prevented.get(cur.id)||0)+intent.damage);
          if(!preventedTargetMap.has(cur.id))preventedTargetMap.set(cur.id,[]);
          preventedTargetMap.get(cur.id).push(intent);
        }
        return;
      }
      if(cur){
        hits.set(cur.id,(hits.get(cur.id)||0)+intent.damage);
        if(!targetMap.has(cur.id))targetMap.set(cur.id,[]);
        targetMap.get(cur.id).push(intent);
      }
      if(orig&&(!cur||cur.id!==orig.id))dodges.set(orig.id,(dodges.get(orig.id)||0)+intent.damage);
      if(!cur&&orig)missMap.push(intent);
    });
    return {hits,dodges,prevented,targetMap,preventedTargetMap,missMap,disabledSources:disabled};
  };

  renderSelection = function(){
    const room=sourceEntity('player',state.selectedWeaponId);
    if(room && !ready(room)){ state.selectedWeaponId=null; decorate(); return; }
    return renderSelectionBase();
  };

  // Ensure miss markers can be mapped back to the exact gun that owns the intent.
  addMissMarker = function(intent){
    const source=sourceEntity('enemy',intent.sourceId);
    const marker=document.createElement('div');
    marker.className='miss-marker';
    marker.dataset.sourceId=intent.sourceId;
    marker.style.left=`${worldColX(intent.targetWorld)+10}px`;
    marker.style.top=`${laneY('player',intent.lane)+34}px`;
    marker.innerHTML=`${iconMarkup(source.weapon,enemySuffix[source.id]||'',true)}<span class="miss-text">MISS</span>`;
    marker.addEventListener('mouseenter',()=>beginIntentHover('enemy',intent.sourceId));
    marker.addEventListener('mouseleave',endIntentHover);
    stage.appendChild(marker);
  };

  function showIntentFocus(side,sourceId){
    clearIntentFocusOnly();
    const src=sourceEntity(side,sourceId);
    if(!src)return;
    drawArc(side,src);
    const sourceEl=getEntityElement(side,src.id);
    if(sourceEl)sourceEl.classList.add('focus-source');

    if(side==='enemy'){
      const intent=enemyIntents.find(i=>i.sourceId===src.id);
      const impact=intent?projectedEnemyImpact(intent):null;
      const es=enemyIntentDistribution(playerIntentDistribution());
      if(impact){
        const targetEl=getEntityElement('player',impact.id);
        if(es.disabledSources.has(src.id))targetEl.classList.add('prevented');
        else targetEl.classList.add('focus-target');
      } else {
        const miss=stage.querySelector(`.miss-marker[data-source-id="${src.id}"]`);
        if(miss)miss.classList.add('v3-focus-miss');
      }
      weaponInfo.innerHTML=`${iconMarkup(src.weapon,enemySuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
      if(es.disabledSources.has(src.id))targetInfo.textContent=impact?`Prevented: this gun is disabled before its shot reaches ${impact.name}.`:'Prevented: this gun is disabled before firing.';
      else targetInfo.textContent=impact?`${impact.name}: ${intent.damage} damage`:'This shot misses at the current alignment.';
    } else {
      const targetId=state.playerIntents[src.id];
      if(targetId)getEntityElement('enemy',targetId).classList.add('friendly-focus-target');
      weaponInfo.innerHTML=`${iconMarkup(src.weapon,playerSuffix[src.id]||'',true)} ${weapons[src.weapon].name}`;
      targetInfo.textContent=targetId?`Planned shot: ${sourceEntity('enemy',targetId).name}`:'No target planned.';
    }
  }

  // Intent chips use this direct focus path so hovering the chip never gets lost
  // when the parent room redraws or changes hover state.
  beginIntentHover = function(side,sourceId){
    if(state.exterior||phase.resolving)return;
    state.hoverIntent={side,sourceId};
    showIntentFocus(side,sourceId);
  };
  endIntentHover = function(){
    state.hoverIntent=null;
    if(!phase.resolving)refresh();
  };

  renderHoverWeapon = function(){
    if(state.hoveredWeapon){
      const room=sourceEntity(state.hoveredWeapon.side,state.hoveredWeapon.id);
      if(room && room.weapon && !ready(room)){
        const el=getEntityElement(state.hoveredWeapon.side,room.id); if(el)el.classList.add('focus-source');
        weaponInfo.innerHTML=`${iconMarkup(room.weapon,'',true)} ${weapons[room.weapon].name}`;
        targetInfo.textContent='LOADING — cannot fire this turn.';
        return true;
      }
    }
    const result=renderHoverWeaponBase();
    if(state.hoveredWeapon && state.hoveredWeapon.side==='enemy'){
      const room=sourceEntity('enemy',state.hoveredWeapon.id);
      const intent=enemyIntents.find(i=>i.sourceId===room.id);
      if(intent && !projectedEnemyImpact(intent)){
        const miss=stage.querySelector(`.miss-marker[data-source-id="${room.id}"]`);
        if(miss)miss.classList.add('v3-focus-miss');
      }
    }
    return result;
  };

  refresh = function(){ refreshBase(); decorate(); };

  function decorate(){
    document.querySelectorAll('.dodge-v3,.loading-v3').forEach(n=>n.remove());
    [...playerRooms,playerMast].forEach(e=>{
      const el=getEntityElement('player',e.id); if(!el)return;
      if(el.classList.contains('dodged')){
        const d=document.createElement('div');
        d.className='dodge-v3';
        d.title='Attack dodged by movement';
        d.innerHTML='<span class="shot">●</span><span class="shield">⤴</span><span class="dodge-word">DODGED</span>';
        el.appendChild(d);
      }
    });
    [...playerRooms,...enemyRooms].filter(r=>r.weapon).forEach(r=>{
      if(wstate(r.id).mode==='loading' && r.hp>0){
        const el=getEntityElement(r.id.startsWith('p_')?'player':'enemy',r.id);if(!el)return;
        const b=document.createElement('div');b.className='loading-v3';b.innerHTML='<span class="wheel">↻</span><span>LOADING</span>';el.appendChild(b);
      }
    });
  }

  function tooltipAt(el,text){
    const r=el.getBoundingClientRect(),t=document.createElement('div');t.className='not-range-v3';t.textContent=text;t.style.left=`${r.left+r.width/2}px`;t.style.top=`${r.top+10}px`;document.body.appendChild(t);setTimeout(()=>t.remove(),820);
  }

  enemyGrid.addEventListener('click',e=>{
    if(phase.resolving||!state.selectedWeaponId)return;
    const room=e.target.closest('.room[data-side="enemy"]'); if(!room)return;
    if(!isLegalTarget(room.dataset.id))tooltipAt(room,'Not in range');
  },true);
  enemyMastEl.addEventListener('click',()=>{if(state.selectedWeaponId&&!isLegalTarget(enemyMast.id))tooltipAt(enemyMastEl,'Not in range')},true);

  // Moving changes the solution space, so all planned player fire is discarded.
  function clearPlansAfterMove(){
    state.playerIntents={};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;
  }
  const oldMoveLeft=moveLeft,oldMoveRight=moveRight;
  moveLeft=function(){ if(phase.resolving)return; clearPlansAfterMove(); oldMoveLeft(); };
  moveRight=function(){ if(phase.resolving)return; clearPlansAfterMove(); oldMoveRight(); };

  function resetTurn(){
    if(phase.resolving)return;
    state.playerMastTrack=phase.startMast;
    state.playerIntents={...phase.startPlans};
    state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;state.overview=null;state.exterior=false;
    document.body.classList.remove('exterior-mode');
    refresh();
    logLines.innerHTML='';
  }

  const btn=document.createElement('button');btn.className='v3-end-turn';btn.textContent='END TURN';stage.appendChild(btn);

  const logPanel=document.createElement('div');logPanel.className='v3-combat-log';
  const logHead=document.createElement('div');logHead.className='v3-log-head';
  const logTitle=document.createElement('span');logTitle.textContent='COMBAT LOG';
  const logToggle=document.createElement('button');logToggle.className='v3-log-toggle';logToggle.textContent='−';logToggle.title='Minimise combat log';
  logHead.append(logTitle,logToggle);
  const logLines=document.createElement('div');logLines.className='v3-log-lines';
  logPanel.append(logHead,logLines);stage.appendChild(logPanel);
  logToggle.addEventListener('click',e=>{e.stopPropagation();const mini=logPanel.classList.toggle('minimized');logToggle.textContent=mini?'+':'−';logToggle.title=mini?'Expand combat log':'Minimise combat log';});

  const phaseLabel=document.createElement('div');phaseLabel.className='v3-combat-phase';phaseLabel.textContent='COMBAT PHASE';stage.appendChild(phaseLabel);
  const projectile=document.createElement('div');projectile.className='v3-projectile-layer';stage.appendChild(projectile);
  const floater=document.createElement('div');floater.className='v3-float-layer';stage.appendChild(floater);

  // Public-domain cannon audio; effects below are generated locally with Web Audio.
  const audio=document.createElement('audio');audio.preload='auto';audio.crossOrigin='anonymous';audio.src='https://upload.wikimedia.org/wikipedia/commons/transcoded/2/2d/01_Salute_Cannon_Reveille.ogg/01_Salute_Cannon_Reveille.ogg.mp3';document.body.appendChild(audio);
  let fxCtx=null;
  function ctx(){ if(!fxCtx||fxCtx.state==='closed')fxCtx=new (window.AudioContext||window.webkitAudioContext)();return fxCtx; }
  function noiseBurst(duration,volume,filterType,frequency){
    try{
      const c=ctx(); if(c.state==='suspended')c.resume();
      const len=Math.max(1,Math.floor(c.sampleRate*duration)),buf=c.createBuffer(1,len,c.sampleRate),data=buf.getChannelData(0);
      for(let i=0;i<len;i++)data[i]=(Math.random()*2-1);
      const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
      src.buffer=buf;filter.type=filterType;filter.frequency.value=frequency;
      const now=c.currentTime;gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
      src.connect(filter).connect(gain).connect(c.destination);src.start(now);
    }catch{}
  }
  function splashSound(){
    noiseBurst(.48,.22,'lowpass',1500);
    try{const c=ctx(),o=c.createOscillator(),g=c.createGain(),now=c.currentTime;o.type='sine';o.frequency.setValueAtTime(170,now);o.frequency.exponentialRampToValueAtTime(65,now+.34);g.gain.setValueAtTime(.08,now);g.gain.exponentialRampToValueAtTime(.001,now+.36);o.connect(g).connect(c.destination);o.start(now);o.stop(now+.38)}catch{}
  }
  function splinterSound(){
    noiseBurst(.26,.27,'highpass',1100);
    setTimeout(()=>noiseBurst(.16,.13,'bandpass',2800),45);
  }

  function logLine(html){const d=document.createElement('div');d.className='v3-log-line';d.innerHTML=html;logLines.appendChild(d);logLines.scrollTop=logLines.scrollHeight}
  const span=(side,text)=>`<span class="v3-log-${side}">${text}</span>`;
  function center(el){const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-s.left+r.width/2,y:r.top-s.top+r.height/2}}
  function missPoint(intent){const pg=playerGrid.getBoundingClientRect(),sg=stage.getBoundingClientRect();return{x:worldColX(intent.targetWorld)+roomWidth()/2,y:pg.top-sg.top+((intent.lane===1?1:0)+.5)*(pg.height/2)}}
  function playSynth(){try{const c=ctx(),b=c.createBuffer(1,c.sampleRate*.42,c.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++){const t=i/c.sampleRate;a[i]=(Math.random()*2-1)*Math.exp(-t*11)+Math.sin(2*Math.PI*56*t)*.55*Math.exp(-t*9)}const s=c.createBufferSource(),g=c.createGain();s.buffer=b;g.gain.value=.21;s.connect(g).connect(c.destination);s.start()}catch{}}
  function fireSound(){try{audio.pause();audio.currentTime=0;audio.volume=.38;const p=audio.play();if(p&&p.catch)p.catch(playSynth);setTimeout(()=>{audio.pause()},650)}catch{playSynth()}}
  async function ball(fromEl,to,side,outcome='hit'){
    const a=center(fromEl),b=to instanceof Element?center(to):to,n=document.createElement('div');n.className=`v3-ball ${side}`;n.style.left=`${a.x}px`;n.style.top=`${a.y}px`;projectile.appendChild(n);fireSound();await wait(20);n.style.transform=`translate(${b.x-a.x}px,${b.y-a.y}px)`;await wait(360);if(outcome==='miss')splashSound();else splinterSound();n.style.opacity='0';await wait(100);n.remove();
  }
  async function note(el,text,cls=''){const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect(),n=document.createElement('div');n.className=`v3-resolve-note ${cls}`;n.textContent=text;n.style.left=`${r.left-s.left+r.width/2}px`;n.style.top=`${r.top-s.top+r.height/2}px`;floater.appendChild(n);await wait(560);n.remove()}
  function damage(e,n){const before=e.hp;e.hp=Math.max(0,e.hp-n);return before>0&&e.hp===0}
  function setLoadingAfterFire(room){
    const s=wstate(room.id);
    if(room.weapon==='repeater'){
      s.burstLeft=(s.burstLeft??2)-1;
      if(s.burstLeft<=0){s.mode='loading';s.remaining=1}
    }else{
      // Heavy follows the same one-full-turn reload cadence after firing.
      s.mode='loading';s.remaining=1;
    }
  }
  function advanceInitialLoad(snapshot){
    Object.entries(snapshot).forEach(([id,was])=>{
      if(!was)return;
      const s=wstate(id);
      if(s.mode==='loading'){
        s.remaining=(s.remaining||1)-1;
        if(s.remaining<=0){s.mode='ready';delete s.remaining;if(id==='e_rep'||id==='p_rep')s.burstLeft=2}
      }
    });
  }

  async function resolveTurn(){
    if(phase.resolving)return;
    phase.resolving=true;document.body.classList.add('v3-resolving');btn.disabled=true;phaseLabel.classList.add('visible');logLines.innerHTML='';
    const plans={...state.playerIntents};
    const loadingAtStart={};Object.keys(phase.weapon).forEach(id=>loadingAtStart[id]=wstate(id).mode==='loading');
    state.playerIntents={};state.selectedWeaponId=null;state.overview=null;state.hoveredWeapon=null;state.hoverIntent=null;refresh();
    logLine(`<b>Turn ${phase.turn} resolves.</b>`);

    for(const room of playerRooms.filter(r=>r.weapon).sort((a,b)=>a.col-b.col)){
      if(room.hp<=0)continue;
      if(!ready(room)){
        await note(getEntityElement('player',room.id),'LOADING');
        logLine(`${span('player',weapons[room.weapon].name)} is loading.`);
        continue;
      }
      const tid=plans[room.id];if(!tid)continue;
      const target=sourceEntity('enemy',tid);if(!target||target.hp<=0)continue;
      await ball(getEntityElement('player',room.id),getEntityElement('enemy',target.id),'player','hit');
      const destroyed=damage(target,weapons[room.weapon].damage);renderShips();refresh();
      logLine(`${span('player',weapons[room.weapon].name)} fires at ${span('enemy',target.name)} doing ${weapons[room.weapon].damage} damage. ${target.hp} of ${target.max} blips left${destroyed?` <b>(${target.name} destroyed — action cancelled)</b>`:''}.`);
      if(destroyed)await note(getEntityElement('enemy',target.id),'DESTROYED','destroyed');
      setLoadingAfterFire(room);await wait(120);
    }

    await wait(180);
    for(const room of enemyRooms.filter(r=>r.weapon).sort((a,b)=>a.col-b.col)){
      if(room.hp<=0){
        await note(getEntityElement('enemy',room.id),'DISABLED','disabled');
        logLine(`${span('enemy',weapons[room.weapon].name)} is disabled — action cancelled.`);
        continue;
      }
      if(!ready(room)){
        await note(getEntityElement('enemy',room.id),'LOADING');
        logLine(`${span('enemy',weapons[room.weapon].name)} is loading.`);
        continue;
      }
      const intent=enemyIntents.find(i=>i.sourceId===room.id);if(!intent)continue;
      const impact=projectedEnemyImpact(intent);
      if(!impact){
        await ball(getEntityElement('enemy',room.id),missPoint(intent),'enemy','miss');
        logLine(`${span('enemy',weapons[room.weapon].name)} fires and ${span('player','misses')}.`);
        setLoadingAfterFire(room);await wait(100);continue;
      }
      await ball(getEntityElement('enemy',room.id),getEntityElement('player',impact.id),'enemy','hit');
      const destroyed=damage(impact,intent.damage);renderShips();refresh();
      logLine(`${span('enemy',weapons[room.weapon].name)} fires at ${span('player',impact.name)} doing ${intent.damage} damage. ${impact.hp} of ${impact.max} blips left${destroyed?` <b>(${impact.name} destroyed)</b>`:''}.`);
      setLoadingAfterFire(room);await wait(120);
    }

    advanceInitialLoad(loadingAtStart);
    phase.turn++;
    phase.startMast=state.playerMastTrack;
    phase.startPlans={};
    retargetEnemyIntents();
    phase.resolving=false;btn.disabled=false;phaseLabel.classList.remove('visible');document.body.classList.remove('v3-resolving');
    renderShips();refresh();
  }
  btn.addEventListener('click',resolveTurn);

  // Own the test hotkeys in capture phase so Z/X remain reliable even after v3 wraps refresh.
  document.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(phase.resolving){
      if(['z','x','h','r','arrowleft','arrowright'].includes(k)){e.preventDefault();e.stopImmediatePropagation();}
      return;
    }
    if(k==='z'){e.preventDefault();e.stopImmediatePropagation();state.overview='enemy';refresh();return;}
    if(k==='x'){e.preventDefault();e.stopImmediatePropagation();state.overview='player';refresh();return;}
    if(k==='r'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();resetTurn();return;}
  },true);
  document.addEventListener('keyup',e=>{
    const k=e.key.toLowerCase();
    if(k==='z'&&state.overview==='enemy'){e.preventDefault();e.stopImmediatePropagation();state.overview=null;refresh();}
    if(k==='x'&&state.overview==='player'){e.preventDefault();e.stopImmediatePropagation();state.overview=null;refresh();}
  },true);

  refresh();
})();
