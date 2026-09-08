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

  const enemyIntentBase = enemyIntentDistribution;
  const renderSelectionBase = renderSelection;
  const renderHoverWeaponBase = renderHoverWeapon;
  const refreshBase = refresh;

  function wstate(id){ return phase.weapon[id] || {mode:'ready'}; }
  function ready(room){ return room && room.weapon && room.hp>0 && wstate(room.id).mode==='ready'; }

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
    const base=enemyIntentBase(ps);
    const disabled=new Set(base.disabledSources||[]);
    enemyRooms.filter(r=>r.weapon).forEach(r=>{ if(r.hp<=0 || !ready(r)) disabled.add(r.id); });
    const hits=new Map(),dodges=new Map(),prevented=new Map(),targetMap=new Map(),preventedTargetMap=new Map(),missMap=[];
    enemyIntents.forEach(intent=>{
      const src=sourceEntity('enemy',intent.sourceId);
      if(!src||src.hp<=0||!ready(src))return;
      const cur=projectedEnemyImpact(intent),orig=originalEnemyImpact(intent);
      if(disabled.has(intent.sourceId)){
        if(cur){prevented.set(cur.id,(prevented.get(cur.id)||0)+intent.damage);if(!preventedTargetMap.has(cur.id))preventedTargetMap.set(cur.id,[]);preventedTargetMap.get(cur.id).push(intent)}
        return;
      }
      if(cur){hits.set(cur.id,(hits.get(cur.id)||0)+intent.damage);if(!targetMap.has(cur.id))targetMap.set(cur.id,[]);targetMap.get(cur.id).push(intent)}
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
        const miss=[...stage.querySelectorAll('.miss-marker')].find(m=>m.textContent.includes('MISS'));
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
        const d=document.createElement('div');d.className='dodge-v3';d.title='Attack dodged by movement';d.innerHTML='<span class="shot">•</span><span class="arrow">↗</span>';el.appendChild(d);
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

  function clearPlansAfterMove(){
    if(Object.keys(state.playerIntents).length || state.selectedWeaponId){ state.playerIntents={};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;refresh(); }
  }
  moveAft.addEventListener('click',()=>setTimeout(clearPlansAfterMove,0));
  moveFore.addEventListener('click',()=>setTimeout(clearPlansAfterMove,0));
  document.addEventListener('keydown',e=>{if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!phase.resolving)setTimeout(clearPlansAfterMove,0)});

  function resetTurn(){
    if(phase.resolving)return;
    state.playerMastTrack=phase.startMast;state.playerIntents={...phase.startPlans};state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;state.overview=null;state.exterior=false;document.body.classList.remove('exterior-mode');refresh();log.innerHTML='';
  }
  document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();resetTurn()}},true);

  const btn=document.createElement('button');btn.className='v3-end-turn';btn.textContent='END TURN';stage.appendChild(btn);
  const log=document.createElement('div');log.className='v3-combat-log';stage.appendChild(log);
  const phaseLabel=document.createElement('div');phaseLabel.className='v3-combat-phase';phaseLabel.textContent='COMBAT PHASE';stage.appendChild(phaseLabel);
  const projectile=document.createElement('div');projectile.className='v3-projectile-layer';stage.appendChild(projectile);
  const floater=document.createElement('div');floater.className='v3-float-layer';stage.appendChild(floater);

  const audio=document.createElement('audio');audio.preload='auto';audio.crossOrigin='anonymous';audio.src='https://upload.wikimedia.org/wikipedia/commons/transcoded/2/2d/01_Salute_Cannon_Reveille.ogg/01_Salute_Cannon_Reveille.ogg.mp3';document.body.appendChild(audio);

  function logLine(html){const d=document.createElement('div');d.className='v3-log-line';d.innerHTML=html;log.appendChild(d);log.scrollTop=log.scrollHeight}
  const span=(side,text)=>`<span class="v3-log-${side}">${text}</span>`;
  function center(el){const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:r.left-s.left+r.width/2,y:r.top-s.top+r.height/2}}
  function missPoint(intent){const pg=playerGrid.getBoundingClientRect(),sg=stage.getBoundingClientRect();return{x:worldColX(intent.targetWorld)+roomWidth()/2,y:pg.top-sg.top+((intent.lane===1?1:0)+.5)*(pg.height/2)}}
  function playSynth(){try{const AC=window.AudioContext||window.webkitAudioContext,c=new AC(),b=c.createBuffer(1,c.sampleRate*.42,c.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++){const t=i/c.sampleRate;a[i]=(Math.random()*2-1)*Math.exp(-t*11)+Math.sin(2*Math.PI*56*t)*.55*Math.exp(-t*9)}const s=c.createBufferSource(),g=c.createGain();s.buffer=b;g.gain.value=.21;s.connect(g).connect(c.destination);s.start();setTimeout(()=>c.close(),650)}catch{}}
  function fireSound(){try{audio.pause();audio.currentTime=0;audio.volume=.38;const p=audio.play();if(p&&p.catch)p.catch(playSynth);setTimeout(()=>{audio.pause()},650)}catch{playSynth()}}
  async function ball(fromEl,to,side){const a=center(fromEl),b=to instanceof Element?center(to):to,n=document.createElement('div');n.className=`v3-ball ${side}`;n.style.left=`${a.x}px`;n.style.top=`${a.y}px`;projectile.appendChild(n);fireSound();await wait(20);n.style.transform=`translate(${b.x-a.x}px,${b.y-a.y}px)`;await wait(360);n.style.opacity='0';await wait(90);n.remove()}
  async function note(el,text,cls=''){const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect(),n=document.createElement('div');n.className=`v3-resolve-note ${cls}`;n.textContent=text;n.style.left=`${r.left-s.left+r.width/2}px`;n.style.top=`${r.top-s.top+r.height/2}px`;floater.appendChild(n);await wait(560);n.remove()}
  function damage(e,n){const before=e.hp;e.hp=Math.max(0,e.hp-n);return before>0&&e.hp===0}
  function sort(arr){return arr.filter(r=>r.weapon).sort((a,b)=>a.col-b.col)}
  function setLoadingAfterFire(room){const s=wstate(room.id);if(room.weapon==='repeater'){s.burstLeft=(s.burstLeft??2)-1;if(s.burstLeft<=0){s.mode='loading';s.remaining=1}}else{s.mode='loading';s.remaining=1}}
  function advanceInitialLoad(snapshot){Object.entries(snapshot).forEach(([id,was])=>{if(!was)return;const s=wstate(id);if(s.mode==='loading'){s.remaining=(s.remaining||1)-1;if(s.remaining<=0){s.mode='ready';delete s.remaining;if(id==='e_rep')s.burstLeft=2}}})}

  async function resolveTurn(){
    if(phase.resolving)return;phase.resolving=true;document.body.classList.add('v3-resolving');btn.disabled=true;phaseLabel.classList.add('visible');log.innerHTML='';
    const plans={...state.playerIntents};const loadingAtStart={};Object.keys(phase.weapon).forEach(id=>loadingAtStart[id]=wstate(id).mode==='loading');state.playerIntents={};state.selectedWeaponId=null;state.overview=null;refresh();
    logLine(`<b>Turn ${phase.turn} resolves.</b>`);

    for(const room of playerRooms.filter(r=>r.weapon).sort((a,b)=>a.col-b.col)){
      if(room.hp<=0)continue;
      if(!ready(room)){await note(getEntityElement('player',room.id),'LOADING');logLine(`${span('player',weapons[room.weapon].name)} is loading.`);continue}
      const tid=plans[room.id];if(!tid)continue;const target=sourceEntity('enemy',tid);if(!target||target.hp<=0)continue;
      await ball(getEntityElement('player',room.id),getEntityElement('enemy',target.id),'player');const destroyed=damage(target,weapons[room.weapon].damage);renderShips();refresh();logLine(`${span('player',weapons[room.weapon].name)} fires at ${span('enemy',target.name)} doing ${weapons[room.weapon].damage} damage. ${target.hp} of ${target.max} blips left${destroyed?` <b>(${target.name} destroyed — action cancelled)</b>`:''}.`);if(destroyed)await note(getEntityElement('enemy',target.id),'DESTROYED','destroyed');setLoadingAfterFire(room);await wait(120);
    }

    await wait(180);
    for(const room of enemyRooms.filter(r=>r.weapon).sort((a,b)=>a.col-b.col)){
      if(room.hp<=0){await note(getEntityElement('enemy',room.id),'DISABLED','disabled');logLine(`${span('enemy',weapons[room.weapon].name)} is disabled — action cancelled.`);continue}
      if(!ready(room)){await note(getEntityElement('enemy',room.id),'LOADING');logLine(`${span('enemy',weapons[room.weapon].name)} is loading.`);continue}
      const intent=enemyIntents.find(i=>i.sourceId===room.id);if(!intent)continue;const impact=projectedEnemyImpact(intent);
      if(!impact){await ball(getEntityElement('enemy',room.id),missPoint(intent),'enemy');logLine(`${span('enemy',weapons[room.weapon].name)} fires and ${span('player','misses')}.`);setLoadingAfterFire(room);await wait(100);continue}
      await ball(getEntityElement('enemy',room.id),getEntityElement('player',impact.id),'enemy');const destroyed=damage(impact,intent.damage);renderShips();refresh();logLine(`${span('enemy',weapons[room.weapon].name)} fires at ${span('player',impact.name)} doing ${intent.damage} damage. ${impact.hp} of ${impact.max} blips left${destroyed?` <b>(${impact.name} destroyed)</b>`:''}.`);setLoadingAfterFire(room);await wait(120);
    }

    advanceInitialLoad(loadingAtStart);phase.turn++;phase.startMast=state.playerMastTrack;phase.startPlans={};phase.resolving=false;btn.disabled=false;phaseLabel.classList.remove('visible');document.body.classList.remove('v3-resolving');renderShips();refresh();
  }
  btn.addEventListener('click',resolveTurn);

  refresh();
})();
