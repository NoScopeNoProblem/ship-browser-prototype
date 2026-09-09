(() => {
  // Geometry helpers must use the canonical DOM references created by combat-v11-data.js.
  // The previous version referenced `playerMastEl`, which does not exist. That only threw when
  // a Mast-specific geometry path ran (notably when movement converted a Mast hit into MISS),
  // aborting refresh after the ship position moved but before dodge/threat/utility/Mast UI updated.
  laneY = function(side,lane){
    const sr=stage.getBoundingClientRect();
    if(lane==='mast'){
      const m=(side==='player'?playerMastBox:enemyMastBox).getBoundingClientRect();
      return m.top-sr.top;
    }
    const g=(side==='player'?playerGrid:enemyGrid).getBoundingClientRect();
    return g.top-sr.top + lane*(g.height/2);
  };

  drawArc = function(side,source){
    if(!source||!source.weapon)return;
    const targetGrid=side==='player'?enemyGrid:playerGrid;
    const targetMast=side==='player'?enemyMastBox:playerMastBox;
    const sourceEl=getEntityElement(side,source.id);
    if(!sourceEl)return;
    const sr=stage.getBoundingClientRect(),src=sourceEl.getBoundingClientRect(),gr=targetGrid.getBoundingClientRect(),mr=targetMast.getBoundingClientRect();
    const w=weapons[source.weapon],sw=sourceWorld(side,source);
    const sx=src.left-sr.left+src.width/2,sy=src.top-sr.top+src.height/2;
    const minY=Math.min(gr.top,mr.top)-sr.top,maxY=gr.bottom-sr.top;
    const above=sy<minY,nearY=above?minY:maxY,farY=above?maxY:minY;
    const minX=worldColX(sw-w.arc),maxX=worldColX(sw+w.arc+1);
    const p=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    p.setAttribute('points',[[sx,sy],[minX,nearY],[minX,farY],[maxX,farY],[maxX,nearY]].map(v=>v.join(',')).join(' '));
    const focused=(state.selectedWeaponId===source.id)||(state.hoverIntent&&state.hoverIntent.sourceId===source.id)||(state.hoveredWeapon&&state.hoveredWeapon.id===source.id);
    p.setAttribute('class',`arc-path ${side==='enemy'?'enemy':'friendly'}${focused?' focus':''}${state.selectedWeaponId===source.id?' selection':''}`);
    arcOverlay.appendChild(p);
  };

  refresh();
})();
