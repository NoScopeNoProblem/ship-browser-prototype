(() => {
  const detail=document.querySelector('.v11-intent-detail');
  if(!detail||!window.enemyRooms)return;

  function activeIntent(room){return enemyIntents.find(i=>i.sourceId===room.id&&!i.inactive)||null;}
  function ready(room){return !!(room?.weapon&&room.hp>0&&window.combatTurn?.isReady?.(room.id));}
  function label(room){return weapons[room.weapon]?.name||room.name;}
  function hasLivingTarget(room){
    try{return getTargetsForWeapon('enemy',room).some(target=>target&&target.hp>0);}catch{return true;}
  }
  function noTarget(room){return ready(room)&&!activeIntent(room)&&!hasLivingTarget(room);}

  function showNoTarget(room){
    const el=getEntityElement('enemy',room.id);
    if(el)showRoomTooltip(el,'No target in range');
  }

  function inspectPreviewDetail(){
    if(!document.body.classList.contains('v11-intent-preview-active'))return;
    const text=detail.textContent||'',suffix=' — HOLDING FIRE';
    if(!text.endsWith(suffix))return;
    const shownLabel=text.slice(0,-suffix.length);
    const rooms=enemyRooms.filter(room=>room.weapon&&label(room)===shownLabel&&noTarget(room));
    if(!rooms.length)return;
    detail.textContent=`${shownLabel} — NO TARGET IN RANGE`;
    rooms.forEach(showNoTarget);
  }

  new MutationObserver(inspectPreviewDetail).observe(detail,{childList:true,subtree:true,characterData:true});

  stage.addEventListener('pointerover',event=>{
    const el=event.target.closest?.('.room[data-side="enemy"]');
    if(!el||el.contains(event.relatedTarget))return;
    const room=enemyRooms.find(r=>r.id===el.dataset.id);
    if(room&&noTarget(room))showNoTarget(room);
  },true);

  inspectPreviewDetail();
})();