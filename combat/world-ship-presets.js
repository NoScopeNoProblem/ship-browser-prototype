(() => {
  const catalog=window.combatCatalog;
  if(!catalog?.shipSetups)return;
  const clone=value=>JSON.parse(JSON.stringify(value));

  // Overworld identities currently reuse proven combat layouts while the encounter layer is
  // being built. Register named copies in the battler so every ship seen on the chart can be
  // selected and regression-tested directly.
  if(catalog.shipSetups.copperKestrel&&!catalog.shipSetups.brassViper){
    const ship=clone(catalog.shipSetups.copperKestrel);
    ship.id='brassViper';ship.name='THE BRASS VIPER II';ship.threatStars=2;
    ship.testExpectation='Overworld ★★ encounter. Uses the Copper Kestrel combat layout while its identity/content is being developed.';
    catalog.shipSetups.brassViper=ship;
  }
  if(catalog.shipSetups.ironGull&&!catalog.shipSetups.redWidow){
    const ship=clone(catalog.shipSetups.ironGull);
    ship.id='redWidow';ship.name='THE RED WIDOW III';ship.threatStars=3;
    ship.testExpectation='Overworld ★★★ encounter. Uses the Iron Gull combat layout while its identity/content is being developed.';
    catalog.shipSetups.redWidow=ship;
  }
})();