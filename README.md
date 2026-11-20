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

It is a **Progressive Web App**: no backend, no account, no ads, no analytics. After the first load it works fully offline, and everything you log lives in IndexedDB on your device.

- 900+ foods (USDA FoodData Central), raw / cooked / as-packaged variants with typical cooking yields
- Raw → cooked converter on every food, and a recipe builder (ingredients → total cooked weight → any portion)
- Daily dashboard (protein first), weekly/monthly history charts, editable log
- Fuzzy search, favorites, recents, custom foods, protein-density filters
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
npm test           # unit tests (engine, database, search, backup, Open Food Facts parsing)
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

## Backup & restore format

*Settings → Export all data as JSON* writes a human-readable, versioned file (`demeter-backup-YYYY-MM-DD.json`):

```json
{
  "app": "Demeter",
  "schemaVersion": 1,
  "exportedAt": "2026-11-20T18:00:00.000Z",
  "counts": { "foods": 3, "recipes": 2, "logs": 120 },
  "data": { "foods": [], "recipes": [], "logs": [], "targets": {}, "settings": {}, "usage": [] }
}
```

It contains your custom foods, recipes, log entries, targets, settings and usage history (the built-in database ships with the app). On iPhone the export opens the share sheet — choose **Save to Files**. *Import* validates the file, shows a summary, and **warns before replacing** everything on the device. A newer `schemaVersion` than the app understands is refused with a clear message. *Erase all local data* lives in the Danger zone, behind a confirmation.

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
  features/     today · foods · recipes · history · settings · openfoodfacts · onboarding
  lib/          engine/ (raw↔cooked, recipes, rounding) · search · logging · Open Food Facts client
  db/           IndexedDB schema (idb), repository, backup/restore + validation
  data/         bundled food database (JSON)
  hooks/        app store (zustand), UI store, theme
  types/        data model
  utils/        dates, ids
scripts/        build-foods.mjs + food-spec/, generate-icons.mjs
public/         icons, favicon
```

Tech: Vite · React · TypeScript · Tailwind CSS 4 · idb · Recharts · Fuse.js · vite-plugin-pwa (Workbox) · Vitest.

## Privacy

No accounts, servers, analytics or ads. The only network request Demeter can ever make is the **optional** Open Food Facts lookup you trigger yourself (a product name or barcode is sent to `world.openfoodfacts.org`). Turn it off in Settings → Online features.

## Credits & licences

- Nutrition data: USDA FoodData Central (public domain, CC0).
- Optional product data: [Open Food Facts](https://world.openfoodfacts.org) — database under the ODbL.
- App code: yours to use and modify for personal use.
