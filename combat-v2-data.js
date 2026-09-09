const TRACK_COLS = 7;
const TRACK_LEFT = 56;
const ROOM_W = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomW'));
const ROOM_H = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--roomH'));

// Both ships begin centered by their main-mast column.
const ENEMY_LEFTMOST = 2;
const ENEMY_MAST_COL = 1;
const ENEMY_MAST_TRACK = ENEMY_LEFTMOST + ENEMY_MAST_COL; // middle segment = 3
const PLAYER_MAST_LOCAL_COL = 1;
const INITIAL_PLAYER_MAST_TRACK = 3;
const PLAYER_MAST_MIN = 1;
const PLAYER_MAST_MAX = 5;

const weapons = {
  standard: {name:'Standard Cannon', arc:1, damage:1, icon:'•→'},
  heavy: {name:'Heavy Cannon', arc:1, damage:2, icon:'◆→'},
  repeater: {name:'Repeater Cannon', arc:1, damage:1, icon:'≡→'},
  long: {name:'Long Gun', arc:2, damage:1, icon:'◎→'},
  chain: {name:'Chain Shot', arc:0, damage:1, icon:'⊙⛓'},
  carronade: {name:'Carronade', arc:0, damage:2, icon:'✦→'}
};

const enemyRooms = [
  {id:'e_std', name:'STANDARD', sub:'Cannon', row:0, col:0, hp:2, max:2, weapon:'standard'},
  {id:'e_heavy', name:'HEAVY', sub:'Cannon', row:0, col:1, hp:4, max:4, weapon:'heavy', loading:true},
  {id:'e_rep', name:'REPEATER', sub:'Cannon', row:0, col:2, hp:3, max:3, weapon:'repeater'},
  {id:'e_long', name:'LONG GUN', sub:'', row:0, col:3, hp:2, max:2, weapon:'long'},
  {id:'e_u1', name:'UNKNOWN', sub:'', row:1, col:0, hp:2, max:2},
  {id:'e_carp', name:'CARPENTER', sub:'', row:1, col:1, hp:2, max:2, capacity:'Timber 3/4'},
  {id:'e_u2', name:'UNKNOWN', sub:'', row:1, col:2, hp:2, max:2},
  {id:'e_hold', name:'HOLD', sub:'', row:1, col:3, hp:2, max:2, capacity:'Cargo 2/3'}
];
const enemyMast = {id:'e_mast', name:'Mast', kind:'mast', col:ENEMY_MAST_TRACK, hp:3, max:3};

const playerRooms = [
  {id:'p_std', name:'STANDARD', sub:'Gun Deck', row:0, col:0, hp:3, max:3, weapon:'standard', capacity:'2 loaded'},
  {id:'p_mag', name:'MAGAZINE', sub:'', row:0, col:1, hp:2, max:2, capacity:'6 / 6'},
  {id:'p_heavy', name:'HEAVY', sub:'Gun Deck', row:0, col:2, hp:3, max:3, weapon:'heavy', loading:true},
  {id:'p_hold1', name:'GENERAL HOLD', sub:'', row:1, col:0, hp:2, max:2, capacity:'2 / 3'},
  {id:'p_carp', name:'CARPENTER', sub:'', row:1, col:1, hp:2, max:2, capacity:'Timber 4/4'},
  {id:'p_hold2', name:'GENERAL HOLD', sub:'', row:1, col:2, hp:2, max:2, capacity:'1 / 3'}
];
const playerMast = {id:'p_mast', name:'Mast', kind:'mast', localCol:PLAYER_MAST_LOCAL_COL, hp:3, max:3};

// Enemy intents are fixed in world-space. Heavy is loading this turn, so it has no intent.
const enemyIntents = [
  {sourceId:'e_std', lane:1, targetWorld:2, damage:1},
  {sourceId:'e_rep', lane:0, targetWorld:3, damage:1},
  {sourceId:'e_long', lane:1, targetWorld:3, damage:1}
];

const state = {
  playerMastTrack: INITIAL_PLAYER_MAST_TRACK,
  hoveredWeapon: null,
  hoverIntent: null,
  overview: null,
  selectedWeaponId: null,
  exterior: false,
  playerIntents: {}
};

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
