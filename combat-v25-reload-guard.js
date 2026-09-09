(() => {
  // v25: final cadence invariant. Capture turn-start weapon state BEFORE projectile callbacks,
  // then use actual projectile launch positions to identify which friendly guns truly fired.
  // A gun that exhausts its available shots must spend its normal reload turn unless Quick Loaded.

  const projectileLayer=stage.querySelector('.v3-projectile-layer');
  if(!projectileLayer||!window.combatTurn)return;

  const baseSetWeaponState=combatTurn.setWeaponState.bind(combatTurn);
  let wasResolving=document.body.classList.contains('v3-resolving');
  let startStates=new Map();
  let fired=new Map();

  function playerRoom(id){return playerRooms.find(r=>r.id===id)||null;}
  function snapshot(){
    startStates=new Map();fired=new Map();
    playerRooms.filter(r=>r.weapon).forEach(room=>startStates.set(room.id,combatTurn.getWeaponState(room.id)));
  }

  function center(room){
    const el=getEntityElement('player',room.id);if(!el)return null;
    const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
    return{x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};
  }

  function sourceFromBall(ball){
    const x=parseFloat(ball.style.left),y=parseFloat(ball.style.top);if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    let best=null,bestD=Infinity;
    playerRooms.filter(r=>r.weapon&&r.hp>0).forEach(room=>{
      const p=center(room);if(!p)return;const d=(p.x-x)**2+(p.y-y)**2;if(d<bestD){bestD=d;best=room;}
    });
    return bestD<=1600?best:null;
  }

  function enforce(){
    if(window.combatEnded)return;
    let changed=false;
    fired.forEach((count,id)=>{
      const room=playerRoom(id);if(!room||room.hp<=0)return;
      const cadence=weapons[room.weapon]?.cadence||{};
      const reloadTurns=Math.max(0,Number(cadence.reloadTurns??1));if(!reloadTurns)return;
      const shotsBeforeReload=Math.max(1,Number(cadence.shotsBeforeReload||1));
      const atStart=startStates.get(id)||{};
      const shotsAvailable=Math.max(1,Number(atStart.shotsLeft??shotsBeforeReload));
      if(count<shotsAvailable)return;
      const now=combatTurn.getWeaponState(id);if(now?.mode==='loading')return;
      // Use the underlying setter captured before this guard. This is resolution bookkeeping,
      // not a planning-time readiness change.
      baseSetWeaponState(id,{mode:'loading',remaining:reloadTurns,shotsLeft:shotsBeforeReload});
      changed=true;
      console.warn('[combat cadence] enforced reload after actual fire',id,{count,atStart,now,turn:combatTurn.turn});
    });
    if(changed)refresh();
  }

  // Register this observer before the projectile observer so the resolving-class mutation is
  // processed first at the same microtask checkpoint as the first cannonball append.
  new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(!wasResolving&&now)snapshot();
    if(wasResolving&&!now)enforce();
    wasResolving=now;
  }).observe(document.body,{attributes:true,attributeFilter:['class']});

  new MutationObserver(records=>{
    records.forEach(record=>record.addedNodes.forEach(node=>{
      if(!(node instanceof Element)||!node.matches('.v3-ball.player'))return;
      // Defensive fallback if a browser batches delivery unusually: establish the resolution
      // baseline before counting the first ball rather than allowing the first count to vanish.
      if(document.body.classList.contains('v3-resolving')&&!wasResolving){snapshot();wasResolving=true;}
      const source=sourceFromBall(node);if(source)fired.set(source.id,(fired.get(source.id)||0)+1);
    }));
  }).observe(projectileLayer,{childList:true});

  window.combatReloadGuard={get fired(){return new Map(fired);},get startStates(){return new Map(startStates);}};
})();