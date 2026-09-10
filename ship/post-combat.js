(() => {
  const Adventure=window.HighSeasAdventure,Voyage=window.HighSeasShipVoyage,World=window.HighSeasWorldDefinition;
  if(!Adventure||!Voyage||!World||new URLSearchParams(window.location.search).get('postCombat')!=='1')return;
  let state=Voyage.load(),last=state.lastCombat;
  if(!last||last.rewardResolved)return;
  if(state.shipSettings?.autoBalanceCargo)Voyage.rebalance();
  state=Voyage.load();last=state.lastCombat;

  const host=document.querySelector('.management-side')||document.querySelector('.management-layout');
  if(!host)return;
  document.body.classList.add('v33-postcombat-active');
  const panel=document.createElement('section');panel.className='v33-postcombat-report';
  panel.innerHTML=`
    <div class="v33-pc-head"><div class="v33-pc-kicker">POST-COMBAT REPORT</div><h2></h2><p class="v33-pc-lead"></p></div>
    <div class="v33-pc-damage"></div>
    <div class="v33-pc-summary"><section class="v33-pc-costs"></section><section class="v33-pc-gains"></section></div>
    <section class="v33-pc-choice" hidden><div class="v33-pc-choice-head"><span></span><p></p></div><div class="v33-pc-rewards"></div><div class="v33-pc-actions"></div></section>`;
  host.insertBefore(panel,host.firstChild);

  const title=panel.querySelector('h2'),lead=panel.querySelector('.v33-pc-lead'),damageEl=panel.querySelector('.v33-pc-damage'),costsEl=panel.querySelector('.v33-pc-costs'),gainsEl=panel.querySelector('.v33-pc-gains'),choiceEl=panel.querySelector('.v33-pc-choice'),choiceLabel=panel.querySelector('.v33-pc-choice-head span'),choiceCopy=panel.querySelector('.v33-pc-choice-head p'),rewards=panel.querySelector('.v33-pc-rewards'),actions=panel.querySelector('.v33-pc-actions');
  const report=last.report||{},used=report.resourcesUsed||{cannonballs:0,timber:0},lost=report.cargoLost||{},tier=report.resultTier||'standard';
  let currentStage=last.postCombat?.stage||'initial';
  let aggregate={coins:0,accepted:{},leftBehind:{},repairTimber:0,...(last.postCombat?.aggregate||{})};
  aggregate.accepted={...(aggregate.accepted||{})};aggregate.leftBehind={...(aggregate.leftBehind||{})};aggregate.repairTimber=Number(aggregate.repairTimber)||0;

  const itemName=id=>({cannonballs:'Cannonballs',timber:'Timber',food:'Food',medicine:'Medicine'}[id]||id);
  const icon=id=>window.HighSeasShipStorage?.ITEMS?.[id]?.icon||'•';
  function parts(obj){return Object.entries(obj||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>`${icon(id)} ${itemName(id)} ${q}`);}
  function mergeSummary(summary){
    aggregate.coins=(Number(aggregate.coins)||0)+(Number(summary?.coins)||0);
    for(const key of ['accepted','leftBehind'])for(const [id,q] of Object.entries(summary?.[key]||{}))aggregate[key][id]=(Number(aggregate[key][id])||0)+(Number(q)||0);
  }
  function saveProgress(stage=currentStage){
    currentStage=stage;
    Adventure.update(s=>{if(s.lastCombat)s.lastCombat.postCombat={stage:currentStage,aggregate:JSON.parse(JSON.stringify(aggregate))};});
  }
  function button(label,cls,fn){const b=document.createElement('button');b.type='button';b.className=cls||'';b.textContent=label;b.addEventListener('click',fn);return b;}
  function rewardText(reward={}){const p=[];if(reward.coins)p.push(`🪙 ${reward.coins} coin`);for(const [id,q] of Object.entries(reward.stores||{}))p.push(`${icon(id)} ${q} ${itemName(id)}`);return p.join(' · ')||'No stores';}
  function fitText(reward={}){
    const st=Voyage.load(),lines=[];
    for(const [id,q] of Object.entries(reward.stores||{})){const fit=Voyage.maxAdditional(id,q,st);if(fit<q)lines.push(`${itemName(id)} ${fit}/${q} fits`);}
    return lines.length?lines.join(' · '):'All listed cargo fits.';
  }

  function resultHeading(){
    if(tier==='perfect'){title.textContent='PERFECT COMBAT';lead.textContent='The Wayward finishes at full integrity without spending Timber on combat repairs. +10 combat score bonus.';return;}
    if(tier==='noDamage'){title.textContent='NO-DAMAGE FINISH';lead.textContent='The Wayward finishes at full integrity. +5 combat score bonus.';return;}
    title.textContent=last.kind==='fled'?'YOU BROKE AWAY':last.kind==='defeat'?'THE WAYWARD WAS SUNK':last.kind==='surrender'?'ENEMY SURRENDERED':last.kind==='sunk'?'ENEMY SHIP SUNK':'VICTORY';
    lead.textContent='Review the cost, repair what you can, then choose what to take. Your ship and stores remain visible while you decide.';
  }

  function renderDamage(){
    const st=Voyage.load(),remaining=Voyage.missingBlips(st),timber=Math.max(0,Number(st.stores?.timber)||0),carpenter=Voyage.carpenterFunctional(st);
    const taken=Math.max(0,Number(report.damageTaken??remaining)||0);
    damageEl.innerHTML=`<div class="v33-pc-section-label">SHIP DAMAGE</div><div class="v33-pc-damage-grid"><div><span>DAMAGE TAKEN</span><strong>${taken}</strong></div><div><span>DAMAGE REMAINING</span><strong>${remaining}</strong></div></div><div class="v33-pc-repair-row"><div><b>${remaining?`${remaining} damage can be repaired aboard.`:'The Wayward is fully repaired.'}</b><small>${remaining?`Repair costs 1 Timber per damage. ${timber} Timber aboard.`:'No repair action needed.'}</small></div></div>`;
    const row=damageEl.querySelector('.v33-pc-repair-row');
    if(remaining){
      const repair=button(`REPAIR ALL · 🪵 ${remaining}`,'v33-repair-all',()=>{
        const result=Voyage.repairAll();
        if(result?.ok){aggregate.repairTimber+=Number(result.cost)||0;saveProgress(currentStage);renderAll();}
        else{repair.title=result?.reason||'Unable to repair all damage';}
      });
      repair.disabled=!carpenter||timber<remaining;
      repair.title=!carpenter?"Requires a working Carpenter's Workshop":timber<remaining?`Need ${remaining} Timber; ${timber} aboard`:`Repair all remaining ship damage for ${remaining} Timber`;
      row.appendChild(repair);
    }
  }

  function renderCosts(){
    const lostParts=parts(lost),lines=[
      `<div><span>CANNONBALLS SPENT</span><strong>⚫ ${Number(used.cannonballs)||0}</strong></div>`,
      `<div><span>TIMBER SPENT IN COMBAT</span><strong>🪵 ${Number(used.timber)||0}</strong></div>`
    ];
    if(aggregate.repairTimber>0)lines.push(`<div><span>POST-COMBAT REPAIRS</span><strong>🪵 ${aggregate.repairTimber}</strong></div>`);
    if(lostParts.length)lines.push(`<div class="v33-loss"><span>CARGO LOST</span><strong>${lostParts.join(' · ')}</strong></div>`);
    costsEl.innerHTML=`<div class="v33-pc-section-label">COST OF THE FIGHT</div><div class="v33-info-list">${lines.join('')}</div>`;
  }

  function renderGains(){
    const accepted=parts(aggregate.accepted),left=parts(aggregate.leftBehind),coin=Number(aggregate.coins)||0;
    const gained=[coin?`🪙 Coin +${coin}`:'',...accepted.map(x=>`+${x}`)].filter(Boolean);
    gainsEl.innerHTML=`<div class="v33-pc-section-label">WHAT YOU HAVE GAINED</div><div class="v33-info-list"><div class="v33-gain"><span>LOADED / RECEIVED</span><strong>${gained.join(' · ')||'Nothing yet'}</strong></div>${left.length?`<div class="v33-left"><span>LEFT BEHIND / OVERBOARD</span><strong>${left.join(' · ')}</strong></div>`:''}</div>`;
  }

  function take(reward){const summary=Voyage.acceptReward(reward||{});mergeSummary(summary);return summary;}
  function finish(){Voyage.markCombatReportResolved({postCombat:{stage:'done',aggregate}});window.location.href='../world/';}
  function finishDefeat(){Voyage.markCombatReportResolved({postCombat:{stage:'done',aggregate}});window.location.href='../';}
  function showChoice(label,copy=''){
    choiceEl.hidden=false;choiceLabel.textContent=label;choiceCopy.textContent=copy;rewards.innerHTML='';actions.innerHTML='';
  }
  function hideChoice(){choiceEl.hidden=true;rewards.innerHTML='';actions.innerHTML='';}
  function rewardCard(label,reward,onClick,{note=''}={}){
    const card=document.createElement('button');card.type='button';card.className='v33-reward-choice';
    card.innerHTML=`<span>${label}</span><strong>${rewardText(reward)}</strong><small>${note||fitText(reward)}</small><em>SELECT</em>`;
    card.addEventListener('click',onClick);return card;
  }

  function showExtra(kind){
    const table=World.combatRewards?.[kind],extra=kind==='surrender'?table?.strip:table?.salvage;
    if(!extra){showChoice('DECISION COMPLETE','Your chosen reward is aboard.');actions.appendChild(button('RETURN TO CHART','primary',finish));return;}
    showChoice('OPTIONAL SALVAGE','Choose whether the extra haul is worth another day of Food and world movement.');
    const info=document.createElement('div');info.className='v33-extra-info';info.innerHTML=`<span>EXTRA SALVAGE</span><strong>${rewardText(extra)}</strong><small>Costs +${extra.days} day${extra.days===1?'':'s'} and ${extra.days*(Number(World.ships?.[Voyage.load().shipId]?.foodPerDay)||4)} Food. ${fitText(extra)}</small>`;rewards.appendChild(info);
    actions.append(
      button(`STAY +${extra.days}d · TAKE WHAT FITS`,'primary',()=>{Voyage.advanceDay(extra.days);take(extra);saveProgress('extraTaken');renderAll();}),
      button('SAIL ON','secondary',()=>{saveProgress('extraSkipped');renderAll();})
    );
  }

  function showInitialRewards(){
    if(last.kind==='fled'){showChoice('NO REWARD','You escaped. The hostile ship remains active.');actions.appendChild(button('RETURN TO CHART','primary',finish));return;}
    if(last.kind==='defeat'){showChoice('RUN ENDED','No salvage can be recovered.');actions.appendChild(button('RETURN TO MAIN MENU','primary',finishDefeat));return;}
    if(last.kind==='sunk'){
      const reward=World.combatRewards?.sunk||{};showChoice('RECOVER WRECKAGE','Sinking yields a smaller haul. Take what physically fits or leave it behind.');
      rewards.appendChild(rewardCard('TAKE WRECKAGE',reward,()=>{take(reward);saveProgress('initialTaken');renderAll();}));
      actions.appendChild(button('LEAVE WRECKAGE','secondary',()=>{saveProgress('initialTaken');renderAll();}));return;
    }
    const kind=last.kind==='surrender'?'surrender':'victory',table=World.combatRewards?.[kind]||{};
    showChoice('CHOOSE ONE REWARD','These are alternatives. Review your Holds and current stores before choosing.');
    const options=[['TAKE COIN',table.coin],['TAKE STORES',table.stores]];
    for(const [label,reward] of options){if(!reward)continue;rewards.appendChild(rewardCard(label,reward,()=>{take(reward);saveProgress('initialTaken');renderAll();}));}
  }

  function renderStage(){
    if(currentStage==='initialTaken'){
      if(last.kind==='sunk'){showChoice('DECISION COMPLETE','Wreckage decision recorded.');actions.appendChild(button('RETURN TO CHART','primary',finish));}
      else showExtra(last.kind==='surrender'?'surrender':'victory');
      return;
    }
    if(currentStage==='extraTaken'||currentStage==='extraSkipped'){
      showChoice('DECISION COMPLETE',currentStage==='extraTaken'?'The extra salvage is aboard where it fits.':'You chose to sail on.');actions.appendChild(button('RETURN TO CHART','primary',finish));return;
    }
    if(currentStage==='done'){hideChoice();return;}
    showInitialRewards();
  }

  function renderAll(){state=Voyage.load();last=state.lastCombat||last;resultHeading();renderDamage();renderCosts();renderGains();renderStage();}
  renderAll();
})();
