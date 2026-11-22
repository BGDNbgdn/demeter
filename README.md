# Demeter

A personal **calorie & protein tracker for home cooking** that gets cooked food right.

Cooked food weighs less than raw food (water leaves) but keeps its nutrients, so 100 g of cooked chicken contains more protein than 100 g of raw. Demeter converts between raw and cooked weights for single foods **and** multi-ingredient recipes:

```
cookedPer100g = rawPer100g × rawWeightG / cookedWeightG

1,000 g raw chicken · 20 g protein / 110 kcal per 100 g raw
        → cooked down to 800 g
        → 25 g protein / 137.5 kcal per 100 g cooked
        → eat 300 g → 75 g protein · 412.5 kcal
```

It is a **Progressive Web App**: no server of its own, no account, no ads, no analytics. After the first load it works fully offline, and everything you log lives in IndexedDB on your device. Optionally it can keep several devices in sync through **your own private GitHub repository** (free) — see [Sync across devices](#sync-across-devices-optional-free).

- 900+ foods (USDA FoodData Central), raw / cooked / as-packaged variants with typical cooking yields
- Raw → cooked converter on every food, and a recipe builder (ingredients → total cooked weight → any portion)
- Daily dashboard (protein first), weekly/monthly history charts, editable log
- Fuzzy search, favorites, recents, custom foods, protein-density filters
- **Protein streak**: consecutive days with ≥ 75% of your protein goal (nothing else counts)
- **Safety nets**: undo for every delete, a 60-day *Recently deleted* list, a restore point before import/erase, recipe scaling (×1.5…), and a heads-up when an ingredient's food changed
- **Optional auto-sync** between devices via a private GitHub repo (no button — it just happens)
- JSON export/import backups (Files app / iCloud Drive), erase-all
- Optional Open Food Facts lookup (barcode scan / search) — never required

---

## Getting it on your iPhone without an Apple developer licence

You do **not** need a paid developer account, Xcode, TestFlight or re-installing every 7 days. Those limits only apply to *sideloaded native apps*. A web app installed from Safari has none of them:

1. Deploy the site once (see [Deploy](#deploy)) — it is a static site, free to host.
2. On the iPhone open the site URL **in Safari**.
3. Tap **Share → Add to Home Screen → Add**.
4. Open Demeter from the Home Screen icon. It runs full-screen, offline, like an app.

> **Important:** on iOS, the Home Screen app has its **own storage**, separate from Safari tabs. Add it to the Home Screen *before* you start logging real data. If you tried it in Safari first, use **Settings → Export** in Safari and **Import** in the installed app to carry data across.

Updates: when you deploy a new version, the installed app notices the next time it is opened with a connection and shows an **Update** banner.

## The “7-day Safari storage” caveat (why backups matter)

Safari’s Intelligent Tracking Prevention deletes script-writable storage (IndexedDB, Cache Storage, localStorage) for websites you haven’t interacted with in **7 days of Safari use**. Two things protect Demeter:

- **Installed Home Screen web apps are exempt** from that 7-day cap (WebKit counts their own days of use). This is why you should install it rather than use it in a Safari tab.
- Demeter calls `navigator.storage.persist()` on startup. Safari may or may not grant it — **Settings → Storage** shows the current status.

Even so, iOS can still clear website data if you “Clear History and Website Data”, delete the app, or run very low on storage. **Treat the JSON backup as your safety net:** Settings → *Export all data as JSON* → save to Files / iCloud Drive. Demeter reminds you every 2 weeks by default (configurable). Restore with *Import JSON backup*.

---

## Local development

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173  (service worker is disabled in dev)
npm test           # unit + integration tests (engine, database, search, backup, sync, streak, scaling…)
npm run build      # type-checks, then builds to dist/
npm run preview    # serve the production build at http://localhost:4173 (service worker active)
```

## Deploy

It is a static site (`dist/`). The `BASE_PATH` environment variable controls the URL prefix; routing uses `#/hash` URLs, so no server rewrite rules are needed.

### GitHub Pages (project site)

1. Create a GitHub repo, push this project to `main`.
2. Publish the built site to the `gh-pages` branch from your machine:

   ```bash
   npm run deploy      # builds with BASE_PATH=/<repo>/ and pushes dist/ to gh-pages
   ```
3. Repo → **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `/ (root)`** (one-time).
4. The site appears at `https://<user>.github.io/<repo>/`. Re-run `npm run deploy` for each update.

Prefer automatic deploys on every push? Copy `docs/github-pages-workflow.yml` to `.github/workflows/deploy.yml`, set **Settings → Pages → Source: GitHub Actions**, and push (pushing workflow files needs a token with the `workflow` scope or normal git credentials).

### Cloudflare Pages

Connect the repo, then: **Build command** `npm run build` · **Output directory** `dist` · no environment variables (served from `/`). Or drag-and-drop the `dist/` folder in the dashboard after `npm run build`.

### Netlify

**Build command** `npm run build` · **Publish directory** `dist`. Or drag `dist/` into the Netlify “Deploys” page.

> Your data is not on the server in any of these cases — only the app code is. Each device keeps its own data.

## Sync across devices (optional, free)

Demeter can keep your iPhone, iPad and computer in step. There is no Demeter server: your data goes to **a private repository in your own GitHub account**, and only you can read it. It is free (private repos are free on personal accounts).

### One-time setup
1. On GitHub, create a **private** repository, e.g. `demeter-data` (don't make it public — Demeter refuses to sync to a public repo).
2. Create a token for it: GitHub → Settings → Developer settings → *Fine-grained tokens* → **Generate new token** (the link in the app pre-fills the name and permission).
   - **Repository access:** *Only select repositories* → your `demeter-data` repo
   - **Permissions → Repository → Contents:** *Read and write* (Metadata read-only is added automatically)
   - Expiration: up to 1 year (put a reminder in your calendar; the app shows a clear message when it expires).
3. In Demeter: **Settings → Sync across devices**, enter `yourname/demeter-data`, paste the token, **Connect and sync**. Repeat on each device.

### How it behaves
- **Automatic, no button:** Demeter syncs when you open it, when you come back to it, a few seconds after you change something, and when the connection returns.
- **Merging:** each record carries an edit time; the newest edit wins, per record. Deleting is remembered too, so a delete on one device removes it everywhere, and *Restore* on any device brings it back. Two devices adding different things at the same time both keep their additions.
- **What syncs:** log entries, recipes, custom foods, targets, favorites and frequent-food history. *Not* synced (per device): theme, onboarding, reminder settings, and the token itself.
- **Files on GitHub:** `settings.json`, `foods.json`, `recipes.json` and one `logs/YYYY-MM.json` per month — small, human-readable JSON, one record per line, with git history for free. Only files that changed are downloaded or uploaded.
- **Importing a backup / restoring a restore point** while connected makes the cloud copy match this device; anything the file didn't contain is tombstoned (still recoverable from *Recently deleted* for 60 days).
- **Erase all local data** disconnects sync and leaves the GitHub copy alone; reconnect to pull it back.

### Security notes
- The token is stored in IndexedDB on that device only and is **never** included in JSON backups or uploaded. Use a fine-grained token limited to the one repo, so a leaked token can't touch anything else.
- On every app open Demeter checks the repo is still **private** and refuses to sync if it isn't.
- Data is plain JSON in your private repo (no extra encryption). Anyone with access to your GitHub account could read it.
- iOS web apps cannot sync in the background: a device catches up the next time it is opened.
- Free tiers and GitHub's rules change; sync uses ordinary REST API calls, well inside GitHub's normal rate limits.

## Undo, safety nets & streak

- **Undo:** deleting a log entry, recipe or custom food shows an *Undo* toast. Anything deleted stays in **Settings → Recently deleted** for 60 days (then it is removed for good).
- **Restore point:** before an import, a restore-from-restore-point, or *Erase all*, Demeter keeps a copy of everything on the device. **Settings → Restore previous data** swaps it back (and keeps the replaced data as the new restore point, so you can switch back again).
- **Scale a recipe:** in a recipe, *Scale recipe* multiplies every weight (×0.5, ×1.5, ×2, any factor, or "aim for N g cooked"). Per-100 g nutrition never changes; totals scale. Save as a new recipe (keeps your batch tracking) or scale in place.
- **Ingredient changed?** Recipes keep a snapshot of each ingredient so they never change behind your back. If you later edit the food (or an app update changes a built-in value), the recipe shows *“Chicken changed: protein 20 → 24 g — Update this recipe”*. Past log entries are never rewritten.
- **Streak:** a day counts when your protein reaches **75% of your protein target** (so 120 g for a 160 g target) — the number of meals or calories doesn't matter. Today never breaks a streak while it is still in progress. Uses your current target for past days.

## Kitchen: fridge, week plan, shopping list, protein value

The **Kitchen** tab has four views.

- **Fridge** — what you have right now. After shopping tap **Scan groceries** and beep each barcode: the camera stays open, every product is looked up (Open Food Facts, online) and goes straight into your fridge — a green "Added" appears each time. Scan the same product twice and it says "Already in your fridge". A barcode that can't be identified (offline, unknown) is still saved and shows under *Needs a name*, where you can look it up later or pick the matching food. Without a camera, type the barcode number. You can also add or remove any food by name (type in the search box, tap to flip it on/off) or use **Quick toggle** chips of your usual foods. **✕** means *ran out* (undo is one tap). An item can optionally record how many grams are left and the pack size.
- **Plan** — pick this week's recipes (× batches, in halves) and extra foods. It shows the protein and kcal per day the plan delivers against your goal, and the ingredient cost. *Copy last week's plan* in one tap.
- **Shop** — the plan's raw ingredient weights added up, minus your fridge. If the fridge has a food and you didn't record an amount, it counts as *enough*; if you did record grams, only the shortfall is listed. With a price and pack size it rounds up to whole packs and estimates the total. Tap the circle when you've got something and it moves into the fridge. **Share** copies/sends the list as text.
- **Value** — protein per euro. Add what a pack costs and weighs (from the scan sheet's *Price* button, the fridge item, a food's detail sheet, or here) and the foods are ranked by what **20 g of protein** costs. Recipes show their cost per batch, per 100 g cooked, per portion and per 20 g of protein (ingredients without a price are named; the total is then a lower bound). The currency symbol is in *Settings → Prices* (default €, per device).

Weekly review (in **History → Weekly review**): average protein vs last week, days that reached 75% of your goal, protein by day and by meal, your top protein sources, your weakest weekday over the last 8 weeks — and one concrete suggestion that only ever uses foods you actually eat. Days with nothing logged are not counted as zero; today only counts once it already reaches the threshold. Everything is computed on the device from your log.

Fridge, prices and plan are part of the data set: they sync through the same private GitHub repo (`pantry.json`, `prices.json`, `plan.json`), are included in JSON backups (schema 3; older backups still import) and ran-out/removed items sit in the 60-day tombstone window like everything else.

## Backup & restore format

*Settings → Export all data as JSON* writes a human-readable, versioned file (`demeter-backup-YYYY-MM-DD.json`):

```json
{
  "app": "Demeter",
  "schemaVersion": 3,
  "exportedAt": "2026-11-20T18:00:00.000Z",
  "counts": { "foods": 3, "recipes": 2, "logs": 120, "pantry": 12, "prices": 9, "plan": 4 },
  "data": { "foods": [], "recipes": [], "logs": [], "targets": {}, "settings": {}, "usage": [], "pantry": [], "prices": [], "plan": [] }
}
```

It contains your custom foods, recipes, log entries, fridge, prices, weekly plan, targets, settings and usage history (the built-in database ships with the app). Items in *Recently deleted* and the GitHub sync token are **not** exported. On iPhone the export opens the share sheet — choose **Save to Files**. *Import* validates the file, shows a summary, and **warns before replacing** everything on the device. A newer `schemaVersion` than the app understands is refused with a clear message. *Erase all local data* lives in the Danger zone, behind a confirmation.

## How the numbers work

- Nutrition is stored per 100 g of the food **in the state it is listed** (`raw`, `cooked` or `as-packaged`).
- **Single food, cooked:** choose *Cooked (convert)*, enter the raw and cooked weight of your batch, then how much you eat. Only a cooked weight? Demeter estimates the raw weight from the food’s typical yield (shown, with a warning). Cooked heavier than raw (rice, pasta, oats) is allowed and flagged; zero/invalid weights are rejected with a message.
- **Recipes:** raw ingredient weights are summed, then per-100 g *cooked* values come from the **total cooked weight of the dish** — the same formula applied to the whole dish. Oil added in the pan is just another ingredient. Per-ingredient cooked weights are optional; if you give them for every ingredient the total is their sum.
- **Logs are snapshots:** each log entry stores its calculated nutrition, so editing a recipe or food later never rewrites history.
- **Batches:** a recipe tracks how much of the current cooked batch you have logged (“450 g left, ≈ 1.3 portions”). *Cook again* starts a new batch.
- Calculations keep full precision internally; only displayed values are rounded (calories show one decimal in detail views: `412.5`).

The engine lives in `src/lib/engine/` and has an extensive unit-test suite (`npm test`).

### Where the food data comes from

`src/data/foods/*.json` is generated from **USDA FoodData Central (SR Legacy)** — public-domain data — plus a few clearly marked “typical label values” for packaged items USDA does not list (protein powders, bars, some sauces, plant milks…). Cooked-yield percentages come from USDA cooked-vs-raw nutrient density and standard yield tables; they are **typical**, so weigh your own batches for exact results. Packaged products vary by brand — check your label (or use the optional Open Food Facts lookup).

#### Updating / extending the food database

Spec files in `scripts/food-spec/*.mjs` map USDA records (by FDC id or a description regex) to clean names, categories, aliases and cooking yields; `manual` entries hold hand-entered values.

```bash
# 1. download + unzip the USDA SR Legacy CSV export:
#    https://fdc.nal.usda.gov/download-datasets.html  (SR Legacy → CSV)
# 2. regenerate the JSON files:
USDA_SR_DIR=/path/to/FoodData_Central_sr_legacy_food_csv_2018-04 npm run foods:build
```

The script prints warnings for patterns that did not match, ambiguous matches and implausible energy values. You can also edit the generated JSON directly.

## Replacing the icons

`public/icons/icon-source.svg` is a placeholder wheat-ear icon. Replace it with your own square artwork (SVG, or a 1024×1024 `icon-source.png`) and run:

```bash
npm run icons     # regenerates apple-touch-icon, 192, 512 and maskable PNGs
```

## Project structure

```
src/
  components/   shared UI (bottom sheets, inputs, nav, rows…)
  features/     today · foods · recipes · kitchen (fridge, plan, shop, value) · history (+ weekly review) · settings · openfoodfacts · onboarding
  lib/          engine/ (raw↔cooked, recipes, rounding) · search · logging · Open Food Facts client · cost · kitchen (fridge/plan/shopping list) · pantry (barcode → fridge) · review
  db/           IndexedDB schema (idb, v3), repository, backup/restore + validation
  lib/sync/     merge rules, GitHub client, sync engine + orchestrator (see tests for two-device scenarios)
  data/         bundled food database (JSON)
  hooks/        app store (zustand), UI store, theme
  types/        data model
  utils/        dates, ids
scripts/        build-foods.mjs + food-spec/, generate-icons.mjs
public/         icons, favicon
```

Design: a "liquid glass" look (frosted translucent cards over a soft gradient page, floating tab bar, dot-matrix numbers for protein and streak), in dark, light and automatic. Fonts (Figtree, Doto) are bundled with the app — no requests to Google. The tokens live in `src/index.css`; surfaces use the `glass` / `sheet-glass` / `bg-grad` classes.

Tech: Vite · React · TypeScript · Tailwind CSS 4 · idb · Recharts · Fuse.js · vite-plugin-pwa (Workbox) · Vitest.

## Privacy

No accounts, analytics or ads, and no Demeter server. Demeter makes network requests only if you opt in: the **optional** Open Food Facts lookup you trigger yourself (a product name or barcode goes to `world.openfoodfacts.org`; turn it off in Settings → Online features), and **optional sync** to *your own private GitHub repo* (`api.github.com`). With neither enabled, nothing ever leaves the device.

## Credits & licences

- Nutrition data: USDA FoodData Central (public domain, CC0).
- Optional product data: [Open Food Facts](https://world.openfoodfacts.org) — database under the ODbL.
- App code: yours to use and modify for personal use.

### Testing sync against real GitHub (optional)

`src/lib/sync/real.test.ts` runs the two-device scenario against the real GitHub API; it is skipped unless you provide a token and a **scratch branch** of your data repo:

```bash
DEMETER_SYNC_TOKEN=<token> DEMETER_SYNC_REPO=you/demeter-data DEMETER_SYNC_BRANCH=sync-test npx vitest run src/lib/sync/real.test.ts
```
