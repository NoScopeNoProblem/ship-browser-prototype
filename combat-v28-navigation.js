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
    resetArm();
    // Final-result navigation lives inside the outcome card so the combat-end input lock cannot
    // intercept it. Hide the old bottom-left control rather than leaving a dead-looking button.
    endButton.hidden=true;
    queueMicrotask(()=>{
      const actions=stage.querySelector('.v11-outcome-actions');if(!actions)return;
      actions.innerHTML='';actions.classList.add('v28-final-actions');
      const again=document.createElement('button');again.type='button';again.className='v28-replay';again.textContent='REPLAY MATCH';
      const back=document.createElement('button');back.type='button';back.className='v28-return';back.textContent='RETURN TO SHIP SELECT';
      again.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();replay();});
      back.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();returnToSelect();});
      actions.append(again,back);
    });
  });

  window.combatNavigation={returnToSelect,replay};
})();