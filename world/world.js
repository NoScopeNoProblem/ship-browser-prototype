(() => {
  const Adventure=window.HighSeasAdventure;
  const World=window.HighSeasWorldDefinition;
  if(!Adventure||!World)return;

  let state=Adventure.load();
  let activeModal=null;
  let sailing=false;

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
  const foodRate=()=>Math.max(0,Number(World.ships?.[state.shipId]?.foodPerDay)||4);

  function ensureState(){
    if(!nodeById(state.currentNodeId))state.currentNodeId=World.startNodeId;
    state.routeConditions=state.routeConditions||{};
    state.plannedRoute=Array.isArray(state.plannedRoute)?state.plannedRoute.filter(id=>nodeById(id)):[];
    if(state.plannedRoute.length&&state.plannedRoute[0]!==state.currentNodeId)state.plannedRoute=[];
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

  function baseWindState(edge){
    const runtime=state.routeConditions?.[edge?.id]||{};
    return runtime.weatherState||edge?.travel?.weatherState||'normal';
  }
  function reverseWind(wind){return wind==='favourable'?'adverse':wind==='adverse'?'favourable':'normal';}
  function windState(edge,from=edge?.a,to=edge?.b){
    const wind=baseWindState(edge);
    if(wind==='normal'||!edge||!from||!to)return wind;
    if(from===edge.a&&to===edge.b)return wind;
    if(from===edge.b&&to===edge.a)return reverseWind(wind);
    return wind;
  }
  function edgeDays(edge,from=edge?.a,to=edge?.b){
    const travel=edge?.travel||{};
    const runtime=state.routeConditions?.[edge?.id]||{};
    const base=Number(travel.baseDays)||2;
    const wind=windState(edge,from,to);
    const windMod=wind==='favourable'?-1:wind==='adverse'?1:0;
    const runtimeExtra=runtime.weatherState?0:(Number(runtime.modifierDays)||0);
    return Math.max(1,Math.round(base+windMod+runtimeExtra));
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
        const alt=best+edgeDays(edge,current,next);
        if(alt<dist.get(next)){dist.set(next,alt);prev.set(next,current);}
      }
    }
    if(!prev.has(target))return null;
    const path=[target];let cursor=target;
    while(cursor!==start){cursor=prev.get(cursor);if(!cursor)return null;path.push(cursor);}
    path.reverse();return {path,days:dist.get(target)};
  }

  function normalPlan(){
    const path=state.plannedRoute;
    if(!Array.isArray(path)||path.length<2||path[0]!==state.currentNodeId)return null;
    let days=0;
    for(let i=0;i<path.length-1;i++){
      const edge=edgeBetween(path[i],path[i+1]);if(!edge)return null;days+=edgeDays(edge,path[i],path[i+1]);
    }
    return {path:[...path],days,midPassage:false};
  }

  function currentPlan(){
    if(state.midPassage){
      const target=state.plannedRoute?.[0];
      if(target!==state.midPassage.fromNodeId&&target!==state.midPassage.toNodeId)return null;
      return {path:['__mid__',target],days:1,midPassage:true};
    }
    return normalPlan();
  }

  function edgeKey(a,b){return [a,b].sort().join('::');}
  function directionForEdge(edge,plan){
    if(plan&&!plan.midPassage){
      for(let i=0;i<plan.path.length-1;i++){
        if(edgeKey(plan.path[i],plan.path[i+1])===edgeKey(edge.a,edge.b))return {from:plan.path[i],to:plan.path[i+1],planned:true};
      }
    }
    if(plan?.midPassage&&state.midPassage&&edgeKey(state.midPassage.fromNodeId,state.midPassage.toNodeId)===edgeKey(edge.a,edge.b)){
      const target=plan.path[1];
      const other=target===edge.a?edge.b:edge.a;
      return {from:other,to:target,planned:true,midPassage:true};
    }
    if(!state.midPassage&&state.currentNodeId===edge.a)return {from:edge.a,to:edge.b,fromCurrent:true};
    if(!state.midPassage&&state.currentNodeId===edge.b)return {from:edge.b,to:edge.a,fromCurrent:true};
    return {from:edge.a,to:edge.b};
  }

  function renderEdges(plan){
    els.edgeLayer.innerHTML='';
    const planned=new Set();
    if(plan&&!plan.midPassage)for(let i=0;i<plan.path.length-1;i++)planned.add(edgeKey(plan.path[i],plan.path[i+1]));
    if(plan?.midPassage)planned.add(edgeKey(state.midPassage.fromNodeId,state.midPassage.toNodeId));

    for(const edge of World.edges){
      const a=nodeById(edge.a),b=nodeById(edge.b);if(!a||!b)continue;
      const direction=directionForEdge(edge,plan);
      const wind=windState(edge,direction.from,direction.to);
      const shownDays=direction.midPassage?1:edgeDays(edge,direction.from,direction.to);
      const group=document.createElementNS('http://www.w3.org/2000/svg','g');
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
      line.setAttribute('class',`route-edge${planned.has(edgeKey(edge.a,edge.b))?' planned':''}${wind!=='normal'?` ${wind}`:''}`);group.appendChild(line);

      if(wind!=='normal'){
        const left=a.x<=b.x?a:b,right=a.x<=b.x?b:a;
        const flow=document.createElementNS('http://www.w3.org/2000/svg','text');
        const mx=(left.x+right.x)/2,my=(left.y+right.y)/2;
        const angle=Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI;
        const raw=baseWindState(edge);
        const aToBRight=b.x>=a.x;
        const physicalRight=raw==='favourable'?aToBRight:!aToBRight;
        flow.setAttribute('x',mx);flow.setAttribute('y',my+1.1);flow.setAttribute('transform',`rotate(${angle} ${mx} ${my})`);
        flow.setAttribute('class',`wind-arrows ${wind}`);
        flow.textContent=physicalRight?'› › ›':'‹ ‹ ‹';
        group.appendChild(flow);
      }

      const label=document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x',(a.x+b.x)/2);label.setAttribute('y',(a.y+b.y)/2-1.4);
      label.setAttribute('class',`route-time${wind!=='normal'?` ${wind}`:''}`);
      label.textContent=direction.midPassage?'1d':`${shownDays}d`;
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');
      const fromName=nodeById(direction.from)?.name||direction.from,toName=nodeById(direction.to)?.name||direction.to;
      title.textContent=wind==='normal'?`${fromName} → ${toName}: ${shownDays} days`:`${fromName} → ${toName}: ${wind.toUpperCase()} · ${shownDays} day${shownDays===1?'':'s'}`;
      group.appendChild(title);group.appendChild(label);
      els.edgeLayer.appendChild(group);
    }
  }

  function plannedFoodByNode(plan){
    const result=new Map();
    if(!plan)return result;
    let food=state.stores.food;
    if(plan.midPassage){food-=foodRate();result.set(plan.path[1],food);return result;}
    for(let i=1;i<plan.path.length;i++){
      food-=edgeDays(edgeBetween(plan.path[i-1],plan.path[i]),plan.path[i-1],plan.path[i])*foodRate();
      result.set(plan.path[i],food);
    }
    return result;
  }

  function handleNodeSelection(node){
    if(sailing||state.status!=='active')return;
    if(state.midPassage){
      if(node.id!==state.midPassage.fromNodeId&&node.id!==state.midPassage.toNodeId)return;
      state.plannedRoute=[node.id];state.plannedDestinationId=node.id;Adventure.save(state);render();return;
    }
    if(node.id===state.currentNodeId){openLocation(node);return;}

    let route=Array.isArray(state.plannedRoute)&&state.plannedRoute[0]===state.currentNodeId?[...state.plannedRoute]:[state.currentNodeId];
    const existing=route.indexOf(node.id);
    if(existing>0){
      route=route.slice(0,existing+1);
    }else{
      const endpoint=route[route.length-1];
      if(edgeBetween(endpoint,node.id)){
        route.push(node.id);
      }else{
        const auto=shortestPath(endpoint,node.id);if(!auto)return;
        route.push(...auto.path.slice(1));
      }
    }
    state.plannedRoute=route;
    state.plannedDestinationId=route[route.length-1]||null;
    Adventure.save(state);render();
  }

  function renderNodes(plan){
    els.nodeLayer.innerHTML='';
    const plannedNodes=new Set(plan?.path?.filter(id=>id!=='__mid__')||[]),visited=new Set(state.visitedNodeIds),resolved=new Set(state.resolvedPoiIds);
    const foodForecast=plannedFoodByNode(plan);
    const midpointEndpoints=state.midPassage?new Set([state.midPassage.fromNodeId,state.midPassage.toNodeId]):null;

    for(const node of World.nodes){
      const button=document.createElement('button');button.type='button';button.className=`map-node ${node.type}`;
      button.style.left=`${node.x}%`;button.style.top=`${node.y}%`;button.dataset.nodeId=node.id;
      const current=!state.midPassage&&node.id===state.currentNodeId;
      button.classList.toggle('current',current);button.classList.toggle('planned',plannedNodes.has(node.id));button.classList.toggle('visited',visited.has(node.id));button.classList.toggle('resolved',resolved.has(node.id));
      if(midpointEndpoints&&!midpointEndpoints.has(node.id))button.classList.add('mid-unavailable');
      const forecast=foodForecast.has(node.id)?`<span class="food-forecast${foodForecast.get(node.id)<0?' negative':''}">FOOD ${foodForecast.get(node.id)}</span>`:'';
      button.innerHTML=`<span class="node-icon">${iconFor(node)}</span><span class="node-name">${node.name}</span><span class="node-type">${node.summary}</span>${forecast}`;
      button.title=current?'Current location — click to open':midpointEndpoints?(midpointEndpoints.has(node.id)?'1 day from your current mid-passage position':'Reach one end of the passage first'):'Click adjacent nodes to author a route; distant nodes auto-route';
      button.addEventListener('click',()=>handleNodeSelection(node));
      els.nodeLayer.appendChild(button);
    }
  }

  function playerPosition(){
    if(state.midPassage){
      const a=nodeById(state.midPassage.fromNodeId),b=nodeById(state.midPassage.toNodeId);
      if(a&&b)return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,mid:true};
    }
    const current=nodeById(state.currentNodeId);return current?{x:current.x,y:current.y,mid:false}:null;
  }

  function renderEntities(){
    els.entityLayer.innerHTML='';
    const pos=playerPosition();
    if(pos){
      const player=document.createElement('div');player.className=`player-marker${pos.mid?' mid-passage':''}`;
      player.style.left=`${pos.x}%`;player.style.top=`${pos.y}%`;
      player.innerHTML='<span class="player-ship-icon" aria-hidden="true">⛵</span><b>YOU</b>';
      player.title=pos.mid?'The Wayward — between chart nodes after fleeing':'The Wayward — your current position';
      els.entityLayer.appendChild(player);
    }

    for(const def of World.enemies){
      const entity=state.enemies[def.id];if(!entity?.active)continue;
      const node=nodeById(entity.nodeId);if(!node)continue;
      const button=document.createElement('button');button.type='button';button.className='enemy-marker';
      button.style.left=`calc(${node.x}% + 28px)`;button.style.top=`calc(${node.y}% - 34px)`;
      button.innerHTML=`<span>⛵</span><b>${'★'.repeat(def.threat)}</b>`;button.title=`${def.name} — Threat ${'★'.repeat(def.threat)}`;
      button.addEventListener('click',()=>openEnemyInfo(def,entity));els.entityLayer.appendChild(button);
    }
  }

  function routeFoodCost(plan){return plan?plan.days*foodRate():0;}

  function renderHud(plan){
    els.seaName.textContent=World.name;els.day.textContent=state.day;els.coins.textContent=state.coins;
    els.food.textContent=state.stores.food;els.balls.textContent=state.stores.cannonballs;els.timber.textContent=state.stores.timber;
    if(state.midPassage){
      const a=nodeById(state.midPassage.fromNodeId),b=nodeById(state.midPassage.toNodeId);
      els.current.textContent=`BETWEEN ${a?.name||'—'} / ${b?.name||'—'}`;els.openLocation.disabled=true;
    }else{
      els.current.textContent=nodeById(state.currentNodeId)?.name||'—';els.openLocation.disabled=!nodeById(state.currentNodeId);
    }

    if(!plan){
      els.destination.textContent='No route plotted';
      els.routeSummary.textContent=state.midPassage?'Choose either end of this passage. Each is 1 day away.':`Click an adjacent node to build your route, or a distant node to auto-route. Food: ${state.stores.food}.`;
      els.nextLeg.textContent='—';els.sail.disabled=true;els.clearRoute.disabled=true;
    }else{
      const destination=nodeById(plan.path[plan.path.length-1]);
      const next=nodeById(plan.path[1]);
      const nextDays=plan.midPassage?1:edgeDays(edgeBetween(plan.path[0],plan.path[1]),plan.path[0],plan.path[1]);
      const finalFood=state.stores.food-routeFoodCost(plan);
      const nextWind=plan.midPassage?'normal':windState(edgeBetween(plan.path[0],plan.path[1]),plan.path[0],plan.path[1]);
      const windCopy=nextWind==='normal'?'':` · ${nextWind.toUpperCase()}`;
      els.destination.textContent=destination?.name||'—';
      els.routeSummary.textContent=`${plan.path.length-1} leg${plan.path.length===2?'':'s'} · ${plan.days} day${plan.days===1?'':'s'} · Food ${state.stores.food} → ${finalFood}`;
      els.nextLeg.textContent=next?`${next.name} · ${nextDays} day${nextDays===1?'':'s'}${windCopy} · −${nextDays*foodRate()} Food`:'—';
      els.sail.disabled=sailing||!next||state.status!=='active';els.clearRoute.disabled=sailing;
    }
    const buttonDays=plan?.path?.[1]?(plan.midPassage?1:edgeDays(edgeBetween(plan.path[0],plan.path[1]),plan.path[0],plan.path[1])):null;
    els.sail.textContent=buttonDays?`SAIL NEXT LEG · ${buttonDays}d`:'SAIL NEXT LEG';
  }

  function render(){
    const plan=currentPlan();renderEdges(plan);renderNodes(plan);renderEntities();renderHud(plan);
  }

  function advanceEnemies(){
    for(const def of World.enemies){
      const e=state.enemies[def.id];if(!e?.active)continue;
      while(state.day>=e.nextMoveDay){
        e.routeIndex=(e.routeIndex+1)%def.route.length;e.nodeId=def.route[e.routeIndex];e.nextMoveDay+=def.moveIntervalDays;
      }
    }
  }

  function advanceTime(days){
    const whole=Math.max(0,Math.round(Number(days)||0));
    if(!whole)return;
    state.day+=whole;
    state.stores.food-=foodRate()*whole;
    advanceEnemies();
  }

  function enemyAtNode(nodeId){
    for(const def of World.enemies){const e=state.enemies[def.id];if(e?.active&&e.nodeId===nodeId)return {def,entity:e};}
    return null;
  }

  async function animatePlayerSail(start,end){
    const marker=els.entityLayer.querySelector('.player-marker');
    if(!marker||!start||!end||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
    sailing=true;els.map.classList.add('sailing');marker.classList.add('sailing');els.sail.disabled=true;els.clearRoute.disabled=true;
    const q=(a,b,t)=>a+(b-a)*t;
    const move=marker.animate([
      {left:`${start.x}%`,top:`${start.y}%`},
      {left:`${q(start.x,end.x,.25)}%`,top:`${q(start.y,end.y,.25)}%`},
      {left:`${q(start.x,end.x,.5)}%`,top:`${q(start.y,end.y,.5)}%`},
      {left:`${q(start.x,end.x,.75)}%`,top:`${q(start.y,end.y,.75)}%`},
      {left:`${end.x}%`,top:`${end.y}%`}
    ],{duration:760,easing:'cubic-bezier(.42,0,.25,1)',fill:'forwards'});
    const icon=marker.querySelector('.player-ship-icon');
    const bob=icon?.animate([
      {transform:'translateY(0) rotate(-2deg)'},
      {transform:'translateY(-5px) rotate(2deg)'},
      {transform:'translateY(2px) rotate(-1deg)'},
      {transform:'translateY(-3px) rotate(1deg)'},
      {transform:'translateY(0) rotate(0deg)'}
    ],{duration:380,iterations:2,easing:'ease-in-out'});
    try{await move.finished;}catch{}
    try{bob?.cancel();}catch{}
    marker.classList.remove('sailing');els.map.classList.remove('sailing');sailing=false;
  }

  function arriveAtNode(from,to,days){
    const threatBeforeMove=enemyAtNode(to);
    advanceTime(days);
    state.currentNodeId=to;
    state.lastLeg={fromNodeId:from,toNodeId:to,days};
    if(!state.visitedNodeIds.includes(to))state.visitedNodeIds.push(to);
    const threatAfterMove=enemyAtNode(to);

    if(Array.isArray(state.plannedRoute)&&state.plannedRoute[0]===from&&state.plannedRoute[1]===to){
      state.plannedRoute=state.plannedRoute.slice(1);
      if(state.plannedRoute.length<2)state.plannedRoute=[];
    }else state.plannedRoute=[];
    state.plannedDestinationId=state.plannedRoute.length?state.plannedRoute[state.plannedRoute.length-1]:null;
    Adventure.save(state);render();

    const threat=threatBeforeMove||threatAfterMove;
    if(threat){openThreat(threat.def,threat.entity);return;}
    openLocation(nodeById(to),true);
  }

  async function sailFromMidPassage(plan){
    const target=plan?.path?.[1],mid=state.midPassage;if(!target||!mid)return;
    const from=target===mid.toNodeId?mid.fromNodeId:mid.toNodeId;
    const a=nodeById(mid.fromNodeId),b=nodeById(mid.toNodeId),destination=nodeById(target);
    closeModal(true);
    await animatePlayerSail(a&&b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:null,destination);
    advanceTime(1);
    state.currentNodeId=target;
    state.lastLeg={fromNodeId:from,toNodeId:target,days:1,fromMidPassage:true};
    state.midPassage=null;state.plannedRoute=[];state.plannedDestinationId=null;
    if(!state.visitedNodeIds.includes(target))state.visitedNodeIds.push(target);
    const threat=enemyAtNode(target);
    Adventure.save(state);render();
    if(threat){openThreat(threat.def,threat.entity);return;}
    openLocation(nodeById(target),true);
  }

  async function sailNextLeg(){
    const plan=currentPlan();if(sailing||!plan||plan.path.length<2||state.status!=='active')return;
    if(plan.midPassage){await sailFromMidPassage(plan);return;}
    closeModal(true);
    const from=plan.path[0],to=plan.path[1],edge=edgeBetween(from,to);if(!edge)return;
    const start=nodeById(from),end=nodeById(to);
    await animatePlayerSail(start,end);
    arriveAtNode(from,to,edgeDays(edge,from,to));
  }

  function modalShell({kicker,title,copy,locked=false}){
    activeModal={locked};els.modal.hidden=false;els.modalCard.innerHTML='';
    const head=document.createElement('div');head.className='modal-head';head.innerHTML=`<div class="modal-kicker">${kicker||''}</div><h2>${title||''}</h2><p>${copy||''}</p>`;els.modalCard.appendChild(head);
    return els.modalCard;
  }
  function closeModal(force=false){if(activeModal?.locked&&!force)return;activeModal=null;els.modal.hidden=true;els.modalCard.innerHTML='';}
  function actions(...buttons){const row=document.createElement('div');row.className='modal-actions';buttons.filter(Boolean).forEach(b=>row.appendChild(b));els.modalCard.appendChild(row);}
  function button(label,onClick,className=''){const b=document.createElement('button');b.type='button';b.className=`modal-button ${className}`;b.textContent=label;b.addEventListener('click',onClick);return b;}

  function openPort(node){
    const major=node.type==='majorPort';
    modalShell({kicker:major?'MAJOR PORT':'MINOR PORT',title:node.name,copy:`Market counter · The Wayward consumes ${foodRate()} Food per sailing day. Storage limits are not enforced in this map pass.`});
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
    els.modalCard.appendChild(counter);actions(button('LEAVE PORT',()=>closeModal(true),'secondary'));
  }

  function addReward(reward={}){
    state.coins+=Number(reward.coins)||0;
    Object.entries(reward.stores||{}).forEach(([key,value])=>{state.stores[key]=(Number(state.stores[key])||0)+(Number(value)||0);});
  }
  function rewardText(reward={}){
    const parts=[];if(reward.coins)parts.push(`+${reward.coins} coin`);
    Object.entries(reward.stores||{}).forEach(([key,value])=>parts.push(`+${value} ${key==='cannonballs'?'cannonballs':key}`));
    return parts.join(' · ')||'No stores';
  }

  function openPoi(node){
    const done=state.resolvedPoiIds.includes(node.id);
    if(done){modalShell({kicker:node.poiKind==='wreck'?'SHIPWRECK':'POINT OF INTEREST',title:node.name,copy:'You have already explored this location.'});actions(button('SAIL ON',()=>closeModal(true),'secondary'));return;}

    if(node.poiKind==='wreck'){
      modalShell({kicker:'SHIPWRECK',title:node.name,copy:`Choose how long to search. Extra days consume ${foodRate()} Food each and advance the world.`});
      const quick=World.wreckRewards.quick,thorough=World.wreckRewards.thorough;
      actions(
        button(`QUICK SEARCH · +${quick.days}d`,()=>resolveWreck(node,quick,'Quick search')),
        button(`THOROUGH SEARCH · +${thorough.days}d`,()=>resolveWreck(node,thorough,'Thorough search')),
        button('LEAVE WRECK',()=>closeModal(true),'secondary')
      );
      return;
    }

    modalShell({kicker:'POINT OF INTEREST',title:node.name,copy:'A simple interaction placeholder. Later this becomes a short event with information, risk and opportunity cost.'});
    actions(button('EXPLORE',()=>{if(!state.resolvedPoiIds.includes(node.id))state.resolvedPoiIds.push(node.id);Adventure.save(state);render();modalShell({kicker:'EXPLORED',title:node.name,copy:'The location is now marked complete.'});actions(button('CONTINUE',()=>closeModal(true)));}),button('SAIL ON',()=>closeModal(true),'secondary'));
  }

  function resolveWreck(node,reward,label){
    advanceTime(reward.days);addReward(reward);
    if(!state.resolvedPoiIds.includes(node.id))state.resolvedPoiIds.push(node.id);
    Adventure.save(state);render();
    modalShell({kicker:'WRECK EXPLORED',title:node.name,copy:`${label}: ${rewardText(reward)}. ${reward.days} day${reward.days===1?'':'s'} passed; ${reward.days*foodRate()} Food consumed.`});
    actions(button('CONTINUE',()=>closeModal(true)));
  }

  function openParadise(node){
    state.status='complete';Adventure.save(state);render();
    modalShell({kicker:'PROTOTYPE DESTINATION',title:node.name,copy:`The Wayward reaches Paradise Bay on Day ${state.day}. This is the end point of the current overworld prototype.`});
    actions(button('RETURN TO MAIN MENU',()=>{window.location.href='../';}),button('KEEP CHART OPEN',()=>closeModal(true),'secondary'));
  }

  function openLocation(node,fromTravel=false){
    if(!node||state.midPassage)return;
    if(node.type==='majorPort'||node.type==='minorPort'){openPort(node);return;}
    if(node.type==='poi'){openPoi(node);return;}
    if(node.type==='paradise'){openParadise(node);return;}
    if(fromTravel){modalShell({kicker:'ARRIVED',title:node.name,copy:'Open water. Route costs now read from this position: a favourable passage is adverse when sailed back against the same wind.'});actions(button('CONTINUE',()=>closeModal(true)));}
    else{modalShell({kicker:'CURRENT LOCATION',title:node.name,copy:'Open water. No local interaction is attached yet.'});actions(button('CLOSE',()=>closeModal(true),'secondary'));}
  }

  function openEnemyInfo(def,entity){
    if(!state.midPassage&&entity.nodeId===state.currentNodeId){openThreat(def,entity);return;}
    const node=nodeById(entity.nodeId);
    modalShell({kicker:'SHIP SIGHTING',title:def.name,copy:`Threat ${'★'.repeat(def.threat)} · Last plotted at ${node?.name||'unknown waters'}.`});
    actions(button('PLOT TO CURRENT POSITION',()=>{if(state.midPassage)return;state.plannedRoute=[];state.plannedDestinationId=null;closeModal(true);handleNodeSelection(node);}),button('CLOSE',()=>closeModal(true),'secondary'));
  }

  function evadeThreat(def){
    const foodCost=foodRate();
    advanceTime(1);
    state.lastEvasion={enemyId:def.id,day:state.day,foodCost};
    Adventure.save(state);render();
    modalShell({kicker:'EVADED',title:'YOU SLIP PAST',copy:`Avoiding ${def.name} cost 1 day and ${foodCost} Food. The world advanced while you kept your distance.`});
    actions(button('CONTINUE',()=>closeModal(true)));
  }

  function openThreat(def){
    const foodCost=foodRate();
    modalShell({kicker:'THREAT ENCOUNTERED',title:def.name,copy:`Threat Rank ${'★'.repeat(def.threat)}. You know the vessel's coarse threat level; its internal rooms remain unknown until combat reveals them. Evading costs 1 day and ${foodCost} Food, and the world advances.`});
    const detail=document.createElement('div');detail.className='threat-summary';detail.innerHTML=`<span>YOUR SHIP</span><strong>THE WAYWARD</strong><span>THREAT</span><strong>${'★'.repeat(def.threat)}</strong>`;els.modalCard.appendChild(detail);
    actions(button('ENGAGE',()=>launchCombat(def),'danger'),button(`EVADE · 1 DAY · −${foodCost} FOOD`,()=>evadeThreat(def),'secondary'));
  }

  function launchCombat(def){
    Adventure.beginCombat({enemyId:def.id,enemySetupId:def.shipSetupId,encounterNodeId:state.currentNodeId,approachFromNodeId:state.lastLeg?.toNodeId===state.currentNodeId?state.lastLeg.fromNodeId:null,name:def.name,threat:def.threat});
    const url=new URL('../combat/combat.html',window.location.href);url.searchParams.set('mode','adventure');url.searchParams.set('player','wayward');url.searchParams.set('enemy',def.shipSetupId);url.searchParams.set('encounter',def.id);window.location.href=url.toString();
  }

  function markCombatRewardResolved(){
    if(!state.lastCombat)return;
    state.lastCombat.rewardResolved=true;state.lastSeenCombatAt=state.lastCombat.endedAt;Adventure.save(state);
  }

  function finishCombatReward(copy){
    markCombatRewardResolved();render();
    modalShell({kicker:'SALVAGE TAKEN',title:'STORES UPDATED',copy});
    actions(button('CONTINUE',()=>closeModal(true)),button('MAIN MENU',()=>{window.location.href='../';},'secondary'));
  }

  function offerExtraSalvage(kind,baseCopy){
    const table=World.combatRewards[kind];
    const extra=kind==='surrender'?table?.strip:table?.salvage;
    if(!extra){finishCombatReward(baseCopy);return;}
    modalShell({kicker:kind==='surrender'?'SURRENDERED SHIP':'SALVAGE WINDOW',title:kind==='surrender'?'STRIP THE SHIP?':'STAY AND SALVAGE?',copy:`${baseCopy} Stay +${extra.days} day to take ${rewardText(extra)}. The extra day also consumes ${extra.days*foodRate()} Food.`,locked:true});
    actions(button(`STAY +${extra.days}d`,()=>{advanceTime(extra.days);addReward(extra);finishCombatReward(`${baseCopy} Extra salvage: ${rewardText(extra)}.`);}),button('SAIL ON',()=>finishCombatReward(baseCopy),'secondary'));
  }

  function showVictoryLoot(last){
    if(last.kind==='sunk'){
      const reward=World.combatRewards.sunk;addReward(reward);markCombatRewardResolved();render();
      modalShell({kicker:'WRECKAGE',title:`${last.name||'ENEMY SHIP'} SUNK`,copy:`The ship went under before you could choose what to take. You recover only ${rewardText(reward)}.`});
      actions(button('CONTINUE',()=>closeModal(true)),button('MAIN MENU',()=>{window.location.href='../';},'secondary'));
      return;
    }

    const kind=last.kind==='surrender'?'surrender':'victory';
    const table=World.combatRewards[kind];
    modalShell({kicker:last.kind==='surrender'?'PRIZE TAKEN':'VICTORY',title:last.name||'ENEMY DEFEATED',copy:'Choose what to take first. This is deliberately a tiny-number prototype economy; cargo capacity is not enforced yet.',locked:true});
    actions(button(`TAKE COIN · ${rewardText(table.coin)}`,()=>{addReward(table.coin);Adventure.save(state);render();offerExtraSalvage(kind,`Prize: ${rewardText(table.coin)}.`);}),button(`TAKE STORES · ${rewardText(table.stores)}`,()=>{addReward(table.stores);Adventure.save(state);render();offerExtraSalvage(kind,`Prize: ${rewardText(table.stores)}.`);}) );
  }

  function showReturnedCombat(){
    const last=state.lastCombat;if(!last||!last.endedAt||last.endedAt<=Number(state.lastSeenCombatAt||0))return false;
    if((last.kind==='sunk'||last.kind==='surrender'||last.kind==='victory')&&!last.rewardResolved){showVictoryLoot(last);return true;}

    state.lastSeenCombatAt=last.endedAt;Adventure.save(state);
    if(last.kind==='fled'){
      const mid=state.midPassage,a=nodeById(mid?.fromNodeId),b=nodeById(mid?.toNodeId);
      modalShell({kicker:'YOU BROKE AWAY',title:'MID-PASSAGE',copy:mid?`The enemy remains active. You are between ${a?.name||'the last position'} and ${b?.name||'the encounter'}. Either end is exactly 1 day away and costs ${foodRate()} Food.`:'The enemy remains active on the chart.'});
      if(mid){actions(button(`SAIL TO ${a.name} · 1d`,()=>{state.plannedRoute=[a.id];state.plannedDestinationId=a.id;Adventure.save(state);closeModal(true);render();}),button(`SAIL TO ${b.name} · 1d`,()=>{state.plannedRoute=[b.id];state.plannedDestinationId=b.id;Adventure.save(state);closeModal(true);render();}),button('CLOSE',()=>closeModal(true),'secondary'));}
      else actions(button('CONTINUE',()=>closeModal(true)));
      return true;
    }

    if(last.kind==='defeat'){
      modalShell({kicker:'RETURN TO MAP',title:'THE WAYWARD WAS SUNK',copy:'This adventure is marked ended. Persistent recovery is not connected yet.'});
      actions(button('NEW ADVENTURE',()=>{Adventure.newAdventure();window.location.reload();}),button('MAIN MENU',()=>{window.location.href='../';},'secondary'));return true;
    }

    modalShell({kicker:'RETURN TO MAP',title:'COMBAT ENDED',copy:'You have returned to the chart.'});actions(button('CONTINUE',()=>closeModal(true)),button('MAIN MENU',()=>{window.location.href='../';},'secondary'));return true;
  }

  els.sail.addEventListener('click',()=>{void sailNextLeg();});
  els.clearRoute.addEventListener('click',()=>{if(sailing)return;state.plannedRoute=[];state.plannedDestinationId=null;Adventure.save(state);render();});
  els.openLocation.addEventListener('click',()=>{if(!sailing)openLocation(nodeById(state.currentNodeId));});
  els.reset.addEventListener('click',()=>{if(sailing)return;if(window.confirm('Start a fresh map run? Current map progress will be replaced.')){state=Adventure.newAdventure();ensureState();render();openPort(nodeById(World.startNodeId));}});
  els.modal.addEventListener('click',event=>{if(event.target===els.modal)closeModal();});
  window.addEventListener('keydown',event=>{if(event.code==='Escape'&&activeModal)closeModal();});

  ensureState();render();
  if(!showReturnedCombat()&&!state.flags.openingPortShown){state.flags.openingPortShown=true;Adventure.save(state);openPort(nodeById(World.startNodeId));}
})();