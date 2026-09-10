# High Seas Prototype — Development Handoff

**Checkpoint:** 10 September 2026  
**Repository:** `NoScopeNoProblem/ship-browser-prototype`  
**Branch:** `main`

This file is the technical/session handoff for the current browser prototype. The Google GDD is the game-design source of truth. The Combat TDD remains the detailed record of the combat implementation. Fetch `main` before making edits; do not rely on SHAs copied from an older chat.

## Current status

The combat sandbox has reached a stable playtest checkpoint. The large Mast-target/movement stale-UI regression was resolved; only minor visual combat issues were knowingly left when work moved on. Do not casually refactor combat while developing the overworld.

The first overworld/adventure vertical slice is now implemented but has **not yet received the same designer playtest pass as combat**. It connects a main menu, a data-driven First Sea chart, ports/POIs, moving threats, combat entry/return, prototype stores and Paradise Bay.

## Live entry points

- Main menu: `https://noscopenoproblem.github.io/ship-browser-prototype/`
- New Adventure / world map: `https://noscopenoproblem.github.io/ship-browser-prototype/world/`
- Ship Battler / dev ship builder: `https://noscopenoproblem.github.io/ship-browser-prototype/combat/`
- Adventure combat is launched by the world layer into `combat/combat.html?mode=adventure&player=wayward&enemy=<setup>&encounter=<id>`.

GitHub Pages can lag after a push. Hard-refresh before diagnosing a stale deployment.

## Source-of-truth documents

- GDD: `High Seas Roguelike – GGD – Prototype Game Design`
  - `https://docs.google.com/document/d/1oFd-jYqLazt6SH2B88152qxbcEk4jFJlMLnjP3WIBpM/edit`
  - Section 16 is authoritative for the completed combat-prototype rules.
  - Section 17 is the new authoritative overworld/adventure checkpoint.
- TDD: `High Seas Roguelike – TDD – Combat Prototype`
  - `https://docs.google.com/document/d/1SnbQyLDRLMA1KtUVriP6ixZBiwBjMwGDsvmOHvFKi-A/edit`

## Repository structure

The intended product architecture is three major screens plus shared state:

```text
/
  index.html                 Main menu: New Adventure / Ship Battler
  menu.css

  world/
    index.html               World-map screen
    world.css                World-map presentation
    world-data.js            First Sea graph/content/travel tuning
    world.js                 Route planning, travel, POIs, threats, port UI

  combat/
    index.html               Ship Battler / builder entry
    combat.html              Adventure/standalone combat entry
    world-ship-presets.js    Map identities exposed in Ship Battler

  shared/
    adventure-state.js       Persistent run state + combat handoff state
    adventure-combat-bridge.js
                             Connects combat outcomes/ammo to adventure state

  [legacy/root combat-v*.js/css, combat-v11-data.js, ship-select.js/css]
                             Proven combat implementation currently referenced
                             by the combat/ entry pages
```

### Important organisation decision

`combat/` is now the public/semantic home of the combat screen, but the proven combat JS/CSS modules still physically live at repo root and are referenced with `../...` from `combat/combat.html`. This is intentional transitional debt: moving dozens of stable combat assets at the same time as building the map would create high regression risk for no gameplay benefit.

Do **not** perform a bulk physical move of the combat modules as incidental cleanup. When combat is next substantially rebuilt, migrate it as one deliberate refactor with URL/reference testing. A future ship-management screen should get its own `ship/` (or similarly explicit) folder rather than being mixed into `world/`.

## Shared adventure state

`shared/adventure-state.js` owns browser persistence under localStorage key `highSeasAdventure.v1` (state schema version 2).

Current important fields include:

- `status`: active / complete / defeated
- `day`
- `shipId` (`wayward` for New Adventure)
- `currentNodeId`
- `plannedDestinationId`
- `plannedRoute`
- `lastLeg`
- `midPassage`
- `coins`
- `stores.food`, `stores.cannonballs`, `stores.timber`
- `visitedNodeIds`, `resolvedPoiIds`
- `enemies`
- `pendingCombat`, `lastCombat`, `lastSeenCombatAt`
- flags such as `openingPortShown`

`New Adventure` replaces only the adventure run. Standalone/custom Ship Battler templates use their existing separate localStorage keys and should not be destroyed by starting a voyage.

Current fresh-state tuning is Day 1, The Wayward at Seabrook, 3 coin, 0 Food, 6 cannonballs and 4 Timber. These starting stores are prototype plumbing/tuning, not a newly frozen balance rule unless the designer explicitly adopts them after playtest.

## World graph and route model

`world/world-data.js` is content/data; `world/world.js` is the runtime. Keep that separation.

Each route edge carries a travel object with a `baseDays` value and modifier/weather fields. Normal base travel is 2 days. `edgeDays()` combines base + static modifier + runtime modifier, so changing weather/conditions can later alter route cost without rewriting route planning.

The current map includes some fixed 1-day favourable and 3-day adverse examples to prove variable-cost routing and UI. **Dynamic changing weather is not implemented yet.** The designer originally asked not to focus on wind in this pass; treat these fixed examples as a plumbing demonstration, not the final living-weather system.

Route planning is direct on the map:

- Adjacent node click extends the authored route one leg.
- Clicking a distant node auto-routes from the current planned endpoint using weighted shortest-path logic.
- Clicking a node already in the planned route truncates the route there.
- The whole intended route is highlighted and total days are shown.
- Food is forecast along the plotted route.
- Only `SAIL NEXT LEG` commits movement; later legs remain plans and can be changed.
- `CLEAR ROUTE` removes the uncommitted plan.
- Backtracking remains legal.

The current First Sea layout is authored rather than procedurally generated. The runtime is graph/data driven, which is the seam for later per-run braided-map generation. Do not mistake this first authored graph for a decision that every run should have identical topology.

## First Sea content/cadence

The authored prototype chart is a two-stage braid from Seabrook to Paradise Bay.

### First half

- **Seabrook** — Major Port / start
- **Driftwood** — Minor Port
- **Whispering Reef** — exploration POI
- **Northwatch Passage** — open-water waypoint
- **Brasswater** — open-water waypoint
- **Wreck of Saint Iona** — wreck POI
- **Sunreach** — second Major Port / reconnection point
- **The Brass Viper II** — moving ★★ threat, currently reusing the Copper Kestrel combat layout

### Second half

- **Turtle Shore** — Minor Port
- **Lantern Atoll** — exploration POI
- **Needle Strait** — open-water waypoint
- **The Blue Graves** — open-water waypoint
- **Smuggler's Wake** — wreck POI
- **Paradise Bay** — prototype destination
- **The Red Widow III** — moving ★★★ threat, currently reusing the Iron Gull combat layout

This intentionally gives roughly one combat threat plus another meaningful POI/port decision per broad stage, with multiple forward branches reconnecting rather than a corridor.

## Time, food and moving threats

Time advances in whole days. Travel, wreck searching and optional extra salvage can advance time. The Wayward currently consumes 4 Food per elapsed sailing/adventure day in this prototype.

Enemy ships use the same named node network as the player. Their current movement is deliberately simple and deterministic: each follows a small authored patrol route and advances every 2 days whenever world time advances.

Current threats:

- Brass Viper II: Brasswater ↔ Whispering Reef / Northwatch patrol, ★★.
- Red Widow III: Blue Graves ↔ Lantern Atoll / Needle Strait patrol, ★★★.

This is only the first proof that the world moves independently of the player. Destination choice, anchoring, pursuit, rumours, last-seen information and more sophisticated living-world behaviour are deferred.

The current encounter check treats an enemy at the destination immediately before or after the leg's time advancement as an encounter. Revisit this when travel timing becomes more granular; it is not intended as the final interception simulation.

## Ports, POIs and economy placeholder

Major and minor ports currently open the same simple market counter. This is intentional scaffolding while port service identity is deferred.

Current market bundles:

- 1 coin → 12 Food
- 1 coin → 3 cannonballs
- 1 coin → 4 Timber

Storage capacity is not enforced on the map yet. Food and cannonballs are allowed to go negative so playtesting can expose economy pressure before hard failure rules are connected.

Exploration POIs currently have a minimal Explore / Sail On interaction and become visually resolved. Wrecks have a simple time-vs-reward choice. These are interaction scaffolds, not final authored event content.

Paradise Bay marks the run `complete` and is the end of this prototype map.

## Threat → combat → map bridge

When the player reaches a node occupied by an active enemy, the map shows a pre-combat threat modal with the enemy name and coarse Threat Rank. Internal rooms are not exposed there.

`ENGAGE` writes `pendingCombat` into the shared adventure state and launches the existing combat engine in `mode=adventure`. The map enemy identity can reuse a proven combat setup while carrying its own map name/threat.

`shared/adventure-combat-bridge.js` listens for the existing combat result event rather than modifying the core combat outcome system. On a terminal result it records the result and replaces the standalone replay/select actions with `RETURN TO MAP`.

Current outcome integration:

- Sunk/surrender/victory: enemy is marked inactive/defeated and a small placeholder loot choice is offered on return.
- Surrender/victory may offer an extra +1-day salvage/strip decision.
- Sunk ships give worse automatic salvage.
- Flee keeps the enemy active and can put the player in a `midPassage` consequence state: the ship is visually between the two relevant chart endpoints and either endpoint costs exactly 1 day to reach.
- Defeat marks the adventure defeated.

`midPassage` is **not a selectable/generated map node**. It is transient consequence state layered over one existing edge. Keep this distinction when expanding route logic.

## Known temporary seams / bugs to remember

These are important so future work does not accidentally treat prototype shortcuts as design decisions:

1. **Combat damage is not persisted into voyage ship health yet.** Each new adventure combat receives a fresh Wayward definition. Persistent damage belongs to the later ship-management/adventure-state integration.
2. **Adventure cannonball accounting is incomplete.** The bridge currently decrements one cannonball only for player shots that reach the combat damage hook. A miss does not currently spend ammunition. Firing is not blocked at zero and negative ammo is allowed for observation.
3. **Combat Repair/Brace resource costs remain sandboxed.** Do not infer from combat that Timber is no longer part of the wider economy.
4. **Port capacity/refit/shore actions are not connected.** Market stock goes straight into counters.
5. **Food can go negative and starvation is not implemented.** Route forecast deliberately exposes negative values rather than preventing departure.
6. **`AVOID FOR NOW` on a co-located threat is only a modal dismissal.** Evasion/pursuit consequences have not been designed/implemented.
7. **World topology is fixed data today.** Per-run braided generation remains a design requirement.
8. **Weather is not living yet.** Edge cost plumbing exists; forecast cycles/change-every-2–3-days logic does not.
9. **Enemy overworld movement is scripted patrol movement.** Rumours, destinations, anchoring and interception intelligence are later systems.
10. **The combat folder is a wrapper around root combat assets.** Do not “clean it up” casually and regress the stable battler.
11. **The new overworld pass still needs designer browser testing.** Do not mark its interactions verified until actually exercised on GitHub Pages.

## Recommended next playtest

Start from the main menu and test the loop rather than isolated pages:

1. New Adventure → opening Seabrook market.
2. Buy a small mix with the starting 3 coin.
3. Plot a multi-leg route and confirm only the next leg commits.
4. Change/truncate a route before committing another leg.
5. Visit a minor port and an exploration/wreck POI.
6. Watch both moving enemies change nodes as days pass.
7. Intercept Brass Viper → threat popup → combat → return to map.
8. Test victory/surrender/sinking and the +1-day salvage branch.
9. Separately test Flee and confirm the mid-passage 1-day-to-either-end state.
10. Continue through Sunreach and the second braid to Paradise Bay.

Focus feedback on route readability, whether two-day legs feel tangible, whether clicking/committing a route is unambiguous, encounter cadence, and whether returning from combat preserves the feeling of one continuous voyage.

## Next development priorities after this map pass

Do not expand all systems simultaneously. A sensible sequence is:

1. Playtest/fix movement, route planning, encounter entry/return and persistence.
2. Decide the final route-generation grammar and build per-run braided graph generation while preserving clear authored landmarks/cadence constraints.
3. Add living weather/wind using the existing edge-cost seam.
4. Expand port identity: shore actions, Market persistence, Tavern information, Shipyard/refit.
5. Add rumours/intel and moving-ship information (last seen, heading, likely destination/anchor windows).
6. Build the Ship Management screen and make damage/stores/capacity persistent across map ↔ combat ↔ port.
7. Replace temporary reward/store plumbing with the storage/economy rules once the ship-management layer owns inventory.

## Design guardrails

Preserve the project's established design DNA while expanding the world:

- Preparation, profit, speed and survival should compete.
- Information should create deductions, not reveal “the correct choice.”
- Routes should present opportunity cost, not obvious completion order.
- Interrupt the plan frequently; do not interrupt the player constantly.
- Keep text short and numbers chunky.
- Backtracking is legal but should not be the routine optimal pattern.
- Branches should normally reconnect forward.
- Enemy threats should be coarse-but-reliable on the map; combat retains fair hidden internal information.
- The map, Ship Interior/Management and Combat are connected states of one voyage, not separate games.
