(() => {
  const Adventure=window.HighSeasAdventure,Voyage=window.HighSeasShipVoyage,World=window.HighSeasWorldDefinition;
  const anchor=document.getElementById('openLocation');
  if(!Adventure||!Voyage||!World||!anchor)return;

  const wait=document.createElement('button');wait.type='button';wait.className='small-action v34-wait-day';
  anchor.insertAdjacentElement('afterend',wait);

  const foodRate=state=>Math.max(0,Number(World.ships?.[state.shipId]?.foodPerDay)||4);
  function render(){
    const state=Adventure.load(),cost=foodRate(state);
    wait.textContent=`WAIT 1 DAY · −${cost} FOOD`;
    wait.disabled=state.status!=='active'||!!state.midPassage;
    wait.title=state.midPassage?'You are between locations; reach either end before waiting.':`Remain at this location for one day. Costs ${cost} Food and advances moving threats.`;
  }
  function toast(text){
    const old=document.querySelector('.v34-wait-toast');old?.remove();
    const el=document.createElement('div');el.className='v34-wait-toast';el.textContent=text;
    const panel=document.querySelector('.route-panel');(panel||document.body).appendChild(el);
    setTimeout(()=>el.remove(),3200);
  }
  function currentThreat(state){
    return World.enemies?.find(def=>state.enemies?.[def.id]?.active&&state.enemies[def.id].nodeId===state.currentNodeId)||null;
  }

  wait.addEventListener('click',()=>{
    const before=Adventure.load();if(before.status!=='active'||before.midPassage)return;
    const cost=foodRate(before),nodeId=before.currentNodeId;
    Voyage.advanceDay(1);window.HighSeasWorldStateSync?.sync?.();
    try{sessionStorage.setItem('highSeasWaitResult',JSON.stringify({nodeId,cost}));}catch{}
    // Reload the map after the deliberate day transition so route forecasts, moving threats and
    // every closure-owned world view are rebuilt from the newly advanced canonical state.
    window.location.replace(window.location.pathname+window.location.search);
  });

  let waited=null;try{waited=JSON.parse(sessionStorage.getItem('highSeasWaitResult')||'null');if(waited)sessionStorage.removeItem('highSeasWaitResult');}catch{}
  if(waited)setTimeout(()=>{
    const state=Adventure.load();toast(`Waited 1 day · −${waited.cost} Food`);
    const threat=currentThreat(state);if(!threat)return;
    const marker=[...document.querySelectorAll('.enemy-marker')].find(el=>el.title?.startsWith(threat.name));
    marker?.click();
  },40);

  window.addEventListener('adventure-storage-changed',render);
  window.addEventListener('adventure-ship-changed',render);
  render();
})();
