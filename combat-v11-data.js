// Data-driven combat catalogue. Runtime systems use these archetypes and ship setups.
const WEAPON_ARCHETYPES = {
  standard: {name:'Standard Cannon', range:1, arc:1, damage:1, icon:'•→', cadence:{initialLoadTurns:0, reloadTurns:1, shotsBeforeReload:1}},
  heavy: {name:'Heavy Cannon', range:1, arc:1, damage:2, icon:'◆→', cadence:{initialLoadTurns:1, reloadTurns:1, shotsBeforeReload:1}},
  repeater: {name:'Repeater Cannon', range:1, arc:1, damage:1, icon:'≡→', cadence:{initialLoadTurns:0, reloadTurns:1, shotsBeforeReload:2}},
  long: {name:'Long Gun', range:2, arc:2, damage:1, icon:'◎→', cadence:{initialLoadTurns:0, reloadTurns:1, shotsBeforeReload:1}},
  chain: {name:'Chain Shot', range:0, arc:0, damage:1, icon:'⊙⛓', cadence:{initialLoadTurns:0, reloadTurns:1, shotsBeforeReload:1}, mastDamage:2},
  carronade: {name:'Carronade', range:0, arc:0, damage:2, icon:'✦→', cadence:{initialLoadTurns:0, reloadTurns:1, shotsBeforeReload:1}}
};

const ROOM_ARCHETYPES = {
  gun:       {kind:'gun', actionType:'fire'},
  magazine:  {kind:'magazine', actionType:'quickLoad', explosionDamage:1},
  carpenter: {kind:'carpenter', actionType:'repair', repairAmount:1},
  storage:   {kind:'storage', actionType:null},
  unknown:   {kind:'unknown', actionType:null}
};

const SHIP_SETUPS = {
  wayward: {
    id:'wayward', name:'THE WAYWARD', columns:3, rows:2, mastColumn:1, mastHp:3,
    rooms:[
      {id:'p_std', type:'gun', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, weapon:'standard', capacity:'2 loaded'},
      {id:'p_mag', type:'magazine', name:'MAGAZINE', row:0, col:1, hp:2, capacity:'6 / 6'},
      {id:'p_heavy', type:'gun', name:'HEAVY', sub:'Gun Deck', row:0, col:2, hp:3, weapon:'heavy'},
      {id:'p_hold1', type:'storage', name:'HOLD', row:1, col:0, hp:2, capacity:'2 / 3'},
      {id:'p_carp', type:'carpenter', name:'CARPENTER', row:1, col:1, hp:2, capacity:'Timber 4/4'},
      {id:'p_hold2', type:'storage', name:'HOLD', row:1, col:2, hp:2, capacity:'1 / 3'}
    ]
  },
  ironGull: {
    id:'ironGull', name:'THE IRON GULL', columns:4, rows:2, mastColumn:1, mastHp:3,
    rooms:[
      {id:'e_std', type:'gun', name:'STANDARD', sub:'Cannon', row:0, col:0, hp:2, weapon:'standard'},
      {id:'e_heavy', type:'gun', name:'HEAVY', sub:'Cannon', row:0, col:1, hp:4, weapon:'heavy'},
      {id:'e_rep', type:'gun', name:'REPEATER', sub:'Cannon', row:0, col:2, hp:3, weapon:'repeater'},
      {id:'e_long', type:'gun', name:'LONG GUN', row:0, col:3, hp:2, weapon:'long'},
      {id:'e_u1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_carp', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:1, hp:2, capacity:'Timber 3/4'},
      {id:'e_u2', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:2, hp:2},
      {id:'e_hold', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:3, hp:2, capacity:'Cargo 2/3'}
    ],
    openingIntents:[
      {sourceId:'e_std', targetId:'p_hold1'},
      {sourceId:'e_heavy', targetId:'p_heavy'},
      {sourceId:'e_rep', targetId:'p_mag'},
      {sourceId:'e_long', targetId:'p_carp'}
    ]
  }
};

const COMBAT_SETUP = {trackColumns:7, playerShip:'wayward', enemyShip:'ironGull', playerMastTrack:3, enemyMastTrack:3};
const weapons = WEAPON_ARCHETYPES;
const PLAYER_SHIP_SETUP = SHIP_SETUPS[COMBAT_SETUP.playerShip];
const ENEMY_SHIP_SETUP = SHIP_SETUPS[COMBAT_SETUP.enemyShip];

function instantiateRoom(def){
  const archetype = ROOM_ARCHETYPES[def.type] || ROOM_ARCHETYPES.unknown;
  const weaponDef = def.weapon ? weapons[def.weapon] : null;
  const initialLoadTurns = weaponDef?.cadence?.initialLoadTurns || 0;
  return {...archetype, ...def, max:def.max ?? def.hp, revealed:def.hidden ? false : true, isMagazine:archetype.kind === 'magazine', loading:!!weaponDef && initialLoadTurns > 0};
}

const TRACK_COLS = COMBAT_SETUP.trackColumns;
const TRACK_LEFT = 56;
const ROOM_W = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomW'));
const ROOM_H = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomH'));
const ENEMY_MAST_TRACK = COMBAT_SETUP.enemyMastTrack;
const ENEMY_MAST_COL = ENEMY_SHIP_SETUP.mastColumn;
const ENEMY_LEFTMOST = ENEMY_MAST_TRACK - ENEMY_MAST_COL;
const PLAYER_MAST_LOCAL_COL = PLAYER_SHIP_SETUP.mastColumn;
const INITIAL_PLAYER_MAST_TRACK = COMBAT_SETUP.playerMastTrack;
const PLAYER_MAST_MIN = PLAYER_MAST_LOCAL_COL;
const PLAYER_MAST_MAX = TRACK_COLS - (PLAYER_SHIP_SETUP.columns - PLAYER_MAST_LOCAL_COL);

const enemyRooms = ENEMY_SHIP_SETUP.rooms.map(instantiateRoom);
const playerRooms = PLAYER_SHIP_SETUP.rooms.map(instantiateRoom);
const enemyMast = {id:'e_mast', name:'Mast', kind:'mast', col:ENEMY_MAST_TRACK, hp:ENEMY_SHIP_SETUP.mastHp, max:ENEMY_SHIP_SETUP.mastHp};
const playerMast = {id:'p_mast', name:'Mast', kind:'mast', localCol:PLAYER_MAST_LOCAL_COL, hp:PLAYER_SHIP_SETUP.mastHp, max:PLAYER_SHIP_SETUP.mastHp};

function makeOpeningIntent(def){
  const source = enemyRooms.find(r => r.id === def.sourceId);
  const target = def.targetId === playerMast.id ? playerMast : playerRooms.find(r => r.id === def.targetId);
  if(!source || !source.weapon || !target) return null;
  const damage = def.damage ?? weapons[source.weapon].damage;
  if(target.kind === 'mast') return {sourceId:source.id, lane:'mast', targetWorld:INITIAL_PLAYER_MAST_TRACK, damage, logicalTargetId:target.id};
  const playerLeft = INITIAL_PLAYER_MAST_TRACK - PLAYER_MAST_LOCAL_COL;
  return {sourceId:source.id, lane:target.row, targetWorld:playerLeft + target.col, damage, logicalTargetId:target.id};
}
const enemyIntents = (ENEMY_SHIP_SETUP.openingIntents || []).map(makeOpeningIntent).filter(Boolean);

const state = {playerMastTrack:INITIAL_PLAYER_MAST_TRACK, turnStartMast:INITIAL_PLAYER_MAST_TRACK, hoveredWeapon:null, hoverIntent:null, overview:null, selectedWeaponId:null, exterior:false, playerIntents:{}};

const stage = document.getElementById('combatStage');
const trackRow = document.getElementById('trackRow');
const enemyGrid = document.getElementById('enemyGrid');
const playerGrid = document.getElementById('playerGrid');
const enemyBlock = document.getElementById('enemyBlock');
const playerBlock = document.getElementById('playerBlock');
const enemyMastBox = document.getElementById('enemyMastBox');
const playerMastBox = document.getElementById('playerMastBox');
const enemyMastPips = document.getElementById('enemyMastPips');
const playerMastPips = document.getElementById('playerMastPips');
const arcOverlay = document.getElementById('arcOverlay');
const weaponInfo = document.getElementById('weaponInfo');
const targetInfo = document.getElementById('targetInfo');
const moveAft = document.getElementById('moveAft');
const moveFore = document.getElementById('moveFore');

window.combatCatalog = {weapons:WEAPON_ARCHETYPES, roomTypes:ROOM_ARCHETYPES, shipSetups:SHIP_SETUPS, active:COMBAT_SETUP};
