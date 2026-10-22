// Headless render test for the availability dashboards. Stubs the DOM, Chart.js and
// the SQL proxy, then drives every route so a bad template literal (an undefined
// variable, a missing helper) throws here instead of silently blanking the page.
import fs from 'node:fs';
import vm from 'node:vm';

const FILE = process.argv[2];
const KIND = process.argv[3] || 'sales';
const html = fs.readFileSync(FILE, 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 1) throw new Error(`expected 1 inline script, found ${scripts.length}`);

// ── DOM stub ────────────────────────────────────────────────────────────────
const written = {};
class El {
  constructor(id){ this.id = id; this._html = ''; this._text = ''; this.dataset = {}; this.classList = { add(){}, remove(){}, contains(){return false;} }; }
  set innerHTML(v){ this._html = String(v); written[this.id] = (written[this.id]||'') + this._html; }
  get innerHTML(){ return this._html; }
  set textContent(v){ this._text = String(v); }
  get textContent(){ return this._text; }
  getContext(){ return { createLinearGradient: () => ({ addColorStop(){} }) }; }
  querySelector(){ return new El(this.id + ' > *'); }
}
const els = {};
const doc = {
  getElementById: (id) => (els[id] ??= new El(id)),
  querySelectorAll: () => [],
  querySelector: (sel) => new El(sel),
  addEventListener(){},
};
const loc = { hash: '' };

// ── data stub ───────────────────────────────────────────────────────────────
const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3600e3).toISOString();
const runAt = (h) => new Date(NOW - h * 3600e3).toISOString();

// [segment, today, next business day, next 24h, next 48h, days to slot, next slot]
const TIERS = [
  ['1-10 Units', 6, 8, 6, 14, 0, iso(2)],
  ['11-20 Units', 0, 5, 0, 5, 1, iso(20)],
  ['21-50', 5, 2, 5, 7, 0, iso(5)],
  ['51-100 Units', 0, 0, 0, 0, null, null],           // fully booked
  ['101-150', 2, 9, 2, 11, 0, iso(3)],
  ['151-300', 0, 1, 0, 1, 1, iso(26)],
  ['300+', 0, 0, 0, 1, 3, iso(70)],
];
const REPS = [   // onboarding specialists, for the OB dashboard only
  ['Brandon Rios', 'AE 1-20', 0, 2, 0, 2, 1, iso(19)],
  ['Liam Delaney', 'AE 1-20', 2, 1, 2, 3, 0, iso(1)],
  ['Pedro Chinait', 'AE 1-20', 0, 0, 0, 0, null, null],
  ['Meaghan Falcone', 'AE 101-300', 1, 1, 1, 2, 0, iso(4)],
  ['Macy Holzhauer', 'SDR', 0, 0, 0, 1, 4, iso(90)],
];
const mkTier = (r, cap) => ({
  captured_at: cap, run_period: 'PM', type: 'RR', name: 'DoorLoop Demo', segment: r[0],
  avail_today: String(r[1]), avail_tomorrow: String(r[2]), avail_24h: String(r[3]),
  avail_48h: String(r[4]), days_until_available: r[5] === null ? null : String(r[5]),
  next_available_at: r[6], slots_48h_after_first: String(r[4]),
});
let CAP = runAt(1);
let latest = TIERS.map(t => mkTier(t, CAP));
const history = [];
for (const h of [1, 3, 5, 7, 9]) for (const t of TIERS) history.push(mkTier(t, runAt(h)));

// OB-shaped rows, for running the same test against the onboarding dashboard
const obSeg = TIERS.map(t => ({ captured_at: CAP, run_period:'PM', type:'RR', unit_tier:t[0], event_type:'',
  entity_count:'1', avail_24h:String(t[3]), avail_48h:String(t[4]), next_available_at:t[6],
  avg_days_to_avail:t[5]===null?null:String(t[5]), slots_48h_after_first:String(t[4]) }));
const obRep = REPS.map(r => ({ captured_at: CAP, type:'SPECIALIST', name:r[0], event_type:'Training Session (45 min)',
  unit_tier:'', calendly_username:'x-doorloop', rep_email:'x@doorloop.com', scheduling_url:'https://calendly.com/x/y',
  avail_24h:String(r[4]), avail_48h:String(r[5]), next_available_at:r[7],
  days_until_available:r[6]===null?null:String(r[6]), slots_48h_after_first:String(r[5]), slot_count:'12' }));

let calls = 0;
async function fakeFetch(url, opts){
  calls++;
  const { sql } = JSON.parse(opts.body);
  let rows;
  if (KIND === 'ob') {
    rows = /ob_calendar_segment_daily/.test(sql)
      ? (/interval/.test(sql) ? obSeg.concat(obSeg) : obSeg)
      : (/group by/i.test(sql) ? [{captured_at:CAP, best:iso(4), slots_24h:'3'}] : obRep);
  } else {
    rows = /max\(captured_at\)/.test(sql) ? latest : history;
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, rows }), text: async () => '' };
}

// ── run ─────────────────────────────────────────────────────────────────────
const sandbox = {
  window: { SQL_CONFIG: { url: '/api/sql', headers: {} }, addEventListener(){} },
  document: doc, location: loc, fetch: fakeFetch,
  Chart: class { constructor(){} destroy(){} },
  console, Intl, Date, JSON, Math, Number, String, Object, Array, Set, Map,
  setInterval: () => 0, setTimeout: (f) => f(),
  encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN,
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(scripts[0], ctx, { filename: FILE });

// Sales: the same routes at a weekday-morning snapshot and at the Friday 4pm snapshot, with
// the words each must show (morning judges today; Friday 4pm judges Monday).
const scenarios = KIND === 'ob'
  ? [{ label: 'now', cap: CAP, routes: ['', '#/tier/1-10 Units', '#/rep/Brandon Rios'], expect: [] }]
  : [
      { label: 'Thu 10am', cap: '2026-10-22T14:01:30.000Z', routes: ['', '#/tier/1-10 Units', '#/tier/300+', '#/nonsense/x'],
        expect: ['Low today', '✅ OK', 'Tomorrow', 'No slots'] },
      { label: 'Fri 4pm', cap: '2026-10-23T20:01:30.000Z', routes: ['', '#/tier/1-10 Units', '#/tier/300+'],
        expect: ["Light Monday", '✅ OK', 'Monday'] },
    ];

let failures = 0, routesRun = 0;
for (const sc of scenarios) {
  CAP = sc.cap;
  latest = TIERS.map(t => mkTier(t, CAP));
  if (KIND !== 'ob') await vm.runInContext('fetchData()', ctx);
  console.log(`${sc.label}:`);
  let overview = '';
  for (const r of sc.routes) {
    routesRun++;
    loc.hash = r;
    Object.keys(written).forEach(k => delete written[k]);
    try {
      await vm.runInContext('route()', ctx);
      await new Promise(res => setImmediate(res));
      const out = written['content'] || '';
      if (r === '') overview = out;
      const bad = /undefined|NaN|\[object Object\]/.test(out);
      if (out.length < 200 && r !== '#/nonsense/x') throw new Error('content suspiciously short: ' + out.slice(0,120));
      console.log(`  ${bad ? 'WARN' : 'OK  '} route "${r || '#/'}" rendered ${out.length} chars${bad ? '  <-- contains undefined/NaN' : ''}`);
      if (bad) { failures++; console.log('       ' + (out.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/) || [''])[0]); }
    } catch (e) {
      failures++;
      console.log(`  FAIL route "${r || '#/'}": ${e.message}`);
    }
  }
  for (const word of sc.expect) {
    const ok = overview.includes(word);
    if (!ok) failures++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} overview shows "${word}"`);
  }
}
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${routesRun} routes, ${failures} problem(s), ${calls} SQL calls`);
process.exit(failures ? 1 : 0);
