(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const worldUrl=()=>new URL('../world/',window.location.href).toString();

  window.addEventListener('combat-ended',event=>{
    Adventure.recordCombatResult(event.detail||{});
    queueMicrotask(()=>{
      const actions=document.querySelector('.v11-outcome-actions');if(!actions)return;
      actions.innerHTML='';actions.classList.add('v28-final-actions');
      const back=document.createElement('button');back.type='button';back.className='v28-return';back.textContent='RETURN TO MAP';
      back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.location.href=worldUrl();});
      actions.appendChild(back);
    });
  });

  const endButton=document.querySelector('.v28-end-combat');
  endButton?.addEventListener('click',event=>{
    if(endButton.textContent!=='CONFIRM END?')return;
    event.preventDefault();event.stopImmediatePropagation();Adventure.clearPendingCombat();window.location.href=worldUrl();
  },true);
})();