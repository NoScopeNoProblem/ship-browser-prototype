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
      {id:'p_std', type:'gun', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, weapon:'standard'},
      {id:'p_mag', type:'magazine', name:'MAGAZINE', row:0, col:1, hp:2, capacity:'6 / 6'},
      {id:'p_heavy', type:'gun', name:'HEAVY', sub:'Gun Deck', row:0, col:2, hp:3, weapon:'heavy'},
      {id:'p_hold1', type:'storage', name:'HOLD', row:1, col:0, hp:2, capacity:'2 / 3'},
      {id:'p_carp', type:'carpenter', name:'CARPENTER', row:1, col:1, hp:2, capacity:'Timber 4/4'},
      {id:'p_hold2', type:'storage', name:'HOLD', row:1, col:2, hp:2, capacity:'1 / 3'}
    ]
  },

  // Mirror calibration fight: identical hull, room positions, HP and weapons to the starter Wayward.
  // Enemy non-weapon rooms remain hidden under the normal combat information rules.
  waywardEnemy: {
    id:'waywardEnemy', name:'THE WAYWARD', threatStars:2,
    testExpectation:'Calibrated at ★★. Easy with foreknowledge of the Magazine; otherwise the hidden-room choice adds meaningful uncertainty.',
    columns:3, rows:2, mastColumn:1, mastHp:3,
    rooms:[
      {id:'e_way_std', type:'gun', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, weapon:'standard'},
      {id:'e_way_mag', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:0, col:1, hp:2},
      {id:'e_way_heavy', type:'gun', name:'HEAVY', sub:'Gun Deck', row:0, col:2, hp:3, weapon:'heavy'},
      {id:'e_way_hold1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_way_carp', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:1, hp:2},
      {id:'e_way_hold2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:2, hp:2}
    ]
  },

  // ★★ movement lesson: two modest guns, one of which can pressure the Mast at exact alignment.
  saltFinch: {
    id:'saltFinch', name:'THE SALT FINCH', threatStars:2,
    testExpectation:'Starter ship should win reliably; movement should matter, but damage is avoidable with careful play.',
    columns:3, rows:2, mastColumn:1, mastHp:2,
    rooms:[
      {id:'e_sf_u0', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:0, col:0, hp:2},
      {id:'e_sf_chain', type:'gun', name:'CHAIN', sub:'Cannon', row:0, col:1, hp:2, weapon:'chain'},
      {id:'e_sf_std', type:'gun', name:'STANDARD', sub:'Cannon', row:0, col:2, hp:2, weapon:'standard'},
      {id:'e_sf_h1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_sf_h2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:1, hp:2},
      {id:'e_sf_h3', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:2, hp:2}
    ],
    openingIntents:[
      {sourceId:'e_sf_chain', targetId:'p_mast'},
      {sourceId:'e_sf_std', targetId:'p_heavy'}
    ]
  },

  // ★★ tempo lesson: a fragile hidden Magazine can repeatedly accelerate the close-range Carronade.
  powderWren: {
    id:'powderWren', name:'THE POWDER WREN', threatStars:2,
    testExpectation:'Starter ship should win; the danger spike comes from identifying or interrupting the hidden Magazine-Carronade pairing.',
    columns:3, rows:2, mastColumn:1, mastHp:2,
    rooms:[
      {id:'e_pw_std', type:'gun', name:'STANDARD', sub:'Cannon', row:0, col:0, hp:2, weapon:'standard'},
      {id:'e_pw_car', type:'gun', name:'CARRONADE', sub:'Cannon', row:0, col:1, hp:2, weapon:'carronade'},
      {id:'e_pw_u0', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:0, col:2, hp:2},
      {id:'e_pw_h1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_pw_mag', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:1, hp:1},
      {id:'e_pw_h2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:2, hp:2}
    ],
    openingIntents:[
      {sourceId:'e_pw_std', targetId:'p_std'},
      {sourceId:'e_pw_car', targetId:'p_mag'}
    ]
  },

  // ★ calibration: too little simultaneous pressure and too fragile to survive into its support game.
  greyPetrel: {
    id:'greyPetrel', name:'THE GREY PETREL', threatStars:1,
    testExpectation:'Calibrated at ★. Starter Wayward can often end this fight early in Turn 2 without taking damage.',
    columns:4, rows:2, mastColumn:1, mastHp:2,
    rooms:[
      {id:'e_gp_std', type:'gun', name:'STANDARD', sub:'Cannon', row:0, col:0, hp:2, weapon:'standard'},
      {id:'e_gp_u1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:0, col:1, hp:2},
      {id:'e_gp_u2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:0, col:2, hp:2},
      {id:'e_gp_long', type:'gun', name:'LONG GUN', sub:'Cannon', row:0, col:3, hp:2, weapon:'long'},
      {id:'e_gp_h1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_gp_h2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:1, hp:2},
      {id:'e_gp_h3', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:2, hp:2},
      {id:'e_gp_carp', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:3, hp:2}
    ],
    openingIntents:[
      {sourceId:'e_gp_std', targetId:'p_std'},
      {sourceId:'e_gp_long', targetId:'p_carp'}
    ]
  },

  // ★★ durability/support test: three credible guns backed by both Magazine and Carpenter.
  copperKestrel: {
    id:'copperKestrel', name:'THE COPPER KESTREL', threatStars:2,
    testExpectation:'Calibrated at ★★. A strong player can still finish cleanly by identifying the Magazine and using repair well, but the fight creates meaningful pressure.',
    columns:4, rows:2, mastColumn:1, mastHp:3,
    rooms:[
      {id:'e_ck_std', type:'gun', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, weapon:'standard'},
      {id:'e_ck_heavy', type:'gun', name:'HEAVY', sub:'Gun Deck', row:0, col:1, hp:3, weapon:'heavy'},
      {id:'e_ck_long', type:'gun', name:'LONG GUN', sub:'Gun Deck', row:0, col:2, hp:3, weapon:'long'},
      {id:'e_ck_hold0', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:0, col:3, hp:3},
      {id:'e_ck_hold1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:3},
      {id:'e_ck_mag', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:1, hp:2},
      {id:'e_ck_carp', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:2, hp:3},
      {id:'e_ck_hold2', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:3, hp:3}
    ],
    openingIntents:[
      {sourceId:'e_ck_std', targetId:'p_std'},
      {sourceId:'e_ck_heavy', targetId:'p_mag'},
      {sourceId:'e_ck_long', targetId:'p_carp'}
    ]
  },

  ironGull: {
    id:'ironGull', name:'THE IRON GULL', threatStars:3, testExpectation:'Starter ship can win; experienced play should find avoiding all damage difficult.',
    columns:4, rows:2, mastColumn:1, mastHp:3,
    rooms:[
      {id:'e_std', type:'gun', name:'STANDARD', sub:'Cannon', row:0, col:0, hp:2, weapon:'standard'},
      {id:'e_heavy', type:'gun', name:'HEAVY', sub:'Cannon', row:0, col:1, hp:4, weapon:'heavy'},
      {id:'e_rep', type:'gun', name:'REPEATER', sub:'Cannon', row:0, col:2, hp:3, weapon:'repeater'},
      {id:'e_long', type:'gun', name:'LONG GUN', row:0, col:3, hp:2, weapon:'long'},
      {id:'e_u1', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:0, hp:2},
      {id:'e_u2', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:1, hp:2},
      {id:'e_carp', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:2, hp:2, capacity:'Timber 3/4'},
      {id:'e_hold', type:'storage', name:'???', revealName:'HOLD', hidden:true, row:1, col:3, hp:2, capacity:'Cargo 2/3'}
    ],
    openingIntents:[
      {sourceId:'e_std', targetId:'p_hold1'},
      {sourceId:'e_heavy', targetId:'p_heavy'},
      {sourceId:'e_rep', targetId:'p_mag'},
      {sourceId:'e_long', targetId:'p_carp'}
    ]
  },

  // ★★★ attrition/support test: four durable guns, two Carpenters and two Magazines.
  // The support rooms deliberately repeat, and HP mixes 2/3/4 so target priority is less obvious.
  blackAlbatross: {
    id:'blackAlbatross', name:'THE BLACK ALBATROSS', threatStars:3,
    testExpectation:'Hard ★★★. The starter Wayward should be able to win, but sustained support and 4-blip gun rooms should make a flawless victory difficult even with strong play.',
    columns:4, rows:2, mastColumn:1, mastHp:4,
    rooms:[
      {id:'e_ba_std', type:'gun', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, weapon:'standard'},
      {id:'e_ba_heavy', type:'gun', name:'HEAVY', sub:'Gun Deck', row:0, col:1, hp:4, weapon:'heavy'},
      {id:'e_ba_rep', type:'gun', name:'REPEATER', sub:'Gun Deck', row:0, col:2, hp:4, weapon:'repeater'},
      {id:'e_ba_long', type:'gun', name:'LONG GUN', sub:'Gun Deck', row:0, col:3, hp:3, weapon:'long'},
      {id:'e_ba_carp_a', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:0, hp:4},
      {id:'e_ba_mag_a', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:1, hp:3},
      {id:'e_ba_carp_b', type:'carpenter', name:'???', revealName:'CARPENTER', hidden:true, row:1, col:2, hp:2},
      {id:'e_ba_mag_b', type:'magazine', name:'???', revealName:'MAGAZINE', hidden:true, row:1, col:3, hp:3}
    ],
    openingIntents:[
      {sourceId:'e_ba_std', targetId:'p_carp'},
      {sourceId:'e_ba_heavy', targetId:'p_mag'},
      {sourceId:'e_ba_rep', targetId:'p_std'},
      {sourceId:'e_ba_long', targetId:'p_heavy'}
    ]
  }
};

// The dev ship-select screen stores the exact working pair here before entering combat.
// Keep this as data injection only: the combat engine still receives ordinary ship setups.
try{
  const devMatch=JSON.parse(localStorage.getItem('highSeasDevMatch.v1')||'null');
  if(devMatch?.player?.rooms)SHIP_SETUPS.__dev_player=devMatch.player;
  if(devMatch?.enemy?.rooms)SHIP_SETUPS.__dev_enemy=devMatch.enemy;
}catch(error){console.warn('Dev match data unavailable',error);}

// Matchups can now be selected without changing engine code. Future enemy definitions only
// need to be added to SHIP_SETUPS and can then be loaded with ?enemy=<id>. The same hook is
// already available for player builds via ?player=<id> when we begin testing those.
const COMBAT_PARAMS = new URLSearchParams(window.location.search);
const REQUESTED_PLAYER = COMBAT_PARAMS.get('player');
const REQUESTED_ENEMY = COMBAT_PARAMS.get('enemy');
const ACTIVE_PLAYER_ID = REQUESTED_PLAYER && SHIP_SETUPS[REQUESTED_PLAYER] ? REQUESTED_PLAYER : 'wayward';
const ACTIVE_ENEMY_ID = REQUESTED_ENEMY && SHIP_SETUPS[REQUESTED_ENEMY] ? REQUESTED_ENEMY : 'blackAlbatross';
const COMBAT_SETUP = {trackColumns:7, playerShip:ACTIVE_PLAYER_ID, enemyShip:ACTIVE_ENEMY_ID, playerMastTrack:3, enemyMastTrack:3};
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
