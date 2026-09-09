(() => {
  const endButton=document.createElement('button');
  endButton.type='button';endButton.className='v28-end-combat';endButton.textContent='END COMBAT';
  stage.appendChild(endButton);
  let armed=false,armTimer=null;

  function selectorUrl(){ return new URL('./',window.location.href).toString(); }
  function returnToSelect(){ window.location.href=selectorUrl(); }
  function replay(){ window.location.reload(); }
  function resetArm(){armed=false;endButton.textContent='END COMBAT';endButton.classList.remove('confirm');clearTimeout(armTimer);armTimer=null;}

  endButton.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(window.combatEnded){returnToSelect();return;}
    if(!armed){armed=true;endButton.textContent='CONFIRM END?';endButton.classList.add('confirm');armTimer=setTimeout(resetArm,3200);return;}
    returnToSelect();
  });

  window.addEventListener('combat-ended',()=>{
    resetArm();endButton.textContent='RETURN TO SHIP SELECT';endButton.classList.add('ended');
    queueMicrotask(()=>{
      const actions=stage.querySelector('.v11-outcome-actions');if(!actions)return;
      actions.innerHTML='';
      const again=document.createElement('button');again.type='button';again.className='v11-accept';again.textContent='REPLAY MATCH';
      const back=document.createElement('button');back.type='button';back.className='v11-refuse';back.textContent='RETURN TO SHIP SELECT';
      again.addEventListener('click',e=>{e.stopPropagation();replay();});
      back.addEventListener('click',e=>{e.stopPropagation();returnToSelect();});
      actions.append(again,back);
    });
  });

  window.combatNavigation={returnToSelect,replay};
})();
