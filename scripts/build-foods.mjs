#!/usr/bin/env node
/**
 * Builds the bundled food database (src/data/foods/*.json) from:
 *   1. USDA FoodData Central "SR Legacy" CSV export (public domain / CC0)
 *   2. Hand-entered "manual" foods for packaged products USDA does not cover
 *
 * Usage:
 *   1. Download + unzip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
 *   2. USDA_SR_DIR=/path/to/FoodData_Central_sr_legacy_food_csv_2018-04 node scripts/build-foods.mjs
 *
 * Every spec file in scripts/food-spec/*.mjs exports `usda` (array of rows) and optionally `manual`.
 *   usda row:   [match, displayName, category, basis, opts?]
 *     match     number (FDC id) or string (case-insensitive regex tested against the USDA description;
 *               if several match, the shortest description wins and a warning is printed)
 *     basis     'raw' | 'cooked' | 'pack' (as-packaged)
 *     opts      { ret: percent | {kcal|protein: <cooked match>}, liquid, aliases[], serv: [[label, grams]], brand }
 *   manual row: { name, category, basis, p, c, f, kcal?, fiber?, liquid?, brand?, aliases?, serv?, note? }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srDir = process.env.USDA_SR_DIR || process.argv[2];
if (!srDir || !fs.existsSync(srDir)) {
  console.error('Set USDA_SR_DIR to the unzipped SR Legacy CSV folder.');
  process.exit(1);
}

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const rd = n => parseCSV(fs.readFileSync(path.join(srDir, n), 'utf8'));
const NUT = { 1003: 'p', 1004: 'f', 1005: 'c', 1008: 'k', 1079: 'fi' };
const nv = {};
for (const r of rd('food_nutrient.csv')) { const k = NUT[r.nutrient_id]; if (k) (nv[r.fdc_id] ??= {})[k] = parseFloat(r.amount); }
const muName = Object.fromEntries(rd('measure_unit.csv').map(m => [m.id, m.name]));
const portions = {};
for (const r of rd('food_portion.csv')) (portions[r.fdc_id] ??= []).push({ amt: parseFloat(r.amount), unit: muName[r.measure_unit_id], mod: r.modifier, desc: r.portion_description, g: parseFloat(r.gram_weight), seq: parseInt(r.seq_num || '99') });
const usdaFoods = rd('food.csv').map(f => ({ id: +f.fdc_id, desc: f.description, ...(nv[f.fdc_id] || {}), portions: (portions[f.fdc_id] || []).sort((a, b) => a.seq - b.seq) }));
const byId = new Map(usdaFoods.map(f => [f.id, f]));

const warnings = [];
function resolve(match, label) {
  if (typeof match === 'number') { const f = byId.get(match); if (!f) warnings.push(`MISSING id ${match} (${label})`); return f; }
  const re = new RegExp(match, 'i');
  const hits = usdaFoods.filter(f => re.test(f.desc));
  if (!hits.length) { warnings.push(`NO MATCH /${match}/ (${label})`); return undefined; }
  // Prefer the plain variant: penalise qualifiers the pattern did not ask for (toasted, prepared, reduced fat, ...).
  const PENALTY = ['toasted', 'prepared', 'lower fat', 'reduced', 'low sodium', 'no salt', 'with salt', 'whole wheat', 'whole-wheat', 'unenriched', 'fat free', 'nonfat', 'low fat', 'lowfat', 'sprouted', 'frozen', 'canned', 'dehydrated', 'cubed', 'dry mix', 'instant'];
  const pen = d => PENALTY.reduce((n, w) => n + (d.toLowerCase().includes(w) && !match.toLowerCase().includes(w) ? 1 : 0), 0);
  hits.sort((a, b) => pen(a.desc) - pen(b.desc) || a.desc.length - b.desc.length);
  if (hits.length > 1) warnings.push(`AMBIGUOUS /${match}/ (${label}) -> ${hits.length} hits, using "${hits[0].desc}"`);
  return hits[0];
}
const r1 = x => Math.round(x * 10) / 10;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BASIS = { raw: 'raw', cooked: 'cooked', pack: 'as-packaged' };

function cleanPortionLabel(p) {
  if (!isFinite(p.g) || p.g <= 0) return null;
  const unit = (p.unit && p.unit !== 'undetermined') ? p.unit : '';
  let label = [unit ? `${p.amt} ${unit}` : (p.amt === 1 ? '1' : String(p.amt)), p.mod || p.desc || ''].join(' ').trim().replace(/\s+/g, ' ');
  label = label.replace(/\(.*?\)/g, '').replace(/\s+,/g, ',').trim();
  if (!label || label.length > 24 || /NLEA|undetermined|bone|skin|removed|yield|includes|NFS|^\d+(\.\d+)?$|^[\d.]+ unit$|^[\d.]+ (small|medium|large)? ?cubic|\bpkg\b/i.test(label)) return null;
  return label;
}
function pickServings(f) {
  const out = []; const seen = new Set();
  for (const p of f.portions) {
    const label = cleanPortionLabel(p); if (!label) continue;
    const g = r1(p.g); const k = label + g; if (seen.has(k)) continue; seen.add(k);
    out.push({ label, grams: g }); if (out.length >= 3) break;
  }
  return out;
}

const specDir = path.join(here, 'food-spec');
const outDir = path.join(here, '..', 'src', 'data', 'foods');
fs.mkdirSync(outDir, { recursive: true });
const allIds = new Set(); let total = 0; const sanity = [];

for (const file of fs.readdirSync(specDir).filter(f => f.endsWith('.mjs')).sort()) {
  const spec = await import(pathToFileURL(path.join(specDir, file)).href);
  const foods = [];
  for (const row of spec.usda || []) {
    const [match, name, category, basisCode, opts = {}] = row;
    const u = resolve(match, name);
    if (!u) continue;
    if (u.k == null || u.p == null) { warnings.push(`INCOMPLETE nutrients (${name}) ${u.desc}`); continue; }
    let id = `usda-${u.id}`;
    if (allIds.has(id)) id = `${id}-${slug(name).slice(0, 12)}`;
    if (allIds.has(id)) { warnings.push(`DUPLICATE ${name}`); continue; }
    allIds.add(id);
    let ret = opts.ret;
    if (ret && typeof ret === 'object') {
      const key = Object.keys(ret)[0]; const c = resolve(ret[key], name + ' (retention pair)');
      const f = key === 'kcal' ? 'k' : 'p';
      ret = c && c[f] ? Math.round(((u[f] / c[f]) * 100) / 5) * 5 : undefined;
    }
    const food = {
      id, name, category, nutritionBasis: BASIS[basisCode],
      proteinPer100g: r1(u.p), carbsPer100g: r1(u.c ?? 0), fatPer100g: r1(u.f ?? 0), caloriesPer100g: Math.round(u.k),
      ...(u.fi != null && u.fi > 0 ? { fiberPer100g: r1(u.fi) } : {}),
      isLiquid: !!opts.liquid,
      ...(ret ? { defaultCookedWeightRetentionPercent: ret } : {}),
      ...(opts.brand ? { brand: opts.brand } : {}),
      ...(opts.aliases ? { aliases: opts.aliases } : {}),
      servings: (opts.serv ? opts.serv.map(([label, grams]) => ({ label, grams })) : pickServings(u)),
      usdaId: u.id,
    };
    if (!food.servings.length) delete food.servings;
    foods.push(food);
    const atw = 4 * food.proteinPer100g + 4 * food.carbsPer100g + 9 * food.fatPer100g;
    if (food.caloriesPer100g > 20 && Math.abs(atw - food.caloriesPer100g) / food.caloriesPer100g > 0.25 && !(opts.liquid && category === 'beverage')) sanity.push(`ATWATER ${name}: kcal ${food.caloriesPer100g} vs ${Math.round(atw)}`);
  }
  for (const m of spec.manual || []) {
    const id = `bi-${slug(m.name)}`;
    if (allIds.has(id)) { warnings.push(`DUPLICATE manual ${m.name}`); continue; }
    allIds.add(id);
    const kcal = m.kcal ?? Math.round(4 * m.p + 4 * m.c + 9 * m.f);
    foods.push({
      id, name: m.name, ...(m.brand ? { brand: m.brand } : {}), category: m.category, nutritionBasis: BASIS[m.basis || 'pack'],
      proteinPer100g: m.p, carbsPer100g: m.c, fatPer100g: m.f, caloriesPer100g: kcal,
      ...(m.fiber ? { fiberPer100g: m.fiber } : {}), isLiquid: !!m.liquid,
      ...(m.ret ? { defaultCookedWeightRetentionPercent: m.ret } : {}),
      ...(m.aliases ? { aliases: m.aliases } : {}),
      ...(m.serv ? { servings: m.serv.map(([label, grams]) => ({ label, grams })) } : {}),
      ...(m.note ? { note: m.note } : {}),
    });
    const atw = 4 * m.p + 4 * m.c + 9 * m.f;
    if (kcal > 20 && Math.abs(atw - kcal) / kcal > 0.3 && !m.liquid) sanity.push(`ATWATER(manual) ${m.name}: kcal ${kcal} vs ${Math.round(atw)}`);
  }
  fs.writeFileSync(path.join(outDir, file.replace(/\.mjs$/, '.json')), JSON.stringify(foods, null, 1));
  console.log(`${file}: ${foods.length} foods`);
  total += foods.length;
}
console.log(`TOTAL ${total}`);
if (warnings.length) console.log('\nWARNINGS\n' + warnings.join('\n'));
if (sanity.length) console.log('\nSANITY\n' + sanity.join('\n'));
