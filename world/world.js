(() => {
  const Adventure=window.HighSeasAdventure;
  const World=window.HighSeasWorldDefinition;
  if(!Adventure||!World)return;

  let state=Adventure.load();
  let activeModal=null;

  const els={
    map:document.getElementById('worldMap'),
    edgeLayer:document.getElementById('edgeLayer'),
    nodeLayer:document.getElementById('nodeLayer'),
    entityLayer:document.getElementById('entityLayer'),
    seaName:document.getElementById('seaName'),
    day:document.getElementById('dayValue'),
    coins:document.getElementById('coinValue'),
    food:document.getElementById('foodValue'),
    balls:document.getElementById('ballValue'),
    timber:document.getElementById('timberValue'),
    current:document.getElementById('currentLocation'),
    destination:document.getElementById('routeDestination'),
    routeSummary:document.getElementById('routeSummary'),
    nextLeg:document.getElementById('nextLeg'),
    sail:document.getElementById('sailNext'),
    openLocation:document.getElementById('openLocation'),
    clearRoute:document.getElementById('clearRoute'),
    modal:document.getElementById('modalLayer'),
    modalCard:document.getElementById('modalCard'),
    reset:document.getElementById('resetAdventure')
  };

  const nodeById=id=>World.nodes.find(n=>n.id===id)||null;
  const edgeBetween=(a,b)=>World.edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a))||null;
  const neighbours=id=>World.edges.flatMap(edge=>edge.a===id?[[edge.b,edge]]:edge.b===id?[[edge.a,edge]]:[]);
  const iconFor=node=>node.type==='majorPort'?'⚓':node.type==='minorPort'?'●':node.type==='poi'?(node.poiKind==='wreck'?'⚑':'◇'):node.type==='paradise'?'★':'·';

  function ensureState(){
    if(!nodeById(state.currentNodeId))state.currentNodeId=World.startNodeId;
    state.routeConditions=state.routeConditions||{};
    state.visitedNodeIds=Array.isArray(state.visitedNodeIds)?state.visitedNodeIds:[World.startNodeId];
    state.resolvedPoiIds=Array.isArray(state.resolvedPoiIds)?state.resolvedPoiIds:[];
    state.enemies=state.enemies||{};
    for(const def of World.enemies){
      if(!state.enemies[def.id]){
        state.enemies[def.id]={active:true,defeated:false,nodeId:def.startNodeId,routeIndex:0,nextMoveDay:state.day+def.moveIntervalDays};
      }else{
        const e=state.enemies[def.id];
        if(!nodeById(e.nodeId))e.nodeId=def.startNodeId;
        if(!Number.isFinite(e.routeIndex))e.routeIndex=Math.max(0,def.route.indexOf(e.nodeId));
        if(!Number.isFinite(e.nextMoveDay))e.nextMoveDay=state.day+def.moveIntervalDays;
      }
    }
    Adventure.save(state);
  }

  function edgeDays(edge){
    const travel=edge.travel||{};
    const runtime=state.routeConditions?.[edge.id]||{};
    const base=Number(travel.baseDays)||2;
    const staticMod=Number(travel.modifierDays)||0;
    const runtimeMod=Number(runtime.modifierDays)||0;
    return Math.max(1,base+staticMod+runtimeMod);
  }

  function shortestPath(start,target){
    if(start===target)return {path:[start],days:0};
    const dist=new Map(World.nodes.map(n=>[n.id,Infinity]));
    const prev=new Map();
    const unvisited=new Set(World.nodes.map(n=>n.id));
    dist.set(start,0);
    while(unvisited.size){
      let current=null,best=Infinity;
      for(const id of unvisited){const d=dist.get(id);if(d<best){best=d;current=id;}}
      if(current===null||best===Infinity)break;
      unvisited.delete(current);
      if(current===target)break;
      for(const [next,edge] of neighbours(current)){
        if(!unvisited.has(next))continue;
        const alt=best+edgeDays(edge);
        if(alt<dist.get(next)){dist.set(next,alt);prev.set(next,current);}
      }
    }
    if(!prev.has(target))return null;
    const path=[target];let cursor=target;
    while(cursor!==start){cursor=prev.get(cursor);if(!cursor)return null;path.push(cursor);}
    path.reverse();return {path,days:dist.get(target)};
  }

  function currentPlan(){
    if(!state.plannedDestinationId||state.plannedDestinationId===state.currentNodeId)return null;
    return shortestPath(state.currentNodeId,state.plannedDestinationId);
  }

  function edgeKey(a,b){return [a,b].sort().join('::');}

  function renderEdges(plan){
    els.edgeLayer.innerHTML='';
    const planned=new Set();
    if(plan)for(let i=0;i<plan.path.length-1;i++)planned.add(edgeKey(plan.path[i],plan.path[i+1]));
    for(const edge of World.edges){
      const a=nodeById(edge.a),b=nodeById(edge.b);if(!a||!b)continue;
      const group=document.createElementNS('http://www.w3.org/2000/svg','g');
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
      line.setAttribute('class',`route-edge${planned.has(edgeKey(edge.a,edge.b))?' planned':''}`);group.appendChild(line);
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x',(a.x+b.x)/2);label.setAttribute('y',(a.y+b.y)/2-1.1);label.setAttribute('class','route-time');label.textContent=`${edgeDays(edge)}d`;group.appendChild(label);
      els.edgeLayer.appendChild(group);
    }
  }

  function renderNodes(plan){
    els.nodeLayer.innerHTML='';
    const plannedNodes=new Set(plan?.path||[]),visited=new Set(state.visitedNodeIds),resolved=new Set(state.resolvedPoiIds);
    for(const node of World.nodes){
      const button=document.createElement('button');button.type='button';button.className=`map-node ${node.type}`;
      button.style.left=`${node.x}%`;button.style.top=`${node.y}%`;button.dataset.nodeId=node.id;
      button.classList.toggle('current',node.id===state.currentNodeId);button.classList.toggle('planned',plannedNodes.has(node.id));button.classList.toggle('visited',visited.has(node.id));button.classList.toggle('resolved',resolved.has(node.id));
      button.innerHTML=`<span class="node-icon">${iconFor(node)}</span><span class="node-name">${node.name}</span><span class="node-type">${node.summary}</span>`;
      button.title=node.id===state.currentNodeId?'Current location — click to open':`Plan a route to ${node.name}`;
      button.addEventListener('click',()=>{
        if(node.id===state.currentNodeId){openLocation(node);return;}
        if(state.status!=='active')return;
        state.plannedDestinationId=node.id;Adventure.save(state);render();
      });
      els.nodeLayer.appendChild(button);
    }
  }

  function renderEnemies(){
    els.entityLayer.innerHTML='';
    for(const def of World.enemies){
      const entity=state.enemies[def.id];if(!entity?.active)continue;
      const node=nodeById(entity.nodeId);if(!node)continue;
      const button=document.createElement('button');button.type='button';button.className='enemy-marker';
      button.style.left=`calc(${node.x}% + 24px)`;button.style.top=`calc(${node.y}% - 31px)`;
      button.innerHTML=`<span>⛵</span><b>${'★'.repeat(def.threat)}</b>`;button.title=`${def.name} — Threat ${'★'.repeat(def.threat)}`;
      button.addEventListener('click',()=>openEnemyInfo(def,entity));els.entityLayer.appendChild(button);
    }
  }

  function renderHud(plan){
    els.seaName.textContent=World.name;els.day.textContent=state.day;els.coins.textContent=state.coins;
    els.food.textContent=state.stores.food;els.balls.textContent=state.stores.cannonballs;els.timber.textContent=state.stores.timber;
    const current=nodeById(state.currentNodeId);els.current.textContent=current?.name||'—';
    if(!plan){
      els.destination.textContent='No route plotted';els.routeSummary.textContent='Select any location on the chart.';els.nextLeg.textContent='—';els.sail.disabled=true;els.clearRoute.disabled=true;
    }else{
      const destination=nodeById(state.plannedDestinationId),next=nodeById(plan.path[1]),nextEdge=edgeBetween(plan.path[0],plan.path[1]);
      els.destination.textContent=destination?.name||'—';els.routeSummary.textContent=`${plan.path.length-1} leg${plan.path.length===2?'':'s'} · ${plan.days} days total`;
      els.nextLeg.textContent=next?`${next.name} · ${edgeDays(nextEdge)} days`:'—';els.sail.disabled=!next||state.status!=='active';els.clearRoute.disabled=false;
    }
    els.openLocation.disabled=!current;els.sail.textContent=plan?.path?.[1]?`SAIL NEXT LEG · ${edgeDays(edgeBetween(plan.path[0],plan.path[1]))}d`:'SAIL NEXT LEG';
  }

  function render(){
    const plan=currentPlan();renderEdges(plan);renderNodes(plan);renderEnemies();renderHud(plan);
  }

  function advanceEnemies(){
    for(const def of World.enemies){
      const e=state.enemies[def.id];if(!e?.active)continue;
      while(state.day>=e.nextMoveDay){
        e.routeIndex=(e.routeIndex+1)%def.route.length;e.nodeId=def.route[e.routeIndex];e.nextMoveDay+=def.moveIntervalDays;
      }
    }
  }

  function enemyAtCurrentNode(){
    for(const def of World.enemies){const e=state.enemies[def.id];if(e?.active&&e.nodeId===state.currentNodeId)return {def,entity:e};}
    return null;
  }

  function sailNextLeg(){
    const plan=currentPlan();if(!plan||plan.path.length<2||state.status!=='active')return;
    closeModal();
    const from=plan.path[0],to=plan.path[1],edge=edgeBetween(from,to);if(!edge)return;
    state.day+=edgeDays(edge);state.currentNodeId=to;
    if(!state.visitedNodeIds.includes(to))state.visitedNodeIds.push(to);
    // Catch a ship already at the destination before the world tick, then move the living world
    // and catch a ship that arrives there during the same travel leg. This is a deliberately
    // simple interception model until edge-crossing/pursuit timing is designed.
    const threatBeforeMove=enemyAtCurrentNode();
    advanceEnemies();
    const threatAfterMove=enemyAtCurrentNode();
    if(state.plannedDestinationId===to)state.plannedDestinationId=null;
    Adventure.save(state);render();
    const threat=threatBeforeMove||threatAfterMove;
    if(threat){openThreat(threat.def,threat.entity);return;}
    openLocation(nodeById(to),true);
  }

  function modalShell({kicker,title,copy}){
    activeModal=true;els.modal.hidden=false;els.modalCard.innerHTML='';
    const head=document.createElement('div');head.className='modal-head';head.innerHTML=`<div class="modal-kicker">${kicker||''}</div><h2>${title||''}</h2><p>${copy||''}</p>`;els.modalCard.appendChild(head);
    return els.modalCard;
  }
  function closeModal(){activeModal=null;els.modal.hidden=true;els.modalCard.innerHTML='';}
  function actions(...buttons){const row=document.createElement('div');row.className='modal-actions';buttons.filter(Boolean).forEach(b=>row.appendChild(b));els.modalCard.appendChild(row);}
  function button(label,onClick,className='') {const b=document.createElement('button');b.type='button';b.className=`modal-button ${className}`;b.textContent=label;b.addEventListener('click',onClick);return b;}

  function openPort(node){
    const major=node.type==='majorPort';
    modalShell({kicker:major?'MAJOR PORT':'MINOR PORT',title:node.name,copy:'Market counter · purchases are tracked for this map prototype but are not connected to ship storage yet.'});
    const counter=document.createElement('div');counter.className='market-counter';
    const coinRow=document.createElement('div');coinRow.className='market-wallet';coinRow.innerHTML=`<span>COIN</span><strong>${state.coins}</strong>`;counter.appendChild(coinRow);
    Object.entries(World.market).forEach(([key,item])=>{
      const row=document.createElement('div');row.className='market-row';
      row.innerHTML=`<div><strong>${item.label}</strong><span>+${item.amount} for ${item.cost} coin</span></div><div class="market-owned"><span>ON HAND</span><b>${state.stores[key]}</b></div>`;
      const buy=button(`BUY +${item.amount}`,()=>{
        if(state.coins<item.cost)return;
        state.coins-=item.cost;state.stores[key]+=item.amount;Adventure.save(state);render();openPort(node);
      },'buy');buy.disabled=state.coins<item.cost;row.appendChild(buy);counter.appendChild(row);
    });
    els.modalCard.appendChild(counter);actions(button('LEAVE PORT',closeModal,'secondary'));
  }

  function openPoi(node){
    const done=state.resolvedPoiIds.includes(node.id);
    const copy=done?'You have already explored this location.':'A simple interaction placeholder for the route prototype. Later this becomes a short event with information, risk and opportunity cost.';
    modalShell({kicker:node.poiKind==='wreck'?'SHIPWRECK':'POINT OF INTEREST',title:node.name,copy});
    if(done){actions(button('SAIL ON',closeModal,'secondary'));return;}
    actions(
      button('EXPLORE',()=>{state.resolvedPoiIds.push(node.id);Adventure.save(state);render();modalShell({kicker:'EXPLORED',title:node.name,copy:'The location is now marked complete. Rewards and story consequences will be added in the interaction pass.'});actions(button('CONTINUE',closeModal));}),
      button('SAIL ON',closeModal,'secondary')
    );
  }

  function openParadise(node){
    state.status='complete';Adventure.save(state);render();
    modalShell({kicker:'PROTOTYPE DESTINATION',title:node.name,copy:`The Wayward reaches Paradise Bay on Day ${state.day}. This is the end point of the current overworld prototype.`});
    actions(button('RETURN TO MAIN MENU',()=>{window.location.href='../';}),button('KEEP CHART OPEN',closeModal,'secondary'));
  }

  function openLocation(node,fromTravel=false){
    if(!node)return;
    if(node.type==='majorPort'||node.type==='minorPort'){openPort(node);return;}
    if(node.type==='poi'){openPoi(node);return;}
    if(node.type==='paradise'){openParadise(node);return;}
    if(fromTravel){modalShell({kicker:'ARRIVED',title:node.name,copy:'Open water. Plot the next leg when ready.'});actions(button('CONTINUE',closeModal));}
    else {modalShell({kicker:'CURRENT LOCATION',title:node.name,copy:'Open water. No local interaction is attached yet.'});actions(button('CLOSE',closeModal,'secondary'));}
  }

  function openEnemyInfo(def,entity){
    if(entity.nodeId===state.currentNodeId){openThreat(def,entity);return;}
    const node=nodeById(entity.nodeId);
    modalShell({kicker:'SHIP SIGHTING',title:def.name,copy:`Threat ${'★'.repeat(def.threat)} · Last plotted at ${node?.name||'unknown waters'}. Ships currently advance on a simple deterministic patrol as time passes.`});
    actions(button('PLOT TO CURRENT POSITION',()=>{state.plannedDestinationId=entity.nodeId;Adventure.save(state);closeModal();render();}),button('CLOSE',closeModal,'secondary'));
  }

  function openThreat(def){
    modalShell({kicker:'THREAT ENCOUNTERED',title:def.name,copy:`Threat Rank ${'★'.repeat(def.threat)}. You know the vessel's coarse threat level; its internal rooms remain unknown until combat reveals them.`});
    const detail=document.createElement('div');detail.className='threat-summary';detail.innerHTML=`<span>YOUR SHIP</span><strong>THE WAYWARD</strong><span>THREAT</span><strong>${'★'.repeat(def.threat)}</strong>`;els.modalCard.appendChild(detail);
    actions(button('ENGAGE',()=>launchCombat(def),'danger'),button('AVOID FOR NOW',closeModal,'secondary'));
  }

  function launchCombat(def){
    Adventure.beginCombat({enemyId:def.id,enemySetupId:def.shipSetupId,encounterNodeId:state.currentNodeId,name:def.name,threat:def.threat});
    const url=new URL('../combat/combat.html',window.location.href);url.searchParams.set('mode','adventure');url.searchParams.set('player','wayward');url.searchParams.set('enemy',def.shipSetupId);url.searchParams.set('encounter',def.id);window.location.href=url.toString();
  }

  function showReturnedCombat(){
    const last=state.lastCombat;if(!last||!last.endedAt||last.endedAt<=Number(state.lastSeenCombatAt||0))return false;
    state.lastSeenCombatAt=last.endedAt;Adventure.save(state);
    const won=['sunk','surrender','victory'].includes(last.kind),fled=last.kind==='fled',defeated=last.kind==='defeat';
    const title=won?'ENGAGEMENT WON':fled?'YOU BROKE AWAY':defeated?'THE WAYWARD WAS SUNK':'COMBAT ENDED';
    const copy=won?`${last.name||'The enemy'} is removed from the map for this prototype.`:fled?'The enemy remains active on the chart and may be encountered again.':defeated?'This adventure is marked ended. Persistent ship damage and recovery will be connected when the ship-management layer is built.':'You have returned to the chart.';
    modalShell({kicker:'RETURN TO MAP',title,copy});
    actions(defeated?button('NEW ADVENTURE',()=>{Adventure.newAdventure();window.location.reload();}):button('CONTINUE',closeModal),button('MAIN MENU',()=>{window.location.href='../';},'secondary'));
    return true;
  }

  els.sail.addEventListener('click',sailNextLeg);
  els.clearRoute.addEventListener('click',()=>{state.plannedDestinationId=null;Adventure.save(state);render();});
  els.openLocation.addEventListener('click',()=>openLocation(nodeById(state.currentNodeId)));
  els.reset.addEventListener('click',()=>{if(window.confirm('Start a fresh map run? Current map progress will be replaced.')){state=Adventure.newAdventure();ensureState();render();openPort(nodeById(World.startNodeId));}});
  els.modal.addEventListener('click',event=>{if(event.target===els.modal)closeModal();});
  window.addEventListener('keydown',event=>{if(event.code==='Escape'&&activeModal)closeModal();});

  ensureState();render();
  if(!showReturnedCombat()&&!state.flags.openingPortShown){state.flags.openingPortShown=true;Adventure.save(state);openPort(nodeById(World.startNodeId));}
})();