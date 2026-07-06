# The Curfew Cellar — Handoff Notes

**Read this first, then read the attached `TheCurfewCellar.jsx`.** This is a continuing project, not a new one. Kyle owns The Curfew Micropub (46a Bridge St, Berwick-upon-Tweed) and has been building this cellar management app entirely through Claude, with no development background himself. Match his communication preference: tight, scannable, British English, no em dashes, honest trade-offs, no filler.

## How to start
1. Kyle will upload `TheCurfewCellar.jsx` (the current master file, attached alongside this doc) as his first message, or it’ll already be in context.
2. Treat it as the source of truth for “what’s built.” The last few changes in it may not be pushed to his live site yet — ask if unsure, don’t assume.
3. Skim the file structure before making changes: search for the constant/function names mentioned below rather than reading linearly, it’s ~3000 lines.

## What this is
A React cellar-management web app, live on Vercel (`curfew-cellar-ou5c.vercel.app`), backed by Supabase for cloud sync across devices, private GitHub repo `github.com/KylePatrickMew/curfew-cellar`. Kyle runs it on his phone behind the bar.

## File setup (critical, don’t skip)
- **Master file:** `TheCurfewCellar.jsx` — this is what you edit. Uses `window.storage` in the chat preview sandbox (which shows blank seed data — that’s expected, not data loss, it’s disconnected from Kyle’s real Supabase cloud).
- **Deploy file:** `App.jsx` — regenerated from the master file after EVERY change via one transform only:
  ```
  s.split(“https://api.anthropic.com/v1/messages”).join(“/api/anthropic”)
  ```
  All logic lives in the master file; `App.jsx` is purely that one string swap applied. Never hand-edit `App.jsx` directly.
- Kyle deploys via **Working Copy (iOS)**: chat code preview → “...” → Copy (not “Save as TSX”) → Working Copy app → repo → `src` → open App.jsx → Select All → paste → Commit → Push. Vercel auto-redeploys. He may also use GitHub Desktop.
- The real Vite project only exists in his GitHub repo — you cannot see or edit it directly, so everything must live in this one file.

## Validation — do this every single change, no exceptions
Network/Vite isn’t available in this sandbox, so manual checks are the only safety net:
1. **Bracket parity**: count `{ }`, `( )`, `[ ]` before and after your edit, must match exactly.
   ```
   for ch in ‘{‘ ‘}’ ‘(‘ ‘)’ ‘[‘ ‘]’; do grep -o -F “$ch” TheCurfewCellar.jsx | wc -l; done
   ```
2. **No arbitrary Tailwind values**: `grep -oE ‘className=“[^”]*\[[^”]*”’ file | grep -vE ‘\$\{‘` must return nothing. This sandbox/Kyle’s build doesn’t support `text-[10px]` style arbitrary values — use inline `style={{ fontSize: 10 }}` instead.
3. **Grep-verify new identifiers are actually wired** (defined AND called/used).
4. Regenerate `App.jsx` with the transform above, re-check bracket parity on that file too.
5. `present_files` **both** files, `App.jsx` first (that’s the one Kyle copies to deploy), master file second.

## Architecture essentials
- Two-DB model under `STORE_KEY`: `{ library, lines, distributors, prefs, lastUpdated }`.
- `STATUSES` flow: `in_cellar` (“In Store”) → `racked` → `vented` → `tapped` → `on` → `off` (“Finished”).
- `DRINK_TYPES`: `cask`, `keg`, `keykeg`, `cider`.
- `PUMPS = { cask: [cask0-3], keg: [keg0-2], cider: [cider0-2] }`, fixed order.
- `PUMP_LABELS`: cask0=IPA, cask1=Pale, cask2=Bitter, cask3=Stout, keg0-2=Keg 1-3, cider0-2=Cider 1-3. This order is load-bearing — the staff “On” board must always sort this way.
- `PUMP_NUMBER`: same slots numbered 1–10, drives the small numbered pump tiles on the On board (a deliberate signature element mirroring the physical pump run behind the bar).
- `CATEGORIES = [“IPA”,”Pale”,”Bitter”,”Stout/Porter”,”Misc”]` — **cask-only**, drives cask style groupings in Stock List/Tap List PDFs. Do NOT add Cider/Sour to this shared constant (learned the hard way — it would leak into cask-only groupings elsewhere). Cider/Sour were added only to the Edit Beer Details category chip selector via `[...CATEGORIES, “Cider”, “Sour”]`.
- `categorise(style, abv)` auto-assigns cask category.
- `splitNote(notes)` splits a tasting note into a taste-keyword line + optional fun-fact line for two-line bullet display.
- AI model used for autofill/label-scan/invoice-scan: `claude-sonnet-4-6`.
- Cloud sync: Supabase, shared pub password, `cloudStore` object, gated load with retry-on-failure so the app can never silently save blank data over real data.

## Current design system (as of this handoff)

**Colours** — all grounded in Kyle’s actual logo and merch (not invented; he uploaded real photos of his logo, pump-badge poster, and t-shirts partway through, and the whole palette was rebuilt to match):
```js
const C = {
  ink: “#1C3636”, inkSoft: “#2C4A47”, brass: “#B8862B”, brassSoft: “#D1A44A”,
  stone: “#E8E7E2”, surface: “#FCFBF9”, line: “#DBD8D0”, cream: “#F3EFE6”,
  paper: “#FBF8F2”, alert: “#A23B3B”,
};
const TYPE_ACCENT = { cask: “#B8862B”, keg: “#3E8C82”, keykeg: “#3E8C82”, cider: “#5E8C4F” };
const CAT_ACCENT = { IPA: “#E8D976”, Pale: “#E3A93E”, Bitter: “#D6823C”, “Stout/Porter”: “#6E4A32”, Stout: “#6E4A32”, Porter: “#6E4A32”, Cider: “#5E8C4F”, Sour: “#A13B5C”, Misc: “#96A19B” };
```
- `ink` is deep teal-charcoal (from his logo’s tower silhouette), not navy — this was a full rebrand partway through, don’t reintroduce blue-navy.
- `CAT_ACCENT` IPA→Stout is deliberately the light-to-dark pint-glass gradient from his merch poster (five pints running pale straw → gold → orange → red → brown).
- Page background: `linear-gradient(180deg, #F6F1E4 0%, #EEE7D5 60%)`, warm cream matching his merch, not a cool grey.
- Tailwind’s default cool-blue “slate” scale was globally retinted via `!important` CSS overrides in the main `<style>` block (`.text-slate-400`, `.border-slate-200`, `.bg-slate-50`, hover/focus variants, etc.) to warm teal-tinted neutrals — this was flagged as the single biggest thing making the app feel generic before the fix. Don’t let new code fall back to un-retinted slate classes without checking this list covers them.

**Typography**: **Archivo** (weights 500/600/700/800) for everything, both `—font-display` (headings, beer names) and `—font-data` (prices, ABV, nav, counts) — one unified family, matching that his real logo also uses a single bold geometric sans, not a serif+sans pairing. History: started as Fraunces serif (wrong — didn’t match the logo) → Space Grotesk (Kyle disliked its squared-off flat-bottomed lowercase y) → settled on Archivo. Page titles and “The Curfew” wordmarks get positive letter-spacing (`0.02–0.03em`) to match the logo’s tracking; body text stays normal. PDF exports still use jsPDF’s built-in Helvetica — can’t load custom web fonts there without embedding, accepted limitation.

**Header**: slim single-line bar (not the old two-line block with a big icon circle). Brand mark is the **Bell** lucide icon (`size={19}`, `color: C.brassSoft`) — NOT a castle/tower SVG. A castle-turret mark was tried and explicitly rejected by Kyle in favour of keeping the bell.

**Motion**: CSS classes `.cc-fade` (view transitions), `.cc-rise`/`.cc-stagger` (staggered card entrance on load, nth-child delays), `.cc-press` (tap feedback), `.cc-pop`/`.cc-sheet` (modals), all respecting `prefers-reduced-motion`.

**Elevation**: `.cc-elev`/`.cc-elev-lg` (layered ambient+contact shadow for panels), `.cc-tile` (hover-lift for tappable tiles) — applied to all major content panels so they read as sitting on the page, not flat.

## Views added since the design system was last documented
- **Cellar Stats** (More → Cellar Stats): most restocked, price rises since first stocked, deliveries by supplier (bar chart), average cask lifespan. Reads from `beer.history` and finished cask lines; shows a friendly empty state until enough history exists.
- **How to Use** (More → How to Use): staff guide. Content is one array, `GUIDE_SECTIONS`, rendered both on-screen and into a PDF (`shareGuidePDF`) so they can’t drift apart. Wording has been through several rounds of Kyle’s edits — check with him before assuming a rewrite is wanted, he’s been specific about tone (app’s own terms, no bell mentions since “self-explanatory”, no backup-nudge mention, no mention of autofill’s blank-only mechanic).
- **Notifications** (More → Notifications): subscribe/unsubscribe UI for push. `pushState` machine (`checking/unsupported/need-install/blocked/off/on`), `enablePush`/`disablePush`, `sendCellarPush` fired from `advance`, `finishAndChoose`, `doSwap`. Depends on repo-level pieces not yet confirmed live — see Open items.
- **Needs Attention is now a header bell**, not a strip. `attentionItems` is a `useMemo` at component scope (best-before soon/passed, quality-check-due casks, vented-and-ready, backup nudge) shared between the badge count and the dropdown list. If adding a new “thing that needs attention”, add it here, not as a separate UI element.
- **Tap List masthead** uses a CSS-only brass arch (border-radius trick, no image) framing the bell/wordmark, echoing the merch poster’s arched window.

## Hard-won lessons (don’t reintroduce these bugs)
- **Grid blowout**: any `grid` with `sm:grid-cols-2` MUST also have an explicit base `grid-cols-1`. Without it, CSS gives the grid no shrink constraint, so one long unbreakable string (a beer name, a location) can force the whole grid wider than the viewport on mobile, pushing content off-screen. This caused several “going off screen” bug reports before the root cause was found and fixed across all 12 grids app-wide. Apply this rule to any new grid.
- **Autofill only fills blank fields** — both `autoFill` (Add form) and `autoFillBeer` (Library edit) must never overwrite something Kyle typed manually. Only exception: `allergensVerified` always resets to false on any autofill, since new info needs re-checking.
- **`prefs` persistence gotcha**: section collapse/expand state (`prefs.on/racked/store`) is part of the synced cloud data, so once toggled it stays that way forever across reloads unless you explicitly force it. Kyle wanted “In Store” to always start collapsed regardless of history — fixed by forcing `store: false` in the merge at load time, not just in the initial `useState`.
- **Python-generated apostrophes**: if you ever generate JS string literals via a Python script (e.g. bulk data migrations), watch for `repr()` converting `’` to bare `”` inside strings — this broke 7 tasting notes once with a hard parse error. Always grep-check generated string literals for stray unescaped quotes before shipping.
- **Tasting notes must be flashcard-style keywords**, not sentences: 3–5 comma-separated keywords ending in a period, optionally + one short genuine fun fact under 10 words if actually known (never invented). E.g. “Biscuity, citrus, pear. Named after a Para Handy character.” Displayed as two bullet lines via `splitNote()`. There’s a `NOTE_FORCED` map + `migrateNotes5` that unconditionally force-writes this format for all original 57 beers — any new automated note-writing (autofill prompts, label scan) must follow the same strict format or it’ll look inconsistent.
- **Share PDF buttons are deliberately subtle** — plain text-link style, no border/box, small muted icon+text. Print/primary actions stay bold. Don’t reintroduce bordered-button styling for these.

## Recent chronological log (most recent first)
- **Reconciled work scattered across multiple parallel chats.** Kyle had been running separate sessions (“Keg list display and iPad notification fixes”, “Converting logo to iPhone home screen icon”) whose changes never made it back into this master file or GitHub. Found via conversation_search and manually re-applied in full:
  - Key kegs now grouped with kegs (not invisible) in both the Cellar In Store list and the customer Tap List, via `PUMP_DRINK(l.drinkType) === “keg”` instead of `l.drinkType === “keg”`, matching the rule the On board already used.
  - Tapping an empty in the Empties list now opens its full card (same as any other line), so a wrong supplier or other detail can be fixed without deleting and re-adding.
  - Added `paddingTop: env(safe-area-inset-top)` to the header, fixing the iPad status bar clock overlapping the notification bell on installed iPad/iPhone apps. Zero effect elsewhere.
  - Cellar Stats hidden from both nav menus (Kyle’s call) — `Stats()` and the `view === “stats”` routing deliberately left intact, so it’s a one-line restore if wanted back.
  - Added `shareEmptiesPDF`, grouped by supplier, matching the established PDF visual pattern (dark header, brass dividers, pale card rows, footers).
  - **Renamed “Ready” back to “Tapped”** across the cellar progression (progress pip, card badge, advance button) at Kyle’s explicit request — reverses a change made earlier in a different session. If a future session is tempted to “restore” Ready, don’t: this is the current, deliberate wording.
  - Important process note: **this reconciliation only happened because Kyle explicitly said “there’s been changes across two different chats, make sure we’re up to date.”** Nothing about the platform surfaces this automatically — parallel chats do not share state, and “the handoff happens automatically” (something Kyle said in one of the other sessions) is a misconception worth correcting again if it comes up: GitHub sync only works if Kyle actually pushes files there, and only for the two root-level files this project fetches, not for in-progress work sitting in other conversations.
- **Push notifications, confirmed working end to end** (tested with two phones: advancing a beer to Pouring pushed “Now pouring: [beer]” to the phone that had it turned on, app closed, within a few seconds). App side (subscribe/unsubscribe UI under More → Notifications, `sendCellarPush` hooked into `advance`/`finishAndChoose`/`doSwap`) is in App.jsx. Repo side (`sw.js` → `public/`, `notify.js` → `api/`, updated `package.json`, Supabase table via `push-setup.sql`, two Vercel env vars) is done and confirmed live by Kyle. Treat this feature as live, not experimental.
- Added a **How to Use** guide (More → How to Use), staff-facing, plus Share PDF. Content lives in one place, `GUIDE_SECTIONS`, and both the in-app page and the PDF render from it, so edit content only there. Been through several wording passes at Kyle’s request (rewritten stillage description in app’s own terms, autofill explained without the “blank fields” mechanic, bell/backup-nudge/PDF-sharing mentions stripped per his instructions, “match the pumps that are on the bar” phrasing).
- Wrote **PROJECT-INSTRUCTIONS.md** for a new Claude Project: standing workflow, validation gates, scrutiny standards, standing decisions, design system, copy rules, and a required reminder (for real changes, not simple tweaks) to refresh this file and the master file in project knowledge after big sessions.
- **Full app audit, several passes**, functional and visual, each pass smaller than the last (a good sign — the big issues are done):
  - Added Cellar Stats (most restocked, price rises, deliveries by supplier, average cask lifespan) from data already recorded.
  - Added Library archive (hide without deleting, restore any time) + a duplicate-add warning.
  - Generated PWA manifest + icons for installability (files delivered, Kyle needs to add to repo `public/` + two `index.html` lines — confirm this landed).
  - Replaced `window.alert` popups with a proper toast system matching the Undo snackbar.
  - **Fixed a real bug**: the empty Racked slot sent staff to “Add new beer” instead of letting them pull an existing beer up from In Store. Now shows “Rack from store” and a chooser scoped to `in_cellar` casks; `doSwap` handles the rack-only path (status → `racked`, not `on`) via a `toRack` flag on `swap`.
  - **Fixed a race condition**: the backup nudge could reappear after backing up if Kyle refreshed quickly, because `noteBackupTaken` relied on the general 500ms-debounced autosave. Now saves immediately.
  - Turned the “Needs Attention” strip (which Kyle found too large) into a header bell with a count badge and dropdown — same data (`attentionItems`, lifted to component scope), much less space.
  - Added Cider **Sweetness** scale (Sweet → Dry), chip selector shown only when category is Cider, in both edit surfaces; auto-filled by the AI prompt and the offline keyword fallback; now also shown in Library, Add Stock pick list, CardModal, customer Tap List, and staff Stock List (was Library-only at first, then surfaced everywhere on a later pass).
  - Unified Add Stock and Edit Beer Details fully: same fields, same order (Name first), same Category list (added Cider/Sour, no longer cask-only/conditional), same Vegan control style, same Allergens-verified control style (checkbox + descriptive sentence, chosen over the terser button for clarity on a safety-relevant field).
  - Added previous-price AND previous-supplier memory: recorded per delivery in `beer.history` (`latestPrice`/`latestSupplier` helpers), shown in Library rows and the history table, pre-filled with a “please confirm” hint when adding to cellar.
  - Fixed a real regression: the agreed Pouring/Ready terminology (from a session in late June) had silently reverted to On/Tapped somewhere along the way. Restored across status label, card badge, and the Ready badge — a reminder that standing decisions need active checking, not just documentation.
  - Small usability wins: empties-waiting count badge on both navs, numeric keypads on remaining price/ABV fields (batch review inputs had been missed), foreground refetch when the app returns from background (closes a stale-data gap between phones) with a guard so it can’t clobber an unsent local edit.
  - Copy/grammar pass: em dashes removed from app copy, several duplicate/inconsistent labels unified (“Gluten” → “Gluten status”, etc.).
- Visual-only pass at Kyle’s request: header given a subtle top-lit gradient, pump number tiles given a brass rim/inner light (small engraved-plate look), Cask/Keg/Cider dividers given a fading hairline, and the **customer Tap List masthead reframed in the brass arch motif** from the pump-badge poster. Also fixed the unlock/connection-error screens, which had been silently missing the Archivo font and bell mark because they render before the main app shell’s style block (added a small shared `FontBoot` component to fix, and to prevent recurrence in any future early-return screen).
- (Earlier, prior sessions): full colour rebrand to real merch palette, Fraunces → Space Grotesk → Archivo typography, Cider/Sour categories added, grid-blowout root cause fixed app-wide, racked IPA/Pale sorting by ABV, tasting notes rewritten to flashcard format, autofill made blank-fields-only. See below for the design system these produced.
- **Fixed a real rebrand gap**: the three original PDF exports (Stock List, customer Tap List, Allergen Sheet) were written before the colour rebrand and had been quietly left on the old navy/grey palette ever since — the on-screen app got rebranded but nobody went back for the separate colour constants inside the PDF builders. All three now use the brand teal and warm neutrals (kept a slightly darker brass than on-screen for print contrast on white paper). Deployed and confirmed by Kyle.
- Self-audit of the notification code from the previous session found it sound (busy-guards on both buttons, Supabase client accessible where called, pushes only fire on genuine on/off transitions) — noted two non-urgent code-health items: the `empties` filter (`status === “off” && !l.collected && drinkType not cider/keykeg`) is duplicated identically in 5 places rather than being one shared helper, and the app re-renders the whole tree on every keystroke (fine now, worth revisiting if typing ever feels laggy on an older phone). Neither is a bug, both are future-refactor candidates if this file keeps growing.

## Open items / things Kyle may come back to
- Confirm the PWA files (manifest.json, icon-192.png, icon-512.png, index.html lines) were actually added to the repo — asked for a while back, never explicitly confirmed done (separate from the notification setup, which IS confirmed).
- Kyle asked about changing the Home Screen icon; offered to design a new one or convert a supplied image. Nothing generated yet — pick this up if he sends an image or a direction.
- Two by Two beers (b53/b54/b55) have estimated ABVs flagged for Kyle to verify against the actual casks.
- `thecurfew.bar` custom domain and public no-login pages were discussed early on but never built.
- Free Supabase plan keeps no history — Backup & Restore screen exists for this; the backup-nudge logic (in the header bell dropdown) reminds Kyle periodically.
- Possible future refactor (not urgent): consolidate the 5 duplicated `empties` filter expressions into one helper; consider whether the single-component re-render-on-every-keystroke pattern needs addressing as the file grows past ~3,700 lines.
