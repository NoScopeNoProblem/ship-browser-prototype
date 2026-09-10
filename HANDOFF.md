# High Seas Prototype — Development Handoff

**Checkpoint:** 10 September 2026  
**Repository:** `NoScopeNoProblem/ship-browser-prototype`  
**Branch:** `main`

Fetch current `main` before editing. This file is intentionally short and should eventually disappear: the Google GDD is the game-design authority and the TDD records implementation detail.

## Authority

- GDD Section 16: current Combat Prototype rules.
- GDD Section 17: current World Map / Adventure rules.
- GDD Section 18: current Ship Management / shared cargo rules.
- TDD Section 25: current Adventure ↔ Ship Management ↔ Combat technical integration.
- Current `main`: executable implementation.

Do not revive older conflicting storage/combat wording from earlier GDD/TDD sections. Do not casually bulk-move/refactor the proven root combat modules while working on voyage systems.

## Live entry points

- Main menu: `https://noscopenoproblem.github.io/ship-browser-prototype/`
- World Map: `https://noscopenoproblem.github.io/ship-browser-prototype/world/`
- Ship Management: `https://noscopenoproblem.github.io/ship-browser-prototype/ship/`
- Ship Battler: `https://noscopenoproblem.github.io/ship-browser-prototype/combat/`
- Adventure combat: `combat/combat.html?mode=adventure&player=wayward&enemy=<setup>&encounter=<id>`

GitHub Pages may lag after a push; hard-refresh before diagnosing a stale deployment.

## Current connected build

The browser prototype now has the three major voyage screens connected by one persistent adventure state: World Map ↔ Ship Management ↔ Adventure Combat.

`shared/ship-storage.js` is the physical cargo authority. `shared/adventure-state.js` persists that cargo plus run state. Current fresh Wayward stores are 3 coin, 6 Food, 6 Cannonballs, 4 Timber, 0 Medicine. Holds have 3 flexible slots; Magazine has 2 Cannonball-only slots; Carpenter has 1 Timber-only slot. Stack limits are Food 12, Cannonballs 3, Timber 4, Medicine 1. Packing prioritises Magazine/Carpenter and compacts/splits like cargo evenly where practical.

`/ship/` is the Ship Management screen. It uses the Wayward 3×2 side-slice, real cargo slots, drag/drop and click/drop whole-stack movement, a faint seven-cell combat track, Hold-X friendly range overlay, and an auto-sort toggle that is ON by default. Returning from combat automatically refills specialist stores when that toggle is enabled; SORT NOW performs the same repack manually.

Adventure combat retains its proven ship/track geometry. The lower UI is now one consolidated readable room inspector with temporary room art, existing Selected/Effect information and storage together. Hidden enemy ??? information rules are preserved. Cannonballs and Timber have prominent bottom-right counters. Actual player fire spends Cannonballs; player Repair spends Timber with R rollback before resolution.

Medicine is a Hold-only one-slot trade crate. Seabrook sells for 1 coin. Sunreach pays 3 coin through purchase day +8, 2 through +10, then 1. This is provisional economy tuning.

Temporary room art under `assets/rooms/` is prototype scaffolding derived from the supplied visual reference; combat itself has not been art-reskinned.

## Unresolved seams only

1. **Persistent ship damage:** combat room/Mast HP is still fresh per encounter. Next cross-screen milestone is one persistent ship instance carrying damage plus stores into combat and back.
2. **Cargo consequences:** destroyed storage rooms do not yet lose/displace cargo because persistent damage is not connected.
3. **Capacity/shortage enforcement:** over-capacity stock and negative resources are still allowed through temporary overflow/debt. Overboard choices, starvation and hard zero-ammo rules remain to design.
4. **Medicine balance:** route deadline/prices are prototype calibration, not frozen balance.
5. **World systems still intentionally provisional:** fixed authored topology, scripted enemy patrols, non-living weather, simple ports/POIs and incomplete rumours/intel remain later work.
6. **Browser validation:** this integration has been source/state-model checked but still needs designer testing on the published GitHub Pages build.

Everything else completed in this pass belongs in the GDD/TDD rather than being accumulated here.