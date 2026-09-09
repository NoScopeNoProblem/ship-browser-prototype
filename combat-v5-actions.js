(() => {
  const utility = { selected:null, used:{}, rollback:[], quickLoaded:{}, wasResolving:document.body.classList.contains('v3-resolving') };

  function resolving(){ return !!(window.combatTurn && combatTurn.resolving); }
  function currentTurn(){ return window.combatTurn?.turn || 1; }
  function roomById(id){ return playerRooms.find(r=>r.id===id)||null; }
  function isUtilityRoom(room){ return !!room && (room.actionType==='repair'||room.actionType==='quickLoad'); }
  function wasUsed(id){ return utility.used[id]===currentTurn(); }
  function delta(a,b){ return {dx:b.col-a.col,dy:b.row-a.row}; }
  function carpenterReach(source,target){ const {dx,dy}=delta(source,target); return Math.abs(dx)<=1&&Math.abs(dy)<=1; }
  function magazineReach(source,target){ const {dx,dy}=delta(source,target); return target.id!==source.id&&Math.abs(dx)+Math.abs(dy)===1; }
  function inReach(source,target){ return source?.actionType==='repair'?carpenterReach(source,target):source?.actionType==='quickLoad'?magazineReach(source,target):false; }
  function reachableRooms(sourceOrId){ const source=typeof sourceOrId==='string'?roomById(sourceOrId):sourceOrId; return source?playerRooms.filter(r=>inReach(source,r)):[]; }
  function eligibleTargets(sourceOrId){
    const source=typeof sourceOrId==='string'?roomById(sourceOrId):sourceOrId;if(!source)return[];
    if(source.actionType==='repair')return reachableRooms(source).filter(r=>r.hp>0&&r.hp<r.max);
    if(source.actionType==='quickLoad')return reachableRooms(source).filter(r=>r.weapon&&r.hp>0&&r.loading);
    return[];
  }
  function arrowFor(source,target){
    if(source.id===target.id)return '♥';
    const {dx,dy}=delta(source,target),key=`${Math.sign(dx)},${Math.sign(dy)}`;
    return {'-1,-1':'↖','0,-1':'↑','1,-1':'↗','-1,0':'←','1,0':'→','-1,1':'↙','0,1':'↓','1,1':'↘'}[key]||'•';
  }
  function tooltip(el,text){if(el)showRoomTooltip(el,text);}
  function clearUtilitySelection(){utility.selected=null;}

  function selectUtility(id,el){
    const room=roomById(id);if(!room||!isUtilityRoom(room))return;
    if(room.hp<=0){clearUtilitySelection();tooltip(el,'Disabled');refresh();return;}
    if(wasUsed(id)){clearUtilitySelection();tooltip(el,'Used this turn');refresh();return;}
    const targets=eligibleTargets(room);
    if(!targets.length){clearUtilitySelection();tooltip(el,room.actionType==='repair'?'Nothing to repair':'No adjacent guns loading');refresh();return;}
    state.selectedWeaponId=null;state.hoveredWeapon=null;state.hoverIntent=null;utility.selected=utility.selected===id?null:id;refresh();
  }

  function applyUtility(sourceId,targetId){
    const source=roomById(sourceId),target=roomById(targetId);if(!source||!target||wasUsed(sourceId))return false;
    if(!eligibleTargets(source).some(r=>r.id===targetId))return false;
    const turn=currentTurn();
    if(source.actionType==='repair'){
      const before=target.hp;utility.rollback.push({type:'repair',turn,sourceId,targetId,hp:before});target.hp=Math.min(target.max,target.hp+(source.repairAmount||1));
    }else if(source.actionType==='quickLoad'){
      if(!window.combatTurn)return false;utility.rollback.push({type:'reload',turn,sourceId,targetId,weaponState:combatTurn.getWeaponState(targetId)});combatTurn.setReady(targetId);target.loading=false;utility.quickLoaded[targetId]=turn;
    }
    utility.used[sourceId]=turn;utility.selected=null;state.hoveredWeapon=null;state.hoverIntent=null;refresh();
    tooltip(getEntityElement('player',targetId),source.actionType==='repair'?'Repaired +1':'Quick Load');return true;
  }

  function rollbackUtilityEffects(){
    for(let i=utility.rollback.length-1;i>=0;i--){const a=utility.rollback[i];if(a.type==='repair'){const t=roomById(a.targetId);if(t)t.hp=a.hp;}else if(a.type==='reload'&&window.combatTurn)combatTurn.setWeaponState(a.targetId,a.weaponState);}
    utility.rollback=[];utility.used={};utility.quickLoaded={};utility.selected=null;
  }

  function ensurePlanningQuickLoads(){
    if(resolving()||!window.combatTurn)return;const turn=currentTurn();
    Object.entries(utility.quickLoaded).forEach(([targetId,stamp])=>{
      if(stamp!==turn)return;const target=roomById(targetId);if(!target||target.hp<=0)return;
      const rollback=utility.rollback.find(a=>a.type==='reload'&&a.turn===turn&&a.targetId===targetId);if(!rollback||!wasUsed(rollback.sourceId))return;
      if(!combatTurn.isReady(targetId))combatTurn.setReady(targetId);
      // Core clickability still reads room.loading, so keep the compatibility flag synchronized too.
      target.loading=false;
    });
  }

  function clearReachDecorations(){
    document.querySelectorAll('.utility-reach-arrow').forEach(n=>n.remove());
    document.querySelectorAll('.utility-selected,.utility-target,.utility-used,.utility-unavailable,.utility-reachable,.utility-reach-inactive,.utility-outside-range').forEach(el=>el.classList.remove('utility-selected','utility-target','utility-used','utility-unavailable','utility-reachable','utility-reach-inactive','utility-outside-range'));
  }
  function decorateUtilities(){
    ensurePlanningQuickLoads();document.querySelectorAll('.utility-used-badge').forEach(n=>n.remove());clearReachDecorations();
    playerRooms.filter(isUtilityRoom).forEach(room=>{const el=getEntityElement('player',room.id);if(!el)return;if(wasUsed(room.id)){el.classList.add('utility-used');const b=document.createElement('div');b.className='utility-used-badge';b.innerHTML='<span class="tick">✓</span> USED';el.appendChild(b);}else if(room.hp<=0||!eligibleTargets(room).length)el.classList.add('utility-unavailable');});
    if(!utility.selected)return;
    const source=roomById(utility.selected);if(!source)return;const sourceEl=getEntityElement('player',source.id);if(sourceEl)sourceEl.classList.add('utility-selected');
    const reachable=new Set(reachableRooms(source).map(r=>r.id)),eligible=new Set(eligibleTargets(source).map(r=>r.id));
    playerRooms.forEach(target=>{const el=getEntityElement('player',target.id);if(!el)return;if(!reachable.has(target.id)){if(target.id!==source.id)el.classList.add('utility-outside-range');return;}el.classList.add('utility-reachable');if(eligible.has(target.id))el.classList.add('utility-target');else el.classList.add('utility-reach-inactive');if(target.id===source.id&&source.actionType!=='repair')return;const arrow=document.createElement('div');arrow.className=`utility-reach-arrow${eligible.has(target.id)?' active':''}`;arrow.textContent=arrowFor(source,target);arrow.title=eligible.has(target.id)?'Action can reach this room':'In range, but not applicable';el.appendChild(arrow);});
    weaponInfo.textContent=source.actionType==='repair'?'Carpenter':'Magazine — Quick Load';targetInfo.textContent=source.actionType==='repair'?'Self or adjacent rooms (including diagonals). Select a damaged room.':'Orthogonally adjacent rooms only. Select a loading gun.';
  }

  const baseRefresh=refresh;refresh=function(){baseRefresh();decorateUtilities();};

  stage.addEventListener('click',e=>{
    if(resolving()||state.exterior)return;const roomEl=e.target.closest&&e.target.closest('.room[data-side="player"]'),id=roomEl?roomEl.dataset.id:null;
    if(utility.selected){
      e.preventDefault();e.stopImmediatePropagation();const source=roomById(utility.selected),target=id?roomById(id):null;
      if(target&&source&&target.id===source.id){if(source.actionType==='repair'&&target.hp>0&&target.hp<target.max){const selected=utility.selected;if(applyUtility(selected,id))return;}utility.selected=null;refresh();if(source.actionType==='repair'&&target.hp>=target.max)tooltip(roomEl,'No repair needed');return;}
      if(target&&!inReach(source,target)){utility.selected=null;refresh();tooltip(roomEl,'Out of reach');return;}
      if(source?.actionType==='repair'&&target&&target.hp<=0){utility.selected=null;refresh();tooltip(roomEl,'Beyond repair');return;}
      if(source?.actionType==='repair'&&target&&target.hp>=target.max){utility.selected=null;refresh();tooltip(roomEl,'No repair needed');return;}
      if(source?.actionType==='quickLoad'&&target&&(!target.weapon||!target.loading)){utility.selected=null;refresh();tooltip(roomEl,target?.weapon?'Already loaded':'Cannot Quick Load');return;}
      const selected=utility.selected;if(id&&applyUtility(selected,id))return;utility.selected=null;refresh();return;
    }
    const room=id?roomById(id):null;if(room&&isUtilityRoom(room)){e.preventDefault();e.stopImmediatePropagation();selectUtility(id,roomEl);}
  },true);

  document.addEventListener('click',e=>{if(!utility.selected||resolving()||stage.contains(e.target))return;utility.selected=null;refresh();},true);
  moveAft.addEventListener('click',()=>{if(utility.selected){utility.selected=null;refresh();}});moveFore.addEventListener('click',()=>{if(utility.selected){utility.selected=null;refresh();}});

  const baseEnemyIntentDistribution=enemyIntentDistribution;
  enemyIntentDistribution=function(playerState=playerIntentDistribution()){const saved=enemyIntents.slice(),active=saved.filter(intent=>!intent.inactive&&enemyIntentInRange(intent));enemyIntents.splice(0,enemyIntents.length,...active);try{return baseEnemyIntentDistribution(playerState);}finally{enemyIntents.splice(0,enemyIntents.length,...saved);}};

  function targetWorld(target){return target.kind==='mast'?state.playerMastTrack:playerWorldCol(target.col);}
  function retargetEnemyIntentsInRange(){
    for(let i=enemyIntents.length-1;i>=0;i--)if(!sourceEntity('enemy',enemyIntents[i].sourceId))enemyIntents.splice(i,1);
    const turn=currentTurn();let mastGunId=null;
    if(turn%2===0&&playerMast.hp>0){const mastShooters=enemyRooms.filter(r=>r.weapon&&r.hp>0&&window.combatTurn?.isReady(r.id)&&getTargetsForWeapon('enemy',r).some(t=>t.id===playerMast.id)).sort((a,b)=>(a.col-b.col)||(a.row-b.row));if(mastShooters.length)mastGunId=mastShooters[(Math.floor(turn/2)-1)%mastShooters.length].id;}
    enemyIntents.forEach(intent=>{const source=sourceEntity('enemy',intent.sourceId);if(!source||!source.weapon||source.hp<=0){intent.inactive=true;return;}const candidates=getTargetsForWeapon('enemy',source).filter(t=>t&&t.hp>0);if(!candidates.length){intent.inactive=true;return;}const previous=intent.logicalTargetId?sourceEntity('player',intent.logicalTargetId):null;let target=source.id===mastGunId?candidates.find(t=>t.id===playerMast.id)||null:null;if(!target)target=previous&&candidates.some(t=>t.id===previous.id)?previous:null;if(!target){const desiredRow=previous&&Number.isFinite(previous.row)?previous.row:(intent.lane==='mast'?null:intent.lane),desiredWorld=Number.isFinite(intent.targetWorld)?intent.targetWorld:sourceWorld('enemy',source);target=candidates.slice().sort((a,b)=>{const ar=Number.isFinite(a.row)?a.row:null,br=Number.isFinite(b.row)?b.row:null,aw=targetWorld(a),bw=targetWorld(b),ap=(desiredRow!==null&&ar!==desiredRow?4:0)+Math.abs(aw-desiredWorld),bp=(desiredRow!==null&&br!==desiredRow?4:0)+Math.abs(bw-desiredWorld);return ap-bp;})[0];}intent.inactive=false;intent.logicalTargetId=target.id;if(target.kind==='mast'){intent.lane='mast';intent.targetWorld=state.playerMastTrack;}else{intent.lane=target.row;intent.targetWorld=playerWorldCol(target.col);}});
  }

  const observer=new MutationObserver(()=>{const now=document.body.classList.contains('v3-resolving');if(!utility.wasResolving&&now)utility.selected=null;if(utility.wasResolving&&!now){state.turnStartMast=state.playerMastTrack;utility.used={};utility.rollback=[];utility.quickLoaded={};utility.selected=null;retargetEnemyIntentsInRange();refresh();}utility.wasResolving=now;});observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('keydown',e=>{if(e.code==='KeyR'&&!e.repeat&&!resolving()){rollbackUtilityEffects();setTimeout(refresh,0);}else if((e.code==='ArrowLeft'||e.code==='ArrowRight'||e.code==='KeyH')&&utility.selected)utility.selected=null;},true);

  window.combatUtility={eligibleTargets,reachableRooms,inReach,isUsed:id=>wasUsed(id),isAvailable(room){return isUtilityRoom(room)&&room.hp>0&&!wasUsed(room.id)&&eligibleTargets(room).length>0;},plannedRepairs(){const turn=currentTurn();return utility.rollback.filter(a=>a.type==='repair'&&a.turn===turn).map(a=>({sourceId:a.sourceId,targetId:a.targetId,beforeHp:a.hp,afterHp:roomById(a.targetId)?.hp??a.hp}));},quickLoadedTargets(){const turn=currentTurn();return Object.entries(utility.quickLoaded).filter(([,stamp])=>stamp===turn).map(([id])=>id);},get selected(){return utility.selected;}};
  retargetEnemyIntentsInRange();refresh();
})();
