(() => {
  const catalog = window.combatCatalog;
  if (!catalog) return;

  const CUSTOM_KEY = 'highSeasCustomShips.v1';
  const MATCH_KEY = 'highSeasDevMatch.v1';
  const PRESET_IDS = Object.keys(catalog.shipSetups).filter(id => !id.startsWith('__dev_') && !id.startsWith('custom_'));
  const clone = value => JSON.parse(JSON.stringify(value));

  const roomLibrary = {
    'Gun Deck': [
      ['Standard Cannon', {type:'gun', name:'STANDARD', sub:'Gun Deck', weapon:'standard'}],
      ['Heavy Cannon', {type:'gun', name:'HEAVY', sub:'Gun Deck', weapon:'heavy'}],
      ['Repeater Cannon', {type:'gun', name:'REPEATER', sub:'Gun Deck', weapon:'repeater'}],
      ['Long Gun', {type:'gun', name:'LONG GUN', sub:'Gun Deck', weapon:'long'}],
      ['Chain Shot', {type:'gun', name:'CHAIN', sub:'Gun Deck', weapon:'chain'}],
      ['Carronade', {type:'gun', name:'CARRONADE', sub:'Gun Deck', weapon:'carronade'}]
    ],
    'Storage': [
      ['Hold', {type:'storage', name:'HOLD'}],
      ['Magazine', {type:'magazine', name:'MAGAZINE'}]
    ],
    'Support': [
      ['Carpenter', {type:'carpenter', name:'CARPENTER'}]
    ]
  };

  const state = {
    player: null,
    enemy: null,
    sourcePlayer: 'wayward',
    sourceEnemy: 'blackAlbatross',
    editingSide: null,
    selectedRoomId: null,
    editingSavedId: null
  };

  const els = {
    playerList: document.getElementById('playerShipList'),
    enemyList: document.getElementById('enemyShipList'),
    playerPreview: document.getElementById('playerShipPreview'),
    enemyPreview: document.getElementById('enemyShipPreview'),
    playerCustomise: document.getElementById('playerCustomise'),
    enemyCustomise: document.getElementById('enemyCustomise'),
    editor: document.getElementById('shipEditor'),
    editorEmpty: document.getElementById('editorEmpty'),
    editorBody: document.getElementById('editorBody'),
    editorSide: document.getElementById('editorSide'),
    shipName: document.getElementById('shipName'),
    size3: document.getElementById('size3'),
    size4: document.getElementById('size4'),
    mastHp: document.getElementById('mastHp'),
    mastHpDown: document.getElementById('mastHpDown'),
    mastHpUp: document.getElementById('mastHpUp'),
    mastColumn: document.getElementById('mastColumn'),
    roomHp: document.getElementById('roomHp'),
    roomHpDown: document.getElementById('roomHpDown'),
    roomHpUp: document.getElementById('roomHpUp'),
    selectedRoomLabel: document.getElementById('selectedRoomLabel'),
    roomLibrary: document.getElementById('roomLibrary'),
    save: document.getElementById('saveShip'),
    saveAs: document.getElementById('saveAsShip'),
    stopEditing: document.getElementById('stopEditing'),
    start: document.getElementById('startCombat')
  };

  function readJSON(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function customShips(){ return readJSON(CUSTOM_KEY, {}); }
  function setCustomShips(value){ localStorage.setItem(CUSTOM_KEY, JSON.stringify(value)); }

  function actualName(room){ return room.revealName || (room.name === '???' ? room.type.toUpperCase() : room.name); }
  function displaySetup(raw){
    const setup = clone(raw);
    setup.rooms.forEach(room => {
      room.name = actualName(room);
      room.hidden = false;
      delete room.revealName;
    });
    return setup;
  }
  function catalogue(){
    const all = {};
    PRESET_IDS.forEach(id => { if (catalog.shipSetups[id]) all[id] = catalog.shipSetups[id]; });
    Object.assign(all, customShips());
    return all;
  }

  function roomId(side,row,col){ return `${side[0]}_dev_${row}_${col}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`; }
  function normalizeDraft(raw, side){
    const setup = displaySetup(raw);
    setup.rows = 2;
    setup.columns = setup.columns === 4 ? 4 : 3;
    setup.mastColumn = Math.max(0, Math.min(setup.columns - 1, Number(setup.mastColumn) || 0));
    setup.mastHp = Math.max(1, Number(setup.mastHp) || 1);
    const byCell = new Map(setup.rooms.map(r => [`${r.row}:${r.col}`, r]));
    setup.rooms = [];
    for(let row=0;row<2;row++) for(let col=0;col<setup.columns;col++){
      const existing = byCell.get(`${row}:${col}`);
      const room = existing ? {...existing} : {type:'storage',name:'HOLD',hp:2};
      room.row=row;room.col=col;room.hp=Math.max(1,Number(room.hp)||1);
      room.id=roomId(side,row,col);
      room.name=actualName(room);room.hidden=false;delete room.revealName;
      setup.rooms.push(room);
    }
    delete setup.openingIntents;
    return setup;
  }

  function initialState(){
    const last = readJSON(MATCH_KEY, null);
    const all = catalogue();
    if(last?.player?.rooms && last?.enemy?.rooms){
      state.player=normalizeDraft(last.player,'player');
      state.enemy=normalizeDraft(last.enemy,'enemy');
      state.sourcePlayer=last.sourcePlayer && all[last.sourcePlayer] ? last.sourcePlayer : 'wayward';
      state.sourceEnemy=last.sourceEnemy && all[last.sourceEnemy] ? last.sourceEnemy : 'blackAlbatross';
    } else {
      state.player=normalizeDraft(all.wayward || catalog.shipSetups.wayward,'player');
      state.enemy=normalizeDraft(all.blackAlbatross || catalog.shipSetups.blackAlbatross,'enemy');
    }
  }

  function stars(setup){ return '★'.repeat(Math.max(0,Number(setup.threatStars)||0)); }
  function renderList(side){
    const host=side==='player'?els.playerList:els.enemyList;
    const selected=side==='player'?state.sourcePlayer:state.sourceEnemy;
    host.innerHTML='';
    Object.entries(catalogue()).forEach(([id,raw])=>{
      const tr=document.createElement('button');tr.type='button';tr.className='ship-row';
      tr.classList.toggle('selected',id===selected);
      const custom=id.startsWith('custom_');
      tr.innerHTML=`<span class="ship-row-name">${actualText(raw.name||id)}</span><span>${raw.columns}×2</span><span>${stars(raw)||'—'}</span>${custom?'<span class="custom-tag">CUSTOM</span>':''}`;
      tr.title=raw.testExpectation||'';
      tr.addEventListener('click',()=>selectSetup(side,id));
      host.appendChild(tr);
    });
  }

  function actualText(text){
    const div=document.createElement('div');div.textContent=String(text??'');return div.innerHTML;
  }

  function selectSetup(side,id){
    const raw=catalogue()[id];if(!raw)return;
    state[side]=normalizeDraft(raw,side);
    state[side==='player'?'sourcePlayer':'sourceEnemy']=id;
    if(state.editingSide===side){state.selectedRoomId=null;state.editingSavedId=id.startsWith('custom_')?id:null;}
    renderAll();
  }

  function shipPreview(side){
    const setup=state[side], editing=state.editingSide===side, selected=state.selectedRoomId;
    const outer=document.createElement('div');outer.className=`ship-cutaway ${editing?'editing':''}`;outer.style.setProperty('--cols',setup.columns);
    const mast=document.createElement('div');mast.className='preview-mast';mast.style.setProperty('--mast-col',setup.mastColumn);mast.innerHTML=`<div class="mast-stick"></div><div class="mast-label">MAIN MAST · ${'♥'.repeat(setup.mastHp)}</div>`;outer.appendChild(mast);
    const grid=document.createElement('div');grid.className='preview-grid';grid.style.gridTemplateColumns=`repeat(${setup.columns}, minmax(108px,1fr))`;
    setup.rooms.sort((a,b)=>(a.row-b.row)||(a.col-b.col)).forEach(room=>{
      const cell=document.createElement('button');cell.type='button';cell.className='preview-room';cell.dataset.id=room.id;
      cell.classList.toggle('selected',editing&&selected===room.id);
      cell.disabled=!editing;
      const icon=room.weapon ? catalog.weapons[room.weapon]?.icon||'●' : room.type==='magazine'?'▣':room.type==='carpenter'?'♥+':'□';
      cell.innerHTML=`<span class="room-icon">${icon}</span><strong>${actualText(actualName(room))}</strong><span class="room-hp">${'♥'.repeat(room.hp)}</span>`;
      cell.addEventListener('click',()=>{state.selectedRoomId=room.id;renderAll();});
      grid.appendChild(cell);
    });
    outer.appendChild(grid);return outer;
  }

  function renderPreview(side){
    const host=side==='player'?els.playerPreview:els.enemyPreview;host.innerHTML='';
    const title=document.createElement('div');title.className='preview-heading';
    title.innerHTML=`<div><span class="side-kicker">${side==='player'?'PLAYER':'ENEMY'}</span><h2>${actualText(state[side].name)}</h2></div><span class="size-chip">${state[side].columns}×2</span>`;
    host.append(title,shipPreview(side));
  }

  function startEditing(side){
    state.editingSide=side;state.selectedRoomId=null;
    const source=side==='player'?state.sourcePlayer:state.sourceEnemy;
    state.editingSavedId=source?.startsWith('custom_')?source:null;
    renderAll();
  }

  function edited(){ return state.editingSide ? state[state.editingSide] : null; }
  function selectedRoom(){ const s=edited();return s?.rooms.find(r=>r.id===state.selectedRoomId)||null; }

  function renderEditor(){
    const active=!!state.editingSide;els.editor.classList.toggle('active',active);els.editorEmpty.hidden=active;els.editorBody.hidden=!active;if(!active)return;
    const setup=edited(), room=selectedRoom();
    els.editorSide.textContent=state.editingSide==='player'?'EDITING PLAYER':'EDITING ENEMY';
    els.shipName.value=setup.name;
    els.size3.classList.toggle('active',setup.columns===3);els.size4.classList.toggle('active',setup.columns===4);
    els.mastHp.textContent=setup.mastHp;els.mastColumn.value=String(setup.mastColumn);
    els.mastColumn.innerHTML='';for(let i=0;i<setup.columns;i++){const o=document.createElement('option');o.value=i;o.textContent=`Column ${i+1}`;o.selected=i===setup.mastColumn;els.mastColumn.append(o);}
    els.selectedRoomLabel.textContent=room?`${actualName(room)} · row ${room.row+1}, column ${room.col+1}`:'Select a room in the ship preview';
    els.roomHp.textContent=room?room.hp:'—';els.roomHpDown.disabled=!room;els.roomHpUp.disabled=!room;
    els.roomLibrary.querySelectorAll('button[data-room-key]').forEach(btn=>btn.disabled=!room);
    els.save.textContent=state.editingSavedId?'SAVE':'SAVE';
  }

  function renderLibrary(){
    els.roomLibrary.innerHTML='';
    Object.entries(roomLibrary).forEach(([group,items],index)=>{
      const details=document.createElement('details');details.open=index===0;const summary=document.createElement('summary');summary.textContent=group;details.append(summary);
      const list=document.createElement('div');list.className='library-items';
      items.forEach(([label,def])=>{const b=document.createElement('button');b.type='button';b.dataset.roomKey=label;b.innerHTML=`<strong>${label}</strong><span>${def.weapon?catalog.weapons[def.weapon]?.icon||'':def.type==='magazine'?'Quick Load':def.type==='carpenter'?'Repair':'Cargo'}</span>`;b.addEventListener('click',()=>replaceSelectedRoom(def));list.append(b);});
      details.append(list);els.roomLibrary.append(details);
    });
  }

  function replaceSelectedRoom(def){
    const room=selectedRoom();if(!room)return;
    const keep={id:room.id,row:room.row,col:room.col,hp:room.hp};
    Object.keys(room).forEach(k=>delete room[k]);Object.assign(room,keep,clone(def));
    renderAll();
  }

  function resizeShip(columns){
    const setup=edited();if(!setup||setup.columns===columns)return;
    if(columns===3&&setup.columns===4&&!window.confirm('Reduce to 3×2? The final column will be discarded.'))return;
    if(columns===4){
      for(let row=0;row<2;row++)setup.rooms.push({id:roomId(state.editingSide,row,3),type:'storage',name:'HOLD',row,col:3,hp:2});
    }else{
      setup.rooms=setup.rooms.filter(r=>r.col<3);if(!selectedRoom())state.selectedRoomId=null;
      setup.mastColumn=Math.min(setup.mastColumn,2);
    }
    setup.columns=columns;renderAll();
  }

  function changeNumber(kind,delta){
    const setup=edited();if(!setup)return;
    if(kind==='mast')setup.mastHp=Math.max(1,Math.min(6,setup.mastHp+delta));
    else {const room=selectedRoom();if(room)room.hp=Math.max(1,Math.min(6,room.hp+delta));}
    renderAll();
  }

  function cleanForSave(setup,id){
    const out=clone(setup);out.id=id;out.name=(out.name||'UNTITLED SHIP').trim().toUpperCase();out.rows=2;
    out.rooms.forEach((room,index)=>{room.id=`${id}_r${room.row}c${room.col}_${index}`;room.name=actualName(room);room.hidden=false;delete room.revealName;});
    delete out.openingIntents;return out;
  }

  function save(asNew=false){
    const setup=edited();if(!setup)return;
    const all=customShips();let id=!asNew&&state.editingSavedId?state.editingSavedId:null;
    if(!id)id=`custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
    const saved=cleanForSave(setup,id);all[id]=saved;setCustomShips(all);
    state[state.editingSide]=normalizeDraft(saved,state.editingSide);
    if(state.editingSide==='player')state.sourcePlayer=id;else state.sourceEnemy=id;
    state.editingSavedId=id;renderAll();
  }

  function setupForCombat(setup,side){
    const out=clone(setup);out.id=`__dev_${side}`;out.rows=2;out.name=(out.name||'UNTITLED SHIP').trim().toUpperCase();delete out.openingIntents;
    out.rooms.forEach((room,index)=>{
      const real=actualName(room);room.id=`${side==='player'?'p':'e'}_dev_r${room.row}c${room.col}_${index}`;
      room.hp=Math.max(1,Number(room.hp)||1);
      if(side==='enemy'&&!room.weapon){room.revealName=real;room.name='???';room.hidden=true;}else{room.name=real;room.hidden=false;delete room.revealName;}
    });
    return out;
  }

  function startCombat(){
    const match={
      player:setupForCombat(state.player,'player'),enemy:setupForCombat(state.enemy,'enemy'),
      sourcePlayer:state.sourcePlayer,sourceEnemy:state.sourceEnemy,savedAt:Date.now()
    };
    localStorage.setItem(MATCH_KEY,JSON.stringify(match));
    const u=new URL('combat.html',window.location.href);u.searchParams.set('player','__dev_player');u.searchParams.set('enemy','__dev_enemy');window.location.href=u.toString();
  }

  function renderAll(){renderList('player');renderList('enemy');renderPreview('player');renderPreview('enemy');renderEditor();els.playerCustomise.classList.toggle('active',state.editingSide==='player');els.enemyCustomise.classList.toggle('active',state.editingSide==='enemy');}

  renderLibrary();initialState();
  els.playerCustomise.addEventListener('click',()=>startEditing('player'));
  els.enemyCustomise.addEventListener('click',()=>startEditing('enemy'));
  els.stopEditing.addEventListener('click',()=>{state.editingSide=null;state.selectedRoomId=null;state.editingSavedId=null;renderAll();});
  els.shipName.addEventListener('input',()=>{const s=edited();if(s){s.name=els.shipName.value;renderPreview(state.editingSide);}});
  els.size3.addEventListener('click',()=>resizeShip(3));els.size4.addEventListener('click',()=>resizeShip(4));
  els.mastHpDown.addEventListener('click',()=>changeNumber('mast',-1));els.mastHpUp.addEventListener('click',()=>changeNumber('mast',1));
  els.roomHpDown.addEventListener('click',()=>changeNumber('room',-1));els.roomHpUp.addEventListener('click',()=>changeNumber('room',1));
  els.mastColumn.addEventListener('change',()=>{const s=edited();if(s){s.mastColumn=Number(els.mastColumn.value);renderAll();}});
  els.save.addEventListener('click',()=>save(false));els.saveAs.addEventListener('click',()=>save(true));els.start.addEventListener('click',startCombat);
  renderAll();
})();
