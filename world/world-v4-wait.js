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
    Object.assign(el.style,{marginTop:'10px',padding:'9px 11px',border:'1px solid #647986',background:'#10242e',color:'#edf2f4',fontSize:'11px',fontWeight:'900',letterSpacing:'.06em',textAlign:'center'});
    const panel=document.querySelector('.route-panel');(panel||document.body).appendChild(el);
    setTimeout(()=>el.remove(),3200);
  }
  function currentThreat(state){
    return World.enemies?.find(def=>state.enemies?.[def.id]?.active&&state.enemies[def.id].nodeId===state.currentNodeId)||null;
  }

  wait.addEventListener('click',()=>{
    const before=Adventure.load();if(before.status!=='active'||before.midPassage)return;
    const cost=foodRate(before),nodeId=before.currentNodeId;
    wait.disabled=true;wait.textContent='WAITING…';
    Voyage.advanceDay(1);window.HighSeasWorldStateSync?.sync?.();
    try{sessionStorage.setItem('highSeasWaitResult',JSON.stringify({nodeId,cost}));}catch{}
    // Rebuild the map from canonical state after the deliberate day transition so route forecasts,
    // moving threats and every closure-owned world view advance together.
    setTimeout(()=>window.location.replace(window.location.pathname+window.location.search),90);
  });

  let waited=null;try{waited=JSON.parse(sessionStorage.getItem('highSeasWaitResult')||'null');if(waited)sessionStorage.removeItem('highSeasWaitResult');}catch{}
  if(waited)setTimeout(()=>{
    const state=Adventure.load();toast(`WAITED 1 DAY · −${waited.cost} FOOD`);
    const threat=currentThreat(state);if(!threat)return;
    const marker=[...document.querySelectorAll('.enemy-marker')].find(el=>el.title?.startsWith(threat.name));
    marker?.click();
  },40);

  window.addEventListener('adventure-storage-changed',render);
  window.addEventListener('adventure-ship-changed',render);
  render();
})();
