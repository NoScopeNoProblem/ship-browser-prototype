(() => {
  if(state.movedThisTurn===undefined) state.movedThisTurn=false;

  function validateShipSetup(setup, side='ship'){
    const errors=[];
    if(!setup) return [`${side}: missing setup`];
    if(!Number.isInteger(setup.columns)||setup.columns<1) errors.push(`${side}: columns must be a positive integer`);
    if(!Number.isInteger(setup.rows)||setup.rows<1) errors.push(`${side}: rows must be a positive integer`);
    if(!Number.isInteger(setup.mastColumn)||setup.mastColumn<0||setup.mastColumn>=setup.columns) errors.push(`${side}: mastColumn is outside the hull`);
    if(!Array.isArray(setup.rooms)) errors.push(`${side}: rooms must be an array`);

    const ids=new Set(), cells=new Set();
    (setup.rooms||[]).forEach((room,index)=>{
      const label=`${side} room ${room.id||index}`;
      if(!room.id) errors.push(`${label}: missing id`);
      else if(ids.has(room.id)) errors.push(`${label}: duplicate id`);
      else ids.add(room.id);
      if(!Number.isInteger(room.col)||!Number.isInteger(room.row)||room.col<0||room.row<0||room.col>=setup.columns||room.row>=setup.rows){
        errors.push(`${label}: grid position is outside ${setup.columns}×${setup.rows}`);
      }else{
        const key=`${room.col},${room.row}`;
        if(cells.has(key)) errors.push(`${label}: overlaps another room at ${key}`);
        cells.add(key);
      }
      if(!ROOM_ARCHETYPES[room.type]) errors.push(`${label}: unknown room type '${room.type}'`);
      if(room.weapon && !WEAPON_ARCHETYPES[room.weapon]) errors.push(`${label}: unknown weapon '${room.weapon}'`);
      if(room.type==='gun' && !room.weapon) errors.push(`${label}: gun room has no weapon`);
      if(!Number.isFinite(room.hp)||room.hp<1) errors.push(`${label}: hp must be at least 1`);
    });
    return errors;
  }

  function validateMatchup(playerSetup=PLAYER_SHIP_SETUP, enemySetup=ENEMY_SHIP_SETUP){
    const errors=[...validateShipSetup(playerSetup,'player'),...validateShipSetup(enemySetup,'enemy')];
    const enemyLeft=COMBAT_SETUP.enemyMastTrack-enemySetup.mastColumn;
    const enemyRight=enemyLeft+enemySetup.columns-1;
    const playerLeft=COMBAT_SETUP.playerMastTrack-playerSetup.mastColumn;
    const playerRight=playerLeft+playerSetup.columns-1;
    if(enemyLeft<0||enemyRight>=TRACK_COLS) errors.push('enemy hull does not fit on the combat track');
    if(playerLeft<0||playerRight>=TRACK_COLS) errors.push('player hull does not fit on the combat track');
    return errors;
  }

  function applyScalableLayout(){
    const roomH=ROOM_H();
    const enemyTop=110;
    const trackTop=enemyTop+(ENEMY_SHIP_SETUP.rows*roomH)+35;
    const playerTop=trackTop+125;
    const minHeight=playerTop+(PLAYER_SHIP_SETUP.rows*roomH)+170;

    enemyBlock.style.top=`${enemyTop}px`;
    playerBlock.style.top=`${playerTop}px`;
    trackRow.style.top=`${trackTop}px`;
    const chevrons=stage.querySelector('.track-chevrons');
    if(chevrons) chevrons.style.top=`${trackTop-2}px`;
    stage.style.minHeight=`${minHeight}px`;
  }

  function updateMovementButtons(){
    const blocked=playerMast.hp<=0||state.movedThisTurn;
    moveAft.disabled=blocked||state.playerMastTrack<=PLAYER_MAST_MIN;
    moveFore.disabled=blocked||state.playerMastTrack>=PLAYER_MAST_MAX;
  }

  function movementPermission(direction){
    if(playerMast.hp<=0) return {ok:false,message:'Mast destroyed'};
    if(state.movedThisTurn) return {ok:false,message:'Movement used'};
    const target=state.playerMastTrack+direction;
    if(target<PLAYER_MAST_MIN||target>PLAYER_MAST_MAX) return {ok:false,message:null};
    return {ok:true,message:null};
  }
  const previousMoveLeft=moveLeft;
  const previousMoveRight=moveRight;
  moveLeft=function(){
    const permission=movementPermission(-1);
    if(!permission.ok){
      if(permission.message) showRoomTooltip(playerMastBox,permission.message);
      refresh();
      return;
    }
    const before=state.playerMastTrack;
    previousMoveLeft();
    if(state.playerMastTrack!==before) state.movedThisTurn=true;
    refresh();
  };
  moveRight=function(){
    const permission=movementPermission(1);
    if(!permission.ok){
      if(permission.message) showRoomTooltip(playerMastBox,permission.message);
      refresh();
      return;
    }
    const before=state.playerMastTrack;
    previousMoveRight();
    if(state.playerMastTrack!==before) state.movedThisTurn=true;
    refresh();
  };

  function worldForFriendlyTarget(target){
    return target.kind==='mast' ? state.playerMastTrack : playerWorldCol(target.col);
  }

  // A generated enemy setup does not need hand-authored target ids to function. Existing
  // authored intents are preserved; missing gun intents are filled deterministically from
  // currently living, in-range targets. Chain weapons prefer a mast when one is available.
  function ensureEnemyIntentCoverage(){
    enemyRooms.filter(r=>r.weapon&&r.hp>0).forEach(source=>{
      if(enemyIntents.some(i=>i.sourceId===source.id)) return;
      const candidates=getTargetsForWeapon('enemy',source).filter(t=>t&&t.hp>0);
      if(!candidates.length) return;

      let target=null;
      if(source.weapon==='chain') target=candidates.find(t=>t.kind==='mast')||null;
      if(!target){
        const sourceCol=sourceWorld('enemy',source);
        target=candidates.slice().sort((a,b)=>{
          const ad=Math.abs(worldForFriendlyTarget(a)-sourceCol);
          const bd=Math.abs(worldForFriendlyTarget(b)-sourceCol);
          if(ad!==bd) return ad-bd;
          const am=a.kind==='mast'?1:0, bm=b.kind==='mast'?1:0;
          if(am!==bm) return am-bm;
          const ar=Number.isFinite(a.row)?a.row:99, br=Number.isFinite(b.row)?b.row:99;
          if(ar!==br) return ar-br;
          return String(a.id).localeCompare(String(b.id));
        })[0];
      }

      const intent={
        sourceId:source.id,
        damage:weapons[source.weapon].damage,
        logicalTargetId:target.id,
        lane:target.kind==='mast'?'mast':target.row,
        targetWorld:worldForFriendlyTarget(target)
      };
      enemyIntents.push(intent);
    });
  }

  function cloneSetup(id){
    const setup=SHIP_SETUPS[id];
    return setup ? structuredClone(setup) : null;
  }

  function weaponSummary(id){
    const w=WEAPON_ARCHETYPES[id];
    if(!w) return null;
    return {
      id,
      name:w.name,
      range:w.range ?? w.arc ?? 0,
      damage:w.damage,
      initialLoadTurns:w.cadence?.initialLoadTurns||0,
      reloadTurns:w.cadence?.reloadTurns||0,
      shotsBeforeReload:w.cadence?.shotsBeforeReload||1
    };
  }

  const problems=validateMatchup();
  if(problems.length) console.warn('Combat setup validation:',problems);
  ensureEnemyIntentCoverage();

  window.combatFactory={
    validateShipSetup,
    validateMatchup,
    cloneSetup,
    weaponSummary,
    ensureEnemyIntentCoverage,
    listShipSetups:()=>Object.keys(SHIP_SETUPS),
    current:{player:PLAYER_SHIP_SETUP,enemy:ENEMY_SHIP_SETUP,setup:COMBAT_SETUP}
  };

  const previousRefresh=refresh;
  refresh=function(){
    previousRefresh();
    applyScalableLayout();
    updateMovementButtons();
  };

  let wasResolving=document.body.classList.contains('v3-resolving');
  const turnObserver=new MutationObserver(()=>{
    const now=document.body.classList.contains('v3-resolving');
    if(wasResolving&&!now){
      state.movedThisTurn=false;
      state.turnStartMast=state.playerMastTrack;
      ensureEnemyIntentCoverage();
      refresh();
    }
    wasResolving=now;
  });
  turnObserver.observe(document.body,{attributes:true,attributeFilter:['class']});

  window.addEventListener('keydown',e=>{
    if(e.code==='KeyR'&&!e.repeat){
      state.movedThisTurn=false;
      setTimeout(refresh,0);
    }
  },true);

  window.addEventListener('resize',applyScalableLayout);
  refresh();
})();
