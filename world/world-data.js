(() => {
  const edge=(id,a,b,wind='normal')=>{
    const modifierDays=wind==='favourable'?-1:wind==='adverse'?1:0;
    return {id,a,b,travel:{baseDays:2,weatherEligible:wind!=='normal',weatherState:wind,modifierDays}};
  };

  window.HighSeasWorldDefinition={
    id:'first-sea-prototype',
    name:'THE FIRST SEA',
    startNodeId:'seabrook',
    endNodeId:'paradiseBay',
    nodes:[
      {id:'seabrook',name:'SEABROOK',type:'majorPort',x:6,y:50,summary:'Major Port · Starting harbour'},
      {id:'driftwood',name:'DRIFTWOOD',type:'minorPort',x:20,y:28,summary:'Minor Port'},
      {id:'whisperingReef',name:'WHISPERING REEF',type:'poi',poiKind:'exploration',x:20,y:72,summary:'Point of Interest'},
      {id:'northwatch',name:'NORTHWATCH PASSAGE',type:'waypoint',x:35,y:18,summary:'Open water'},
      {id:'brasswater',name:'BRASSWATER',type:'waypoint',x:36,y:50,summary:'Open water'},
      {id:'saintIona',name:'WRECK OF SAINT IONA',type:'poi',poiKind:'wreck',x:35,y:82,summary:'Shipwreck'},
      {id:'sunreach',name:'SUNREACH',type:'majorPort',x:50,y:50,summary:'Major Port · Mid-sea harbour'},
      {id:'turtleShore',name:'TURTLE SHORE',type:'minorPort',x:64,y:28,summary:'Minor Port'},
      {id:'lanternAtoll',name:'LANTERN ATOLL',type:'poi',poiKind:'exploration',x:64,y:72,summary:'Point of Interest'},
      {id:'needleStrait',name:'NEEDLE STRAIT',type:'waypoint',x:80,y:18,summary:'Open water'},
      {id:'blueGraves',name:'THE BLUE GRAVES',type:'waypoint',x:80,y:50,summary:'Open water'},
      {id:'smugglersWake',name:"SMUGGLER'S WAKE",type:'poi',poiKind:'wreck',x:80,y:82,summary:'Shipwreck'},
      {id:'paradiseBay',name:'PARADISE BAY',type:'paradise',x:95,y:50,summary:'Prototype destination'}
    ],
    edges:[
      edge('e01','seabrook','driftwood'),
      edge('e02','seabrook','whisperingReef'),
      edge('e03','driftwood','northwatch'),
      edge('e04','driftwood','brasswater','favourable'),
      edge('e05','whisperingReef','brasswater'),
      edge('e06','whisperingReef','saintIona','adverse'),
      edge('e07','northwatch','brasswater'),
      edge('e08','northwatch','sunreach','adverse'),
      edge('e09','brasswater','sunreach','favourable'),
      edge('e10','saintIona','sunreach'),
      edge('e11','sunreach','turtleShore'),
      edge('e12','sunreach','lanternAtoll'),
      edge('e13','turtleShore','needleStrait'),
      edge('e14','turtleShore','blueGraves','adverse'),
      edge('e15','lanternAtoll','blueGraves','favourable'),
      edge('e16','lanternAtoll','smugglersWake'),
      edge('e17','needleStrait','blueGraves'),
      edge('e18','needleStrait','paradiseBay','favourable'),
      edge('e19','blueGraves','paradiseBay','adverse'),
      edge('e20','smugglersWake','paradiseBay')
    ],
    enemies:[
      {
        id:'brassViper',name:'THE BRASS VIPER II',threat:2,shipSetupId:'copperKestrel',
        startNodeId:'brasswater',route:['brasswater','whisperingReef','brasswater','northwatch'],moveIntervalDays:2
      },
      {
        id:'redWidow',name:'THE RED WIDOW III',threat:3,shipSetupId:'ironGull',
        startNodeId:'blueGraves',route:['blueGraves','lanternAtoll','blueGraves','needleStrait'],moveIntervalDays:2
      }
    ],
    ships:{
      wayward:{foodPerDay:4}
    },
    market:{
      food:{label:'Food',amount:12,cost:1},
      cannonballs:{label:'Cannonballs',amount:3,cost:1},
      timber:{label:'Timber',amount:4,cost:1}
    },
    wreckRewards:{
      quick:{days:1,stores:{timber:1}},
      thorough:{days:2,stores:{timber:2,cannonballs:3,food:4}}
    },
    combatRewards:{
      sunk:{stores:{timber:1}},
      surrender:{
        coin:{coins:1},
        stores:{stores:{food:6,cannonballs:3,timber:2}},
        strip:{days:1,coins:1,stores:{cannonballs:3,timber:2}}
      },
      victory:{
        coin:{coins:1},
        stores:{stores:{food:4,cannonballs:3,timber:1}},
        salvage:{days:1,stores:{cannonballs:3,timber:2}}
      }
    }
  };
})();