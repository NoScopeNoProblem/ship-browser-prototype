(() => {
  const params=new URLSearchParams(window.location.search);
  if(params.get('mode')!=='adventure'||!window.HighSeasAdventure)return;
  const Adventure=window.HighSeasAdventure;
  const worldUrl=()=>new URL('../world/',window.location.href).toString();

  const ammo=document.createElement('div');
  ammo.className='adventure-ammo-counter';
  Object.assign(ammo.style,{position:'fixed',right:'18px',bottom:'16px',zIndex:'95',padding:'8px 10px',border:'1px solid #4b5c67',borderRadius:'6px',background:'#0c151dcc',color:'#e8edf2',font:'800 10px/1.2 system-ui',letterSpacing:'.09em',boxShadow:'0 5px 18px #0008'});
  document.body.appendChild(ammo);
  function updateAmmo(){const value=Adventure.load().stores.cannonballs;ammo.textContent=`CANNONBALLS  ${value}`;ammo.title='Adventure ammunition. Negative values are allowed during this economy prototype.';}
  updateAmmo();

  // Voyage ammunition belongs to the adventure layer, not the standalone combat sandbox.
  // Count only real player shots that reach the combat damage hook. Planned shots that are
  // cancelled because their target was already destroyed never spend ammunition.
  const baseAfterDamage=window.combatHooks?.afterDamage;
  if(baseAfterDamage){
    window.combatHooks.afterDamage=async function(ctx){
      const actualPlayerShot=ctx?.side==='enemy'&&ctx?.source?.weapon&&typeof playerRooms!=='undefined'&&playerRooms.includes(ctx.source);
      if(actualPlayerShot){Adventure.spendCannonball(1);updateAmmo();}
      return baseAfterDamage(ctx);
    };
  }

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