# High Seas Prototype — Development Handoff

**Checkpoint:** 10 September 2026  
**Repository:** `NoScopeNoProblem/ship-browser-prototype`  
**Branch:** `main`

This file is the technical/session handoff for the current browser prototype. The Google GDD is the game-design source of truth. The Combat TDD remains the detailed record of the combat implementation. Fetch `main` before making edits; do not rely on SHAs copied from an older chat.

## Current status

The combat sandbox has reached a stable playtest checkpoint. The large Mast-target/movement stale-UI regression was resolved; only minor visual combat issues were knowingly left when work moved on. Do not casually refactor combat while developing the overworld.

The first overworld/adventure vertical slice is now implemented but has **not yet received the same designer playtest pass as combat**. It connects a main menu, a data-driven First Sea chart, ports/POIs, moving threats, combat entry/return, prototype stores and Paradise Bay.

The first management-integration pass is also now in `main`: persistent adventure inventory has a room-aware storage model shared by map and combat; friendly storage/support/weapon rooms have a combat inspector; Cannonballs and Timber are visible in Adventure combat; actual player firing consumes Cannonballs; planned Repair consumes Timber with planning rollback support. This integration is source-reviewed but still requires designer browser playtesting.

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
  - Section 17 is the authoritative overworld/adventure checkpoint before this storage-integration pass; explicit later designer decisions in `main` and this handoff supersede prototype-plumbing details where noted.
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
    ship-storage.js          Shared item/slot/room storage rules and mutations
    adventure-state.js       Persistent run state + room-aware storage + combat handoff state
    adventure-combat-bridge.js
                             Connects combat outcomes/ammo/Repair costs to adventure state

  combat-v31-room-inspector.js/css
                             Additive room-information/storage panel + live room store labels

  [legacy/root combat-v*.js/css, combat-v11-data.js, ship-select.js/css]
                             Proven combat implementation currently referenced
                             by the combat/ entry pages
```

### Important organisation decision

`combat/` is now the public/semantic home of the combat screen, but the proven combat JS/CSS modules still physically live at repo root and are referenced with `../...` from `combat/combat.html`. This is intentional transitional debt: moving dozens of stable combat assets at the same time as building the map would create high regression risk for no gameplay benefit.

Do **not** perform a bulk physical move of the combat modules as incidental cleanup. When combat is next substantially rebuilt, migrate it as one deliberate refactor with URL/reference testing. A future ship-management screen should get its own `ship/` (or similarly explicit) folder rather than being mixed into `world/`.

The new storage model deliberately lives in `shared/`, not in world or combat. Future Ship Management should manipulate the same storage records rather than create a second inventory representation.

## Shared adventure state

`shared/adventure-state.js` owns browser persistence under localStorage key `highSeasAdventure.v1` (**state schema version 3**).

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
- `stores.food`, `stores.cannonballs`, `stores.timber` — compatibility/summary totals
- `storage` — canonical room-aware storage model for Food/Cannonballs/Timber
- `visitedNodeIds`, `resolvedPoiIds`
- `enemies`
- `pendingCombat`, `lastCombat`, `lastSeenCombatAt`
- flags such as `openingPortShown`

`New Adventure` replaces only the adventure run. Standalone/custom Ship Battler templates use their existing separate localStorage keys and should not be destroyed by starting a voyage.

Current fresh-state tuning is Day 1, The Wayward at Seabrook, 3 coin, **6 Food, 6 cannonballs and 4 Timber**. Existing v1/v2 saves migrate their existing store totals exactly; they are not silently granted the new 6-Food starter amount.

## Shared room-aware storage / management seam

`shared/ship-storage.js` is the current inventory authority for physical Food, Cannonballs and Timber. It records both total quantity and **which room slot contains each stack**, so the later Ship Management screen can move cargo between actual rooms instead of reconstructing location from global counters.

Current item stack sizes:

- Food: 12 per slot.
- Cannonballs: 3 per slot.
- Timber: 4 per slot.

Current storage-bearing room rules:

- Hold / `storage`: 3 general slots; accepts Food, Cannonballs or Timber.
- Magazine: 2 Cannonball-only slots; normal fitted capacity 6 balls.
- Carpenter: 1 Timber-only slot; normal fitted capacity 4 Timber.

The Wayward's initial load is allocated naturally: Food to a Hold, 6 balls across the Magazine's two slots, and 4 Timber in the Carpenter.

Storage also contains an `unassigned` overflow/debt bucket. This is deliberate temporary scaffolding while capacity enforcement is deferred:

- positive unassigned quantity = inventory beyond currently available compatible slots;
- negative unassigned quantity = prototype shortage/debt when consumption is allowed below zero.

Global totals include this bucket. Do not expose it as a final inventory concept; the next capacity-management pass should turn over-capacity state into an explicit player decision rather than silently retaining it forever.

Existing `world.js` still mutates `state.stores` directly in several places. `adventure-state.js` reconciles those totals into the canonical room storage on save so map purchases, Food use and rewards participate in the storage model without a risky world rewrite during this integration pass. New shared systems should prefer `HighSeasAdventure.addItem()` / `consumeItem()` and room-storage helpers.

`ship-storage.js` also has `configureRooms()` as the seam for future refitting/Ship Management. Changing storage-bearing room definitions can displace cargo into temporary unassigned inventory instead of deleting it. The management UI should eventually own the player-facing resolution of that displacement.

Coins remain the existing separate `state.coins` scalar in this pass. No new coin-slot rule was introduced here because this implementation was scoped to the explicitly specified Food/Cannonball/Timber storage rules; revisit physical coin storage deliberately when the management inventory design reaches that item.

## Combat room inspector / management readability seam

Adventure combat now loads `combat-v31-room-inspector.js/css` **after** the established combat layers. It adds a panel below the existing combat/status composition rather than moving the ship boards or alignment track.

Inspector behaviour:

- Hover temporarily inspects a room/Mast.
- Clicking a non-action room can lock its inspection.
- Existing combat selections are also authoritative: selecting a player Gun Deck or support room populates the inspector even though legacy combat handlers stop event propagation.
- Friendly weapons show damage, range, reload/cadence and relevant special behaviour such as Chain Mast damage.
- Friendly Hold/Magazine/Carpenter shows actual room slot contents from the adventure storage model.
- Friendly room-capacity labels are now derived from live storage (`n / 3 SLOTS`, `BALLS n / 6`, `TIMBER n / 4`) rather than the old hard-coded prototype text.
- Support rooms explain their verb.
- Enemy hidden rooms remain `???` and say to deal damage to reveal more information. The inspector must not leak hidden type/capacity/contents.
- Once an enemy room is legitimately revealed, known weapon/support/storage rules can be described, but enemy stored contents remain unknown.

The `FLEE` track label is also now displayed one cell farther left than the old v30 edge label: it marks the space the player would move **into** to flee/end combat. Functional flee ownership remains in v30; this is an additive presentation correction rather than another movement-state owner.

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

Storage **location is now modelled**, but capacity is not enforced yet. Purchases/rewards beyond available fitted slots go to temporary unassigned overflow. Food, Cannonballs and Timber may also go negative through temporary debt so playtesting can expose pressure before hard failure rules are connected.

Exploration POIs currently have a minimal Explore / Sail On interaction and become visibly resolved. Wrecks have a simple time-vs-reward choice. These are interaction scaffolds, not final authored event content.

Paradise Bay marks the run `complete` and is the end of this prototype map.

## Threat → combat → map bridge

When the player reaches a node occupied by an active enemy, the map shows a pre-combat threat modal with the enemy name and coarse Threat Rank. Internal rooms are not exposed there.

`ENGAGE` writes `pendingCombat` into the shared adventure state and launches the existing combat engine in `mode=adventure`. The map enemy identity can reuse a proven combat setup while carrying its own map name/threat.

`shared/adventure-combat-bridge.js` listens for the existing combat result event rather than replacing the core combat outcome system. It also connects the legacy combat prototype to shared voyage resources without moving resource ownership into combat.

Current combat-resource integration:

- Adventure combat shows live Cannonball and Timber totals.
- Each actual player cannon shot consumes 1 Cannonball from shared voyage storage. A plan that is cancelled because an earlier shot already destroyed its target does not spend a ball because that gun never fires.
- Player Carpenter Repair consumes 1 Timber when planned. Because current Repair mutates HP during reversible planning, the bridge mirrors that transaction: `R` refunds Timber if the Repair is rolled back before resolution; once resolution begins the spend is committed.
- Capacity/shortage does not block firing or Repair yet; totals can go negative by design in this pass.
- Brace still has no Timber cost unless/until the designer explicitly adopts one.

On a terminal result the bridge records the result and replaces the standalone replay/select actions with `RETURN TO MAP`.

Current outcome integration:

- Sunk/surrender/victory: enemy is marked inactive/defeated and a small placeholder loot choice is offered on return.
- Surrender/victory may offer an extra +1-day salvage/strip decision.
- Sunk ships give worse automatic salvage.
- Flee keeps the enemy active and can put the player in a `midPassage` consequence state: the ship is visually between the two relevant chart endpoints and either endpoint costs exactly 1 day to reach.
- Defeat marks the adventure defeated.

`midPassage` is **not a selectable/generated map node**. It is transient consequence state layered over one existing edge. Keep this distinction when expanding route logic.

## Known temporary seams / bugs to remember

These are important so future work does not accidentally treat prototype shortcuts as design decisions:

1. **Combat damage is not persisted into voyage ship health yet.** Each new adventure combat receives a fresh Wayward definition. Do not independently bolt cargo loss/damage state onto combat; persistent room HP, cargo and configuration should become one shared Ship Management/ship-state authority.
2. **Adventure firing consumes Cannonballs, but zero-ammo enforcement is deliberately absent.** Current enemy ships do not manoeuvre, so actual player fire reaches the existing damage hook. When enemy movement/miss-capable player shots exist, charge ammunition at the first-class FIRE action/resolution point rather than relying on this compatibility hook.
3. **Player Repair now consumes Timber in Adventure combat; Brace does not.** Repair still uses the combat sandbox's immediate planning-time HP mutation and is mirrored into storage with rollback/commit bookkeeping. The clean combat-state rebuild should make this a proper reversible action transaction.
4. **Capacity is modelled but not enforced.** Over-capacity stores live in temporary `unassigned` overflow and negative resources in temporary debt. The next management pass should give the player a way to resolve excess physically.
5. **Coins are not yet room-stored in this new model.** They remain the existing scalar until a deliberate coin/cargo rule is adopted for Ship Management.
6. **Port refit/shore actions are not connected.** Market stock now reconciles into storage, but port capacity resolution and room refit remain future UI.
7. **Food can go negative and starvation is not implemented.** Route forecast deliberately exposes negative values rather than preventing departure.
8. **`AVOID FOR NOW` on a co-located threat is only a modal dismissal.** Evasion/pursuit consequences have not been designed/implemented.
9. **World topology is fixed data today.** Per-run braided generation remains a design requirement.
10. **Weather is not living yet.** Edge cost plumbing exists; forecast cycles/change-every-2–3-days logic does not.
11. **Enemy overworld movement is scripted patrol movement.** Rumours, destinations, anchoring and interception intelligence are later systems.
12. **The combat folder is a wrapper around root combat assets.** Do not “clean it up” casually and regress the stable battler.
13. **The overworld/storage-management integration still needs designer browser testing.** Source and state-model checks are not equivalent to actually exercising the GitHub Pages build.

## Recommended next playtest

Start from the main menu and test the connected loop rather than isolated pages:

1. Start New Adventure and confirm 6 Food / 6 Cannonballs / 4 Timber.
2. In a port, buy Food/Cannonballs/Timber and confirm global totals update normally; capacity should not block purchases yet.
3. Plot/sail a leg and confirm Food use updates the total and the linked Hold contents.
4. Enter Adventure combat and inspect friendly Hold, Magazine and Carpenter. Confirm room labels and inspector slots match the voyage stores.
5. Select/hover each weapon and support room; confirm the inspector explains range/cadence/verb without shifting the ship/track composition.
6. Hover an enemy `???`; confirm no type/capacity leaks and the panel asks for damage to reveal more information. Damage it and confirm the now-known room can be explained.
7. Fire one player gun and confirm Cannonballs drop by 1. Assign multiple shots and confirm only guns that actually fire spend ammunition.
8. Plan a Carpenter Repair and confirm Timber drops by 1; press `R` before resolution and confirm it is refunded. Plan again and resolve; confirm the Timber stays spent.
9. Verify the `FLEE` label is one track space left of the legal edge position: it represents the space the ship would move into to flee/end combat.
10. Return to the map and confirm the changed Cannonball/Timber totals persist.

Then continue the earlier overworld loop through POIs, moving threats, combat return, mid-passage flee and Paradise Bay. Focus feedback on whether room-specific inventory feels understandable enough to become the foundation for drag/click-drop Ship Management.

## Next development priorities after this management-storage pass

Do not expand all systems simultaneously. A sensible sequence is:

1. Browser-playtest/fix the new room-aware storage + combat inspector + resource-consumption bridge together with the existing Map → Combat → Map loop.
2. Build the dedicated Ship Management screen around one persistent ship state: room layout/HP + the current room-slot storage records, with click/drop or drag/drop cargo movement.
3. Add explicit over-capacity resolution and zero-resource enforcement only after the management screen gives the player a usable place to solve those problems.
4. Make combat damage persist through that same shared ship state; then destroyed/damaged storage rooms can have real voyage consequences without duplicate state ownership.
5. Decide the final route-generation grammar and build per-run braided graph generation while preserving clear authored landmarks/cadence constraints.
6. Add living weather/wind using the existing edge-cost seam.
7. Expand port identity: shore actions, Market persistence, Tavern information, Shipyard/refit.
8. Add rumours/intel and moving-ship information (last seen, heading, likely destination/anchor windows).
9. Replace remaining temporary reward/store plumbing once Ship Management owns physical inventory end-to-end.

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
