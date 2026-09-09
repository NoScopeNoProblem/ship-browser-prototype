(() => {
  const CUSTOM_KEY='highSeasCustomShips.v1';
  const MATCH_KEY='highSeasDevMatch.v1';
  const catalog=window.combatCatalog;
  const actions=document.querySelector('.editor-actions');
  const editorSide=document.getElementById('editorSide');
  if(!catalog||!actions||!editorSide)return;

  const button=document.createElement('button');
  button.type='button';
  button.id='deleteShipTemplate';
  button.className='wide delete-ship-template';
  button.textContent='DELETE SAVED SHIP';
  button.hidden=true;
  actions.appendChild(button);

  const style=document.createElement('style');
  style.textContent=`
    .editor-actions .delete-ship-template{border-color:#7d4742;color:#d9867d;background:#2a2020}
    .editor-actions .delete-ship-template:hover{border-color:#d9867d;color:#ffd6d0;background:#352323}
  `;
  document.head.appendChild(style);

  function readJSON(key,fallback){
    try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}
  }
  function writeJSON(key,value){localStorage.setItem(key,JSON.stringify(value));}

  function editingList(){
    const label=editorSide.textContent||'';
    if(label.includes('PLAYER'))return document.getElementById('playerShipList');
    if(label.includes('ENEMY'))return document.getElementById('enemyShipList');
    return null;
  }

  function selectedCustomId(){
    const list=editingList();
    if(!list)return null;
    const selected=list.querySelector('.ship-row.selected');
    if(!selected||!selected.querySelector('.custom-tag'))return null;
    const customRows=[...list.querySelectorAll('.ship-row')].filter(row=>row.querySelector('.custom-tag'));
    const index=customRows.indexOf(selected);
    if(index<0)return null;
    return Object.keys(readJSON(CUSTOM_KEY,{}))[index]||null;
  }

  function syncButton(){
    const id=selectedCustomId();
    const shouldHide=!id;
    // Do not rewrite the hidden attribute unless its value actually changes. The previous
    // implementation observed this attribute and then rewrote it from inside the observer,
    // creating an endless MutationObserver microtask loop that prevented the selector from painting.
    if(button.hidden!==shouldHide)button.hidden=shouldHide;
    if((button.dataset.shipId||'')!==(id||''))button.dataset.shipId=id||'';
  }

  function fallbackMatch(last,id){
    let changed=false;
    if(last?.sourcePlayer===id){
      last.sourcePlayer='wayward';
      last.player=JSON.parse(JSON.stringify(catalog.shipSetups.wayward));
      changed=true;
    }
    if(last?.sourceEnemy===id){
      last.sourceEnemy='blackAlbatross';
      last.enemy=JSON.parse(JSON.stringify(catalog.shipSetups.blackAlbatross));
      changed=true;
    }
    return changed;
  }

  button.addEventListener('click',()=>{
    const id=selectedCustomId();
    if(!id)return;
    const custom=readJSON(CUSTOM_KEY,{});
    const ship=custom[id];
    if(!ship)return;
    const name=(ship.name||'this saved ship').trim();
    if(!window.confirm(`Delete ${name}?\n\nThis removes the saved custom ship template.`))return;

    delete custom[id];
    writeJSON(CUSTOM_KEY,custom);

    const last=readJSON(MATCH_KEY,null);
    if(last&&fallbackMatch(last,id))writeJSON(MATCH_KEY,last);

    window.location.reload();
  });

  // The selector already re-renders synchronously in response to user actions. A deferred sync
  // after those actions is enough; no DOM observer is needed and this module never participates
  // in the selector's render lifecycle.
  document.addEventListener('click',()=>setTimeout(syncButton,0),true);
  document.addEventListener('input',()=>setTimeout(syncButton,0),true);
  window.addEventListener('pageshow',syncButton);
  syncButton();
})();