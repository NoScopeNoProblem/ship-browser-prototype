(() => {
  // v21: hovering a live enemy cannon replays a single target tracer so its current intention
  // can be read without holding the whole intent overview in working memory.
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.setAttribute('class','v21-hover-target-overlay');
  overlay.setAttribute('aria-hidden','true');
  stage.appendChild(overlay);

  let activeSourceId=null;
  let replayTimer=null;
  let clearTimer=null;

  function clearTrace(){
    overlay.innerHTML='';
    if(clearTimer){clearTimeout(clearTimer);clearTimer=null;}
    document.querySelectorAll('.v21-hover-target-pulse').forEach(el=>el.classList.remove('v21-hover-target-pulse'));
  }

  function stopHover(){
    activeSourceId=null;
    if(replayTimer){clearInterval(replayTimer);replayTimer=null;}
    clearTrace();
  }

  function center(el){
    const sr=stage.getBoundingClientRect(),r=el.getBoundingClientRect();
    return {x:r.left-sr.left+r.width/2,y:r.top-sr.top+r.height/2};
  }

  function currentIntent(sourceId){
    return enemyIntents.find(i=>i.sourceId===sourceId&&!i.inactive)||null;
  }

  function aimedPoint(intent){
    const impact=projectedEnemyImpact(intent);
    if(impact){
      const el=getEntityElement('player',impact.id);
      if(el)return {point:center(el),impact};
    }
    if(intent.lane==='mast'){
      const sr=stage.getBoundingClientRect(),pg=playerGrid.getBoundingClientRect();
      return {point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:pg.top-sr.top-34},impact:null};
    }
    return {point:{x:worldColX(intent.targetWorld)+ROOM_W()/2,y:laneY('player',intent.lane)+ROOM_H()/2},impact:null};
  }

  function playTrace(sourceId){
    clearTrace();
    if(sourceId!==activeSourceId||window.combatEnded||window.combatTurn?.resolving||state.exterior||document.body.classList.contains('v11-intent-preview-active'))return;
    const source=sourceEntity('enemy',sourceId),sourceEl=source&&getEntityElement('enemy',sourceId),intent=currentIntent(sourceId);
    if(!source||!sourceEl||!intent||source.hp<=0||!window.combatTurn?.isReady(sourceId))return;

    const a=center(sourceEl),aim=aimedPoint(intent),b=aim.point;
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
    line.setAttribute('pathLength','1');line.setAttribute('class','v21-hover-target-line');
    overlay.appendChild(line);

    if(aim.impact){
      const targetEl=getEntityElement('player',aim.impact.id);
      targetEl?.classList.add('v21-hover-target-pulse');
      setTimeout(()=>targetEl?.classList.remove('v21-hover-target-pulse'),720);
    }
    clearTimer=setTimeout(()=>{overlay.innerHTML='';clearTimer=null;},1250);
  }

  function startHover(sourceId){
    if(activeSourceId===sourceId)return;
    stopHover();
    activeSourceId=sourceId;
    playTrace(sourceId);
    replayTimer=setInterval(()=>playTrace(sourceId),2300);
  }

  stage.addEventListener('pointerover',e=>{
    const room=e.target.closest?.('.room[data-side="enemy"].weapon');
    if(!room)return;
    if(e.relatedTarget&&room.contains(e.relatedTarget))return;
    startHover(room.dataset.id);
  });

  stage.addEventListener('pointerout',e=>{
    const room=e.target.closest?.('.room[data-side="enemy"].weapon');
    if(!room||room.dataset.id!==activeSourceId)return;
    if(e.relatedTarget&&room.contains(e.relatedTarget))return;
    stopHover();
  });

  window.addEventListener('combat-ended',stopHover);
  window.addEventListener('resize',()=>{if(activeSourceId)playTrace(activeSourceId);});
})();
