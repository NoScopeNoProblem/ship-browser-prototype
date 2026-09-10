# High Seas Prototype — Development Handoff

**Checkpoint:** 10 September 2026  
**Repository:** `NoScopeNoProblem/ship-browser-prototype`  
**Branch:** `main`

Fetch current `main` before editing. This file is intentionally concise: the Google GDD is the game-design authority, the TDD records implementation detail, and current `main` is executable truth.

## Authority

- GDD Section 16: current Combat Prototype rules.
- GDD Section 17: current World Map / Adventure rules.
- GDD Section 18: current Ship Management / shared cargo rules.
- TDD Section 25: Adventure ↔ Ship Management ↔ Combat integration history.
- Current `main`: executable implementation; later explicit designer decisions in main/HANDOFF supersede stale implementation notes in older document paragraphs.

Do not revive older conflicting storage/combat wording. Do not casually bulk-move/refactor the proven root combat modules while working on voyage systems.

## Live entry points

- Main menu: `https://noscopenoproblem.github.io/ship-browser-prototype/`
- World Map: `https://noscopenoproblem.github.io/ship-browser-prototype/world/`
- Ship Management: `https://noscopenoproblem.github.io/ship-browser-prototype/ship/`
- Ship Battler: `https://noscopenoproblem.github.io/ship-browser-prototype/combat/`
- Adventure combat: `combat/combat.html?mode=adventure&player=wayward&enemy=<setup>&encounter=<id>`

GitHub Pages may lag after a push; hard-refresh before diagnosing stale deployment. The main menu now carries a small build-SHA stamp specifically so designer testing can tell which deployed code checkpoint is visible.

## Current connected voyage state

The browser prototype has World Map ↔ Ship Management ↔ Adventure Combat connected by persistent adventure state. `shared/ship-storage.js` owns physical cargo; `shared/ship-voyage.js` owns persistent Wayward room/Mast integrity plus voyage-level cargo/repair/reward helpers; `shared/adventure-state.js` persists the run.

Fresh Wayward stores are 3 coin, 6 Food, 6 Cannonballs, 4 Timber, 0 Medicine. Holds have 3 flexible slots; Magazine has 2 Cannonball-only slots; Carpenter has 1 Timber-only slot. Stack limits are Food 12, Cannonballs 3, Timber 4, Medicine 1. Automatic balancing can spread general cargo between living Holds while specialist sorting prioritises Magazine/Carpenter.

Boatswain now follows the same Timber-storage convention as Carpenter: one Timber-only slot with a normal maximum of 4 Timber. Player Brace spends 1 Timber in Adventure combat; the spend is reversible while the plan can still be reset and becomes committed when resolution starts. A prepared enemy Brace is not cancelled if its Boatswain is destroyed earlier in the player's volley.

Combat starts from persistent Wayward integrity and writes room/Mast damage back into the voyage. Destroying a friendly Hold destroys the cargo physically stored in that Hold. Adventure cannon fire spends Cannonballs; Carpenter Repair and Boatswain Brace spend Timber. Food, Cannonballs and Timber remain visible in the Adventure combat HUD, and friendly storage inspection shows exact contents.

Chain Shot remains 1 room damage / 2 Mast damage. The enemy intention reveal now uses target-specific damage immediately, so a Chain Shot aimed at the friendly Mast previews 2 damage before the intention animation finishes rather than correcting only afterwards.

Ship Management supports per-section repair and Repair All using persistent Timber. A destroyed Mast blocks overworld sailing until repaired. Player-facing management/report copy calls this **ship damage**, not “blips”.

## Post-combat report

Adventure combat exits directly to `/ship/?postCombat=1`. The Adventure bridge synchronously hides the legacy final outcome card before navigation so surrender/sink results do not flash the old combat result screen first.

The post-combat report is docked into the Ship Management side column rather than presented as a blurred full-screen overlay. The ship board, physical Hold contents and Day/Coin/Food/Cannonballs/Timber HUD remain visible while rewards are chosen.

Report hierarchy is deliberate: Ship Damage first with **Damage Taken**, live **Damage Remaining**, and **Repair All** when the Carpenter works and enough Timber is aboard; then informational Cost of the Fight vs What You Have Gained columns; then a visually separate gold **CHOICE** section for mutually exclusive reward decisions and optional salvage. Post-combat repairs update remaining damage/Timber without rewriting historical Damage Taken.

The old map-side victory/spoils return path is now guarded by `world/world-v4-state-sync.js`: once the Ship Management report is resolved, the combat is marked seen before legacy world return handling runs. This prevents the same reward/spoils choice being offered again in text after leaving the cargo screen.

Rewards continue to respect fitted storage capacity. Accepted cargo and anything left behind/overboard are reported separately.

## World / First Sea current rules

Travel consumes the active ship's configured Food per day; the current Wayward rate is 4. Wind passages are directional: a 1-day favourable traversal becomes a 3-day adverse traversal when sailed in reverse; pathfinding, route totals, Food forecasts, edge labels and next-leg UI use that same directional cost. Sailing a leg plays a short moving/bobbing player-ship animation before time/arrival commits.

The route panel now has **WAIT 1 DAY** while the ship is at a chart location. Its displayed/charged Food cost is read from the active ship's `foodPerDay` value rather than hard-coded. Waiting advances the day and moving threats exactly like other elapsed world time. The world view deliberately rebuilds after the wait so route forecasts and threat positions all come from the same advanced state; if a threat arrives at the current location, its encounter opens after the rebuild.

Evading a hostile encounter costs 1 day and the current ship's one-day Food rate; the option states the cost before selection and world time/threat movement advances normally.

First Sea POIs are intentionally more generous with provisions. Exploration grants physical rewards and previews them before EXPLORE: Whispering Reef gives 8 Food + 1 Timber; Lantern Atoll gives 12 Food + 3 Cannonballs. Wreck searches include Food: quick search gives 4 Food + 1 Timber; thorough search gives 8 Food + 2 Timber + 3 Cannonballs. Combat store choices continue to include Food in the 4–6 range. These are calibration values aimed at returning roughly half/all of a normal leg’s Food cost often enough to keep exploration attractive.

Medicine remains a Hold-only one-slot trade crate. Seabrook sells for 1 coin. Sunreach pays 3 coin through purchase day +8, 2 through +10, then 1. Medicine buy/sell no longer reloads the whole browser page: `world-v4-state-sync.js` keeps the world closure's state synchronized and `world-trade.js` refreshes the market row, coin display and HUD in place.

## Remaining seams

1. Capacity decisions are only partly productised: purchases/rewards respect fitted capacity, but the full over-capacity/throw-overboard flow and starvation/zero-ammunition hard stops are still later work.
2. Coins remain scalar rather than physical cargo in this browser slice.
3. First Sea topology and threat patrols are authored/scripted calibration content; procedural braid generation, living weather/Chart Room forecasting, richer ports and rumours/intel remain later systems.
4. Combat core still uses the proven layered vN compatibility architecture. `combat-v33-rule-fixes.js` is an additive late rule-correction layer for target-specific intention damage and prepared Brace semantics; do not fold it into a broad combat rewrite casually.
5. Browser validation is designer-led. Source/state integration can be checked here, but do not mark presentation behaviour verified until exercised on the published build.

## Focused regression checks for this checkpoint

- Finish a surrender, choose rewards in Ship Management, return to chart: no second legacy spoils choice should appear.
- Buy and sell Medicine: the market row/HUD should update without a full-page flicker and subsequent normal market purchases must use the correct coin total.
- Wait one day at a location: Food falls by the active ship's daily rate, Day increments, moving threats advance, and an arriving threat can trigger normally.
- In a combat with a Boatswain: Brace costs 1 Timber, the room advertises one Timber slot / 4 max, and a prepared enemy Brace still absorbs damage after its Boatswain is destroyed earlier in the volley.
- In the Salt Finch Chain Shot case: an intention targeting the friendly Mast should show 2 projected damage during the intention reveal itself.
