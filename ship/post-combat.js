(() => {
  const Adventure=window.HighSeasAdventure,Voyage=window.HighSeasShipVoyage,World=window.HighSeasWorldDefinition;
  if(!Adventure||!Voyage||!World||new URLSearchParams(window.location.search).get('postCombat')!=='1')return;
  let state=Voyage.load(),last=state.lastCombat;
  if(!last||last.rewardResolved)return;
  if(state.shipSettings?.autoBalanceCargo)Voyage.rebalance();
  state=Voyage.load();last=state.lastCombat;

  const overlay=document.createElement('div');overlay.className='v32-postcombat-overlay';
  overlay.innerHTML=`<section class="v32-postcombat-card"><div class="v32-pc-kicker">POST-COMBAT REPORT</div><h2></h2><p class="v32-pc-lead"></p><div class="v32-pc-ledger"></div><div class="v32-pc-gained"></div><div class="v32-pc-rewards"></div><div class="v32-pc-actions"></div></section>`;
  document.body.appendChild(overlay);
  const title=overlay.querySelector('h2'),lead=overlay.querySelector('.v32-pc-lead'),ledger=overlay.querySelector('.v32-pc-ledger'),gainedEl=overlay.querySelector('.v32-pc-gained'),rewards=overlay.querySelector('.v32-pc-rewards'),actions=overlay.querySelector('.v32-pc-actions');
  const report=last.report||{},used=report.resourcesUsed||{cannonballs:0,timber:0},lost=report.cargoLost||{},tier=report.resultTier||'standard';
  let aggregate=last.postCombat?.aggregate||{coins:0,accepted:{},leftBehind:{}};

  const itemName=id=>({cannonballs:'Cannonballs',timber:'Timber',food:'Food',medicine:'Medicine'}[id]||id);
  const icon=id=>window.HighSeasShipStorage?.ITEMS?.[id]?.icon||'•';
  function parts(obj){return Object.entries(obj||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>`${icon(id)} ${itemName(id)} ${q}`);}
  function mergeSummary(summary){
    aggregate.coins=(Number(aggregate.coins)||0)+(Number(summary?.coins)||0);
    for(const key of ['accepted','leftBehind'])for(const [id,q] of Object.entries(summary?.[key]||{}))aggregate[key][id]=(Number(aggregate[key][id])||0)+(Number(q)||0);
  }
  function saveProgress(stage){Adventure.update(s=>{if(s.lastCombat)s.lastCombat.postCombat={stage,aggregate:JSON.parse(JSON.stringify(aggregate))};});}
  function renderGains(){
    const accepted=parts(aggregate.accepted),left=parts(aggregate.leftBehind),coin=Number(aggregate.coins)||0;
    gainedEl.innerHTML=`<div><span>GAINED</span><strong>${[coin?`🪙 Coin +${coin}`:'',...accepted.map(x=>`+${x}`)].filter(Boolean).join(' · ')||'Nothing yet'}</strong></div><div class="left-behind"><span>LEFT BEHIND / OVERBOARD</span><strong>${left.join(' · ')||'Nothing'}</strong></div>`;
  }
  function resultHeading(){
    if(tier==='perfect'){title.textContent='PERFECT COMBAT';lead.textContent='The Wayward finishes at full integrity without spending Timber on combat repairs. +10 combat score bonus.';return;}
    if(tier==='noDamage'){title.textContent='NO-DAMAGE FINISH';lead.textContent='The Wayward finishes at full integrity. +5 combat score bonus.';return;}
    title.textContent=last.kind==='fled'?'YOU BROKE AWAY':last.kind==='defeat'?'THE WAYWARD WAS SUNK':last.kind==='surrender'?'ENEMY SURRENDERED':last.kind==='sunk'?'ENEMY SHIP SUNK':'VICTORY';
    lead.textContent='Combat consequences now remain with the voyage.';
  }
  function renderLedger(){
    const lostParts=parts(lost),missing=Voyage.missingBlips(Voyage.load());
    ledger.innerHTML=`<div><span>SPENT</span><strong>⚫ ${Number(used.cannonballs)||0} Cannonballs · 🪵 ${Number(used.timber)||0} Timber</strong></div><div><span>CARGO LOST</span><strong>${lostParts.join(' · ')||'None'}</strong></div><div><span>SHIP DAMAGE REMAINING</span><strong>${missing} blip${missing===1?'':'s'}</strong></div>`;
  }
  function button(label,cls,fn){const b=document.createElement('button');b.type='button';b.className=cls||'';b.textContent=label;b.addEventListener('click',fn);return b;}
  function rewardText(reward={}){const p=[];if(reward.coins)p.push(`🪙 ${reward.coins} coin`);for(const [id,q] of Object.entries(reward.stores||{}))p.push(`${icon(id)} ${q} ${itemName(id)}`);return p.join(' · ')||'No stores';}
  function fitText(reward={}){
    const st=Voyage.load(),lines=[];
    for(const [id,q] of Object.entries(reward.stores||{})){const fit=Voyage.maxAdditional(id,q,st);if(fit<q)lines.push(`${itemName(id)}: ${fit}/${q} fits`);}
    return lines.length?` · ${lines.join(', ')}`:'';
  }
  function take(reward){const summary=Voyage.acceptReward(reward||{});mergeSummary(summary);renderGains();return summary;}
  function finish(){Voyage.markCombatReportResolved({postCombat:{stage:'done',aggregate}});window.location.href='../world/';}
  function finishDefeat(){Voyage.markCombatReportResolved({postCombat:{stage:'done',aggregate}});window.location.href='../';}

  function showExtra(kind){
    rewards.innerHTML='';actions.innerHTML='';
    const table=World.combatRewards?.[kind];const extra=kind==='surrender'?table?.strip:table?.salvage;
    if(!extra){actions.appendChild(button('RETURN TO CHART','primary',finish));return;}
    const box=document.createElement('div');box.className='v32-reward-choice single';box.innerHTML=`<span>EXTRA SALVAGE</span><strong>${rewardText(extra)}</strong><small>Costs +${extra.days} day${extra.days===1?'':'s'} and the normal Food use.${fitText(extra)}</small>`;rewards.appendChild(box);
    actions.append(
      button(`STAY +${extra.days}d · TAKE WHAT FITS`,'primary',()=>{Voyage.advanceDay(extra.days);take(extra);saveProgress('extraTaken');actions.innerHTML='';rewards.innerHTML='';actions.appendChild(button('RETURN TO CHART','primary',finish));}),
      button('SAIL ON','secondary',()=>{saveProgress('extraSkipped');finish();})
    );
  }

  function showInitialRewards(){
    rewards.innerHTML='';actions.innerHTML='';
    if(last.kind==='fled'){rewards.innerHTML='<div class="v32-no-reward">No prize taken. The hostile ship remains active.</div>';actions.appendChild(button('RETURN TO CHART','primary',finish));return;}
    if(last.kind==='defeat'){rewards.innerHTML='<div class="v32-no-reward">No salvage. This run is defeated.</div>';actions.appendChild(button('RETURN TO MAIN MENU','primary',finishDefeat));return;}
    if(last.kind==='sunk'){
      const reward=World.combatRewards?.sunk||{};
      const card=document.createElement('button');card.type='button';card.className='v32-reward-choice';card.innerHTML=`<span>WRECKAGE</span><strong>${rewardText(reward)}</strong><small>Take what physically fits; anything else is left behind.${fitText(reward)}</small>`;
      card.addEventListener('click',()=>{take(reward);saveProgress('initialTaken');rewards.innerHTML='';actions.appendChild(button('RETURN TO CHART','primary',finish));});rewards.appendChild(card);return;
    }
    const kind=last.kind==='surrender'?'surrender':'victory',table=World.combatRewards?.[kind]||{};
    const options=[['TAKE COIN',table.coin],['TAKE STORES',table.stores]];
    for(const [label,reward] of options){if(!reward)continue;const card=document.createElement('button');card.type='button';card.className='v32-reward-choice';card.innerHTML=`<span>${label}</span><strong>${rewardText(reward)}</strong><small>Only quantities that fit are loaded; the remainder stays behind.${fitText(reward)}</small>`;card.addEventListener('click',()=>{take(reward);saveProgress('initialTaken');showExtra(kind);});rewards.appendChild(card);}
  }

  resultHeading();renderLedger();renderGains();
  const stage=last.postCombat?.stage;
  if(stage==='initialTaken'){if(last.kind==='sunk')actions.appendChild(button('RETURN TO CHART','primary',finish));else showExtra(last.kind==='surrender'?'surrender':'victory');}
  else if(stage==='extraTaken'||stage==='extraSkipped')actions.appendChild(button('RETURN TO CHART','primary',finish));
  else showInitialRewards();
})();