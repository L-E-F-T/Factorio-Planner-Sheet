/* Factorio Ratios UI. All the maths is in engine.js; this file is search, routing and DOM. */
(() => {
  'use strict';
  let doc = document;            // the document the app currently lives in (changes when popped out)
  const $ = s => doc.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fr:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fr:' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const fine = () => matchMedia('(pointer:fine)').matches;

  // ---------- settings ----------
  // "Your base" has no defaults to go back to: a fresh browser starts at the early game (assembler 1, stone furnace,
  // burner drill, yellow belt, no research) and from then on it is simply whatever was chosen last.
  const S = Object.assign(Engine.defaults(), { tier: 1, furnace: 'stone-furnace', drill: 'burner-mining-drill', mp: 0, rateUnit: 'lane', cap: 0 }, store.get('settings', {}));
  if (!['lane', 'belt', 's', 'min'].includes(S.rateUnit)) S.rateUnit = 'lane';
  const saveS = () => { const { machineOf, recipeOf, ...base } = S; store.set('settings', base); };   // the factory's choices are saved with the factory
  document.getElementById('ver').textContent = FD.version;

  // ---------- formatting ----------
  function fmt(x, d) {
    if (x === undefined || x === null || !isFinite(x)) return '–';
    if (d === undefined) d = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : Math.abs(x) >= 1 ? 2 : 3;
    let s = (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  const fmtIn = x => (isFinite(x) ? fmt(x) : '');
  const beltColour = () => ({ 'transport-belt': 'yellow', 'fast-transport-belt': 'red', 'express-transport-belt': 'blue' })[S.belt] || '';
  // One unit for every item amount, chosen in the strip. Fluids never ride belts, so they are always per second.
  const unitFactor = fluid => fluid ? 1 : { lane: 2 / Engine.beltRate(S), belt: 1 / Engine.beltRate(S), s: 1, min: 60 }[S.rateUnit];
  const toUnit = (perS, fluid) => perS * unitFactor(fluid);
  const fromUnit = (v, fluid) => v / unitFactor(fluid);
  // short unit name for a column header, and the long one that explains it
  const unitShort = () => ({ lane: beltColour() + ' lanes', belt: beltColour() + ' belts', s: 'items per second', min: 'items per minute' })[S.rateUnit];
  const unitWord = v => { const u = unitShort(); return fmt(v) === '1' && /s$/.test(u) ? u.slice(0, -1) : u; };   // "1 yellow lane", "2 yellow lanes"
  const unitNote = () => ({ lane: `1 lane = half a belt = ${fmt(Engine.beltRate(S) / 2)} items per second`, belt: `1 belt = ${fmt(Engine.beltRate(S))} items per second`, s: '', min: '' })[S.rateUnit];
  // amount shown in a cell: a plain number in the column's unit, or "x per second" for fluids
  const amountText = (perS, fluid) => fluid ? fmt(perS) + ' per second' : fmt(toUnit(perS, fluid));
  function buildText(x) { if (!isFinite(x) || x <= 0) return ''; const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? '' : 'build ' + c; }
  // a machine count that is shown, not typed: the whole number to build in big, and the exact count beside it when it is not whole
  function wholeText(x) { if (!isFinite(x) || x <= 0) return fmt(x > 0 ? x : 0); const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? fmt(x) : String(c); }
  function exactText(x) { if (!isFinite(x) || x <= 0) return ''; const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? '' : 'exactly ' + fmt(x); }

  const nameOf = id => (FD.items[id] && FD.items[id].name) || (FD.machines[id] && FD.machines[id].name) || (FD.recipes[id] && FD.recipes[id].name) || id;
  const iconFile = id => (FD.items[id] && FD.items[id].icon) || (FD.machines[id] && FD.machines[id].icon) || (FD.recipes[id] && FD.recipes[id].icon) || (FD.inserters[id] && FD.inserters[id].icon) || (FD.belts[id] && FD.belts[id].icon) || null;
  const BADGE = { 'assembling-machine-1': '1', 'assembling-machine-2': '2', 'assembling-machine-3': '3', 'stone-furnace': 'St', 'steel-furnace': 'S', 'electric-furnace': 'E', 'burner-mining-drill': 'B', 'electric-mining-drill': 'E' };
  const ic = (id, cls) => { const f = iconFile(id); return f ? `<img class="ic${cls ? ' ' + cls : ''}" src="icons/${f}" alt="" title="${esc(nameOf(id))}">` : ''; };
  const icb = (id, cls) => BADGE[id] ? `<span class="icw">${ic(id, cls)}<i class="bd">${BADGE[id]}</i></span>` : ic(id, cls);
  const isFluid = id => FD.items[id] && FD.items[id].type === 'fluid';
  const DRILLS = ['electric-mining-drill', 'burner-mining-drill'];
  // Where the home screen files an item: the game's crafting menu, except where the menu files an ingredient by where it
  // can also be placed: stone brick sits with the floor tiles, satellite next to the rocket silo. Both are intermediates.
  // (Concrete stays with the floor tiles: it is mostly laid as floor.)
  const REGROUP = { 'stone-brick': ['intermediate-products', 'raw-material', 'a[smelting]-d[stone-brick]'], satellite: ['intermediate-products', 'intermediate-product', 'd[rocket-parts]-e[satellite]'] };
  for (const [id, [group, subgroup, order]] of Object.entries(REGROUP)) if (FD.items[id]) Object.assign(FD.items[id], { group, subgroup, order });
  const COLOUR = { 'automation-science-pack': 'red', 'logistic-science-pack': 'green', 'military-science-pack': 'black', 'chemical-science-pack': 'blue', 'production-science-pack': 'purple', 'utility-science-pack': 'yellow', 'space-science-pack': 'white',
    'electronic-circuit': 'green circuit', 'advanced-circuit': 'red circuit', 'processing-unit': 'blue circuit', 'transport-belt': 'yellow', 'fast-transport-belt': 'red', 'express-transport-belt': 'blue' };
  const nick = id => COLOUR[id] ? ` <span class="sub">(${COLOUR[id]})</span>` : '';

  // ---------- search index ----------
  const ALIASES = {
    'electronic-circuit': ['green circuit', 'green circuits', 'green chip', 'circuit', 'circuits', 'gc', 'green', 'chips'], 'advanced-circuit': ['red circuit', 'red circuits', 'red chip', 'rc', 'red'],
    'processing-unit': ['blue circuit', 'blue circuits', 'blue chip', 'pu', 'rcu', 'blue'], 'automation-science-pack': ['red science', 'red pack', 'science'],
    'logistic-science-pack': ['green science', 'green pack', 'science'], 'military-science-pack': ['military science', 'gray science', 'grey science', 'black science', 'science'],
    'chemical-science-pack': ['blue science', 'blue pack', 'science'], 'production-science-pack': ['purple science', 'purple pack', 'science'],
    'utility-science-pack': ['yellow science', 'yellow pack', 'science'], 'space-science-pack': ['white science', 'space science', 'science', 'rocket launch'],
    'iron-gear-wheel': ['gear', 'gears', 'cog', 'cogs'], 'copper-cable': ['wire', 'wires', 'copper wire', 'cable', 'cables'], 'transport-belt': ['yellow belt', 'belt', 'belts'],
    'fast-transport-belt': ['red belt', 'fast belt'], 'express-transport-belt': ['blue belt', 'express belt'], 'assembling-machine-1': ['am1', 'assembler 1', 'assembler'],
    'assembling-machine-2': ['am2', 'assembler 2', 'assembler'], 'assembling-machine-3': ['am3', 'assembler 3', 'assembler'], 'low-density-structure': ['lds'],
    'sulfuric-acid': ['acid'], 'steel-plate': ['steel'], 'iron-plate': ['iron', 'plates', 'iron plates'], 'copper-plate': ['copper', 'plates', 'copper plates'],
    'stone-brick': ['brick', 'bricks'], 'uranium-235': ['u235', 'u-235'], 'uranium-238': ['u238', 'u-238'],
    'uranium-fuel-cell': ['fuel cell', 'fuel cells', 'nuclear fuel cell'], 'rocket-part': ['rocket', 'silo', 'rocket silo', 'rocket parts'], 'engine-unit': ['engine', 'engines', 'engine units'],
    'electric-engine-unit': ['electric engine', 'electric engines'], 'flying-robot-frame': ['frame', 'frames', 'robot frame', 'bots'], 'plastic-bar': ['plastic', 'plastics'], 'solid-fuel': ['solid fuel'],
    'rocket-fuel': ['rocket fuel'], 'bulk-inserter': ['stack inserter'], 'piercing-rounds-magazine': ['red ammo', 'piercing ammo', 'ammo'], 'firearm-magazine': ['yellow ammo', 'ammo', 'bullets', 'magazine'],
    'stone-wall': ['wall', 'walls'], 'medium-electric-pole': ['pole', 'power pole', 'poles'], 'small-electric-pole': ['pole', 'power pole', 'poles'], 'big-electric-pole': ['pole', 'power pole', 'poles'],
    'lubricant': ['lube'], 'inserter': ['yellow inserter', 'basic inserter', 'inserters'], 'fast-inserter': ['blue inserter'], 'long-handed-inserter': ['red inserter', 'long inserter'],
    'pipe': ['pipes'], 'iron-stick': ['stick', 'sticks'], 'battery': ['batteries'], 'grenade': ['grenades'], 'rail': ['rails', 'track'], 'electric-furnace': ['electric furnaces'],
    'productivity-module': ['prod module', 'prod 1'], 'speed-module': ['speed 1'], 'efficiency-module': ['eff module', 'efficiency 1'], 'concrete': ['concrete'], 'landfill': ['landfill'],
    'steam-engine': ['steam engines'], 'boiler': ['boilers'], 'solar-panel': ['solar', 'panels', 'solar panels'], 'accumulator': ['accumulators', 'accum'], 'lab': ['labs'],
    'electric-mining-drill': ['drill', 'drills', 'miner', 'miners', 'mining drill'], 'stone-furnace': ['furnace', 'furnaces', 'smelter'], 'steel-furnace': ['furnaces'],
    'offshore-pump': ['water pump', 'pump'], 'nuclear-reactor': ['reactor', 'reactors'], 'heat-exchanger': ['exchanger', 'exchangers', 'heat boiler'], 'steam-turbine': ['turbine', 'turbines'],
    'centrifuge': ['centrifuges'], 'oil-refinery': ['refinery', 'refineries'], 'chemical-plant': ['chem plant', 'chemical plants'], 'pumpjack': ['pumpjacks'],
    'radar': ['radars'], 'beacon': ['beacons'], 'satellite': ['satellites'], 'cargo-wagon': ['wagon'], 'locomotive': ['train', 'loco'],
  };
  const PRIORITY = { 'iron-plate': 9, 'copper-plate': 9, 'steel-plate': 9, 'iron-gear-wheel': 9, 'copper-cable': 9, 'electronic-circuit': 9, 'advanced-circuit': 8, 'processing-unit': 8, 'engine-unit': 8,
    'pipe': 8, 'plastic-bar': 7, 'sulfur': 7, 'sulfuric-acid': 7, 'battery': 6, 'automation-science-pack': 8, 'logistic-science-pack': 8, 'chemical-science-pack': 7, 'military-science-pack': 6,
    'production-science-pack': 6, 'utility-science-pack': 6, 'space-science-pack': 5, 'stone-brick': 6, 'low-density-structure': 6, 'rocket-fuel': 6, 'solid-fuel': 5, 'inserter': 6, 'transport-belt': 6,
    'electric-engine-unit': 5, 'flying-robot-frame': 5, 'rocket-part': 6, 'uranium-fuel-cell': 5, 'rail': 4, 'iron-stick': 1, 'iron-chest': 1, 'steel-chest': 1, 'pipe-to-ground': 1, 'wooden-chest': 1,
    'coal': 8, 'stone': 8, 'iron-ore': 8, 'copper-ore': 8, 'wood': 8, 'water': 8, 'electric-mining-drill': 5, 'stone-furnace': 5, 'steel-furnace': 4, 'electric-furnace': 5, 'lab': 5, 'boiler': 5, 'steam-engine': 5 };
  const POPULAR = ['electronic-circuit', 'iron-gear-wheel', 'copper-cable', 'engine-unit', 'advanced-circuit', 'processing-unit', 'steel-plate', 'iron-plate', 'copper-plate',
    'automation-science-pack', 'logistic-science-pack', 'chemical-science-pack', 'military-science-pack', 'production-science-pack', 'utility-science-pack',
    'plastic-bar', 'sulfur', 'sulfuric-acid', 'battery', 'low-density-structure', 'rocket-fuel', 'solid-fuel', 'pipe', 'inserter', 'transport-belt', 'stone-brick',
    'electric-engine-unit', 'flying-robot-frame', 'rocket-part', 'space-science-pack', 'uranium-fuel-cell', 'rail', 'electric-furnace', 'productivity-module'];
  // things that are not crafted (fluids, ores, uranium isotopes): a search for them goes to the card that covers them
  const ROUTE = { 'petroleum-gas': 'oil', 'light-oil': 'oil', 'heavy-oil': 'oil', 'crude-oil': 'oil', 'steam': 'steam', 'uranium-235': 'uranium', 'uranium-238': 'uranium', 'uranium-ore': 'uranium' };
  // raw things with a page of their own: what one drill (or pump) gives, and everything made straight from them
  const RESOURCES = ['wood', 'coal', 'stone', 'iron-ore', 'copper-ore', 'water'];
  const isResource = id => RESOURCES.includes(id);
  // leaves a card covers: clicking one in a chain opens the card set to that amount (field + how to convert items/s)
  const CARD_FEED = {
    'petroleum-gas': { card: 'oil', field: 'petroleum-gas' }, 'light-oil': { card: 'oil', field: 'light-oil' }, 'heavy-oil': { card: 'oil', field: 'heavy-oil' }, 'crude-oil': { card: 'oil', field: 'crude-oil' },
    'steam': { card: 'steam', field: 'boiler', v: r => r / FD.power.boiler.steam_per_s },
    'uranium-235': { card: 'uranium', field: 'uranium-235', v: r => r * 60 }, 'uranium-238': { card: 'uranium', field: 'uranium-238', v: r => r * 60 }, 'uranium-ore': { card: 'uranium', field: 'centrifuge', v: r => r / (10 / 12) },
  };
  const GROUPS = [['logistics', 'Logistics'], ['production', 'Production'], ['intermediate-products', 'Intermediate products'], ['combat', 'Combat']];

  const CARDS = {
    factory: { title: 'Your factory', desc: 'What you have making each item, and where it runs short', icon: 'assembling-machine-2', keys: ['factory', 'my factory', 'your factory', 'bottleneck', 'bottlenecks', 'short', 'shortage', 'spare', 'fulfilled', 'surplus', 'deficit', 'balance', 'ledger'] },
    steam: { title: 'Steam power', desc: 'Boilers, steam engines, water and fuel', icon: 'boiler', keys: ['steam', 'boiler', 'boilers', 'power', 'steam engine', 'steam engines', 'engines', 'coal', 'electricity', 'generator', 'water', 'offshore pump', 'water pump', 'mw'] },
    solar: { title: 'Solar power', desc: 'Panels and accumulators for the night', icon: 'solar-panel', keys: ['solar', 'accumulator', 'accumulators', 'panels', 'solar panels', 'power', 'electricity', 'accum'] },
    nuclear: { title: 'Nuclear power', desc: 'Reactors, heat exchangers, turbines, fuel cells', icon: 'nuclear-reactor', keys: ['nuclear', 'reactor', 'reactors', 'turbine', 'turbines', 'heat exchanger', 'exchangers', 'power', 'fuel cell'] },
    mining: { title: 'Mining & smelting', desc: 'Drills, furnaces and belts of ore', icon: 'electric-mining-drill', keys: ['mining', 'drill', 'drills', 'furnace', 'furnaces', 'smelting', 'smelter', 'ore', 'miner', 'miners'] },
    oil: { title: 'Oil processing', desc: 'Refineries, cracking plants, pumpjacks', icon: 'oil-refinery', keys: ['oil', 'refinery', 'refineries', 'cracking', 'petroleum', 'petrol', 'gas', 'crude', 'pumpjack', 'pumpjacks', 'heavy oil', 'light oil', 'aop', 'liquefaction', 'coal liquefaction'] },
    science: { title: 'Labs & science', desc: 'Science assemblers for a number of labs', icon: 'lab', keys: ['lab', 'labs', 'research', 'science', 'packs', 'spm'] },
    uranium: { title: 'Uranium', desc: 'Centrifuges, drills, acid, reactors fed', icon: 'uranium-235', keys: ['uranium', 'centrifuge', 'centrifuges', 'kovarex', 'enrichment', 'u235', 'u238', 'uranium ore'] },
    reference: { title: 'Belts, inserters & more', desc: 'Throughput, fuel values, poles, undergrounds', icon: 'fast-inserter', keys: ['belt', 'belts', 'inserter', 'inserters', 'fuel', 'pole', 'poles', 'underground', 'train', 'wagon', 'reference', 'throughput', 'chest', 'pipe', 'stack'] },
  };

  const INDEX = [];
  for (const [id, it] of Object.entries(FD.items)) {
    if (!((Engine.byProduct[id] && !ROUTE[id]) || isResource(id))) continue;
    INDEX.push({ kind: 'item', id, name: it.name, keys: (ALIASES[id] || []).map(a => a.toLowerCase()), pri: PRIORITY[id] || 3 });
  }
  for (const [id, c] of Object.entries(CARDS)) {
    const keys = c.keys.slice();
    for (const [item, card] of Object.entries(ROUTE)) if (card === id) keys.push(nameOf(item).toLowerCase(), ...(ALIASES[item] || []));
    INDEX.push({ kind: 'card', id, name: c.title, keys, pri: 7 });
  }
  const words = s => s.toLowerCase().split(/[\s-]+/).filter(Boolean);
  function search(q) {
    q = q.trim().toLowerCase().replace(/-/g, ' ');
    if (!q) return [];
    const toks = q.split(/\s+/);
    const sing = t => t.replace(/(ies)$/, 'y').replace(/(ches|sses|xes)$/, m => m.slice(0, -2)).replace(/s$/, '');
    const hits = [];
    for (const e of INDEX) {
      const name = e.name.toLowerCase().replace(/-/g, ' ');
      const ws = words(name);
      let sc = 0;
      const keyWords = e.keys.map(k => k.split(' '));
      if (name === q || e.keys.includes(q)) sc = 100;
      else if (name.startsWith(q)) sc = 90;
      else if (e.keys.some(k => k.startsWith(q))) sc = 84;
      else if (toks.every(t => ws.some(w => w.startsWith(t) || w.startsWith(sing(t))))) sc = 80;
      else if (toks.every(t => keyWords.some(kw => kw.some(w => w.startsWith(t) || w.startsWith(sing(t)))) || ws.some(w => w.startsWith(t) || w.startsWith(sing(t))))) sc = 74;
      else if (name.includes(q)) sc = 60;
      else if (e.keys.some(k => k.includes(q))) sc = 55;
      if (!sc) continue;
      hits.push({ e, sc: sc + e.pri });
    }
    hits.sort((a, b) => b.sc - a.sc || a.e.name.localeCompare(b.e.name));
    return hits.slice(0, 8).map(h => h.e);
  }

  /* Query grammar: [N][unit] thing [> thing].  "5 gear > engine", "2 lanes of green circuits", "10 labs", "100 solar", "2x2 reactor" */
  function parseQuery(raw) {
    let s = raw.trim().toLowerCase();
    const out = { n: null, unit: null, haveQ: '', wantQ: null, layout: null };
    const lm = s.match(/\b(\d)\s*x\s*(\d)\b/); if (lm) { out.layout = lm[1] + 'x' + lm[2]; s = s.replace(lm[0], ' '); }
    const U = '(belts?|b|lanes?|\\/s|\\/m(?:in)?|per min|per minute|per second|spm|labs?|mw)?';
    let m = s.match(new RegExp('^(\\d+(?:\\.\\d+)?)\\s*' + U + '\\s*(?:of\\s+)?(.*)$'));
    if (m) { out.n = parseFloat(m[1]); out.unit = m[2] || null; s = m[3]; }
    else { m = s.match(new RegExp('^(.*?)\\s+(\\d+(?:\\.\\d+)?)\\s*' + U + '$')); if (m) { out.n = parseFloat(m[2]); out.unit = m[3] || null; s = m[1]; } }
    if (out.unit) out.unit = out.unit.replace(/^belts?$|^b$/, 'belt').replace(/^lanes?$/, 'lane').replace(/^\/m(in)?$|^per min(ute)?$/, '/min').replace(/^per second$/, '/s').replace(/^labs?$/, 'labs');
    const parts = s.split(/\s*(?:>|->|→|\bfor\b|\bto\b|\binto\b|\bfeeding\b)\s*/);
    out.haveQ = parts[0].trim(); out.wantQ = parts[1] ? parts[1].trim() : null;
    if (!out.haveQ && out.unit) out.haveQ = { labs: 'labs', mw: 'steam power', spm: 'science' }[out.unit] || '';
    return out;
  }
  function unitToPerS(n, unit) {
    if (unit === 'belt') return n * Engine.beltRate(S);
    if (unit === 'lane') return n * Engine.beltRate(S) / 2;
    if (unit === '/s') return n;
    if (unit === '/min' || unit === 'spm') return n / 60;
    if (unit === 'labs') { const st = cardState('science'); return n * (1 + st.bonus / 100) / st.time; }
    return null;
  }

  // ---------- state ----------
  // Remembered between visits (in this browser): the "Your base" strip and what you set on each page:
  // numbers, machine choices, opened rows. "Clear all" on the Your factory page's Everything tab forgets all of it (on another
  // tab, "Clear this tab" forgets only that tab's rows); ↺ on a page forgets that page.
  // Your factory (the ledger) is the only thing saved, besides "Your base":
  //   chainMem[item]   how much of an item your machines make (scale, units per second; touched = in the factory)
  //   facUnits[id]     machines that make no single item: boilers, steam engines, solar panels, labs, refineries, cracking
  //   machineOf[item]  the machine an item is made in, in your factory (pinned when entered, changed with the row's picker)
  //   recipeOf[item]   the recipe, for the few items with a choice (solid fuel)
  //   facDismiss       shortages you dismissed from the ledger's short list and counts; the rows themselves never change
  // Everything else on a page (item what-ifs, machine picks, opened rows) lasts for this visit only.
  const mem = store.get('mem', {});
  const chainMem = mem.chains || {}, cardMem = mem.cards || {};
  const facUnits = mem.units || {}, machineOf = mem.machines || {}, recipeOf = mem.recipes || {};
  const facDismiss = new Set(mem.dismissed || []);
  S.machineOf = machineOf; S.recipeOf = recipeOf;   // the engine reads them; they are saved with the factory, not with Your base
  // your pumpjacks' yield as a fraction (1 = 100%): set on the ledger's crude oil row and saved with the factory; the engine
  // reads it through S (saveS keeps only S's own fields, so it never lands in Your base)
  Object.defineProperty(S, 'jackYield', { get: () => (cardState('oil').yield || 100) / 100 });
  function chainState(id) { return chainMem[id] || (chainMem[id] = { scale: null, anchor: null, overrides: {}, open: [] }); }
  for (const v of Object.values(chainMem)) { v.overrides = v.overrides || {}; v.open = v.open || []; }
  const cloneState = m => Object.assign({}, m, { overrides: Object.assign({}, m.overrides), open: (m.open || []).slice() });
  // a card's state: scale/anchor/touched are this visit's what-if; time and bonus (science), basic, coal and yield (oil:
  // the refineries' recipe and your pumpjacks' yield in %) and fuel (steam: what your boilers burn) are facts about the
  // factory and are kept
  const CARD_DEF = { scale: null, anchor: null, layout: '2x2', labs: 10, time: 30, bonus: 0, touched: false, basic: false, coal: false, yield: 100, fuel: 'coal' };
  function cardState(id) { const m = cardMem[id] || (cardMem[id] = {}); for (const [k, v] of Object.entries(CARD_DEF)) if (!(k in m)) m[k] = v; return m; }
  // a saved number: set on the Your factory ledger (or with "Add to factory" on a page). Only these drive other pages.
  const saved = st => !!(st && st.touched && st.scale > 0);
  const cardKept = (k, v) => (k === 'science' && ((v.time || 30) !== 30 || (v.bonus || 0) !== 0)) || (k === 'oil' && (v.basic || v.coal || (v.yield || 100) !== 100)) || (k === 'steam' && !!v.fuel && v.fuel !== 'coal');
  function persist() {
    const chains = {}, cards = {}, units = {}, machines = {}, recipes = {};
    for (const [k, v] of Object.entries(chainMem)) if (saved(v)) chains[k] = Object.assign({ scale: v.scale, anchor: v.anchor, touched: true }, v.parts && v.parts.length > 1 ? { parts: v.parts.map(p => ({ recipe: p.recipe, machine: p.machine, scale: p.scale })) } : {});
    for (const [k, v] of Object.entries(cardMem)) if (cardKept(k, v)) cards[k] = { time: v.time, bonus: v.bonus, basic: v.basic, coal: v.coal, yield: v.yield, fuel: v.fuel };
    for (const [k, n] of Object.entries(facUnits)) if (n > 0) units[k] = n;
    for (const [k, m] of Object.entries(machineOf)) if (m) machines[k] = m;
    for (const [k, r] of Object.entries(recipeOf)) if (r) recipes[k] = r;
    store.set('mem', { chains, cards, units, machines, recipes, dismissed: [...facDismiss], refs: 2 });
  }
  // earlier versions kept labs, boilers (with two steam engines each) and refineries as card counts: they are units now
  {
    const sc = cardMem.science, st = cardMem.steam, oil = cardMem.oil;
    for (const v of [sc, st]) if (v && v.saved == null && v.touched && v.scale > 0) v.saved = v.scale;
    if (sc && sc.saved > 0 && !(facUnits.lab > 0)) facUnits.lab = sc.saved;
    if (st && st.saved > 0 && !(facUnits.boiler > 0)) { facUnits.boiler = st.saved; facUnits['steam-engine'] = facUnits['steam-engine'] || st.saved * 2; }
    if (oil && oil.saved > 0 && !(facUnits.refinery > 0)) { facUnits.refinery = oil.saved; if (oil.hc > 0) facUnits['heavy-oil-cracking'] = oil.hc; if (oil.lc > 0) facUnits['light-oil-cracking'] = oil.lc; }
    for (const v of [sc, st, oil]) if (v) { delete v.saved; delete v.hc; delete v.lc; }
  }
  // refineries used to share one processing (Basic, or coal liquefaction, was a switch on the Oil card); each processing
  // now keeps its own count, so what that switch said moves to its own count, once
  if (mem.refs !== 2) { const o = cardMem.oil; if (o && facUnits.refinery > 0 && (o.basic || o.coal)) { facUnits[o.coal ? 'refinery-coal' : 'refinery-basic'] = facUnits.refinery; delete facUnits.refinery; } }
  function saveChain(id, st) { chainMem[id] = st; persist(); }
  function saveCard(id, st) { cardMem[id] = st; persist(); }
  // the home screen's gold border: an item in the factory, or a card whose machines are in it
  const CARD_UNIT = { science: 'lab', steam: 'boiler', oil: 'refinery', solar: 'solar-panel' };
  const remembered = (kind, id) => kind === 'c' ? (id === 'oil' ? refAll() > 0 : facUnits[CARD_UNIT[id]] > 0) : saved(chainMem[id]);
  // what-ifs for this visit only: a component's row you changed, a link you followed. Never saved, never marked.
  const viewMem = {};
  const clearViews = () => { for (const k of Object.keys(viewMem)) delete viewMem[k]; if (cardMem.oil) { cardMem.oil.dem = null; cardMem.oil.anchor = null; } };
  function forgetAll() { for (const m of [chainMem, cardMem, facUnits, machineOf, recipeOf]) for (const k of Object.keys(m)) delete m[k]; facDismiss.clear(); clearViews(); persist(); }
  const anyKept = () => Object.values(chainMem).some(saved) || Object.values(facUnits).some(n => n > 0) || Object.keys(machineOf).length > 0 || Object.keys(recipeOf).length > 0 || Object.entries(cardMem).some(([k, v]) => cardKept(k, v));
  function touch() { }
  // clear what older versions of this page saved (favs: the home screen's pins, taken out)
  try { Object.keys(localStorage).filter(k => /^fr:(chain:|card:|recents$|last$|seenTip$|favs$)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { }

  // ---------- router ----------
  let skipRender = false;
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  window.addEventListener('hashchange', () => { if (skipRender) { skipRender = false; return; } preview = null; render(); });
  const route = () => { const [kind, id] = location.hash.replace(/^#\/?/, '').split('/'); return { kind: kind || 'home', id }; };
  let preview = null;   // {kind,id,spec} while typing in the search box
  let cur = null;       // current item view
  let curCard = null;   // current card view
  let curRes = null;    // current raw-resource view

  let keepPlace = false;   // set while a "Your base" change redraws the page: stay where you are, leave the focus alone
  function render() {
    if (baseOpen && !keepPlace) { baseOpen = false; renderSettings(); }   // an opened "Your base" folds again on another page
    const w = doc.defaultView || window, y = keepPlace ? w.scrollY : 0;
    const v = preview || route();
    $('#back').style.visibility = v.kind === 'home' ? 'hidden' : 'visible';
    closePop();   // a machine picker belongs to the page it was opened on
    cur = null; curCard = null; curRes = null;
    if (v.kind === 'i' && isResource(v.id)) renderResource(v.id, v.spec);
    else if (v.kind === 'i' && FD.items[v.id] && Engine.byProduct[v.id] && !Engine.LEAVES.has(v.id)) { if (!preview) touch('i/' + v.id); renderItem(v.id, v.spec); }
    else if (v.kind === 'i' && CARD_FEED[v.id]) renderCard(CARD_FEED[v.id].card);   // petroleum gas, uranium…: their card
    else if (v.kind === 'c' && CARDS[v.id]) { if (!preview) touch('c/' + v.id); renderCard(v.id, v.spec); }
    else renderHome();
    try { w.scrollTo(0, y); } catch (e) { }
  }
  // a "Your base" change: save it and redraw the page without jumping to the top
  function baseChanged() { saveS(); keepPlace = true; try { renderSettings(); render(); } finally { keepPlace = false; } }

  // ---------- settings bar ----------
  // on a narrow screen "Your base" folds into one line (what it is set to, as icons) that opens the full strip
  let baseOpen = false;
  function renderSettings() {
    const seg = (name, opts, cur, lab) => `<label>${lab}<span class="seg" data-set="${name}">${opts.map(o => `<button tabindex="-1" data-v="${o.v}" class="${String(o.v) === String(cur) ? 'on' : ''}" title="${esc(o.t)}">${o.i ? icb(o.i, 'xs') : ''}<span>${o.l}</span></button>`).join('')}</span></label>`;
    const half = fmt(Engine.beltRate(S) / 2), full = fmt(Engine.beltRate(S)), c = beltColour();
    const folded = `<button class="base-sum" data-base-toggle tabindex="-1" aria-expanded="${baseOpen}" title="${baseOpen ? 'Fold this away' : 'Change what the numbers assume'}"><span class="lead">Your base:</span>${[`assembling-machine-${S.tier}`, S.furnace, S.drill, S.belt].map(i => icb(i, 'xs')).join('')}<span>${esc(unitShort())}${S.mp ? ` · mining +${S.mp}%` : ''}</span><span class="arr">${baseOpen ? '▴' : '▾'}</span></button>`;
    $('#settings').classList.toggle('open', baseOpen);
    $('#settings').innerHTML = folded + `<span class="lead">Your base:</span>` +
      seg('tier', [1, 2, 3].map(t => ({ v: t, i: 'assembling-machine-' + t, l: 'Assembler ' + t, t: 'Assembling machine ' + t })), S.tier, '') +
      seg('furnace', Engine.FURNACES.map(f => ({ v: f, i: f, l: nameOf(f).replace(' furnace', ''), t: nameOf(f) })), S.furnace, 'Furnace') +
      seg('drill', [['electric-mining-drill', 'Electric'], ['burner-mining-drill', 'Burner']].map(([f, l]) => ({ v: f, i: f, l, t: nameOf(f) })), S.drill, 'Drill') +
      seg('belt', [['transport-belt', 'Yellow'], ['fast-transport-belt', 'Red'], ['express-transport-belt', 'Blue']].map(([b, l]) => ({ v: b, i: b, l, t: nameOf(b) + ', ' + FD.belts[b].per_s + ' items per second' })), S.belt, 'Belt') +
      `<label>Mining productivity <select data-set="mp" tabindex="-1">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 300].map(p => `<option value="${p}" ${p === S.mp ? 'selected' : ''}>${p ? '+' + p + '%' : 'none'}</option>`).join('')}</select></label>` +
      seg('rateUnit', [{ v: 'lane', l: `${c} lanes (half a belt, ${half}/s)`, t: 'amounts as lanes of the chosen belt; a belt has two lanes' }, { v: 'belt', l: `${c} belts (${full}/s)`, t: 'amounts as full belts of the chosen colour' }, { v: 's', l: 'items per second', t: 'amounts as items per second' }, { v: 'min', l: 'items per minute', t: 'amounts as items per minute' }], S.rateUnit, 'Amounts in');
  }

  // ---------- search box & live preview ----------
  const q = document.getElementById('q'), strip = document.getElementById('strip');
  let hits = [], selIdx = 0, parsed = null, haveHit = null;
  function runSearch() {
    parsed = parseQuery(q.value);
    if (!parsed.haveQ && !parsed.wantQ) { hits = []; strip.hidden = true; strip.innerHTML = ''; if (preview) { preview = null; render(); } return; }
    const targetQ = parsed.wantQ !== null ? parsed.wantQ : parsed.haveQ;
    hits = targetQ ? search(targetQ) : [];
    haveHit = parsed.wantQ !== null && parsed.haveQ ? (search(parsed.haveQ)[0] || null) : null;
    selIdx = Math.min(selIdx, Math.max(0, hits.length - 1));
    showStrip();
    showPreview();
  }
  function showStrip() {
    const ch = [];
    if (parsed.n !== null) ch.push(`<span class="ch n">${fmt(parsed.n)}${parsed.unit ? ' ' + ({ belt: 'belts', lane: 'lanes', '/s': 'per second', '/min': 'per minute', labs: 'labs', spm: 'per minute', mw: 'MW' }[parsed.unit] || parsed.unit) : ''}</span>`);
    if (parsed.wantQ !== null) ch.push(haveHit ? `<span class="ch">${ic(haveHit.kind === 'card' ? CARDS[haveHit.id].icon : haveHit.id, 'xs')}${esc(haveHit.name)}</span><span>→</span>` : `<span class="ch">?</span><span>→</span>`);
    strip.innerHTML = (ch.length ? `<span class="parse">${ch.join('')}</span>` : '') +
      (hits.length ? hits.map((e, i) => `<span class="hit ${i === selIdx ? 'sel' : ''}" data-i="${i}">${ic(e.kind === 'card' ? CARDS[e.id].icon : e.id, 'sm')}<span class="nm">${i === selIdx ? '<kbd>↵</kbd>' : ''}${esc(e.name)}</span></span>`).join('') : '<span class="sub">nothing called that</span>');
    strip.hidden = false;
    // on a narrow screen the suggestions are one line that scrolls sideways: keep the chosen one in sight
    const sel = strip.querySelector('.hit.sel'); if (sel && strip.scrollWidth > strip.clientWidth) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function showPreview() {
    if (!hits.length) return;
    const e = hits[selIdx];
    const spec = { n: parsed.n, unit: parsed.unit, have: haveHit && haveHit.kind === 'item' ? haveHit.id : null, layout: parsed.layout, haveQ: parsed.haveQ, wantQ: parsed.wantQ };
    preview = { kind: e.kind === 'card' ? 'c' : 'i', id: e.id, spec };
    render();
  }
  function commitPreview(focusBox) {
    if (!preview) return;
    const p = preview; preview = null;
    const hash = '#' + p.kind + '/' + p.id;
    if (p.kind === 'i' && cur && cur.id === p.id && cur.view) viewMem[cur.id] = cur.view;
    if (p.kind === 'i' && curRes && curRes.id === p.id && curRes.view) viewMem[curRes.id] = curRes.view;
    if (p.kind === 'c' && p.id === 'oil' && curCard && curCard.id === 'oil' && curCard.view) { const st = cardState('oil'); st.dem = curCard.view.dem; st.anchor = curCard.view.anchor; }
    touch(p.kind + '/' + p.id);
    if (location.hash !== hash) { skipRender = true; location.hash = hash; }
    $('#back').style.visibility = 'visible';
    if (focusBox) { const box = $('#main input.num[data-focus]') || $('#main input.num'); if (box) { box.focus(); box.select(); } }
  }
  q.addEventListener('input', runSearch);
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey)) {
      if (!hits.length) return; e.preventDefault();
      selIdx = (selIdx + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : hits.length - 1)) % hits.length;
      showStrip(); showPreview();
    } else if (e.key === 'Enter') { e.preventDefault(); if (preview) commitPreview(fine()); else if (hits.length) { showPreview(); commitPreview(fine()); } if (!fine()) q.blur(); }   // a phone's keyboard goes away
    else if (e.key === 'Escape') { e.preventDefault(); if (q.value) { q.value = ''; hits = []; strip.hidden = true; preview = null; render(); } else { q.blur(); back(); } }
    else if (e.key === 'Tab' && preview) { commitPreview(false); }
  });
  strip.addEventListener('mousedown', e => { const h = e.target.closest('.hit'); if (h) { e.preventDefault(); selIdx = Number(h.dataset.i); showStrip(); showPreview(); commitPreview(false); if (!fine()) q.blur(); } });
  function back() { if (route().kind === 'home') return; if (history.length > 1) history.back(); else go('#'); }

  function bindDoc(d) {
    d.addEventListener('keydown', e => {
      const t = e.target;
      if (t && t.matches && t.matches('input,select,textarea')) {
        if (t.matches('input.num')) {
          if (e.key === 'Escape') { e.preventDefault(); if (t.dataset.orig !== undefined && t.value !== t.dataset.orig) { t.value = t.dataset.orig; t.dispatchEvent(new Event('input', { bubbles: true })); } else t.blur(); }
          else if (e.key === 'Enter') { e.preventDefault(); if (fine()) t.select(); else t.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = parseFloat(t.value) || 0; const step = e.shiftKey ? 10 : 1; const nv = Math.max(0, (e.key === 'ArrowUp' ? v + step : v - step)); t.value = fmtIn(nv); t.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); closePop(); back(); }
      else if (e.key.length === 1 && e.key !== ' ') { q.focus(); q.select(); }
    });
    d.addEventListener('click', e => {
      const popCtx = () => !popEl ? null : cur ? (popEl.dataset.block === cur.id ? { id: cur.id, st: cur.st } : null) : (curRes && curRes.blocks[popEl.dataset.block]) || null;
      const pm = e.target.closest('[data-pick-m]');
      if (pm && popEl) { const c = popCtx(); if (!c) return; const path = popEl.dataset.path; if (pm.dataset.pickM) c.st.overrides['m:' + path] = pm.dataset.pickM; else delete c.st.overrides['m:' + path]; saveChain(c.id, c.st); closePop(); rerender(); return; }
      const pr = e.target.closest('[data-pick-r]');
      if (pr && popEl) { const c = popCtx(); if (!c) return; c.st.overrides['r:' + popEl.dataset.path] = pr.dataset.pickR; saveChain(c.id, c.st); closePop(); rerender(); return; }
      const fm = e.target.closest('[data-fac-m]'); if (fm && popEl && popEl.dataset.facItem) { facSetMachine(popEl.dataset.facItem, fm.dataset.facM, null, popEl.dataset.part); return; }
      const fr = e.target.closest('[data-fac-r]'); if (fr && popEl && popEl.dataset.facItem) { facSetMachine(popEl.dataset.facItem, null, fr.dataset.facR, popEl.dataset.part); return; }
      const rto = e.target.closest('[data-ref-to]'); if (rto && popEl && popEl.dataset.refFrom) { refMove(popEl.dataset.refFrom, rto.dataset.refTo); return; }
      if (!e.target.closest('.pop') && !e.target.closest('[data-popover]') && !e.target.closest('[data-fac-pick]') && !e.target.closest('[data-ref-pick]')) closePop();
    });
  }
  bindDoc(document);
  window.addEventListener('focus', () => { const a = doc.activeElement; if (a && a.matches && a.matches('input.num')) a.select(); else if (fine() && !(a && a.matches && a.matches('input,select'))) { q.focus(); q.select(); } });
  document.getElementById('back').addEventListener('click', back);
  document.getElementById('home').addEventListener('click', () => { q.value = ''; strip.hidden = true; preview = null; go('#'); });
  document.getElementById('fac').addEventListener('click', () => { q.value = ''; strip.hidden = true; preview = null; go('#c/factory'); });

  // ---------- home ----------
  // every item with a recipe, in the game's crafting-menu order (group, subgroup, item order)
  const subOrder = sg => (FD.subgroups[sg] ? FD.subgroups[sg][1] : 'z') + '|' + sg;
  const gameOrder = (a, b) => { const A = FD.items[a], B = FD.items[b]; return subOrder(A.subgroup).localeCompare(subOrder(B.subgroup)) || (A.order || '').localeCompare(B.order || '') || A.name.localeCompare(B.name); };
  // the same order across groups (Logistics, Production, Intermediate products, Combat), for lists that mix them
  const groupRank = id => FD.groupOrder[FD.items[id].group] || 'z';
  const fullOrder = (a, b) => groupRank(a).localeCompare(groupRank(b)) || gameOrder(a, b);
  const isSmelted = id => !!Engine.byProduct[id] && FD.recipes[Engine.byProduct[id][0]].cat === 'smelting';
  const productOrder = (a, b) => ((isSmelted(b) ? 1 : 0) - (isSmelted(a) ? 1 : 0)) || fullOrder(a, b);   // plates and bricks first
  const makeable = Object.keys(FD.items).filter(id => FD.items[id].type !== 'fluid' && ((Engine.byProduct[id] && !ROUTE[id]) || isResource(id))).sort(gameOrder);
  // what each item is an ingredient of
  const usedIn = {};
  for (const r of Object.values(FD.recipes)) {
    for (const [ing] of r.in) for (const [out] of r.out) {
      if (out === ing || !FD.items[out] || !Engine.byProduct[out] || ROUTE[out]) continue;
      (usedIn[ing] = usedIn[ing] || new Set()).add(out);
    }
  }
  // a chip that opens item `o`. `from` is the item it is made with: once an amount of `from` has been set on
  // this page, the chip opens `o` at the size that amount feeds
  const useChip = o => `<button class="chip2" data-go="#i/${o}" tabindex="-1" title="Open ${esc(nameOf(o))}">${ic(o, 'sm')}${esc(nameOf(o))}</button>`;
  function usedInHtml(id) {
    const list = [...(usedIn[id] || [])].sort(fullOrder);
    const chips = list.map(useChip);
    if (SCI.has(id)) chips.unshift(`<button class="chip2" data-go="#c/science" tabindex="-1">${ic('lab', 'sm')}Labs</button>`);
    return chips.length ? `<h2>Used in</h2><div class="chips">${chips.join('')}</div>` : '';
  }
  function renderHome() {
    doc.title = 'Factorio Ratios';
    const chip = id => FD.items[id] ? `<button class="chip2${remembered('i', id) ? ' mem' : ''}" data-go="#i/${id}" tabindex="-1"${remembered('i', id) ? ' title="In your factory"' : ''}>${ic(id, 'sm')}${esc(nameOf(id))}</button>` : '';
    $('#main').innerHTML = `
      <div class="cards">${Object.entries(CARDS).filter(([id]) => id !== 'factory').map(([id, c]) => `<button class="card${remembered('c', id) ? ' mem' : ''}" data-go="#c/${id}" tabindex="-1"${remembered('c', id) ? ' title="In your factory"' : ''}>${ic(c.icon, 'lg')}<span><span class="t">${esc(c.title)}</span><br><span class="d">${esc(c.desc)}</span></span></button>`).join('')}</div>
      <h3>Raw resources</h3><div class="chips">${RESOURCES.map(chip).join('')}</div>
      ${GROUPS.map(([g, title]) => { const ids = makeable.filter(id => (FD.items[id].group || 'other') === g); return ids.length ? `<h3>${esc(title)}</h3><div class="chips">${ids.map(chip).join('')}</div>` : ''; }).join('')}
      ${(() => { const rest = makeable.filter(id => !GROUPS.some(([g]) => (FD.items[id].group || 'other') === g)); return rest.length ? `<h3>Other</h3><div class="chips">${rest.map(chip).join('')}</div>` : ''; })()}`;
  }

  // ---------- item chain view (a table: Item | Machines making it | Amount) ----------
  function findNode(tree, item) { let found = null; Engine.walk(tree, n => { if (!found && n.item === item && n !== tree) found = n; }); return found; }
  function supply(item, kRate) {
    const res = FD.resources[item];
    const mp = 1 + S.mp / 100;
    if (res && res.cat === 'basic-solid') {   // the drill chosen for this ore in your factory, else Your base's (fluid ores: electric only)
      const pick = S.machineOf[item], id = res.fluid ? 'electric-mining-drill' : DRILLS.includes(pick) ? pick : S.drill, d = FD.machines[id];
      return { id, k: kRate / (d.speed / res.time * mp) };
    }
    if (item === 'crude-oil') return { id: 'pumpjack', k: kRate / (FD.resources['crude-oil'].amount * mp * S.jackYield), note: `at ${fmt(S.jackYield * 100)}% yield` };
    if (item === 'water') return { id: 'offshore-pump', k: kRate / FD.power.offshore_pump.per_s };
    if (item === 'steam') return { id: 'boiler', k: kRate / FD.power.boiler.steam_per_s };
    return null;
  }
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  // what a resource page opens at: one lane of it (one pump for water)
  function resDefault(id) { const sup = supply(id, 1); return isFluid(id) && sup ? 1 / sup.k : Engine.beltRate(S) / 2; }
  const SCI = new Set(['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack', 'space-science-pack']);

  // the "Machines making it" cell: a count box, "build N", and the machine (a picker when there is a choice)
  // the small ↺ that sits by a value moved off its default and puts it back; hidden until then
  const undoBtn = (key, show) => `<button class="undo" data-undo="${esc(key)}" tabindex="-1" title="Back to the starting value" aria-label="Back to the starting value"${show ? '' : ' hidden'}>↺</button>`;
  const machCell = (path, k, R, machineId, pickable, note, focus, undo) =>
    `<div class="td mach" data-label="# machines making it"><input class="num" inputmode="decimal" data-path="${esc(path)}" data-k="${k}" data-kind="mach" value="${fmtIn(k * R)}" aria-label="number of ${esc(nameOf(machineId))}"${focus ? ' data-focus="1"' : ''}>${undoBtn('scale', undo)}<span class="build" data-k="${k}" data-kind="build">${buildText(k * R)}</span>` +
    (pickable ? `<button class="mbtn can" data-popover="${esc(path)}" tabindex="-1" title="Use a different machine for this row">${icb(machineId)}<span class="mname">${esc(nameOf(machineId))}</span><span class="arr">▾</span></button>` : `<span class="mbtn">${icb(machineId)}<span class="mname">${esc(nameOf(machineId))}${note ? ' <span class="sub">' + esc(note) + '</span>' : ''}</span></span>`) + `</div>`;
  const amtCell = (kRate, R, fluid) => `<div class="td amt" data-label="amount${fluid ? '' : ', ' + esc(unitShort())}"><span class="rate" data-k="${kRate}" data-kind="rate" data-fluid="${fluid ? 1 : 0}">${amountText(kRate * R, fluid)}</span></div>`;
  const header = (first) => `<div class="th">${first}</div><div class="th"># Machines making it</div><div class="th amth">Amount<span class="u">in ${esc(unitShort())}</span>${unitNote() ? `<span class="uu">${esc(unitNote())}</span>` : ''}</div>`;

  function renderItem(id, spec) {
    const st = preview ? cloneState(chainState(id)) : chainState(id);   // a preview must not change what is remembered
    const tree = Engine.build(id, S, st.overrides);
    const nodes = {}; Engine.walk(tree, n => { nodes[n.path] = n; });
    const tot = Engine.totals(tree, S);
    const def = tree.kMach ? 1 / tree.kMach : 1;   // 1 machine
    let note = '', view = null;
    if (spec && spec.n !== null) {   // a query ("8 gear", "5 iron plate > engine") is a what-if for this page; only the ledger saves
      let n = tree;
      if (spec.have && spec.have !== id) { n = findNode(tree, spec.have); if (!n) { note = `<div class="note">${esc(nameOf(spec.have))} is not used anywhere in ${esc(nameOf(id))}. Showing ${esc(nameOf(id))} on its own.</div>`; n = tree; } }
      // "5 iron plate > engine": the 5 furnaces cover every place iron plate appears in the chain, not just the first
      const t = itemTotals(tree, n.item);
      const asRate = unitToPerS(spec.n, spec.unit);
      let scale = null;
      if (asRate !== null) scale = asRate / t.kRate;
      else if (!n.leaf && t.kMach > 0) scale = spec.n / t.kMach;
      else if (n.leaf) { const s = supply(n.item, 1); if (s) scale = spec.n / (t.kRate * s.k); }
      if (scale > 0) { view = { scale, anchor: { path: n.path, kind: asRate !== null ? 'rate' : 'mach' } }; if (!preview) viewMem[id] = view; }
      if (t.places > 1) note += `<div class="note">${esc(nameOf(n.item))} is needed in ${t.places} places in this chain; what you typed is split between them.</div>`;
    } else if (spec && spec.have && spec.have !== id && !findNode(tree, spec.have)) note = `<div class="note">${esc(nameOf(spec.have))} is not used anywhere in ${esc(nameOf(id))}.</div>`;
    // What the page shows: a what-if made here this session, else the item's number in your factory, else the tightest
    // factory component in its chain, else 1 machine.
    const d = driver(tree, id);
    const base = st.touched && st.scale > 0 ? st.scale : d ? d.limit : def;
    const v = view || viewMem[id];
    const mode = v ? 'view' : st.touched && st.scale > 0 ? 'own' : d ? 'driven' : 'default';
    const R = v ? v.scale : base;
    const anchor = v ? v.anchor : mode === 'own' ? (st.anchor || { path: tree.path, kind: 'mach' }) : mode === 'driven' ? { path: d.path, kind: 'mach' } : { path: tree.path, kind: 'mach' };
    cur = { id, tree, nodes, tot, st, scale: R, base, mode, drivenBy: d, view };
    // the row that matters must be on screen: open the rows above it
    if (anchor.path !== tree.path) { const parts = anchor.path.split('>'); for (let i = 2; i < parts.length; i++) { const p = parts.slice(0, i).join('>'); if (nodes[p] && !st.open.includes(p)) st.open.push(p); } }
    const fs = { open: st.open, anchor, touched: mode === 'view' };   // the ↺ drops a what-if; the ledger owns saved numbers
    const sized = mode === 'driven' ? `<div class="sub">Sized to your factory: limited by ${esc(savedText(d.item, d.rate, true))}.</div>` : '';
    const rec = FD.recipes[tree.recipe];
    const perCraft = rec.out.find(o => o[0] === id)[1];
    const recipeLine = rec.cat === 'launch'
      ? `Made by launching a rocket: <span class="nw">100 ${ic('rocket-part', 'xs')} rocket parts</span> + <span class="nw">1 ${ic('satellite', 'xs')} satellite</span> → 1,000 packs.`
      : `Recipe: ${rec.in.map(([i, a]) => `<span class="nw">${fmt(a)} ${ic(i, 'xs')} ${esc(nameOf(i))}</span>`).join(' + ')} → <span class="nw">${fmt(perCraft)} ${ic(id, 'xs')} ${esc(nameOf(id))}</span>, ${fmt(rec.time)} s per craft.`;
    const bump =tree.fluidBump ? `<div class="note">This recipe needs a fluid, so it runs in Assembling machine 2 even though Assembler 1 is selected.</div>` : '';
    // science: labs row
    let labsRow = '';
    if (SCI.has(id)) {
      const sc = cardState('science');
      const kLabs = sc.time / (1 + sc.bonus / 100);   // labs per 1 pack/s
      labsRow = `<div class="tr" style="--d:1"><div class="td item"><span class="exp none"></span>${ic('lab')}<span class="nmtxt"><b>Labs</b> it keeps busy<div class="sub">on a technology that shows <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === sc.time ? 'selected' : ''}>${t} s</option>`).join('')}</select>${undoBtn('sci:time', sc.time !== 30)} next to its science packs${sc.bonus ? ', with +' + sc.bonus + '% lab speed research' : ''}</div></span></div>` +
        `<div class="td mach" data-label="labs"><input class="num" inputmode="decimal" data-path="labs" data-k="${kLabs}" data-kind="mach" value="${fmtIn(kLabs * R)}" aria-label="labs"><span class="build" data-k="${kLabs}" data-kind="build">${buildText(kLabs * R)}</span><span class="mbtn">${ic('lab')}<span class="mname">Lab</span></span></div><div class="td amt"></div></div>`;
    }
    const focusPath = mode === 'driven' ? tree.path : anchor.path;   // Enter lands on the top row, even when a component sizes the page
    $('#main').innerHTML = `
      <h1>${ic(id, 'lg')}<span class="ttl">${esc(nameOf(id))}${nick(id)}<div class="sub">${recipeLine}</div>${sized}</span>
        ${facBtn(st, R, mode)}</h1>
      ${note}${bump}
      <div class="tbl" id="tree">${header('Item')}${rowHtml(tree, 0, R, fs, focusPath)}${labsRow}<div class="tr sep"><div class="td">needs</div></div>${tree.children.map(c => subtree(c, 1, R, fs, focusPath)).join('')}</div>
      <div class="summary" id="summary"><span class="lead">Whole chain:</span>${summaryHtml(tot, R)}</div>
      ${usedInHtml(id)}`;
    const an = nodes[anchor.path];
    let sub = '';
    if (mode === 'driven') sub = ' · limited by ' + savedText(d.item, d.rate, true);
    else if (an && an !== tree) {   // the tab title names what was set, over every place the item appears, in the page's unit
      const t = itemTotals(tree, an.item), fl = isFluid(an.item);
      if (anchor.kind === 'rate') { const v2 = toUnit(t.kRate * R, fl); sub = ` · ${fmt(v2)} ${fl ? 'per second' : unitWord(v2)} of ${nameOf(an.item)}`; }
      else { const s = an.leaf ? supply(an.item, 1) : null; const m = an.leaf ? (s ? t.kRate * R * s.k : null) : t.kMach * R; if (m !== null) sub = ` · ${fmt(m)} ${nameOf(an.leaf ? s.id : an.machine).toLowerCase()}s making ${nameOf(an.item)}`; }
    }
    doc.title = `${nameOf(id)}${sub} – Factorio Ratios`;
    if (!preview && !keepPlace && fine() && doc.activeElement !== q) { const inp = $('#tree input.num[data-focus]') || $('#tree input.num'); if (inp) { inp.focus(); inp.select(); } }
  }
  // the button that puts a page's number into the ledger: add, update, or (when it already matches) a link to the ledger
  function facBtn(st, R, mode) {
    const inFac = st.touched && st.scale > 0;
    if (inFac && near(R, st.scale)) return `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="This number is in your factory; open the ledger">In your factory ✓</button>`;
    return `<button class="iconbtn sm${mode === 'view' ? ' cta' : ''}" data-tofactory tabindex="-1" title="${inFac ? 'Make this the number in your factory' : 'Add this item, at this number, to your factory'}">${inFac ? 'Update in factory' : '+ Add to factory'}</button>`;
  }
  // the same for a card's count (labs, or boilers): the ledger's number against what the card shows now
  const cardHave = id => ['science', 'steam'].includes(id) && facUnits[CARD_UNIT[id]] > 0 ? facUnits[CARD_UNIT[id]] : 0;
  function cardFacBtn(id, n) {
    const have = cardHave(id), st = cardState(id);
    if (have > 0 && near(n, have)) return `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="This count is in your factory; open the ledger">In your factory ✓</button>`;
    return `<button class="iconbtn sm${st.touched ? ' cta' : ''}" data-tofactory-card="${id}" tabindex="-1" title="${have > 0 ? 'Make this the count in your factory' : 'Put this count into your factory'}">${have > 0 ? 'Update in factory' : '+ Add to factory'}</button>`;
  }
  const cardCount = (id, def, R) => R;   // labs or boilers shown on the card
  // Your factory: the saved numbers of the components in a chain. The tightest one decides how much of the item can be made.
  function driver(tree, id) {
    let best = null; const seen = new Set();
    Engine.walk(tree, n => {
      if (n === tree || n.item === id || seen.has(n.item)) return; seen.add(n.item);
      const m = chainMem[n.item]; if (!(m && m.touched && m.scale > 0)) return;
      const t = itemTotals(tree, n.item); if (!(t.kRate > 0)) return;
      const limit = m.scale / t.kRate;          // root rate this component's number allows
      if (!best || limit < best.limit) best = { item: n.item, limit, path: n.path, rate: m.scale };
    });
    return best;
  }
  // a saved number in words: "8 × Assembling machine 2" (short) or "8 × Assembling machine 2 making iron gear wheels"
  function savedText(item, rate, sentence) {
    const fl = isFluid(item);
    if (!isResource(item) && Engine.byProduct[item]) {
      const t = Engine.build(item, S, chainState(item).overrides);
      if (t.kMach > 0) { const s = `${fmt(t.kMach * rate)} × ${nameOf(t.machine)}`; return sentence ? `${s} making ${nameOf(item).toLowerCase()}` : s; }
    }
    const sup = supply(item, 1);   // a resource counts in drills (or pumps), like everything else counts in machines
    if (sup) { const s = `${fmt(sup.k * rate)} × ${nameOf(sup.id)}`; return sentence ? `${s} ${fl ? 'pumping' : 'mining'} ${nameOf(item).toLowerCase()}` : s; }
    const v = toUnit(rate, fl), s = `${fmt(v)} ${fl ? 'per second' : unitWord(v)}`;
    return sentence ? `${s} of ${nameOf(item).toLowerCase()}` : s;
  }
  // what a chain needs of one item over every place it appears: units/s and machines per 1 root unit/s, and how many places
  function itemTotals(tree, item) {
    const t = { kRate: 0, kMach: 0, places: 0 };
    Engine.walk(tree, m => { if (m.item === item) { t.kRate += m.kRate; t.kMach += m.leaf ? 0 : m.kMach; t.places++; } });
    return t;
  }
  // ---------- raw-resource view: what one drill gives, then everything made straight from it ----------
  const originText = item => item === 'wood' ? 'from trees' : /oil|petroleum/.test(item) ? 'from refineries' : item.startsWith('uranium-2') ? 'from centrifuges' : '';
  function renderResource(id, spec) {
    cur = null; curCard = null;
    const fluid = isFluid(id);
    const st = preview ? cloneState(chainState(id)) : chainState(id);   // scale = units of the resource per second: its saved number
    const sup = supply(id, 1);                        // {id, k}: machines per 1 unit/s, or null for wood
    const def = resDefault(id);
    let view = null;
    if (spec && spec.n !== null) {   // "2 lanes of stone": a what-if for this page; only the ledger saves
      const perS = unitToPerS(spec.n, spec.unit);
      let scale = null, kind = 'rate';
      if (perS !== null) scale = perS; else if (sup) { scale = spec.n / sup.k; kind = 'mach'; }
      if (scale > 0) { view = { scale, anchor: { path: id, kind } }; if (!preview) viewMem[id] = view; }
    }
    // One number runs this page: the supply of the resource. The first row is that supply (its number in your factory, or
    // one lane); every item below is sized as if all of it went to that item. Any box you change moves the supply for now.
    const v = view || viewMem[id];
    const base = st.touched && st.scale > 0 ? st.scale : def;
    const mode = v ? 'view' : st.touched && st.scale > 0 ? 'own' : 'default';
    const Rs = v ? v.scale : base;
    const anchor = v ? v.anchor : mode === 'own' && st.anchor ? st.anchor : { path: id, kind: sup ? 'mach' : 'rate' };
    const showU = mode === 'view';
    const focusPath = anchor.path;
    const blocks = { [id]: { id, st, nodes: { [id]: { kRate: 1 } }, tree: null, need: 1 } };
    const focusTop = focusPath === id, focusRate = focusTop && anchor.kind === 'rate';
    const topMach = sup ? machCell(id, sup.k, Rs, sup.id, false, sup.note, focusTop && !focusRate, focusTop && !focusRate && showU) : `<div class="td mach" data-label="# machines making it"><span class="sub">${originText(id)}</span></div>`;
    const topAmt = `<div class="td amt" data-label="amount${fluid ? '' : ', ' + esc(unitShort())}"><input class="num" inputmode="decimal" data-path="${id}" data-k="1" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${fmtIn(toUnit(Rs, fluid))}" aria-label="amount of ${esc(nameOf(id))}"${focusTop && (focusRate || !sup) ? ' data-focus="1"' : ''}>${undoBtn('scale', focusTop && (focusRate || !sup) && showU)}${fluid ? '<span class="unit">per second</span>' : ''}</div>`;
    const topRow = `<div class="blk" data-block="${id}"><div class="tr product" data-path="${id}"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(id)}<span class="nmtxt"><b>${esc(nameOf(id))}</b></span></div>${topMach}${topAmt}</div></div>`;
    const products = [...(usedIn[id] || [])].sort(productOrder);
    const line = `<div class="tr line"><div class="td"><span class="rule"></span></div></div>`;
    const blockHtml = products.map(p => {
      const bst = chainState(p);                      // the product's own machine choices apply here too
      const tree = Engine.build(p, S, bst.overrides);
      const nodes = {}; Engine.walk(tree, n => { nodes[n.path] = n; });
      const need = itemTotals(tree, id).kRate;        // units of the resource per 1 product/s, over the product's whole chain
      if (!(need > 0)) return '';
      blocks[p] = { id: p, st: bst, nodes, tree, need };
      const Rb = Rs / need, fs = { open: [], anchor, touched: showU };
      return line + `<div class="blk" data-block="${p}">${rowHtml(tree, 0, Rb, fs, focusPath, { noExp: true, rootLink: true })}${tree.children.filter(c => c.item !== id).map(c => rowHtml(c, 1, Rb, fs, focusPath, { noExp: true })).join('')}</div>`;
    }).join('');
    // one step further: what those items go into
    const further = products.map(p => { const list = [...(usedIn[p] || [])].filter(o => o !== id).sort(fullOrder); return list.length ? `<h3>${ic(p, 'xs')} ${esc(nameOf(p))} is used in</h3><div class="chips">${list.map(useChip).join('')}</div>` : ''; }).join('');
    curRes = { id, st, blocks, scale: Rs, base, mode, view };
    const nm = nameOf(id).toLowerCase();
    const intro = (sup ? `${fluid ? 'Pumped' : 'Mined'}, not crafted. One ${esc(nameOf(sup.id).toLowerCase())} gives ${fmt(1 / sup.k)} ${esc(nm)} per second${!fluid && S.mp ? ' with +' + S.mp + '% mining productivity' : ''}.` : `From trees, not crafted: no machine makes ${esc(nm)}.`) +
      (products.length ? ` Each item below is made with all of the ${esc(nm)} in the first row.` : '');
    $('#main').innerHTML = `
      <h1>${ic(id, 'lg')}<span class="ttl">${esc(nameOf(id))}<div class="sub">${intro}</div></span>
        ${facBtn(st, Rs, mode)}</h1>
      <div class="tbl" id="tree">${header('Item')}${topRow}${blockHtml}</div>
      ${further ? `<h2>Made from those</h2>${further}` : ''}`;
    doc.title = `${nameOf(id)}${mode !== 'default' ? ' · ' + savedText(id, Rs) : ''} – Factorio Ratios`;
    if (!preview && !keepPlace && fine() && doc.activeElement !== q) { const inp = $('#tree input.num[data-focus]') || $('#tree input.num'); if (inp) { inp.focus(); inp.select(); } }
  }
  // which chain an element belongs to: the page's chain, or one block of a resource page
  function ctxOf(el) {
    if (cur) return { id: cur.id, st: cur.st, nodes: cur.nodes, root: $('#main'), scale: cur.scale };
    if (curRes) { const b = el.closest('[data-block]'); const blk = b && curRes.blocks[b.dataset.block]; if (blk) return { id: blk.id, st: blk.st, nodes: blk.nodes, root: b, need: blk.need, scale: curRes.scale / blk.need }; }
    return null;
  }
  const rerender = () => { if (cur) renderItem(cur.id); else if (curRes) renderResource(curRes.id); };
  // open a card with one of its fields set from an amount per second of the leaf item
  function feedCard(f, rate) {
    if (!f.field || !(rate > 0)) return;
    if (f.card === 'oil' && f.field === 'crude-oil') {   // that much crude oil: what the page opens at, scaled to take it
      const st = cardState('oil'), mode = oilProcOf(st), base = oilBase(mode, factoryModel().oil.D), c = oilPlan(base, mode).crude;
      if (c > 0) { const x = rate / c; st.dem = { p: base.p * x, l: base.l * x, h: base.h * x }; st.anchor = 'crude'; st.anchorN = rate; }
      return;
    }
    if (f.card === 'oil') { const st = cardState('oil'), k = OIL_KEYS[f.field]; st.dem = Object.assign({ p: 0, l: 0, h: 0 }, { [k]: rate }); st.anchor = k; return; }   // just this product, as a what-if
    const st = cardState(f.card);
    const fields = cardFields(f.card, st).fields;
    const i = fields.findIndex(x => x.id === f.field && !x.fixed);
    if (i < 0) return;
    st.scale = f.v(rate) / fields[i].k; st.anchor = 'f' + i; st.touched = true;
    saveCard(f.card, st);
  }
  function summaryHtml(tot, R) {
    const parts = [];
    const furn = {}, drills = {};
    for (const [item, t] of Object.entries(tot.made)) if (FD.recipes[[...t.recipes][0]].cat === 'smelting') for (const [m, k] of Object.entries(t.machines)) furn[m] = (furn[m] || 0) + k;
    for (const r of tot.rawInfo.rows) for (const m of r.machines) if (m.id.endsWith('mining-drill')) drills[m.id] = (drills[m.id] || 0) + m.k;
    const chip = (icon, k, label, unit) => `<span class="s">${icon}<b><span data-k="${k}" data-kind="plain"${unit ? ` data-unit="${unit}"` : ''}>${fmt(k * R)}${unit || ''}</span></b> ${label}</span>`;
    for (const [m, k] of Object.entries(furn)) parts.push(chip(icb(m, 'xs'), k, esc(nameOf(m).toLowerCase()) + 's'));
    for (const [d, k] of Object.entries(drills)) parts.push(chip(ic(d, 'xs'), k, esc(nameOf(d).toLowerCase()) + 's'));
    let oilKw = 0;
    if (tot.rawInfo.oil) {   // your factory's oil processing (Advanced when Basic cannot make what the chain needs)
      const raw = tot.raw, dem = { p: raw['petroleum-gas'] || 0, l: raw['light-oil'] || 0, h: raw['heavy-oil'] || 0 };
      let mode = oilProcOf(cardState('oil')); if (mode === 'basic' && dem.l + dem.h > 0) mode = 'advanced';
      const pl = oilPlan(dem, mode);
      parts.push(chip(ic('oil-refinery', 'xs'), pl.R, `refineries (${OIL_PROC_NAME[mode]})`));
      oilKw = pl.mw * 1000;   // and their electricity: the refineries, the cracking plants and the pumpjacks for their crude oil
    }
    if (tot.kw + oilKw > 0) parts.push(chip(ic('steam-engine', 'xs'), (tot.kw + oilKw) / 1000, 'of electricity', ' MW'));
    return parts.join('');
  }
  function subtree(n, depth, R, st, focusPath) {
    let h = rowHtml(n, depth, R, st, focusPath);
    if (!n.leaf && st.open.includes(n.path)) h += n.children.map(c => subtree(c, depth + 1, R, st, focusPath)).join('');
    return h;
  }
  // one table row. opts.noExp: no ▸ button (the row never opens deeper); opts.rootLink: the product's name links to its own page
  function rowHtml(n, depth, R, st, focusPath, opts) {
    opts = opts || {};
    const isRoot = depth === 0;
    const fluid = isFluid(n.item);
    const focus = n.path === focusPath;
    const focusRate = focus && isRoot && !!(st.anchor && st.anchor.kind === 'rate');   // the box that was set is the one to focus
    const touched = !!st.touched;                                                    // ...and the one that gets the ↺
    let mach, amt;
    if (!n.leaf) {
      const pickable = n.machineChoices.length > 1 || n.recipeChoices.length > 1;
      mach = n.machine ? machCell(n.path, n.kMach, R, n.machine, pickable, null, focus && !focusRate, focus && !focusRate && touched) : `<div class="td mach" data-label="# machines making it"><span class="sub">no machine: a rocket launch</span></div>`;
      amt = isRoot
        ? `<div class="td amt" data-label="amount${fluid ? '' : ', ' + esc(unitShort())}"><input class="num" inputmode="decimal" data-path="${esc(n.path)}" data-k="${n.kRate}" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${fmtIn(toUnit(n.kRate * R, fluid))}" aria-label="amount made"${focusRate ? ' data-focus="1"' : ''}>${undoBtn('scale', focusRate && touched)}${fluid ? '<span class="unit">per second</span>' : ''}</div>`
        : amtCell(n.kRate, R, fluid);
    } else {
      const s = supply(n.item, n.kRate);
      mach = s ? machCell(n.path, s.k, R, s.id, false, s.note, focus, focus && touched) : `<div class="td mach" data-label="# machines making it"><span class="sub">${originText(n.item)}</span></div>`;
      amt = amtCell(n.kRate, R, fluid);
    }
    const open = !opts.noExp && st.open.includes(n.path);
    const exp = n.leaf || isRoot || opts.noExp ? '<span class="exp none"></span>' : `<button class="exp" data-open="${esc(n.path)}" tabindex="-1" title="${open ? 'Hide' : 'Show'} what ${esc(nameOf(n.item))} needs">${open ? '▾' : '▸'}</button>`;
    const recipeNote = !n.leaf && !isRoot && n.recipeChoices.length > 1 ? `<div class="sub">via ${esc(FD.recipes[n.recipe].name)}</div>` : '';
    const nm = esc(nameOf(n.item));
    let name;
    if (isRoot && !opts.rootLink) name = `<b>${nm}</b>`;
    else if (!n.leaf || isResource(n.item)) name = `<a class="lnk" data-nav="${esc(n.item)}" data-k="${n.kRate}" href="#i/${n.item}" title="Open ${nm} at this amount">${nm}</a>`;
    else if (CARD_FEED[n.item]) name = `<a class="lnk" data-card="${esc(n.item)}" data-k="${n.kRate}" href="#c/${CARD_FEED[n.item].card}" title="Open ${esc(CARDS[CARD_FEED[n.item].card].title)} for this much ${nm.toLowerCase()}">${nm}</a>`;
    else name = `<b>${nm}</b>`;
    return `<div class="tr ${isRoot ? 'product' : ''}" data-path="${esc(n.path)}" style="--d:${depth}"><div class="td item">${exp}${ic(n.item)}<span class="nmtxt">${name}${nick(n.item)}${recipeNote}</span></div>${mach}${amt}</div>`;
  }

  // a box accepts "5", "15/s", "900/min", "1b", "1 belt", "2 lanes", "60 spm", "10 labs"
  function parseBox(text, kind, fluid) {
    const m = String(text).trim().toLowerCase().match(/^(\d*\.?\d+)\s*(belts?|b|lanes?|\/s|\/m(?:in)?|spm|labs?)?$/);
    if (!m) return null;
    const v = parseFloat(m[1]); if (!(v >= 0) || v > 1e7) return null;
    let unit = m[2] || null;
    if (unit) unit = unit.replace(/^belts?$|^b$/, 'belt').replace(/^lanes?$/, 'lane').replace(/^\/m(in)?$/, '/min').replace(/^labs?$/, 'labs');
    if (unit && fluid && (unit === 'belt' || unit === 'lane')) unit = '/s';
    if (unit) return { kind: 'rate', perS: unitToPerS(v, unit) };
    if (kind === 'rate') return { kind: 'rate', perS: fromUnit(v, fluid) };
    return { kind: 'mach', v };
  }
  function onBoxInput(inp) {
    const ctx = ctxOf(inp); if (!ctx) return;
    const p = parseBox(inp.value, inp.dataset.kind, inp.dataset.fluid === '1');
    if (!p) { inp.classList.add('bad'); return; }
    inp.classList.remove('bad');
    const k = parseFloat(inp.dataset.k);
    let scale;
    if (p.kind === 'rate') { const node = ctx.nodes[inp.dataset.path]; const kRate = node ? node.kRate : (inp.dataset.kind === 'rate' || inp.dataset.path === 'labs' ? (inp.dataset.kind === 'rate' ? k : 1) : null); if (kRate === null) return; scale = p.perS / kRate; }
    else scale = p.v / k;
    if (!(scale > 0)) return;
    const anchor = { path: inp.dataset.path, kind: inp.dataset.kind === 'rate' ? 'rate' : 'mach' };
    // Any box on an item or resource page is a what-if for this session; only the ledger (or "Add to factory") saves.
    if (curRes) {   // a resource page runs on one number, the supply; every block follows it
      const Rs = scale * ctx.need, changed = !near(Rs, curRes.base);
      if (changed) viewMem[curRes.id] = { scale: Rs, anchor }; else delete viewMem[curRes.id];
      curRes.mode = changed ? 'view' : curRes.st.touched ? 'own' : 'default';
      curRes.scale = Rs;
      for (const b of Object.values(curRes.blocks)) { const el = $(`#tree .blk[data-block="${b.id}"]`); if (el) refreshValues(inp, el, Rs / b.need); }
      showUndo(inp, changed); refreshFacBtn();
      return;
    }
    const changed = !near(scale, cur.base);
    if (changed) viewMem[cur.id] = { scale, anchor }; else delete viewMem[cur.id];
    cur.mode = changed ? 'view' : cur.st.touched ? 'own' : cur.drivenBy ? 'driven' : 'default';
    cur.scale = scale;
    refreshValues(inp, ctx.root, scale);
    showUndo(inp, changed); refreshFacBtn();
  }
  // keep the Add / Update / In your factory button honest while typing
  function refreshFacBtn() {
    const old = $('#main h1 .iconbtn.sm'); if (!old) return;
    const page = cur || curRes;
    const html = page ? facBtn(page.st, page.scale, page.mode) : curCard && curCard.def && ['science', 'steam'].includes(curCard.id) ? cardFacBtn(curCard.id, cardCount(curCard.id, curCard.def, curCard.st.scale)) : null;
    if (!html) return;
    const tmp = doc.createElement('span'); tmp.innerHTML = html; old.replaceWith(tmp.firstElementChild);
  }
  // the ↺ sits by the box that was set last, and only while the page is off its default
  function showUndo(inp, show) {
    $('#main').querySelectorAll('.undo[data-undo="scale"]').forEach(b => { b.hidden = true; });
    const u = inp.parentElement && inp.parentElement.querySelector('.undo[data-undo="scale"]'); if (u && show) u.hidden = false;
  }
  function refreshValues(except, root, R) {
    root.querySelectorAll('[data-k]').forEach(el => {
      if (el === except) return;
      const k = parseFloat(el.dataset.k), kind = el.dataset.kind, fluid = el.dataset.fluid === '1';
      if (el.tagName === 'INPUT') el.value = fmtIn(kind === 'rate' ? toUnit(k * R, fluid) : k * R);
      else if (kind === 'rate') el.textContent = amountText(k * R, fluid);
      else if (kind === 'build') el.textContent = buildText(k * R);
      else if (kind === 'whole') el.textContent = wholeText(k * R);
      else if (kind === 'exact') el.textContent = exactText(k * R);
      else if (kind === 'plain') el.textContent = fmt(k * R) + (el.dataset.unit || '');
    });
  }

  // ---------- machine popover ----------
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function openPop(btn, n, ctx) {
    closePop();
    const r = FD.recipes[n.recipe];
    const needsFluid = r.cat === 'crafting-with-fluid';
    const opts = n.machineChoices.map(m => `<button data-pick-m="${m}" class="${m === n.machine ? 'on' : ''}" ${needsFluid && m === 'assembling-machine-1' ? 'disabled title="needs a fluid input: Assembler 2 or 3"' : ''} tabindex="-1">${icb(m)}<span>${esc(nameOf(m).replace('Assembling machine', 'Assembler'))}</span></button>`).join('');
    const recs = n.recipeChoices.length > 1 ? n.recipeChoices.map(rid => `<button data-pick-r="${rid}" class="${rid === n.recipe ? 'on' : ''}" tabindex="-1">${ic(rid, 'sm')}<span>${esc(FD.recipes[rid].name)}</span></button>`).join('') : '';
    const global = ctx.st.overrides['m:' + n.path] ? `<button data-pick-m="" tabindex="-1"><span>same as<br>the rest</span></button>` : '';
    popEl = doc.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = `<span class="lead">Make ${esc(nameOf(n.item))} in:</span>` + opts + global + (recs ? `<span class="lead">using recipe:</span>` + recs : '');
    popEl.dataset.path = n.path; popEl.dataset.block = ctx.id;
    doc.body.appendChild(popEl);
    placePop(btn);
  }
  // a picker goes under its button, or above it when there is no room below, inside the visible width (not under a
  // scrollbar); it closes when the window gets narrower or wider, since the page then lays out again
  function placePop(btn) {
    const w = doc.defaultView || window, de = doc.documentElement, b = btn.getBoundingClientRect();
    const vw = de.clientWidth, vh = de.clientHeight, ph = popEl.offsetHeight, pw = popEl.offsetWidth;
    let top = b.bottom + 4; if (top + ph > vh - 6 && b.top - 4 - ph >= 6) top = b.top - 4 - ph;
    popEl.style.top = (top + w.scrollY) + 'px';
    popEl.style.left = (w.scrollX + Math.max(6, Math.min(b.left, vw - pw - 6))) + 'px';
    popEl.dataset.vw = vw;
    if (top + ph > vh) popEl.scrollIntoView({ block: 'nearest' });
  }
  (doc.defaultView || window).addEventListener('resize', () => { if (popEl && doc.documentElement.clientWidth !== Number(popEl.dataset.vw)) closePop(); });

  // ---------- main interactions ----------
  const main = document.getElementById('main');
  main.addEventListener('input', e => {
    // the blueprint panel keeps what you typed, so redrawing the ledger does not lose it
    if (e.target.id === 'bpq') { bpDraft = e.target.value; return; }
    const bs = e.target.closest('input[data-bp-split]');
    if (bs) {   // keep the number, and count down that machine's unassigned
      if (bpImport && bpImport.splitVals) bpImport.splitVals[bs.dataset.bpSplit] = bs.value;
      const row = bs.closest('.bp-split'), tag = row && row.querySelector('.bp-left');
      if (tag) tag.outerHTML = bpLeft(Number(row.dataset.bpTotal), [...row.querySelectorAll('input[data-bp-split]')].map(x => x.value));
      return;
    }
    const inp = e.target.closest('input.num[data-k]');
    if (e.target.id === 'addq') { addQuery(e.target.value); return; }
    const oi = e.target.closest('input.num[data-oil]'); if (oi) { onOilInput(oi); return; }
    if (inp) { if (cur || curRes) onBoxInput(inp); else if (curCard && curCard.id === 'factory') onFactoryInput(inp); else if (curCard) onCardInput(inp); return; }
  });
  main.addEventListener('keydown', e => {
    if (e.key === 'Escape' && e.target.id === 'addq' && $('#addhits .chip2')) { e.preventDefault(); e.stopPropagation(); addClose(); return; }   // Esc closes the list first
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addq') { e.preventDefault(); e.stopPropagation(); const first = $('#addhits .chip2'); if (first) addPick(first.dataset.addPick); return; }
    if (e.target.id === 'addn') { e.preventDefault(); e.stopPropagation(); addItem(); }
    if (e.target.id === 'bpq') { e.preventDefault(); e.stopPropagation(); bpRun(e.target.value); }
  });
  main.addEventListener('focusin', e => {
    if (e.target.id === 'addq' && !e.target.value.trim()) { addQuery(''); return; }   // the add box opens its full list
    if (e.target.matches('input.num')) { if (preview) commitPreview(false); e.target.dataset.orig = e.target.value; if (!restoringFocus) e.target.select(); }
  });
  main.addEventListener('change', e => {
    const ba = e.target.closest('input[data-bp-add]'); if (ba) { if (bpImport && bpImport.unticked) { const i = Number(ba.dataset.bpAdd); if (ba.checked) bpImport.unticked.delete(i); else bpImport.unticked.add(i); } return; }
    const yl = e.target.closest('input[data-yield]'); if (yl) { setYield(yl); return; }
    const bf = e.target.closest('select[data-boiler-fuel]');
    if (bf) { const st = cardState('steam'); st.fuel = bf.value; saveCard('steam', st); clearViews(); if (curCard && curCard.id === 'factory') renderFactory(true); else if (curCard && curCard.id === 'steam') renderCard('steam'); return; }
    const sc = e.target.closest('[data-sci]');
    if (sc) { const st = cardState('science'); st[sc.dataset.sci] = Number(sc.value) || 0; saveCard('science', st); if (cur) renderItem(cur.id); else if (curCard && curCard.id === 'factory') renderFactory(true); else renderCard('science'); return; }
    const l = e.target.closest('select[data-layout]'); if (l && curCard) { curCard.st.layout = l.value; curCard.st.touched = true; saveCard(curCard.id, curCard.st); renderCard(curCard.id); return; }
    const cap = e.target.closest('select[data-set="cap"]'); if (cap) { S.cap = Number(cap.value); saveS(); renderReference(); }
  });
  main.addEventListener('click', e => {
    const ex = e.target.closest('[data-q]'); if (ex) { q.value = ex.dataset.q; runSearch(); if (preview) commitPreview(fine()); return; }
    if (preview && !e.target.closest('[data-go]')) commitPreview(false);
    const g = e.target.closest('[data-go]'); if (g) { q.value = ''; strip.hidden = true; preview = null; go(g.dataset.go); return; }
    const un = e.target.closest('[data-undo]'); if (un) { undo(un.dataset.undo); return; }
    // "Clear all" on the ledger's Everything tab, "Clear this tab" on the others: ask first, then forget it
    const fg = e.target.closest('[data-forget]');
    if (fg) {
      const tabName = (FAC_TABS.find(t => t[0] === facTab) || [])[1];
      if (fg.dataset.forget === 'ask') fg.outerHTML = facTab === 'all'
        ? `<span class="lead">Clear everything you entered, on every page?</span><button class="iconbtn sm" data-forget="yes" tabindex="-1">Yes, clear all</button><button class="iconbtn sm" data-forget="no" tabindex="-1">Keep it</button>`
        : `<span class="lead">Clear everything you entered on the ${esc(tabName)} tab?</span><button class="iconbtn sm" data-forget="yes" tabindex="-1">Yes, clear this tab</button><button class="iconbtn sm" data-forget="no" tabindex="-1">Keep it</button>`;
      else if (fg.dataset.forget === 'yes' && facTab === 'all') { forgetAll(); bpImport = null; render(); }
      else { if (fg.dataset.forget === 'yes') { forgetTab(facTab); bpImport = null; } renderFactory(true); }   // Keep it, or one tab: the rest stays as it is
      return;
    }
    const tf = e.target.closest('[data-tofactory]');
    if (tf) {   // the page's number into the ledger, made in the machine the page shows
      const page = cur || curRes; if (!page) return;
      const st = page.st, mid = cur ? cur.tree.machine : (supply(page.id, 1) || {}).id, im = itemMachine(page.id);
      if (mid && im && im.options.includes(mid)) machineOf[page.id] = mid;
      delete st.parts;   // the page's one recipe replaces a split
      st.scale = page.scale; st.anchor = { path: page.id, kind: 'mach' }; st.touched = true; saveChain(page.id, st); delete viewMem[page.id]; clearViews(); rerender(); return;
    }
    const tc = e.target.closest('[data-tofactory-card]');
    if (tc && curCard && curCard.def) {   // labs, or boilers with their steam engines, into the ledger
      const id = tc.dataset.tofactoryCard, n = cardCount(id, curCard.def, curCard.st.scale);
      facUnits[CARD_UNIT[id]] = n;
      if (id === 'steam') facUnits['steam-engine'] = n * FD.power.boiler.steam_per_s / FD.power.steam_engine.steam_per_s;
      cardState(id).touched = false; persist(); clearViews(); renderCard(id); return;
    }
    const ot = e.target.closest('[data-oil-tofactory]');
    if (ot) {   // the Oil page's refineries and cracking, in whole machines, into the ledger, with the pumpjacks they take
      const st = cardState('oil'), mode = oilProcOf(st), basic = mode === 'basic', M = factoryModel(), plan = oilPlan(st.dem || oilBase(mode, M.oil.D), mode), want = oilWant(plan, basic);
      facUnits[REF_KEY[mode]] = want.refinery;   // refineries on this page's processing; any on another processing stay
      if (!basic && plan.Hc > 1e-9) facUnits['heavy-oil-cracking'] = want['heavy-oil-cracking'];   // cracking you have stays when this needs none
      if (!basic && plan.Lc > 1e-9) facUnits['light-oil-cracking'] = want['light-oil-cracking'];
      const c = chainState('crude-oil'), crude = oilCrudeNeed(want.refinery, mode, M.uses);
      if (crude > 1e-9 && !(saved(c) && c.scale >= crude - 1e-9)) { const k = supply('crude-oil', 1).k; pin('crude-oil'); c.scale = Math.ceil(crude * k - 1e-9) / k; c.anchor = { path: 'crude-oil', kind: 'mach' }; c.touched = true; }
      persist();
      const keep = { dem: st.dem, anchor: st.anchor, anchorN: st.anchorN }; clearViews(); Object.assign(st, keep); renderOil(); return;
    }
    const om = e.target.closest('[data-oil-mode]');
    if (om) {
      const st = cardState('oil'), mode = om.dataset.oilMode;
      // a machine or crude oil count typed on the Oil page stays that count in the other processing
      if (st.dem && st.anchorN > 0 && st.anchor && !'plh'.includes(st.anchor)) {
        const base = oilBase(mode, factoryModel().oil.D), v = oilPlan(base, mode)[st.anchor];
        if (v > 0) { const f = st.anchorN / v; st.dem = { p: base.p * f, l: base.l * f, h: base.h * f }; } else { st.dem = null; st.anchor = null; st.anchorN = null; }
      }
      st.basic = mode === 'basic'; st.coal = mode === 'coal'; saveCard('oil', st); if (curCard && curCard.id === 'factory') renderFactory(true); else renderOil(); return;
    }
    if (e.target.id === 'addq' && !e.target.value.trim()) { addQuery(''); return; }   // clicking the add box opens its full list
    const ft = e.target.closest('[data-fac-tab]'); if (ft) { facTab = ft.dataset.facTab; store.set('factab', facTab); addSel = null; bpImport = null; closePop(); renderFactory(true); return; }
    if (e.target.closest('[data-bp-import]')) { const box = $('#bpq'); if (box) bpRun(box.value); return; }
    if (e.target.closest('[data-bp-confirm]')) { bpConfirm(); return; }
    if (e.target.closest('[data-bp-close]')) { bpImport = null; renderFactory(true); return; }
    const fp = e.target.closest('[data-fac-pick]'); if (fp) { if (popEl && popEl.dataset.facItem === fp.dataset.facPick && (popEl.dataset.part || '') === (fp.dataset.part || '')) closePop(); else openFacPick(fp, fp.dataset.facPick); return; }
    // another recipe on a row, or one taken off a split row
    const apt = e.target.closest('[data-add-part]'); if (apt) { facAddPart(apt.dataset.addPart); return; }
    const pxt = e.target.closest('[data-part-x]'); if (pxt) { facDropPart(pxt.dataset.partX, Number(pxt.dataset.part)); return; }
    // the refinery row's lines: which processing a line runs, another processing, or one taken off
    const rpk = e.target.closest('[data-ref-pick]'); if (rpk) { if (popEl && popEl.dataset.refFrom === rpk.dataset.refPick) closePop(); else openRefPick(rpk, rpk.dataset.refPick); return; }
    const radd = e.target.closest('[data-ref-add]'); if (radd) { refAddLine(); return; }
    const rxx = e.target.closest('[data-ref-x]'); if (rxx) { refDropLine(rxx.dataset.refX); return; }
    if (e.target.closest('[data-add-close]')) { addClose(); return; }
    const ap = e.target.closest('[data-add-pick]'); if (ap) { addPick(ap.dataset.addPick); return; }
    if (e.target.closest('[data-add]')) { addItem(); return; }
    const of = e.target.closest('[data-open-f]'); if (of) { const i = of.dataset.openF; if (facOpen.has(i)) facOpen.delete(i); else facOpen.add(i); renderFactory(true); return; }
    // the ledger's short list: × or Dismiss all dismisses (rows, space-separated), Bring back lists them again
    const dz = e.target.closest('[data-dismiss-f]'); if (dz) { for (const d of dz.dataset.dismissF.split(' ')) if (d) facDismiss.add(d); persist(); renderFactory(true, true); return; }
    const uz = e.target.closest('[data-undismiss-f]'); if (uz) { for (const d of uz.dataset.undismissF.split(' ')) facDismiss.delete(d); persist(); renderFactory(true, facFilter !== 'short'); return; }   // under the short filter, their rows join the table
    // a count at the top (short, used but not entered, fulfilled): show only those rows, or every row again
    const fl = e.target.closest('[data-fac-filter]'); if (fl) { facFilter = facFilter === fl.dataset.facFilter ? null : fl.dataset.facFilter; facFiltSeen.clear(); renderFactory(true); return; }
    // Remove on a row: out of your factory; Put back: as it was
    const rm = e.target.closest('[data-rm-f]'); if (rm) { facRemove(rm.dataset.rmF); return; }
    const pb = e.target.closest('[data-unrm-f]'); if (pb) { facPutBack(pb.dataset.unrmF); return; }
    const ff = e.target.closest('[data-focus-f]');
    if (ff) {   // a short item's name: to its own row (out of the filter, if the filter hides it), into its box when it has one
      const find = () => $(`#main #tree [data-fac="${ff.dataset.focusF}"]`);
      let row = find(); if (!row && facFilter) { facFilter = null; facFiltSeen.clear(); renderFactory(true); row = find(); }
      if (!row) return;
      const box = row.querySelector('input.num');
      (row.querySelector('.td') || row).scrollIntoView({ block: 'center' });   // a .tr has no box of its own on wide screens
      if (box && fine()) { box.focus({ preventScroll: true }); box.select(); }
      return;
    }
    if (!cur && !curRes) return;
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); const c = ctxOf(nav); if (!c) return; const item = nav.dataset.nav; viewMem[item] = { scale: parseFloat(nav.dataset.k) * c.scale, anchor: { path: item, kind: 'rate' } }; q.value = ''; strip.hidden = true; go('#i/' + item); return; }   // opens it at this amount, unsaved
    const cl = e.target.closest('[data-card]');
    if (cl) { e.preventDefault(); const c = ctxOf(cl); if (!c) return; const f = CARD_FEED[cl.dataset.card]; feedCard(f, parseFloat(cl.dataset.k) * c.scale); go('#c/' + f.card); return; }
    const op = e.target.closest('[data-open]');
    if (op && cur) { const p = op.dataset.open; const i = cur.st.open.indexOf(p); if (i >= 0) cur.st.open.splice(i, 1); else cur.st.open.push(p); saveChain(cur.id, cur.st); renderItem(cur.id); return; }
    const pop = e.target.closest('[data-popover]');
    if (pop) { const c = ctxOf(pop); const n = c && c.nodes[pop.dataset.popover]; if (n && (n.machineChoices.length > 1 || n.recipeChoices.length > 1)) { if (popEl && popEl.dataset.path === n.path && popEl.dataset.block === c.id) closePop(); else openPop(pop, n, c); } return; }
  });
  // ↺ beside a value: back to its default
  function undo(key) {
    if (key === 'oil') { const st = cardState('oil'); st.dem = null; st.anchor = null; renderOil(); return; }   // back to what your factory uses
    if (key === 'scale') {   // drop the what-if made on this page (saved numbers live in the ledger)
      const page = cur || curRes;
      if (page) { delete viewMem[page.id]; rerender(); return; }
      if (curCard) { const st = curCard.st; st.scale = null; st.anchor = null; st.touched = false; renderCard(curCard.id); }
      return;
    }
    if (key === 'sci:time' || key === 'sci:bonus') { const st = cardState('science'); st[key.slice(4)] = key === 'sci:time' ? 30 : 0; saveCard('science', st); if (cur) renderItem(cur.id); else renderCard('science'); return; }
    if (key === 'layout' && curCard) { curCard.st.layout = '2x2'; saveCard(curCard.id, curCard.st); renderCard(curCard.id); return; }
  }
  document.getElementById('settings').addEventListener('click', e => {
    if (e.target.closest('[data-base-toggle]')) { baseOpen = !baseOpen; keepPlace = true; try { renderSettings(); } finally { keepPlace = false; } return; }
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const name = b.closest('[data-set]').dataset.set;
    S[name] = name === 'tier' ? Number(b.dataset.v) : b.dataset.v;
    baseChanged();
  });
  document.getElementById('settings').addEventListener('change', e => {
    const sel = e.target.closest('select[data-set]'); if (!sel) return;
    const v = Number(sel.value);
    if (sel.dataset.set === 'mp') rescaleMined((1 + v / 100) / (1 + S.mp / 100));   // your drills and pumpjacks stay as many; what they mine changes
    S[sel.dataset.set] = v; baseChanged();
  });

  // ---------- cards: linked quantities (a table: What | How many) ----------
  const SCI_PACKS = ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 'chemical-science-pack', 'production-science-pack', 'utility-science-pack'];
  function cardFields(id, st) {
    const mp = 1 + S.mp / 100;
    if (id === 'steam') {
      const b = FD.power.boiler, e = FD.power.steam_engine, fuel = boilerFuel();
      const per = f => b.kw / (FD.items[f].fuel * 1000), coal = per('coal'), eng = b.steam_per_s / e.steam_per_s;
      // your boilers' fuel first (the ledger's Boilers row picks it), then what the usual others would take instead
      const others = ['coal', 'solid-fuel', 'wood'].filter(f => f !== fuel && BOILER_FUELS.includes(f));
      return { defaultScale: 20, intro: `One boiler burns 1.8 MW of fuel to make 60 steam per second, which runs 2 steam engines at 900 kW each. One offshore pump supplies 200 boilers.`, fields: [
        { id: 'boiler', k: 1, label: 'Boilers' }, { id: 'steam-engine', k: eng, label: 'Steam engines' }, { id: 'offshore-pump', k: b.water_per_s / FD.power.offshore_pump.per_s, label: 'Offshore pumps' },
        { k: eng * e.kw / 1000, label: 'Electricity made', unit: 'MW', icon: 'small-electric-pole' },
        { id: fuel, k: per(fuel), label: `${nameOf(fuel)} burned`, flow: true },
        ...(fuel === 'coal' ? [{ id: S.drill, k: coal / (FD.machines[S.drill].speed * mp), label: nameOf(S.drill) + 's on coal to feed them' }] : []),
        ...others.map(f => ({ id: f, k: per(f), label: `${nameOf(f)} burned instead`, flow: true }))] };
    }
    if (id === 'solar') {
      const s = FD.power.solar;
      return { defaultScale: 25, intro: `A solar panel makes 60 kW at noon and 42 kW averaged over a full day and night. 0.847 accumulators per panel store enough for the night.`, fields: [
        { id: 'solar-panel', k: 1, label: 'Solar panels' }, { id: 'accumulator', k: s.accumulators_per_panel, label: 'Accumulators' },
        { k: s.avg_kw / 1000, label: 'Electricity, averaged over day and night', unit: 'MW', icon: 'small-electric-pole' }, { k: s.peak_kw / 1000, label: 'Electricity at noon', unit: 'MW', icon: 'small-electric-pole' }] };
    }
    if (id === 'mining') {
      const d = FD.machines[S.drill];
      const ore = d.speed * mp;
      const plate = f => FD.machines[f].speed / FD.recipes['iron-plate'].time;
      return { defaultScale: 5, intro: `One ${nameOf(S.drill).toLowerCase()} mines ${fmt(ore)} ore per second${S.mp ? ' with +' + S.mp + '% mining productivity' : ''}. A stone furnace smelts 0.3125 plates per second; steel and electric furnaces 0.625.`, fields: [
        { id: S.drill, k: 1, label: nameOf(S.drill) + 's' }, { id: 'stone-furnace', k: ore / plate('stone-furnace'), label: 'Stone furnaces they keep busy' }, { id: 'steel-furnace', k: ore / plate('steel-furnace'), label: 'Steel or electric furnaces they keep busy' },
        { id: 'iron-ore', k: ore, label: 'Ore mined', flow: true }] };
    }
    if (id === 'nuclear') {
      const [rows, cols] = st.layout.split('x').map(Number);
      const L = Engine.nuclearLayout(rows, cols);
      const cent = L.reactors * 0.0005 / (0.007 / 12);
      return { defaultScale: 1, intro: `A reactor makes 40 MW of heat, plus 40 MW for every reactor touching it. A heat exchanger turns 10 MW into 103 steam per second; a steam turbine turns 60 steam per second into 5.82 MW. A fuel cell lasts 200 s in any layout. With Kovarex enrichment, one centrifuge keeps about 33 reactors in U-235.`, fields: [
        { id: 'nuclear-reactor', k: L.reactors, fixed: true, label: 'Reactors in a ' + st.layout + ' block' }, { k: L.mw, label: 'Electricity made', unit: 'MW', fixed: true, icon: 'small-electric-pole' }, { id: 'heat-exchanger', k: L.exchangers, fixed: true, label: 'Heat exchangers' }, { id: 'steam-turbine', k: L.turbines, fixed: true, label: 'Steam turbines' },
        { id: 'offshore-pump', k: L.pumps, fixed: true, label: 'Offshore pumps (' + fmt(L.water) + ' water per second)' }, { id: 'uranium-fuel-cell', k: L.cellsPerMin, label: 'Fuel cells used', unit: 'per minute', fixed: true },
        { id: 'centrifuge', k: cent, fixed: true, label: 'Centrifuges processing ore, without Kovarex' }, { id: 'electric-mining-drill', k: cent * (10 / 12) / (FD.machines['electric-mining-drill'].speed / 2 * mp), fixed: true, label: 'Electric drills on uranium ore, without Kovarex' }],
        extra: `<label>Reactor layout <select data-layout tabindex="-1">${['1x1', '1x2', '2x2', '2x3', '2x4', '2x5', '2x6', '2x8'].map(l => `<option ${l === st.layout ? 'selected' : ''}>${l}</option>`).join('')}</select>${undoBtn('layout', st.layout !== '2x2')}</label>` };
    }
    if (id === 'uranium') {
      const orePerDrill = FD.machines['electric-mining-drill'].speed / 2 * mp;
      const centOre = 10 / 12;
      return { defaultScale: 6, intro: `A centrifuge eats 10 uranium ore every 12 s and gives one U-235 only 0.7% of the time. Mining uranium costs 1 sulfuric acid per ore. A reactor burns a fuel cell every 200 s, so it needs 0.0005 U-235 per second. Kovarex enrichment: one centrifuge nets +1 U-235 per minute for 3 U-238, enough for 33 reactors, but needs 40 U-235 to start.`, fields: [
        { id: 'centrifuge', k: 1, label: 'Centrifuges processing ore' }, { id: 'electric-mining-drill', k: centOre / orePerDrill, label: 'Electric drills on uranium ore' }, { id: 'sulfuric-acid', k: centOre / mp, label: 'Sulfuric acid used', fluid: true },
        { id: 'uranium-238', k: 0.993 / 12 * 60, label: 'U-238 made, on average', unit: 'per minute' }, { id: 'uranium-235', k: 0.007 / 12 * 60, label: 'U-235 made, on average', unit: 'per minute' },
        { id: 'nuclear-reactor', k: (0.007 / 12) / 0.0005, label: 'Reactors this keeps fuelled, without Kovarex' }] };
    }
    if (id === 'science') {
      const perLab = (1 + st.bonus / 100) / st.time;    // packs per second one lab uses
      const fields = [{ id: 'lab', k: 1, label: 'Labs' }];
      for (const p of SCI_PACKS) { const t = Engine.build(p, S, {}); fields.push({ id: p, k: t.kMach * perLab, label: nameOf(p), nick: COLOUR[p], machine: t.machine }); }
      fields.push({ id: 'space-science-pack', k: perLab * 60 / 1000, label: 'Space science pack', nick: 'white', unit: 'rocket launches per minute', fixed: true });
      return { defaultScale: 10, fields, isScience: true,
        extra: `on a technology that shows <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === st.time ? 'selected' : ''}>${t} s</option>`).join('')}</select>${undoBtn('sci:time', st.time !== 30)} next to its science packs · lab speed research <select data-sci="bonus" tabindex="-1">${[0, 20, 50, 90, 140, 190, 250].map((b, i) => `<option value="${b}" ${b === st.bonus ? 'selected' : ''}>${i ? 'level ' + i + ' (+' + b + '%)' : 'none'}</option>`).join('')}</select>${undoBtn('sci:bonus', st.bonus !== 0)}` };
    }
    return null;
  }

  // ---------- your factory: the machines you have, against what they use ----------
  // The ledger is split into tabs by what makes each row: mining & smelting, assembling, oil & chemicals, power, science.
  // "Everything" shows them all. A tab's dashed add row only offers what belongs in that tab.
  const FAC_TABS = [['all', 'Everything', ''], ['mining', 'Mining & smelting', 'electric-mining-drill'], ['assembling', 'Assembling', 'assembling-machine-2'], ['oil', 'Oil & chemicals', 'oil-refinery'], ['power', 'Power', 'steam-engine'], ['science', 'Science', 'lab']];
  const FAC_ORDER = ['mining', 'assembling', 'oil', 'power', 'science'];
  const ADD_HINT = { all: 'Add anything: pick or type a name', mining: 'Add drills or furnaces', assembling: 'Add an assembled item', oil: 'Add pumpjacks, refineries, cracking', power: 'Add boilers, steam engines, solar', science: 'Add labs or a science pack' };
  let facTab = store.get('factab', 'all'); if (!FAC_TABS.some(t => t[0] === facTab)) facTab = 'all';
  const facOpen = new Set();   // rows opened to show what uses the item
  let facFilter = null;            // 'short', 'none' or 'ok': the table shows only what that count at the top counts (this visit)
  const facFiltSeen = new Set();   // the rows that filter has shown: they stay while you fill them in
  const facKeep = new Set();   // rows you emptied on the ledger this visit: they stay until you leave the page
  const facRemoved = {};       // rows you took out with Remove this visit, as they were: Put back restores them
  // the rows every ledger starts with, at 0, in their tabs: drills on the four ores, the smelting, the first
  // intermediates, steam power, labs and the first two science packs
  const STARTER = ['iron-ore', 'copper-ore', 'coal', 'stone', 'iron-plate', 'copper-plate', 'steel-plate', 'stone-brick', 'iron-gear-wheel', 'copper-cable', 'electronic-circuit', 'automation-science-pack', 'logistic-science-pack'];
  const STARTER_UNITS = ['boiler', 'steam-engine', 'lab'];
  const LAB_KW = 60;
  const OIL_PRODUCTS = ['petroleum-gas', 'light-oil', 'heavy-oil'];
  const OIL_KEYS = { 'petroleum-gas': 'p', 'light-oil': 'l', 'heavy-oil': 'h' }, OIL_ITEM = { p: 'petroleum-gas', l: 'light-oil', h: 'heavy-oil' };
  // what one machine running a recipe flat out takes of an input per second, from the game's recipe and machine speed
  const oilIn = (rid, item, machine) => { const r = FD.recipes[rid], x = r && r.in.find(([i]) => i === item); return x ? x[1] / r.time * ((FD.machines[machine] || {}).speed || 1) : 0; };
  const oilOut = (rid, item, machine) => { const r = FD.recipes[rid], x = r && r.out.find(([i]) => i === item); return x ? x[1] / r.time * ((FD.machines[machine] || {}).speed || 1) : 0; };
  // the refineries' recipe, one for all of them and saved with the factory: basic or advanced oil processing, or coal
  // liquefaction (coal, steam and some of its own heavy oil into all three oils)
  const OIL_PROC = { basic: 'basic-oil-processing', advanced: 'advanced-oil-processing', coal: 'coal-liquefaction' };
  const OIL_PROC_NAME = { basic: 'basic processing', advanced: 'advanced processing', coal: 'coal liquefaction' };
  const oilProcOf = st => st.coal ? 'coal' : st.basic ? 'basic' : 'advanced';
  const oilModeOf = m => m === true ? 'basic' : m === 'basic' || m === 'coal' ? m : 'advanced';   // also takes true/false for Basic
  // what boilers can burn, and what yours do (saved with the factory; coal until you pick another)
  const BOILER_FUELS = ['coal', 'wood', 'solid-fuel', 'rocket-fuel', 'nuclear-fuel'].filter(f => FD.items[f] && FD.items[f].fuel > 0);
  const boilerFuel = () => { const f = cardState('steam').fuel; return BOILER_FUELS.includes(f) ? f : 'coal'; };
  // refineries per processing, each its own count (the plain 'refinery' count is advanced oil processing)
  const REF_KEY = { basic: 'refinery-basic', advanced: 'refinery', coal: 'refinery-coal' };
  const refN = m => unitN(REF_KEY[m]);
  const refMix = () => ({ basic: refN('basic'), advanced: refN('advanced'), coal: refN('coal') });
  const refAll = () => refN('basic') + refN('advanced') + refN('coal');
  // the processing "add N × Oil refinery" means: the one you have the most refineries on, else your default (the Oil page's)
  const refMain = () => { const m = refMix(), def = oilProcOf(cardState('oil')); return Object.keys(m).reduce((a, k) => m[k] > m[a] ? k : a, def); };
  const refShown = new Set();   // processings put on the refinery row this visit that have no count yet
  // the same recipe in words, per second: "20 crude oil and 10 water", "5 heavy oil, 9 light oil and 11 petroleum gas"
  function oilRates(rid, machine) {
    const r = FD.recipes[rid], sp = (FD.machines[machine] || {}).speed || 1;
    const words = side => (r ? r[side].slice() : []).sort((a, b) => (a[0] === 'water') - (b[0] === 'water')).map(([i, a]) => `${fmt(a / r.time * sp)} ${nameOf(i).toLowerCase()}`);
    const and = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');
    return { ins: and(words('in')), outs: and(words('out')) };
  }
  // machines that make no single item of their own: counted on rows of their own
  const UNITS = {
    boiler: { tab: 'power', name: 'Boilers', icon: 'boiler', go: '#c/steam', keys: ['boiler', 'boilers', 'steam'] },
    'steam-engine': { tab: 'power', name: 'Steam engines', icon: 'steam-engine', go: '#c/steam', keys: ['steam engine', 'engines', 'generator', 'power'] },
    'solar-panel': { tab: 'power', name: 'Solar panels', icon: 'solar-panel', go: '#c/solar', keys: ['solar', 'panels'] },
    lab: { tab: 'science', name: 'Labs', icon: 'lab', go: '#c/science', keys: ['lab', 'labs', 'research'] },
    refinery: { tab: 'oil', name: 'Oil refineries', icon: 'oil-refinery', machine: 'oil-refinery', go: '#c/oil', keys: ['refinery', 'refineries', 'oil refinery', 'oil refineries', 'oil processing'] },
    // refineries on basic processing or coal liquefaction: counted on the Oil refineries row, not rows of their own
    'refinery-basic': { tab: 'oil', name: 'Oil refineries (basic processing)', icon: 'oil-refinery', machine: 'oil-refinery', go: '#c/oil', keys: [], part: true },
    'refinery-coal': { tab: 'oil', name: 'Oil refineries (coal liquefaction)', icon: 'oil-refinery', machine: 'oil-refinery', go: '#c/oil', keys: [], part: true },
    'heavy-oil-cracking': { tab: 'oil', name: 'Heavy oil cracking', icon: 'heavy-oil-cracking', machine: 'chemical-plant', go: '#c/oil', keys: ['cracking', 'heavy oil'] },
    'light-oil-cracking': { tab: 'oil', name: 'Light oil cracking', icon: 'light-oil-cracking', machine: 'chemical-plant', go: '#c/oil', keys: ['cracking', 'light oil'] },
  };
  const unitN = id => facUnits[id] > 0 ? facUnits[id] : 0;
  // which tab an item's row belongs in: by the machine that makes it (making boilers or labs is assembling; running them
  // is a unit row in Power or Science)
  function tabOf(id) {
    if (SCI.has(id)) return 'science';
    if (id === 'crude-oil' || OIL_PRODUCTS.includes(id)) return 'oil';
    if (id === 'steam') return 'power';
    if (isResource(id) || FD.resources[id]) return 'mining';
    const rid = Engine.byProduct[id] && Engine.byProduct[id][0], cat = rid && FD.recipes[rid].cat;
    if (cat === 'smelting' || cat === 'centrifuging') return 'mining';
    if (cat === 'chemistry' || cat === 'oil-processing') return 'oil';
    return 'assembling';
  }
  // rows in a useful order inside a tab: raw resources and fluids, then smelting, then intermediates, then the rest
  const facRank = i => isResource(i) || isFluid(i) ? 0 : isSmelted(i) ? 1 : (FD.items[i] && FD.items[i].group === 'intermediate-products') ? 2 : 3;
  const facOrder = (a, b) => facRank(a) - facRank(b) || (FD.items[a] && FD.items[b] ? fullOrder(a, b) : String(nameOf(a)).localeCompare(String(nameOf(b))));
  // the machine an item is made in, in your factory (its pinned one, else Your base's), machines per 1 unit/s, and the choices
  function itemMachine(id) {
    if (!isResource(id) && Engine.byProduct[id] && !Engine.LEAVES.has(id)) {
      const t = Engine.build(id, S, {});
      if (t.kMach > 0) return { machine: t.machine, k: t.kMach, options: t.machineChoices, recipe: t.recipe, recipes: t.recipeChoices };
    }
    const sup = supply(id, 1), res = FD.resources[id];
    if (sup) return { machine: sup.id, k: sup.k, options: res && res.cat === 'basic-solid' && !res.fluid ? DRILLS : [sup.id], recipes: [] };
    return null;
  }
  // an entry is "N × that machine": pin the machine, so a later Your base change does not change what you have
  function pin(id) { const m = itemMachine(id); if (m && m.options.length > 1 && !machineOf[id]) machineOf[id] = m.machine; }
  // a row split across recipes (solid fuel from two oils, say): one part per recipe, each with its machine and how much
  // it makes; the row's number is their sum, and the first part is the row's own machine and recipe
  const partsOf = id => { const st = chainMem[id]; return st && st.parts && st.parts.length > 1 ? st.parts : null; };
  const partsTotal = st => st.parts.reduce((a, p) => a + (p.scale > 0 ? p.scale : 0), 0);
  const sWith = (id, machine, recipe) => Object.assign(Object.create(S), { machineOf: Object.assign({}, machineOf, machine ? { [id]: machine } : {}), recipeOf: Object.assign({}, recipeOf, recipe ? { [id]: recipe } : {}) });
  function partMachine(id, p) { const t = Engine.build(id, sWith(id, p.machine, p.recipe), {}); return { machine: t.machine, k: t.kMach, options: t.machineChoices, recipe: t.recipe, recipes: t.recipeChoices, tree: t }; }
  // a row's machine count and its machine (a picker when there is a choice). A split row has a line per part, each with
  // its own count, picker and ×; a row with more recipes than it uses offers another
  const facOne = (i, k, v, im, part, many) => {
    const choice = im.options.length > 1 || (im.recipes || []).length > 1, pa = part === undefined ? '' : ` data-part="${part}"`;
    const rec = (im.recipes || []).length > 1 ? ` <small>· ${esc(FD.recipes[im.recipe].name)}</small>` : '';
    return `<input class="num" inputmode="decimal" data-path="${i}"${pa} data-k="${k}" data-kind="mach" value="${v ? fmtIn(v) : ''}" placeholder="0" aria-label="number of ${esc(nameOf(im.machine))} making ${esc(nameOf(i))}">` +
      (choice ? `<button class="mbtn can" data-fac-pick="${i}"${pa} tabindex="-1" title="Which machine${rec ? ' and recipe' : ''} makes it in your factory">${icb(im.machine)}<span class="mname">${esc(nameOf(im.machine))}${rec}</span><span class="arr">▾</span></button>` : `<span class="mbtn">${icb(im.machine)}<span class="mname">${esc(nameOf(im.machine))}</span></span>`) +
      (many ? `<button class="partx" data-part-x="${i}"${pa} tabindex="-1" title="Take this recipe off the row" aria-label="Take this recipe off the row">×</button>` : '');
  };
  const facBox = (i, k, v, im) => {
    const parts = partsOf(i), more = (im.recipes || []).length > (parts ? parts.length : 1) ? `<button class="addpart" data-add-part="${i}" tabindex="-1" title="Some of your machines make it with another recipe">+ another recipe</button>` : '';
    if (!parts) return `<div class="td mach" data-label="# machines making it">${facOne(i, k, v, im)}${more}</div>`;
    return `<div class="td mach parts" data-label="# machines making it">${parts.map((p, j) => { const pm = partMachine(i, p); return `<div class="part">${facOne(i, pm.k, p.scale > 0 ? p.scale * pm.k : null, pm, j, true)}</div>`; }).join('')}${more}</div>`;
  };

  // have: item -> units/s your machines make. uses: item -> what your machines consume of it, by producer.
  function factoryModel() {
    const have = {}, uses = {}, trees = {}, runsOf = {};
    const push = (item, u) => (uses[item] = uses[item] || []).push(u);
    for (const [id, m] of Object.entries(chainMem)) if (saved(m) && FD.items[id] && !OIL_PRODUCTS.includes(id) && id !== 'steam') have[id] = m.scale;
    for (const [p, rate] of Object.entries(have)) {
      if (!Engine.byProduct[p] || isResource(p) || Engine.LEAVES.has(p)) continue;
      // a split row runs each part on its own recipe and machine
      const parts = partsOf(p), runs = parts ? parts.filter(q => q.scale > 0).map(q => [partMachine(p, q).tree, q.scale]) : [[Engine.build(p, S, {}), rate]];
      trees[p] = runs.length ? runs[0][0] : Engine.build(p, S, {}); runsOf[p] = runs;
      for (const [tree, r] of runs) for (const c of tree.children) push(c.item, { by: p, rate: c.kRate * r, machines: tree.kMach * r, machine: tree.machine });
    }
    // burner drills and stone or steel furnaces burn coal
    const coalPerKw = 1 / (FD.items.coal.fuel * 1000);
    const burn = (machine, count, by) => { const m = FD.machines[machine]; if (m && m.burner && count > 0) push('coal', { by, rate: m.kw * coalPerKw * count, machines: count, machine, fuel: true }); };
    for (const [p, rate] of Object.entries(have)) { const r = runsOf[p]; if (r) for (const [t, x] of r) burn(t.machine, t.kMach * x, p); else { const s = supply(p, 1); if (s) burn(s.id, s.k * rate, p); } }
    // ores mined with a fluid (uranium ore takes sulfuric acid) use it per ore mined, not for what mining productivity adds
    for (const [p, rate] of Object.entries(have)) { const res = FD.resources[p], s = res && res.fluid && supply(p, 1); if (s) push(res.fluid[0], { by: p, rate: rate / (1 + S.mp / 100) * res.fluid[1], machines: s.k * rate, machine: s.id }); }
    const unitUse = (id, rate, extra) => Object.assign({ by: id, label: UNITS[id].name, go: UNITS[id].go, rate, machines: unitN(id), machine: UNITS[id].machine || id }, extra);
    // labs eat each science pack you make
    const sci = cardState('science'), perLab = (1 + (sci.bonus || 0) / 100) / (sci.time || 30);
    if (unitN('lab')) for (const p of Object.keys(have)) if (SCI.has(p)) push(p, unitUse('lab', unitN('lab') * perLab));
    // boilers burn their fuel (coal unless you pick another) and drink water to make steam; steam engines turn the steam
    // into electricity
    const B = FD.power.boiler, E = FD.power.steam_engine;
    if (unitN('boiler')) { const f = boilerFuel(); push(f, unitUse('boiler', unitN('boiler') * B.kw / (FD.items[f].fuel * 1000), { fuel: true })); push('water', unitUse('boiler', unitN('boiler') * B.water_per_s)); }
    const steamUses = (uses.steam || []).slice(); delete uses.steam;
    if (unitN('steam-engine')) steamUses.unshift(unitUse('steam-engine', unitN('steam-engine') * E.steam_per_s));
    const steam = { made: unitN('boiler') * B.steam_per_s, uses: steamUses };
    // oil: what your machines use of each oil product, the refineries and cracking that takes, and what yours deliver
    const D = { p: 0, l: 0, h: 0 }, oilBy = { p: [], l: [], h: [] };
    for (const i of OIL_PRODUCTS) { for (const u of uses[i] || []) { D[OIL_KEYS[i]] += u.rate; oilBy[OIL_KEYS[i]].push(u); } delete uses[i]; }
    // your refineries on each processing; what your factory needs of them is worked out for the processing you have most
    // of (mode), on top of what the others make running flat out
    const rm = refMix(), N = { r: rm.basic + rm.advanced + rm.coal, rm, a: unitN('heavy-oil-cracking'), b: unitN('light-oil-cracking') };
    const mode = refMain(), basic = rm.advanced + rm.coal === 0 && (N.r > 0 || mode === 'basic');   // nothing makes heavy or light oil
    const extra = { h: 0, l: 0, p: 0 };
    for (const m of Object.keys(OIL_PROC)) if (m !== mode && rm[m] > 0) { const rr = Engine.oilRecipeRates(OIL_PROC[m], 'oil-refinery'); for (const k of ['h', 'l', 'p']) extra[k] += rm[m] * rr[k]; }
    const need = oilPlan(D, mode, extra);
    // what the refineries deliver with no oil backing up; crude oil running short shows on its own row, as any input does
    const sol = oilSolve(D, N, mode, null);
    // your refineries and cracking plants take what their recipe does running flat out, like every other machine you
    // entered: crude oil (and water on Advanced), or on coal liquefaction coal, and steam from your boilers
    for (const m of Object.keys(OIL_PROC)) {
      if (!(rm[m] > 0)) continue;
      const proc = OIL_PROC[m], on = Object.assign({ machines: rm[m] }, N.r > rm[m] ? { label: `Oil refineries (${OIL_PROC_NAME[m]})` } : {});
      for (const [item, label] of [['crude-oil'], ['water'], ['coal', 'Coal liquefaction']]) { const n = rm[m] * oilIn(proc, item, 'oil-refinery'); if (n > 0) push(item, unitUse('refinery', n, Object.assign({}, on, label ? { label } : {}))); }
      const steamN = rm[m] * oilIn(proc, 'steam', 'oil-refinery'); if (steamN > 0) steamUses.push(unitUse('refinery', steamN, { label: 'Coal liquefaction', machines: rm[m] }));
    }
    if (!basic && N.a) push('water', unitUse('heavy-oil-cracking', N.a * oilIn('heavy-oil-cracking', 'water', 'chemical-plant')));
    if (!basic && N.b) push('water', unitUse('light-oil-cracking', N.b * oilIn('light-oil-cracking', 'water', 'chemical-plant')));
    // electricity: steam engines and solar panels against what every electric machine draws
    const power = { made: unitN('steam-engine') * E.kw / 1000 + unitN('solar-panel') * FD.power.solar.avg_kw / 1000, used: 0, parts: [] };
    const draw = (machine, count, by, label, go) => {
      const m = FD.machines[machine], kw = machine === 'lab' ? LAB_KW : m && !m.burner ? m.kw + (m.drain || 0) : 0;
      if (kw > 0 && count > 0) { power.used += kw * count / 1000; power.parts.push({ by, label, go, machines: count, machine, mw: kw * count / 1000 }); }
    };
    for (const [p, rate] of Object.entries(have)) { const r = runsOf[p]; if (r) for (const [t, x] of r) draw(t.machine, t.kMach * x, p); else { const s = supply(p, 1); if (s) draw(s.id, s.k * rate, p); } }
    if (unitN('lab')) draw('lab', unitN('lab'), 'lab', 'Labs', '#c/science');
    if (N.r) draw('oil-refinery', N.r, 'refinery', 'Oil refineries', '#c/oil');
    if (N.a && !basic) draw('chemical-plant', N.a, 'heavy-oil-cracking', 'Heavy oil cracking', '#c/oil');   // on Basic there is nothing to crack
    if (N.b && !basic) draw('chemical-plant', N.b, 'light-oil-cracking', 'Light oil cracking', '#c/oil');
    const ids = [...new Set([...STARTER, ...Object.keys(have), ...Object.keys(uses), ...[...facKeep].filter(k => !k.startsWith('unit:'))])]
      .filter(i => (FD.items[i] || Engine.byProduct[i]) && !OIL_PRODUCTS.includes(i) && i !== 'steam');
    ids.sort(facOrder);
    return { have, uses, trees, runsOf, ids, power, steam, oil: { D, by: oilBy, need, N, sol, basic, mode }, sci };
  }

  // ---------- oil maths, shared by the ledger and the Oil processing page ----------
  // what making these amounts of petroleum gas (p), light oil (l) and heavy oil (h) per second takes: basic processing
  // makes petroleum gas only; advanced cracks what is not wanted (Engine.oilBlock), and reports what is left over anyway
  // the fewest refineries on one processing, with the cracking they need, to deliver dem on top of what your other
  // refineries make (extra, per second at full speed): a small LP; oil nothing uses is then cracked as far as it goes
  function oilPlan(dem, mode, extra) {
    const mp = 1 + S.mp / 100, m = oilModeOf(mode), rid = OIL_PROC[m], rr = Engine.oilRecipeRates(rid, 'oil-refinery');
    const hc = Engine.oilRecipeRates('heavy-oil-cracking', 'chemical-plant'), lc = Engine.oilRecipeRates('light-oil-cracking', 'chemical-plant');
    const ex = extra || { h: 0, l: 0, p: 0 };
    // x = [R, Hc, Lc] >= 0, each oil made at least as fast as it is used: the fewest refineries, then the least cracking
    const A = [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], b = [0, 0, 0];
    for (const k of ['h', 'l', 'p']) { A.push([-rr[k], -hc[k], -lc[k]]); b.push(ex[k] - dem[k]); }
    const s = lpMax([-1, -1e-3, -1e-3], A, b);
    let [R, Hc, Lc] = s ? s.x.map(v => Math.max(0, v)) : [Math.max(0, dem.p - ex.p) / (rr.p || 1), 0, 0];   // Basic cannot make heavy or light oil
    // what is still left over is cracked as far as it goes, heavy oil into light and light oil into petroleum gas
    const left = k => R * rr[k] + Hc * hc[k] + Lc * lc[k] + ex[k] - dem[k];
    if (left('h') > 1e-9) Hc += left('h') / -hc.h;
    if (left('l') > 1e-9) Lc += left('l') / -lc.l;
    const spare = { h: Math.max(0, left('h')), l: Math.max(0, left('l')), p: Math.max(0, left('p')) };
    const water = R * rr.water + Hc * hc.water + Lc * lc.water;
    const kw = id => FD.machines[id].kw + (FD.machines[id].drain || 0);
    const crude = R * rr.crude, coal = R * rr.coal, steam = R * rr.steam;
    const jacks = crude / (FD.resources['crude-oil'].amount * mp * S.jackYield), pumps = water / FD.power.offshore_pump.per_s, boilers = steam / FD.power.boiler.steam_per_s;
    return { R, Hc, Lc, crude, jacks, coal, steam, boilers, water, pumps, spare, mw: (R * kw('oil-refinery') + (Hc + Lc) * kw('chemical-plant') + jacks * kw('pumpjack')) / 1000 };
  }
  // the largest c·x with every A·x <= b, for a handful of variables: checks each corner of the region
  function lpMax(c, A, b) {
    const n = c.length, m = A.length, pick = [];
    let best = null;
    const solve = (rows, rhs) => {
      const M = rows.map((r, i) => r.concat([rhs[i]]));
      for (let col = 0; col < n; col++) {
        let p = col; for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[p][col])) p = r;
        if (Math.abs(M[p][col]) < 1e-12) return null;
        [M[col], M[p]] = [M[p], M[col]];
        for (let r = 0; r < n; r++) if (r !== col) { const f = M[r][col] / M[col][col]; for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k]; }
      }
      return M.map((r, i) => r[n] / r[i]);
    };
    const visit = (start, k) => {
      if (k === n) {
        const x = solve(pick.map(i => A[i]), pick.map(i => b[i])); if (!x) return;
        for (let i = 0; i < m; i++) if (A[i].reduce((s, a, j) => s + a * x[j], 0) > b[i] + 1e-7 * (1 + Math.abs(b[i]))) return;
        const v = c.reduce((s, a, j) => s + a * x[j], 0);
        if (!best || v > best.v + 1e-9) best = { v, x };
        return;
      }
      for (let i = start; i <= m - (n - k); i++) { pick[k] = i; visit(i + 1, k + 1); }
    };
    visit(0, 0);
    return best;
  }
  // what your refineries and cracking plants really deliver of what your factory uses, with nothing backing up (no oil
  // product can pile up: a full tank stops the refinery): refineries running r, heavy crackers a, light crackers b.
  // First the largest share t met for every product, then as much more as fits on top.
  function oilSolve(D, N, mode, crudeFree) {
    // per machine per second, from the recipes: a refinery on each processing you have (what it makes less what it takes of
    // each oil), a heavy and a light oil cracking plant. x = [refineries on each processing..., a, b, t]
    const rm = N.rm || { [oilModeOf(mode)]: N.r }, procs = Object.keys(OIL_PROC).filter(m => rm[m] > 0);
    if (!procs.length) procs.push(oilModeOf(mode));
    const rrs = procs.map(m => Engine.oilRecipeRates(OIL_PROC[m], 'oil-refinery')), hc = Engine.oilRecipeRates('heavy-oil-cracking', 'chemical-plant'), lc = Engine.oilRecipeRates('light-oil-cracking', 'chemical-plant');
    const nr = procs.length, n = nr + 3, ia = nr, ib = nr + 1, it = nr + 2;
    const at = pairs => { const r = new Array(n).fill(0); for (const [i, v] of pairs) r[i] = v; return r; };
    const d = {}; for (const k of ['h', 'l', 'p']) d[k] = rrs.map(r => r[k]).concat([hc[k], lc[k], 0]);   // deliveries over x
    const A = [], b = [], le = (row, rhs) => { A.push(row); b.push(rhs); };
    procs.forEach((m, i) => { le(at([[i, 1]]), rm[m] || 0); le(at([[i, -1]]), 0); });
    le(at([[ia, 1]]), N.a); le(at([[ia, -1]]), 0); le(at([[ib, 1]]), N.b); le(at([[ib, -1]]), 0);
    le(at([[it, 1]]), 1); le(at([[it, -1]]), 0);
    for (const k of ['h', 'l', 'p']) { le(d[k], D[k]); le(d[k].map(v => -v), 0); if (D[k] > 0) le(d[k].map((v, j) => j === it ? D[k] : -v), 0); }
    if (crudeFree !== null) le(at(procs.map((m, i) => [i, rrs[i].crude])), crudeFree);
    const s1 = lpMax(at([[it, 1]]), A, b), t = s1 ? s1.x[it] : 0;
    le(at([[it, -1]]), -(t - 1e-9));
    const w = k => D[k] > 0 ? 1 / D[k] : 0, c = d.h.map((v, j) => j === it ? 0 : w('h') * d.h[j] + w('l') * d.l[j] + w('p') * d.p[j]);
    const s2 = lpMax(c, A, b) || s1, x = s2 ? s2.x : new Array(n).fill(0);
    const val = row => Math.max(0, row.reduce((s, a, j) => s + a * x[j], 0)), byProc = {};
    procs.forEach((m, i) => { byProc[m] = Math.max(0, x[i]); });
    return { r: procs.reduce((s, m, i) => s + Math.max(0, x[i]), 0), rm: byProc, a: Math.max(0, x[ia]), b: Math.max(0, x[ib]), d: { h: val(d.h), l: val(d.l), p: val(d.p) } };
  }

  function renderFactory(fromInput, topOnly) {
    cur = null; curRes = null; curCard = { id: 'factory', st: {}, fields: [] };
    // arriving on the page (a Your base change redraws in place and keeps them): no kept rows, Put back or filter yet
    if (!fromInput && !keepPlace) { facKeep.clear(); for (const k of Object.keys(facRemoved)) delete facRemoved[k]; facFilter = null; facFiltSeen.clear(); refShown.clear(); }
    const { have, uses, runsOf, ids, power, steam, oil, sci } = factoryModel();
    const shared = {};   // rows the Oil tab shows too: coal, steam and water, when its machines take them
    const unitOf = fluid => fluid ? 'per second' : unitShort();
    const amtWord = (v, fluid) => `${fmt(toUnit(v, fluid))} ${fluid ? 'per second' : unitWord(toUnit(v, fluid))}`;
    const head = {}, body = {}, counts = {}, shorts = [], waved = [], rowSt = {};
    for (const t of FAC_ORDER) { head[t] = []; body[t] = []; counts[t] = { short: 0, none: 0, ok: 0 }; }
    // the counts at the top: short, used but not entered (grey rows), fulfilled (made at least as fast as it is used).
    // A shortage you dismissed (did: its row) is left out of the short count, the short list and the tabs' red counts;
    // its row is unchanged.
    const tally = (tab, st, did, label, icon, txt, share) => {
      const x = { tab, did, label, icon, txt, share };
      rowSt[did] = st;
      if (st === 'short' && facDismiss.has(did)) { waved.push(x); return; }
      const k = st === 'balanced' || st === 'spare' ? 'ok' : st;
      if (k && counts[tab][k] !== undefined) counts[tab][k]++;
      if (st === 'short') shorts.push(x);
    };
    // the left-over cell: short (red, with how many machines close the gap), not entered (grey), fulfilled (green)
    const cellOf = (cls, txt, pct, tip, label) => `<div class="td amt bal" data-label="${label || 'left over'}"><span class="${cls}">${txt}</span><span class="meter${cls === 'spare' ? '' : ' ' + cls}"${tip ? ` title="${esc(tip)}"` : ''}><i style="width:${pct}%"></i></span></div>`;
    const cell = cellOf;
    const empty = { st: null, miss: 0, html: `<div class="td amt bal" data-label="left over"><span class="sub">–</span></div>` };
    const balance = (made, used, word, k, machine) => {
      if (!made && !used) return empty;
      const bal = made - used, isShort = bal < 0 && !near(bal, 0), v = Math.abs(bal), pct = made > 0 ? Math.min(100, used / made * 100) : 100;
      // how many machines close a gap: on a short row the gap, on a row with nothing entered all that is used
      const add = n => k > 0 && machine ? `<small>add ${fmt(Math.ceil(n * k - 1e-9))} × ${esc(nameOf(machine))}</small>` : '';
      if (!made) return { st: 'none', miss: 0, html: cell('none', 'not entered' + add(used), 100, 'your factory uses it, but nothing making it is entered') };
      const tip = !used ? 'nothing uses it' : fmt(used / made * 100) + '% of what you make is used';
      if (isShort) return { st: 'short', miss: v, html: cell('short', word(v) + ' short' + add(v), pct, tip) };
      if (near(bal, 0)) return { st: 'balanced', miss: 0, html: cell('spare', 'fulfilled', pct, tip) };
      return { st: 'spare', miss: 0, html: cell('spare', `fulfilled<small>${word(v)} left over</small>`, pct, tip) };
    };
    const expBtn = (key, has, what) => has ? `<button class="exp" data-open-f="${key}" tabindex="-1" title="${facOpen.has(key) ? 'Hide' : 'Show'} ${esc(what)}">${facOpen.has(key) ? '▾' : '▸'}</button>` : '<span class="exp none"></span>';
    const iconOf = by => UNITS[by] ? UNITS[by].icon : by;
    // Remove, under the name of a row you entered: out of your factory. The row stays while you are on the page, with Put
    // back, which brings it back as it was; entering it again any other way drops Put back.
    const inFac = k => k === 'unit:refinery' ? refAll() > 0 : k.startsWith('unit:') ? unitN(k.slice(5)) > 0 : saved(chainMem[k]);
    for (const k of Object.keys(facRemoved)) if (inFac(k)) delete facRemoved[k];
    const rmBtn = (key, name, on) => on ? `<button class="rm" data-rm-f="${esc(key)}" tabindex="-1" title="Take ${esc(name)} out of your factory">Remove</button>`
      : facRemoved[key] ? `<button class="rm back" data-unrm-f="${esc(key)}" tabindex="-1" title="Put ${esc(name)} back in your factory${facRemoved[key].txt ? ': ' + esc(facRemoved[key].txt) : ''}">Put back</button>` : '';
    // a row opened with ▸: what makes it, then what uses it (biggest first), each with its machines and how much, the
    // amount under Makes or under Uses so it reads like the row above it
    const flowRows = (makers, users, fluid, amt, unitLbl) => {
      const a = amt || (v => amountText(v, fluid)), lbl = unitLbl || unitOf(fluid);
      const line = (u, mk) => { const go = u.go || '#i/' + u.by, nm = u.label || nameOf(u.by);
        return `<div class="tr cons ${mk ? 'makes' : 'uses'}"><div class="td item" style="--d:1"><span class="exp none"></span><span class="side">${mk ? 'made by' : 'used by'}</span>${ic(iconOf(u.by), 'sm')}<span class="nmtxt"><a class="lnk" href="${go}" data-go="${go}" title="Open ${esc(nm)}">${esc(nm)}</a>${u.fuel ? ' <span class="sub">fuel for its machines</span>' : ''}</span></div><div class="td mach" data-label="machines">${u.machine ? `${fmt(u.machines)} × ${esc(nameOf(u.machine))}` : esc(u.what || 'rocket launches')}</div><div class="td amt"${mk ? ` data-label="makes, ${esc(lbl)}"` : ''}>${mk ? a(u.rate) : ''}</div><div class="td amt"${mk ? '' : ` data-label="uses, ${esc(lbl)}"`}>${mk ? '' : a(u.rate)}</div><div class="td amt"></div></div>`; };
      return makers.map(u => line(u, true)).join('') + users.slice().sort((x, y) => y.rate - x.rate).map(u => line(u, false)).join('');
    };
    const showUnit = id => (id === 'refinery' ? refAll() : unitN(id)) > 0 || facKeep.has('unit:' + id) || STARTER_UNITS.includes(id);
    const unitRow = (id, sub, bal) => {
      const u = UNITS[id], cnt = unitN(id), mid = u.machine || id;
      return `<div class="tr${cnt ? ' product' : ''}" data-fac="unit:${id}"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(u.icon)}<span class="nmtxt"><a class="lnk" href="${u.go}" data-go="${u.go}" title="Open ${esc(u.name)}">${esc(u.name)}</a><div class="sub">${sub}</div>${rmBtn('unit:' + id, u.name, cnt > 0)}</span></div><div class="td mach" data-label="how many"><input class="num" inputmode="decimal" data-path="unit:${id}" data-k="1" data-kind="mach" value="${cnt ? fmtIn(cnt) : ''}" placeholder="0" aria-label="${esc(u.name)}"><span class="mbtn">${ic(mid)}<span class="mname">${esc(nameOf(mid))}</span></span></div><div class="td amt"></div><div class="td amt"></div>${bal ? bal.html : '<div class="td amt"></div>'}</div>`;
    };
    // a row that adds up other rows (steam, electricity, an oil product): no box of its own
    const sumRow = (key, icon, name, sub, from, made, used, unitTxt, bal, n, listHtml) => `<div class="tr${made ? ' product' : ''}" data-fac="${key}"><div class="td item" style="--d:0">${expBtn(key, n, 'what uses it')}${ic(icon)}<span class="nmtxt"><b>${esc(name)}</b><div class="sub">${sub}</div></span></div><div class="td mach" data-label="made by"><span class="sub">${from}</span></div><div class="td amt" data-label="makes">${made ? fmt(made) + ` <span class="unit">${unitTxt}</span>` : '<span class="sub">–</span>'}</div><div class="td amt" data-label="your factory uses">${used ? fmt(used) + ` <span class="unit">${unitTxt}</span>` : '<span class="sub">–</span>'}</div>${bal.html}</div>` + (facOpen.has(key) ? listHtml : '');

    // power: boilers, steam engines, solar panels, then steam and electricity added up
    const B = FD.power.boiler, E = FD.power.steam_engine;
    // what your boilers burn: picked on their row, and counted on that fuel's row
    const fuel = boilerFuel(), fuelSel = `<select data-boiler-fuel tabindex="-1" aria-label="what your boilers burn">${BOILER_FUELS.map(f => `<option value="${f}" ${f === fuel ? 'selected' : ''}>${esc(nameOf(f).toLowerCase())}</option>`).join('')}</select>`;
    if (showUnit('boiler')) head.power.push(unitRow('boiler', `${fmt(B.steam_per_s)} steam per second each, burning ${fuelSel} (${fmt(B.kw / (FD.items[fuel].fuel * 1000))} per second each) and drinking water`));
    if (showUnit('steam-engine')) head.power.push(unitRow('steam-engine', `${fmt(E.kw / 1000)} MW each from ${fmt(E.steam_per_s)} steam per second`));
    if (showUnit('solar-panel')) head.power.push(unitRow('solar-panel', `${fmt(FD.power.solar.avg_kw)} kW each, averaged over day and night`));
    const steamUsed = steam.uses.reduce((a, u) => a + u.rate, 0);
    if (steam.made || steamUsed) {
      const b = balance(steam.made, steamUsed, v => fmt(v) + ' per second', 1 / B.steam_per_s, 'boiler');
      tally('power', b.st, 'steam', 'Steam', 'steam', fmt(b.miss) + ' per second', b.miss / (steamUsed || 1));
      const boilers = unitN('boiler') ? [{ by: 'boiler', label: 'Boilers', go: '#c/steam', rate: steam.made, machines: unitN('boiler'), machine: 'boiler' }] : [];
      shared.steam = sumRow('steam', 'steam', 'Steam', 'from your boilers, for your steam engines', unitN('boiler') ? `${fmt(unitN('boiler'))} × Boiler` : 'no boilers entered', steam.made, steamUsed, 'per second', b, steam.uses.length, flowRows(boilers, steam.uses, true));
      head.power.push(shared.steam);
    }
    if (power.made || power.used) {
      const viaSolar = !unitN('steam-engine') && unitN('solar-panel') > 0, mE = viaSolar ? 'solar-panel' : 'steam-engine';
      const b = balance(power.made, power.used, v => fmt(v) + ' MW', viaSolar ? 1000 / FD.power.solar.avg_kw : 1000 / E.kw, mE);
      tally('power', b.st, 'power', 'Electricity', 'small-electric-pole', fmt(b.miss) + ' MW', b.miss / (power.used || 1));
      const from = [unitN('steam-engine') ? `${fmt(unitN('steam-engine'))} × Steam engine` : '', unitN('solar-panel') ? `${fmt(unitN('solar-panel'))} × Solar panel` : ''].filter(Boolean).join(' + ') || 'nothing entered';
      const mwMakers = [['steam-engine', 'Steam engines', E.kw], ['solar-panel', 'Solar panels', FD.power.solar.avg_kw]].filter(([id]) => unitN(id) > 0).map(([id, label, kw]) => ({ by: id, label, go: UNITS[id].go, rate: unitN(id) * kw / 1000, machines: unitN(id), machine: id }));
      const list = flowRows(mwMakers, power.parts.map(u => Object.assign({}, u, { rate: u.mw })), false, v => `${fmt(v)} <span class="unit">MW</span>`, 'MW');
      head.power.push(sumRow('power', 'small-electric-pole', 'Electricity', 'from your steam engines and solar panels, for every electric machine in your factory', from, power.made, power.used, 'MW', b, power.parts.length, list));
    }

    // science: labs (with the research they run), then the packs, from the item rows below
    const sciSel = `on technologies that show <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === sci.time ? 'selected' : ''}>${t} s</option>`).join('')}</select> per pack · lab speed research <select data-sci="bonus" tabindex="-1">${[0, 20, 50, 90, 140, 190, 250].map((v, i) => `<option value="${v}" ${v === sci.bonus ? 'selected' : ''}>${i ? 'level ' + i + ' (+' + v + '%)' : 'none'}</option>`).join('')}</select>`;
    if (showUnit('lab') || ids.some(i => SCI.has(i))) head.science.push(unitRow('lab', `eat each science pack you make, ${sciSel}`));

    // oil: crude oil (first, from the item rows below), your refineries and cracking with what each takes and makes, then
    // the oils. Every machine counts at full speed, as on every other row. An oil's verdict comes from what the refineries
    // can really deliver when an oil with nowhere to go stops them (oilSolve), with the reason and what to add on that
    // oil's own row. The refinery and cracking rows say in grey what your factory needs of them, with no verdict of their
    // own, the way Power's boilers and engines carry none: so one gap is counted once.
    const { D, need, sol, basic, by, N, mode } = oil;
    const procsIn = Object.keys(OIL_PROC).filter(m => N.rm[m] > 0), manyProc = procsIn.length > 1;
    const refSum = (f, item) => Object.keys(OIL_PROC).reduce((a, m) => a + (N.rm[m] || 0) * f(OIL_PROC[m], item, 'oil-refinery'), 0);
    const anyOil = D.p + D.l + D.h > 0;
    const andJoin = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : l.join('');
    // what your factory needs of a refinery or cracking row, in grey: idle (and why), not entered, too few, or enough
    const unitNeed = (id, needN, run) => {
      const hv = unitN(id), add = n => `add ${fmt(Math.ceil(n - 1e-9))} × ${esc(nameOf(UNITS[id].machine))}`, cell = (cls, txt, pct) => cellOf(cls, txt, pct, '', 'your factory needs');
      if (!(hv > 0) && !(needN > 1e-9)) return empty;
      if (!(needN > 1e-9)) return { st: null, html: cell('none', `idle<small>${id === 'refinery' ? 'nothing in your factory uses what they make' : basic ? 'basic processing makes nothing to crack' : 'your factory needs no cracking'}</small>`, 0) };
      if (!(hv > 0)) return { st: null, html: cell('none', `not entered<small>needs ${fmt(needN)}: ${add(needN)}</small>`, 100) };
      if (hv < needN - 1e-6) return { st: null, html: cell('none', `needs ${fmt(needN)}<small>${add(needN - hv)}</small>`, 100) };
      return { st: null, html: cell('none', `needs ${fmt(needN)} of your ${fmt(hv)}<small>${fmt(run / hv * 100)}% busy</small>`, Math.min(100, needN / hv * 100)) };
    };
    // what your factory needs of refineries, in grey: on the processing you have most of (mode), on top of the others
    const refNeed = () => {
      const hv = N.rm[mode] || 0, needN = need.R, on = manyProc ? ` on ${OIL_PROC_NAME[mode]}` : '';
      const cell = (cls, txt, pct) => cellOf(cls, txt, pct, '', 'your factory needs'), add = x => `add ${fmt(Math.ceil(x - 1e-9))} × Oil refinery${on}`;
      if (!(N.r > 0) && !(needN > 1e-9)) return empty;
      if (!(needN > 1e-9)) return { st: null, html: cell('none', `idle<small>${anyOil ? 'your other refineries make enough' : 'nothing in your factory uses what they make'}</small>`, 0) };
      if (!(N.r > 0)) return { st: null, html: cell('none', `not entered<small>needs ${fmt(needN)}: ${add(needN)}</small>`, 100) };
      if (hv < needN - 1e-6) return { st: null, html: cell('none', `needs ${fmt(needN)}${on}<small>${add(needN - hv)}</small>`, 100) };
      return { st: null, html: cell('none', `needs ${fmt(needN)} of your ${fmt(hv)}${on}<small>${fmt((sol.rm[mode] || 0) / hv * 100)}% busy</small>`, Math.min(100, needN / hv * 100)) };
    };
    // the refinery row: a line per processing you run, each with its count and a picker for the processing (with none
    // entered, a line for the one your factory would add first); "+ another processing" adds a line
    const refineryRow = bal => {
      const u = UNITS.refinery, shown = Object.keys(OIL_PROC).filter(m => N.rm[m] > 0 || refShown.has(m));
      if (!shown.length) shown.push(mode);
      const many = shown.length > 1;
      const sub = shown.map(m => { const r = oilRates(OIL_PROC[m], 'oil-refinery'); return `<div>${esc(FD.recipes[OIL_PROC[m]].name)}: each takes ${r.ins} and makes ${r.outs} per second</div>`; }).join('');
      const lines = shown.map(m => `<div class="part"><input class="num" inputmode="decimal" data-path="unit:refinery" data-proc="${m}" data-k="1" data-kind="mach" value="${N.rm[m] ? fmtIn(N.rm[m]) : ''}" placeholder="0" aria-label="oil refineries on ${OIL_PROC_NAME[m]}"><button class="mbtn can" data-ref-pick="${m}" tabindex="-1" title="Which processing these refineries run">${ic('oil-refinery')}<span class="mname">Oil refinery <small>· ${{ basic: 'Basic', advanced: 'Advanced', coal: 'Coal liquefaction' }[m]}</small></span><span class="arr">▾</span></button>${many ? `<button class="partx" data-ref-x="${m}" tabindex="-1" title="Take this processing off the row" aria-label="Take this processing off the row">×</button>` : ''}</div>`).join('');
      const more = shown.length < 3 ? `<button class="addpart" data-ref-add tabindex="-1" title="Some of your refineries run another processing">+ another processing</button>` : '';
      return `<div class="tr${N.r ? ' product' : ''}" data-fac="unit:refinery"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(u.icon)}<span class="nmtxt"><a class="lnk" href="${u.go}" data-go="${u.go}" title="Open ${esc(u.name)}">${esc(u.name)}</a><div class="sub">${sub}</div>${rmBtn('unit:refinery', u.name, N.r > 0)}</span></div><div class="td mach${many ? ' parts' : ''}" data-label="how many">${lines}${more}</div><div class="td amt"></div><div class="td amt"></div>${bal.html}</div>`;
    };
    if (anyOil || showUnit('refinery')) head.oil.push(refineryRow(refNeed()));
    const crackText = rid => { const t = oilRates(rid, 'chemical-plant'); return `chemical plants, each turning ${t.ins} into ${t.outs} per second`; };
    for (const [id, needN, run] of [['heavy-oil-cracking', need.Hc, sol.a], ['light-oil-cracking', need.Lc, sol.b]]) {
      if (!((!basic && needN > 1e-9) || showUnit(id))) continue;
      head.oil.push(unitRow(id, crackText(id), unitNeed(id, basic ? 0 : needN, run)));
    }
    // the oils, in the order they are cracked: what your refineries make at full speed plus what cracking turns into it,
    // and what your factory uses plus what cracking takes (cracking runs as fast as the oil it is given allows)
    const cp = 'chemical-plant';
    const crackIn = { h: basic ? 0 : sol.a * oilIn('heavy-oil-cracking', 'heavy-oil', cp), l: basic ? 0 : sol.b * oilIn('light-oil-cracking', 'light-oil', cp), p: 0 };
    const crackOut = { h: 0, l: basic ? 0 : sol.a * oilOut('heavy-oil-cracking', 'light-oil', cp), p: basic ? 0 : sol.b * oilOut('light-oil-cracking', 'petroleum-gas', cp) };
    const shortOf = k => D[k] > 0 && D[k] - sol.d[k] > 1e-6 * Math.max(1, D[k]) ? D[k] - sol.d[k] : 0;
    const anyShort = ['h', 'l', 'p'].some(k => shortOf(k) > 0);
    // why an oil comes up short: too few machines for what your factory uses (oilPlan's numbers), naming the oil that backs
    // up when cracking is what is missing; or, with every machine there, an oil nothing uses that has nowhere to go
    const more = [(N.rm[mode] || 0) < need.R - 1e-6 ? `${fmt(Math.ceil(need.R - (N.rm[mode] || 0) - 1e-9))} × Oil refinery${manyProc ? ' on ' + OIL_PROC_NAME[mode] : ''}` : '',
      !basic && N.a < need.Hc - 1e-6 ? `${fmt(Math.ceil(need.Hc - N.a - 1e-9))} × heavy oil cracking` : '',
      !basic && N.b < need.Lc - 1e-6 ? `${fmt(Math.ceil(need.Lc - N.b - 1e-9))} × light oil cracking` : ''].filter(Boolean);
    const backed = [!basic && N.a < need.Hc - 1e-6 ? 'h' : '', !basic && N.b < need.Lc - 1e-6 ? 'l' : ''].filter(x => x && !shortOf(x));   // an oil that is short is not backing up
    const stuck = (basic ? ['p'] : ['h', 'l', 'p']).filter(k => !(D[k] > 0) && (k === 'p' || (k === 'h' ? !N.a : !N.b)));
    const oilWords = ks => andJoin(ks.map(k => nameOf(OIL_ITEM[k]).toLowerCase())) + (ks.length > 1 ? ' back up' : ' backs up');
    const why = k => basic && k !== 'p' ? 'basic processing makes none'
      : more.length ? (backed.some(x => x !== k) ? oilWords(backed.filter(x => x !== k)) + ': ' : '') + 'add ' + andJoin(more)   // a short oil is not said to back up
      : stuck.length ? `${oilWords(stuck)}: nothing uses ${stuck.length > 1 ? 'them' : 'it'}` : '';
    for (const k of ['h', 'l', 'p']) {
      if (!((N.r > 0 && (!basic || k === 'p')) || D[k] > 0)) continue;
      const item = OIL_ITEM[k], own = refSum(oilIn, item);   // coal liquefaction takes some of its own heavy oil
      const made = refSum(oilOut, item) + crackOut[k], used = D[k] + crackIn[k] + own;
      const miss = basic && k !== 'p' ? D[k] : shortOf(k), pct = made > 0 ? Math.min(100, used / made * 100) : 100;
      let b;
      if (miss > 0 && (N.r > 0 || (basic && k !== 'p'))) b = { st: 'short', miss, html: cell('short', `${fmt(miss)} per second short${why(k) ? `<small>${why(k)}</small>` : ''}`, pct) };
      else if (D[k] > 0 && !N.r) b = { st: 'none', miss: 0, html: cell('none', `not entered<small>add ${fmt(Math.ceil(need.R - 1e-9))} × Oil refinery</small>`, 100) };
      else if (anyShort && !(D[k] > 0) && (stuck.includes(k) || backed.includes(k))) b = { st: null, html: cell('none', 'backs up<small>nothing uses it</small>', 100) };
      else { const lo = made - used, tip = used ? '' : 'nothing uses it'; b = lo > 1e-6 * Math.max(1, made) ? { st: 'spare', html: cell('spare', `fulfilled<small>${fmt(lo)} per second left over</small>`, pct, tip) } : { st: 'balanced', html: cell('spare', 'fulfilled', pct, tip) }; }
      tally('oil', b.st, item, nameOf(item), item, fmt(miss) + ' per second', D[k] ? miss / D[k] : 1);
      const crackers = !basic && k === 'l' && N.a ? ` + ${fmt(N.a)} × Chemical plant` : !basic && k === 'p' && N.b ? ` + ${fmt(N.b)} × Chemical plant` : '';
      // what makes it: your refineries on each processing that makes it, and the cracking that turns the oil before into it
      const makers = Object.keys(OIL_PROC).filter(m => N.rm[m] > 0 && oilOut(OIL_PROC[m], item, 'oil-refinery') > 0).map(m => ({ by: 'refinery', label: manyProc ? `Oil refineries (${OIL_PROC_NAME[m]})` : 'Oil refineries', go: '#c/oil', rate: N.rm[m] * oilOut(OIL_PROC[m], item, 'oil-refinery'), machines: N.rm[m], machine: 'oil-refinery' }));
      if (crackOut[k] > 1e-9) makers.push({ by: k === 'l' ? 'heavy-oil-cracking' : 'light-oil-cracking', label: k === 'l' ? 'Heavy oil cracking' : 'Light oil cracking', go: '#c/oil', rate: crackOut[k], machines: k === 'l' ? N.a : N.b, machine: cp });
      const list = by[k].slice();
      if (own > 1e-9) list.push({ by: 'refinery', label: 'Coal liquefaction', go: '#c/oil', rate: own, machines: N.rm.coal || 0, machine: 'oil-refinery' });
      if (crackIn[k] > 1e-9) list.push({ by: k === 'h' ? 'heavy-oil-cracking' : 'light-oil-cracking', label: k === 'h' ? 'Heavy oil cracking' : 'Light oil cracking', go: '#c/oil', rate: crackIn[k], machines: k === 'h' ? N.a : N.b, machine: cp });
      head.oil.push(sumRow(item, item, nameOf(item), basic || k === 'h' ? 'from your refineries' : k === 'l' ? 'from your refineries and heavy oil cracking' : 'from your refineries and light oil cracking',
        N.r ? `${fmt(N.r)} × Oil refinery${crackers}` : 'no refineries entered', made, used, 'per second', b, list.length || makers.length > 1, flowRows(makers, list, true)));
    }

    // every item row, in the tab of the machine that makes it; crude oil goes first on the Oil tab, above the refineries
    // that take it, with your pumpjacks' yield (the % the game shows on an oil field), which sets how much each one pumps
    const oilFirst = [];
    const yieldLine = () => `<div class="sub">pumpjacks at <input class="yld" data-yield inputmode="decimal" value="${fmtIn(S.jackYield * 100)}" tabindex="-1" aria-label="pumpjack yield in percent">% yield, ${fmt(FD.resources['crude-oil'].amount * (1 + S.mp / 100) * S.jackYield)} per second each</div>`;
    for (const i of ids) {
      const tab = tabOf(i), fluid = isFluid(i), made = have[i] || 0, list = uses[i] || [], used = list.reduce((a, u) => a + u.rate, 0);
      const im = itemMachine(i);
      let mach, makes = `<div class="td amt" data-label="makes, ${esc(unitOf(fluid))}">${made ? amountText(made, fluid) : '<span class="sub">–</span>'}</div>`;
      if (im) mach = facBox(i, im.k, made ? im.k * made : null, im);
      else {   // nothing makes it by the machine: type the amount
        mach = `<div class="td mach" data-label="# machines making it"><span class="sub">${originText(i) || 'not made by a machine'}</span></div>`;
        makes = `<div class="td amt" data-label="makes, ${esc(unitOf(fluid))}"><input class="num" inputmode="decimal" data-path="${i}" data-k="1" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${made ? fmtIn(toUnit(made, fluid)) : ''}" placeholder="0" aria-label="amount of ${esc(nameOf(i))} made">${fluid ? '<span class="unit">per second</span>' : ''}</div>`;
      }
      const b = balance(made, used, v => amtWord(v, fluid), im ? im.k : 0, im ? im.machine : null);
      tally(tab, b.st, i, nameOf(i), i, amtWord(b.miss, fluid), used ? b.miss / used : 1);
      const page = isResource(i) || (FD.items[i] && Engine.byProduct[i] && !Engine.LEAVES.has(i)) ? '#i/' + i : CARD_FEED[i] ? '#c/' + CARD_FEED[i].card : null;
      const link = page ? `<a class="lnk" href="${page}" data-go="${page}" title="Open ${esc(nameOf(i))}">${esc(nameOf(i))}</a>` : `<b>${esc(nameOf(i))}</b>`;
      // what makes it: your machines (each part of a split row), the drills or pumps on a resource, or the amount you typed
      const makers = runsOf[i] ? runsOf[i].map(([t, r]) => ({ by: i, label: partsOf(i) ? FD.recipes[t.recipe].name : nameOf(i), go: page || '#i/' + i, rate: r, machines: t.kMach * r, machine: t.machine }))
        : made ? [(() => { const s = supply(i, 1); return { by: i, label: nameOf(i), go: page || '#i/' + i, rate: made, machines: s ? s.k * made : 0, machine: s ? s.id : null, what: s ? '' : originText(i) || 'what you entered' }; })()] : [];
      const rowHtml = (`<div class="tr${made ? ' product' : ''}" data-fac="${i}"><div class="td item" style="--d:0">${expBtn(i, list.length || makers.length > 1, 'what makes and uses ' + nameOf(i))}${ic(i)}<span class="nmtxt">${link}${nick(i)}${i === 'crude-oil' ? yieldLine() : ''}${rmBtn(i, nameOf(i), made > 0)}</span></div>${mach}${makes}<div class="td amt" data-label="your factory uses, ${esc(unitOf(fluid))}">${used ? amountText(used, fluid) : '<span class="sub">–</span>'}</div>${b.html}</div>` + (facOpen.has(i) ? flowRows(makers, list, fluid) : ''));
      (i === 'crude-oil' ? oilFirst : body[tab]).push(rowHtml);
      if (i === 'coal' || i === 'water') shared[i] = rowHtml;
    }

    // on the Oil tab, the other things its machines take sit with crude oil: coal and steam for coal liquefaction, water
    // for refineries, cracking and the chemical plants (the same rows as on Mining & smelting and Power, counted there)
    const byOil = x => (UNITS[x] ? UNITS[x].tab : tabOf(x)) === 'oil';
    const oilInputs = facTab !== 'oil' ? [] : ['coal', 'steam', 'water'].filter(x => shared[x] && (x === 'steam' ? steam.uses : uses[x] || []).some(u => byOil(u.by))).map(x => shared[x]);
    head.oil.unshift(...oilFirst, ...oilInputs);
    // the page: tabs (red counts where something is short), the summary for this tab, its rows, its add row
    const line = `<div class="tr line"><div class="td"><span class="rule"></span></div></div>`;
    const tabs = facTab === 'all' ? FAC_ORDER : [facTab];
    // a count's filter: only the rows that count counts (a dismissed shortage is not counted), plus any it has shown since
    // you turned it on, so a row you fix stays until you turn it off
    const FILT = { short: (k, st) => st === 'short' && !facDismiss.has(k), none: (k, st) => st === 'none', ok: (k, st) => st === 'balanced' || st === 'spare' };
    if (FILT[facFilter]) for (const [k, st] of Object.entries(rowSt)) if (FILT[facFilter](k, st)) facFiltSeen.add(k);
    // Steam and Electricity have no box of their own: the rows that make them come with them
    const OILU = ['unit:refinery', 'unit:heavy-oil-cracking', 'unit:light-oil-cracking'];
    for (const [k, makers] of [['steam', ['unit:boiler']], ['power', ['unit:steam-engine', 'unit:solar-panel']], ['heavy-oil', OILU], ['light-oil', OILU], ['petroleum-gas', OILU]]) if (facFiltSeen.has(k)) for (const m of makers) facFiltSeen.add(m);
    const keyOf = h => (/data-fac="([^"]*)"/.exec(h) || [])[1];
    const groups = tabs.map(t => head[t].concat(body[t]).filter(h => !facFilter || facFiltSeen.has(keyOf(h)))).filter(g => g.length);
    const cnt = tabs.reduce((a, t) => ({ short: a.short + counts[t].short, none: a.none + counts[t].none, ok: a.ok + counts[t].ok }), { short: 0, none: 0, ok: 0 });
    const here = list => list.filter(s => tabs.includes(s.tab)).sort((a, b) => b.share - a.share);
    const shortHere = here(shorts), wavedHere = here(waved);
    const entered = anyKept();
    // the short list: each name goes to its row, × dismisses it (a shortage you are fine with). Dismiss all and Bring back act on
    // this tab (Everything: every tab). Dismissing changes only this list, the short count and the tabs' red counts, never a row.
    const dids = list => esc(list.map(s => s.did).join(' '));
    const onTab = facTab === 'all' ? '' : ' on this tab';
    const chip = s => `<span class="chip2 short dz"><button class="go" data-focus-f="${esc(s.did)}" tabindex="-1" title="Go to ${esc(s.label)}">${ic(s.icon, 'sm')}${esc(s.label)}${s.txt ? `<span class="sub">${s.txt}</span>` : ''}</button><button class="x" data-dismiss-f="${esc(s.did)}" tabindex="-1" title="Dismiss: you are fine being short on ${esc(s.label)}" aria-label="Dismiss ${esc(s.label)}">×</button></span>`;
    const dismissAll = shortHere.length ? `<button class="iconbtn sm" data-dismiss-f="${dids(shortHere)}" tabindex="-1" title="Dismiss every shortage listed${onTab}">Dismiss all</button>` : '';
    const bringBack = wavedHere.length ? `<button class="iconbtn sm" data-undismiss-f="${dids(wavedHere)}" tabindex="-1" title="List the shortages you dismissed${onTab} again">Bring back ${wavedHere.length} dismissed</button>` : '';
    // each count is also a filter (a count of 0 is not, unless it is on); short is always shown
    const filt = (f, n, cls, label, tip) => `<button class="s${cls}${facFilter === f ? ' on' : ''}" data-fac-filter="${f}" tabindex="-1" aria-pressed="${facFilter === f}" title="${facFilter === f ? 'Show every row again' : tip}"><b>${n}</b> ${label}</button>`;
    const counted = (cnt.short || facFilter === 'short' ? filt('short', cnt.short, cnt.short ? ' short' : '', 'short', 'Show only what is short') : `<span class="s"><b>0</b> short</span>`)
      + (cnt.none || facFilter === 'none' ? filt('none', cnt.none, ' none', 'used but not entered', 'Show only what your factory uses with nothing entered making it (so it cannot tell whether you have enough)') : '')
      + (cnt.ok || facFilter === 'ok' ? filt('ok', cnt.ok, '', 'fulfilled', 'Show only what is made at least as fast as your factory uses it') : '');
    const sum = entered || facFilter ? `<div class="summary fac-sum">${counted}${shortHere.length ? `<span class="chiprow"><span class="lead">Short:</span>${shortHere.map(chip).join('')}</span>` : ''}${dismissAll}${bringBack}</div>` : '';
    const badge = t => { const n = t === 'all' ? FAC_ORDER.reduce((a, x) => a + counts[x].short, 0) : counts[t].short; return n ? `<span class="n" title="${n} short">${n}</span>` : ''; };
    const tabBar = `<div class="factabs" role="tablist">${FAC_TABS.map(([t, label, icon]) => `<button tabindex="-1" role="tab" data-fac-tab="${t}" class="${t === facTab ? 'on' : ''}">${icon ? icb(icon, 'xs') : ''}<span>${esc(label)}</span>${badge(t)}</button>`).join('')}</div>`;
    const th = `<div class="th">Item</div><div class="th"># Machines making it</div><div class="th amth">Makes<span class="u">in ${esc(unitShort())}</span></div><div class="th amth">Your factory uses<span class="u">in ${esc(unitShort())}</span></div><div class="th amth">Left over</div>`;
    const intro = entered ? 'What you have making each item, and what is left after your own factory uses it. Rows marked "not entered" are things your machines use that you have not entered.'
      : 'Nothing entered yet. Each tab\'s dashed row adds what you have; Everything shows it all together.';
    // dismissing only changes the top: redraw the tabs and the summary, and leave everything below them as it is
    if (topOnly) {
      const s = $('#main .fac-sum'), tb = $('#main .factabs');
      if (s && tb && sum) { const cr = s.querySelector('.chiprow'), x = cr ? cr.scrollLeft : 0; s.outerHTML = sum; tb.outerHTML = tabBar; const cr2 = $('#main .fac-sum .chiprow'); if (cr2) cr2.scrollLeft = x; return; }
    }
    const filtEmpty = facFilter === 'short' ? (facTab === 'all' ? 'Nothing is short' : 'Nothing on this tab is short') + (wavedHere.length ? ', apart from what you dismissed.' : '.')
      : facFilter === 'ok' ? (facTab === 'all' ? 'Nothing is fulfilled yet.' : 'Nothing on this tab is fulfilled yet.')
      : facTab === 'all' ? 'Everything your factory uses is entered.' : 'Everything on this tab that your factory uses is entered.';
    $('#main').innerHTML = `
      <h1>${ic('assembling-machine-2', 'lg')}<span class="ttl">Your factory<div class="sub">${intro}</div></span></h1>
      ${tabBar}${sum}
      <div class="tbl fac" id="tree">${th}${groups.map(g => g.join('')).join(line)}${groups.length ? line : ''}${facFilter ? (groups.length ? '' : `<div class="tr full"><div class="td"><span class="sub">${filtEmpty}</span></div></div>`) : addRowHtml()}</div>
      ${facFilter ? '' : bpHtml()}
      ${facTabKept(facTab) ? `<div class="summary" id="forget"><button class="iconbtn sm" data-forget="ask" title="${facTab === 'all' ? 'Forget every number, machine choice and opened row you entered, on every page' : 'Forget every number and machine choice you entered on this tab; the other tabs keep theirs'}" tabindex="-1">${facTab === 'all' ? 'Clear all' : 'Clear this tab'}</button></div>` : ''}`;
    doc.title = 'Your factory – Factorio Ratios';
  }

  // the dashed "add" row at the bottom of a tab: name, then how many, then Enter or Add
  let addSel = null;   // { kind: 'item' | 'unit', id }
  const addName = s => s.kind === 'unit' ? UNITS[s.id].name : nameOf(s.id);
  const addIcon = s => s.kind === 'unit' ? UNITS[s.id].icon : s.id;
  function addMachineHtml(s) {
    if (s.kind === 'unit') { const m = UNITS[s.id].machine || s.id; return `${ic(m)}<span class="mname">${esc(nameOf(m))}</span>`; }
    const im = itemMachine(s.id);
    return im ? `${icb(im.machine)}<span class="mname">${esc(nameOf(im.machine))}</span>` : '<span class="sub">amount per second</span>';
  }
  const addRowHtml = () => `<div class="tr add"><div class="td item" style="--d:0"><span class="exp none"></span>${addSel ? ic(addIcon(addSel)) : ''}<input class="txt" id="addq" placeholder="${esc(ADD_HINT[facTab])}" autocomplete="off" spellcheck="false" aria-label="what to add" value="${addSel ? esc(addName(addSel)) : ''}"></div><div class="td mach" data-label="how many"><input class="num" id="addn" inputmode="decimal" placeholder="1" aria-label="how many"><span class="mbtn" id="addm">${addSel ? addMachineHtml(addSel) : ''}</span></div><div class="td amt"></div><div class="td amt"></div><div class="td amt"><button class="iconbtn sm" data-add tabindex="-1" title="Add it to your factory">Add</button></div></div><div class="tr add-hits"><div class="td" id="addhits"></div></div>`;
  // what a tab's add row offers: only what belongs in that tab (Everything: anything)
  function addCandidates(tab) {
    const out = [], seen = new Set();
    for (const [id, u] of Object.entries(UNITS)) if (!u.part && (tab === 'all' || u.tab === tab)) out.push({ kind: 'unit', id, name: u.name, keys: u.keys, pri: 6 });
    // what pumps them: crude oil is entered as its pumpjacks, water as its offshore pumps (the Pumpjack and Offshore pump
    // rows on Assembling are the machines that build them), so those names find these rows first
    const PUMPED = { 'crude-oil': ['pumpjack', 'pumpjacks', 'oil well'], water: ['offshore pump', 'offshore pumps'] };
    const keysOf = (id, keys) => PUMPED[id] ? (keys || []).concat(PUMPED[id]) : keys;
    for (const e of INDEX) if (e.kind === 'item' && !OIL_PRODUCTS.includes(e.id) && e.id !== 'steam' && (tab === 'all' || tabOf(e.id) === tab)) { out.push({ kind: 'item', id: e.id, name: e.name, keys: keysOf(e.id, e.keys), pri: PUMPED[e.id] ? 8 : e.pri }); seen.add(e.id); }
    for (const id of ['crude-oil', 'uranium-ore', 'uranium-235', 'uranium-238']) if (!seen.has(id) && FD.items[id] && (tab === 'all' || tabOf(id) === tab)) out.push({ kind: 'item', id, name: nameOf(id), keys: keysOf(id, ALIASES[id] || []), pri: PUMPED[id] ? 8 : 3 });
    return out;
  }
  function addSearch(text) {
    const q = text.trim().toLowerCase().replace(/-/g, ' '); if (!q) return [];
    const toks = q.split(/\s+/);
    const score = e => {
      const nm = e.name.toLowerCase().replace(/-/g, ' '), ws = nm.split(/\s+/), keys = (e.keys || []).map(k => k.toLowerCase());
      if (nm === q || keys.includes(q)) return 100;
      if (nm.startsWith(q)) return 90;
      if (keys.some(k => k.startsWith(q))) return 84;
      if (toks.every(t => ws.some(w => w.startsWith(t)))) return 80;
      if (nm.includes(q)) return 60;
      if (keys.some(k => k.includes(q))) return 55;
      return 0;
    };
    return addCandidates(facTab).map(e => ({ e, s: score(e) })).filter(x => x.s > 0)
      .sort((a, b) => (b.s + (b.e.pri || 0)) - (a.s + (a.e.pri || 0)) || a.e.name.localeCompare(b.e.name)).slice(0, 8).map(x => x.e);
  }
  // every option a tab's add row offers, in game order: shown as soon as you click the add box
  const addTabOf = e => e.kind === 'unit' ? UNITS[e.id].tab : tabOf(e.id);
  function addList() {
    const c = addCandidates(facTab), units = c.filter(e => e.kind === 'unit'), items = c.filter(e => e.kind === 'item').sort((a, b) => facOrder(a.id, b.id));
    return FAC_ORDER.flatMap(t => units.filter(e => addTabOf(e) === t).concat(items.filter(e => addTabOf(e) === t)));
  }
  function addQuery(text) {
    const h = $('#addhits'); if (!h) return;
    addSel = null; const m = $('#addm'); if (m) m.innerHTML = '';
    const t = text.trim(), whole = !t, list = whole ? addList() : addSearch(text);
    const tabName = tb => FAC_TABS.find(x => x[0] === tb)[1], where = facTab === 'all' ? '' : ' in ' + tabName(facTab);
    const chip = (e, sub) => `<button class="chip2" data-add-pick="${e.kind}:${e.id}" tabindex="-1">${ic(e.kind === 'unit' ? UNITS[e.id].icon : e.id, 'sm')}${esc(e.name)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</button>`;
    let html;
    if (whole && facTab === 'all') html = FAC_ORDER.map(tb => { const g = list.filter(e => addTabOf(e) === tb); return g.length ? `<span class="lead add-group">${esc(tabName(tb))}</span>${g.map(e => chip(e)).join('')}` : ''; }).join('');
    else html = list.map(e => chip(e, facTab === 'all' ? tabName(addTabOf(e)) : '')).join('');   // a search on Everything says where each match goes
    h.innerHTML = html ? `<div class="add-head"><button class="iconbtn sm" data-add-close tabindex="-1" title="Close the list" aria-label="Close the list">−</button></div>${html}` : (t ? `<span class="sub">nothing called that${esc(where)}</span>` : '');
    h.classList.toggle('all', whole);
  }
  function addClose() { const h = $('#addhits'); if (h) { h.innerHTML = ''; h.classList.remove('all'); } }
  function addPick(key) {
    const i = key.indexOf(':'); addSel = { kind: key.slice(0, i), id: key.slice(i + 1) };
    const q2 = $('#addq'), m = $('#addm'), n = $('#addn'), h = $('#addhits');
    if (q2) q2.value = addName(addSel);
    if (m) m.innerHTML = addMachineHtml(addSel);
    if (h) h.innerHTML = '';
    if (n) { n.focus(); n.select(); }
  }
  function addItem() {
    if (!addSel) {   // nothing picked yet: an empty box opens the list; a typed name takes the best match
      const q2 = $('#addq');
      if (!q2 || !q2.value.trim()) { addQuery(''); if (q2) q2.focus(); return; }
      const first = $('#addhits .chip2'); if (first) addPick(first.dataset.addPick);
      if (!addSel) { q2.focus(); return; }
    }
    const nEl = $('#addn'), text = ((nEl || {}).value || '').trim() || '1';
    if (addSel.kind === 'unit') {
      const v = parseFloat(text); if (!(v > 0)) { if (nEl) nEl.classList.add('bad'); return; }
      facUnits[addSel.id === 'refinery' ? REF_KEY[refMain()] : addSel.id] = v; persist(); clearViews();   // refineries: on the processing you have most of
    } else {
      const id = addSel.id, im = itemMachine(id), p = parseBox(text, 'mach', isFluid(id));
      if (!p) { if (nEl) nEl.classList.add('bad'); return; }
      const rate = p.kind === 'rate' ? p.perS : im ? p.v / im.k : p.v;   // "8" machines, or "2 lanes" / "15/s"; no machine: units per second
      if (!(rate > 0)) return;
      pin(id);
      const st = chainState(id); if (partsOf(id)) { st.parts[0].scale = rate; st.scale = partsTotal(st); } else st.scale = rate;   // a split row: its first part
      st.anchor = { path: id, kind: 'mach' }; st.touched = true;
      saveChain(id, st); clearViews();
    }
    addSel = null; renderFactory(true);
    const q2 = $('#addq'); if (q2 && fine()) q2.focus();   // on a phone that would bring the keyboard and the list back over the ledger
  }
  let restoringFocus = false;
  // a box on the ledger: an item's number (empty or 0 takes it out) or a unit's count; then the whole page is recounted
  function onFactoryInput(inp) {
    const id = inp.dataset.path, text = inp.value, t = text.trim();
    if (id.startsWith('unit:')) {
      const v = t === '' ? 0 : parseFloat(t);
      if (!(v >= 0) || !isFinite(v)) { inp.classList.add('bad'); return; }
      facUnits[inp.dataset.proc ? REF_KEY[inp.dataset.proc] : id.slice(5)] = v; if (!(v > 0)) facKeep.add(id);   // a refinery line: its processing's count
      inp.classList.remove('bad'); persist(); clearViews();
    } else {
      const st = chainState(id);
      let rate = 0;
      if (t !== '') { const p = parseBox(t, inp.dataset.kind, inp.dataset.fluid === '1'); if (!p) { inp.classList.add('bad'); return; } rate = p.kind === 'rate' ? p.perS : p.v / parseFloat(inp.dataset.k); }
      if (inp.dataset.part !== undefined && st.parts) {   // one part of a split row: the row's number is the parts' sum
        st.parts[Number(inp.dataset.part)].scale = rate > 0 ? rate : 0; st.scale = partsTotal(st);
        st.anchor = { path: id, kind: 'mach' }; st.touched = st.scale > 0; if (!st.touched) facKeep.add(id);
      }
      else if (rate > 0) { pin(id); st.scale = rate; st.anchor = { path: id, kind: inp.dataset.kind === 'rate' ? 'rate' : 'mach' }; st.touched = true; }
      else { st.scale = null; st.anchor = null; st.touched = false; facKeep.add(id); }   // blank or any zero: out of the factory, row kept while you are here
      inp.classList.remove('bad');
      saveChain(id, st); clearViews();
    }
    const sel = [inp.selectionStart, inp.selectionEnd], orig = inp.dataset.orig;
    renderFactory(true);
    const again = $(`#main input.num[data-path="${id}"]${inp.dataset.part !== undefined ? `[data-part="${inp.dataset.part}"]` : inp.dataset.proc ? `[data-proc="${inp.dataset.proc}"]` : ''}`);
    if (again) { again.value = text; restoringFocus = true; again.focus(); restoringFocus = false; if (orig !== undefined) again.dataset.orig = orig; try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { } }
  }
  // the machine (and recipe) picker on a ledger row
  function openFacPick(btn, id) {
    closePop();
    const parts = partsOf(id), j = btn.dataset.part === undefined ? null : Number(btn.dataset.part);
    const im = parts && j !== null ? partMachine(id, parts[j]) : itemMachine(id); if (!im) return;
    const opts = im.options.length > 1 ? `<span class="lead">${esc(nameOf(id))} is made in:</span>` + im.options.map(m => `<button data-fac-m="${m}" class="${m === im.machine ? 'on' : ''}" tabindex="-1">${icb(m)}<span>${esc(nameOf(m).replace('Assembling machine', 'Assembler'))}</span></button>`).join('') : '';
    const recs = (im.recipes || []).length > 1 ? `<span class="lead">using recipe:</span>` + im.recipes.map(rid => `<button data-fac-r="${rid}" class="${rid === im.recipe ? 'on' : ''}" tabindex="-1">${ic(rid, 'sm')}<span>${esc(FD.recipes[rid].name)}</span></button>`).join('') : '';
    popEl = doc.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = opts + recs;
    popEl.dataset.facItem = id; if (j !== null) popEl.dataset.part = j;
    doc.body.appendChild(popEl);
    placePop(btn);
  }
  // a new machine or recipe for a factory item: you still have the same number of machines
  function facSetMachine(id, machine, recipe, part) {
    const parts = partsOf(id);
    if (parts && part !== undefined && part !== '') {   // one part of a split row: the same machines on the new choice
      const st = chainState(id), p = parts[Number(part)], before = partMachine(id, p), count = p.scale > 0 ? p.scale * before.k : 0;
      if (recipe && recipe !== p.recipe) { p.recipe = recipe; const opts = partMachine(id, { recipe }).options; if (!opts.includes(p.machine)) p.machine = opts[0]; }
      if (machine) p.machine = machine;
      if (count > 0) p.scale = count / partMachine(id, p).k;
      // two parts on the same recipe and machine are one part
      for (let x = parts.length - 1; x > 0; x--) { const y = parts.findIndex(q => q !== parts[x] && q.recipe === parts[x].recipe && q.machine === parts[x].machine); if (y >= 0 && y < x) { parts[y].scale = (parts[y].scale || 0) + (parts[x].scale || 0); parts.splice(x, 1); } }
      facPartsSettled(id, st);
      closePop(); persist(); clearViews(); renderFactory(true); return;
    }
    const st = chainState(id), before = itemMachine(id), count = saved(st) && before ? st.scale * before.k : null;
    if (machine) machineOf[id] = machine;
    if (recipe) recipeOf[id] = recipe;
    const after = itemMachine(id); if (count !== null && after) st.scale = count / after.k;
    closePop(); persist(); clearViews(); renderFactory(true);
  }
  // the refinery row's lines: a picker for which processing a line runs (its refineries move there), another processing,
  // or one taken off (its refineries go)
  function openRefPick(btn, from) {
    closePop();
    popEl = doc.createElement('div'); popEl.className = 'pop';
    popEl.innerHTML = `<span class="lead">These refineries run:</span>` + Object.keys(OIL_PROC).map(m => `<button data-ref-to="${m}" class="${m === from ? 'on' : ''}" tabindex="-1">${ic(OIL_PROC[m], 'sm')}<span>${esc(FD.recipes[OIL_PROC[m]].name)}</span></button>`).join('');
    popEl.dataset.refFrom = from; doc.body.appendChild(popEl); placePop(btn);
  }
  const refLines = () => { const s = Object.keys(OIL_PROC).filter(m => refN(m) > 0 || refShown.has(m)); return s.length ? s : [refMain()]; };
  function refMove(from, to) {
    if (from !== to) {
      facUnits[REF_KEY[to]] = refN(to) + refN(from); facUnits[REF_KEY[from]] = 0;
      refShown.delete(from); refShown.add(to);
      // with one processing on the row, it is also the one the Oil page plans with and new refineries run
      if (refLines().length <= 1) { const st = cardState('oil'); st.basic = to === 'basic'; st.coal = to === 'coal'; saveCard('oil', st); }
    }
    closePop(); persist(); clearViews(); renderFactory(true);
  }
  function refAddLine() {
    const shown = refLines(), next = Object.keys(OIL_PROC).find(m => !shown.includes(m)); if (!next) return;
    for (const m of shown) refShown.add(m);
    refShown.add(next); renderFactory(true);
    const box = $(`#main input.num[data-path="unit:refinery"][data-proc="${next}"]`); if (box && fine()) box.focus();
  }
  function refDropLine(m) { facUnits[REF_KEY[m]] = 0; refShown.delete(m); facKeep.add('unit:refinery'); persist(); clearViews(); renderFactory(true); }
  // after parts change: the first part is the row's machine and recipe, the row's number is their sum, and a row left with
  // one part is a plain row again
  function facPartsSettled(id, st) {
    const q = st.parts[0];
    if (q) { machineOf[id] = q.machine; recipeOf[id] = q.recipe; }
    if (st.parts.length < 2) { st.scale = q ? q.scale : null; delete st.parts; } else st.scale = partsTotal(st);
    st.touched = st.scale > 0; if (!st.touched) facKeep.add(id);
  }
  // another recipe on a row: a part at 0 for the next recipe it does not use yet
  function facAddPart(id) {
    const st = chainState(id), im = itemMachine(id); if (!im) return;
    if (!st.parts || st.parts.length < 2) st.parts = [{ recipe: im.recipe, machine: im.machine, scale: saved(st) ? st.scale : 0 }];
    const next = (im.recipes || []).find(r => !st.parts.some(p => p.recipe === r)); if (!next) return;
    st.parts.push({ recipe: next, machine: partMachine(id, { recipe: next }).machine, scale: 0 });
    facPartsSettled(id, st); chainMem[id] = st; persist(); renderFactory(true);
    const box = $(`#main input.num[data-path="${id}"][data-part="${st.parts.length - 1}"]`); if (box && fine()) box.focus();
  }
  function facDropPart(id, j) {
    const st = chainState(id); if (!st.parts) return;
    st.parts.splice(j, 1); facPartsSettled(id, st);
    persist(); clearViews(); renderFactory(true);
  }
  // Remove on a ledger row: its count, machine and recipe choice, and dismissal go; the row stays while you are on the
  // page, with Put back
  function facRemove(key) {
    const was = { dismissed: facDismiss.has(key) };
    if (key === 'unit:refinery') {   // every processing's refineries go, and come back together
      was.mix = refMix(); was.txt = Object.keys(OIL_PROC).filter(m => was.mix[m] > 0).map(m => `${fmt(was.mix[m])} × Oil refinery (${OIL_PROC_NAME[m]})`).join(' and ');
      for (const m of Object.keys(OIL_PROC)) facUnits[REF_KEY[m]] = 0;
    }
    else if (key.startsWith('unit:')) { const id = key.slice(5); was.n = facUnits[id]; was.txt = `${fmt(was.n)} × ${nameOf(UNITS[id].machine || id)}`; facUnits[id] = 0; }
    else {
      const st = chainState(key), im = itemMachine(key), fl = isFluid(key);
      const parts = partsOf(key), each = parts && parts.filter(p => p.scale > 0).map(p => { const pm = partMachine(key, p); return `${fmt(p.scale * pm.k)} × ${nameOf(pm.machine)}`; });
      Object.assign(was, { scale: st.scale, anchor: st.anchor, machine: machineOf[key], recipe: recipeOf[key], parts: parts ? parts.map(p => Object.assign({}, p)) : null,
        txt: each ? each.join(' and ') : im ? `${fmt(st.scale * im.k)} × ${nameOf(im.machine)}` : `${fmt(toUnit(st.scale, fl))} ${fl ? 'per second' : unitWord(toUnit(st.scale, fl))}` });
      st.scale = null; st.anchor = null; st.touched = false; delete st.parts; delete machineOf[key]; delete recipeOf[key];
    }
    facRemoved[key] = was; facDismiss.delete(key); facKeep.add(key);
    closePop(); persist(); clearViews(); renderFactory(true);
  }
  function facPutBack(key) {
    const was = facRemoved[key]; if (!was) return;
    if (was.mix) for (const m of Object.keys(OIL_PROC)) facUnits[REF_KEY[m]] = was.mix[m];
    else if (key.startsWith('unit:')) facUnits[key.slice(5)] = was.n;
    else {
      const st = chainState(key); st.scale = was.scale; st.anchor = was.anchor; st.touched = true;
      if (was.parts) st.parts = was.parts; else delete st.parts;
      if (was.machine) machineOf[key] = was.machine; else delete machineOf[key];
      if (was.recipe) recipeOf[key] = was.recipe; else delete recipeOf[key];
    }
    if (was.dismissed) facDismiss.add(key);
    delete facRemoved[key]; closePop(); persist(); clearViews(); renderFactory(true);
  }
  // the tab a ledger row (or a dismissed shortage) sits in
  const rowTab = k => k === 'power' || k === 'steam' ? 'power' : k.startsWith('unit:') ? (UNITS[k.slice(5)] || {}).tab : tabOf(k);
  // Clear this tab: only what is on that tab (its rows' numbers, machine and recipe choices, dismissals and opened rows, and
  // the tab's own settings: Science's research time and lab speed, Oil's processing and pumpjack yield, Power's boiler fuel).
  // Everything's Clear all: all of it.
  function facTabKept(tab) {
    if (tab === 'all') return anyKept();
    return Object.entries(chainMem).some(([id, v]) => saved(v) && tabOf(id) === tab) || Object.entries(UNITS).some(([id, u]) => u.tab === tab && unitN(id) > 0)
      || [machineOf, recipeOf].some(m => Object.keys(m).some(id => tabOf(id) === tab)) || [...facDismiss].some(d => rowTab(d) === tab)
      || (tab === 'science' && !!cardMem.science && cardKept('science', cardMem.science)) || (tab === 'oil' && !!cardMem.oil && cardKept('oil', cardMem.oil)) || (tab === 'power' && !!cardMem.steam && cardKept('steam', cardMem.steam));
  }
  function forgetTab(tab) {
    if (tab === 'all') { forgetAll(); return; }
    for (const id of Object.keys(chainMem)) if (tabOf(id) === tab) delete chainMem[id];
    for (const [id, u] of Object.entries(UNITS)) if (u.tab === tab) delete facUnits[id];
    for (const m of [machineOf, recipeOf]) for (const id of Object.keys(m)) if (tabOf(id) === tab) delete m[id];
    for (const d of [...facDismiss]) if (rowTab(d) === tab) facDismiss.delete(d);
    for (const k of [...facOpen]) if (rowTab(k) === tab) facOpen.delete(k);
    if (tab === 'science' && cardMem.science) Object.assign(cardMem.science, { time: CARD_DEF.time, bonus: CARD_DEF.bonus });
    if (tab === 'oil' && cardMem.oil) Object.assign(cardMem.oil, { basic: CARD_DEF.basic, coal: CARD_DEF.coal, yield: CARD_DEF.yield });
    if (tab === 'power' && cardMem.steam) cardMem.steam.fuel = CARD_DEF.fuel;
    for (const k of Object.keys(facRemoved)) if (rowTab(k) === tab) delete facRemoved[k];
    for (const k of [...facKeep]) if (rowTab(k) === tab) facKeep.delete(k);
    facFilter = null; facFiltSeen.clear();
    clearViews(); persist();
  }
  // your drills and pumpjacks stay as many when mining productivity or the pumpjacks' yield changes: what they mine changes
  // instead (the ledger keeps what is mined per second, so it is scaled)
  function rescaleMined(f, onlyCrude) {
    if (!(f > 0) || near(f, 1)) return;
    for (const [id, st] of Object.entries(chainMem)) { const res = FD.resources[id]; if (saved(st) && res && (id === 'crude-oil' || (!onlyCrude && res.cat === 'basic-solid'))) st.scale *= f; }
    persist();
  }
  // the crude oil row's yield box: the % the game shows on an oil field
  function setYield(inp) {
    const v = parseFloat(String(inp.value).replace('%', '').replace(',', '.'));
    if (!(v > 0) || !isFinite(v)) { inp.classList.add('bad'); return; }
    const st = cardState('oil'), old = st.yield || 100;
    rescaleMined(v / old, true); st.yield = v; saveCard('oil', st); clearViews();
    if (curCard && curCard.id === 'factory') renderFactory(true); else if (curCard && curCard.id === 'oil') renderOil(); else rerender();
  }

  // ---------- oil processing: what the oil products your factory uses take ----------
  // what the Oil processing page opens at: what your factory uses, else your refineries at full speed, else 20 refineries
  function oilBase(mode, D) {
    if (D.p + D.l + D.h > 0) return { p: D.p, l: D.l, h: D.h };
    return { p: (refN(oilModeOf(mode)) || refAll() || 20) / oilPlan({ p: 1, l: 0, h: 0 }, mode).R, l: 0, h: 0 };
  }
  function renderOil(spec) {
    cur = null; curRes = null;
    const st = cardState('oil'), mode = oilProcOf(st), basic = mode === 'basic', M = factoryModel(), F = M.oil, fac = F.D, hasFac = fac.p + fac.l + fac.h > 0;
    const base = oilBase(mode, fac);
    let dem = st.dem || base, anchor = st.dem ? st.anchor : null, view = null;
    if (spec && spec.n !== null && spec.n > 0) {   // "10 refineries", "8 pumpjacks", "100 crude oil", "3 light oil cracking", "40 petroleum gas"
      const qs = (spec.haveQ || '').toLowerCase(), n = spec.n;
      const box = /pumpjack/.test(qs) ? 'jacks' : /crude/.test(qs) ? 'crude' : /crack/.test(qs) ? (/heavy/.test(qs) ? 'Hc' : 'Lc') : null;
      const k = box ? null : /light/.test(qs) ? 'l' : /heavy/.test(qs) ? 'h' : /petrol|gas/.test(qs) ? 'p' : null;
      let d = null, key = k;
      if (k) d = Object.assign({ p: 0, l: 0, h: 0 }, { [k]: n });
      else {   // a machine or crude oil: what the page opens at, scaled so that box reads n (refineries when nothing else fits)
        const pl = oilPlan(base, mode); key = box && pl[box] > 0 ? box : 'R';
        if (pl[key] > 0) { const f = n / pl[key]; d = { p: base.p * f, l: base.l * f, h: base.h * f }; }
      }
      if (d) { dem = d; anchor = key; view = { dem: d, anchor }; if (!preview) { st.dem = d; st.anchor = anchor; st.anchorN = k ? null : n; } }
    }
    curCard = { id: 'oil', st, fields: [], view };
    const plan = oilPlan(dem, mode), changed = !!anchor;
    const box = (key, v, label) => `<input class="num" inputmode="decimal" data-oil="${key}" value="${fmtIn(v)}" aria-label="${esc(label)}"${anchor === key ? ' data-focus="1"' : ''}>${undoBtn('oil', anchor === key)}`;
    const row = (key, icon, label, sub, v, unit, cls, extra) => `<div class="tr${cls ? ' ' + cls : ''}"><div class="td item"><span class="exp none"></span>${icb(icon)}<span class="nmtxt"><b>${esc(label)}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</span></div><div class="td mach" data-label="how many">${key && (v > 0 || 'plh'.includes(key) && key.length === 1) ? box(key, v, label) + (unit ? '' : `<span class="build">${buildText(v)}</span>`) : `<span class="big">${unit ? fmt(v) : wholeText(v)}</span>${unit ? '' : `<span class="build">${exactText(v)}</span>`}`}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}${extra || ''}</div></div>`;
    const useSub = k => { if (!(fac[k] > 0)) return ''; const names = [...new Set(F.by[k].map(u => (u.label || nameOf(u.by)).toLowerCase()))]; return `your factory uses ${fmt(fac[k])} per second: ${esc(names.join(', '))}`; };
    const vs = k => { if (!hasFac || !changed || !(fac[k] > 0)) return ''; const d = dem[k] - fac[k]; if (Math.abs(d) < 1e-6 * Math.max(1, fac[k])) return ''; return d < 0 ? `<span class="vs short">${fmt(-d)} short</span>` : `<span class="vs spare">fulfilled, ${fmt(d)} left over</span>`; };
    const prods = (basic ? ['p'] : ['p', 'l', 'h']).map(k => row(k, OIL_ITEM[k], nameOf(OIL_ITEM[k]) + ' made', useSub(k), dem[k], 'per second', 'product', vs(k))).join('');
    // beside each machine, how many your factory has, to compare with what this takes
    const machinesOf = id => { const m = itemMachine(id), s = chainMem[id]; return m && saved(s) ? s.scale * m.k : 0; };
    const haveTxt = n => n > 0 ? ` · ${fmt(n)} in your factory` : '';
    // the same names and rates as the ledger's rows
    const rates = oilRates(OIL_PROC[mode], 'oil-refinery');
    const crackRates = rid => { const t = oilRates(rid, 'chemical-plant'); return `chemical plants, each turning ${t.ins} into ${t.outs} per second`; };
    const mach = [row('R', 'oil-refinery', 'Oil refineries', `each takes ${rates.ins} and makes ${rates.outs} per second` + haveTxt(refN(mode)), plan.R)];
    if (!basic) mach.push(row('Hc', 'heavy-oil-cracking', 'Heavy oil cracking', crackRates('heavy-oil-cracking') + haveTxt(unitN('heavy-oil-cracking')), plan.Hc), row('Lc', 'light-oil-cracking', 'Light oil cracking', crackRates('light-oil-cracking') + haveTxt(unitN('light-oil-cracking')), plan.Lc));
    // coal liquefaction takes coal and steam (from boilers) instead of crude oil
    if (mode === 'coal') mach.push(row('coal', 'coal', 'Coal used', '', plan.coal, 'per second'), row('steam', 'steam', 'Steam used', '', plan.steam, 'per second'),
      row('boilers', 'boiler', 'Boilers for that steam', `${fmt(FD.power.boiler.steam_per_s)} steam per second each` + haveTxt(unitN('boiler')), plan.boilers));
    else mach.push(row('crude', 'crude-oil', 'Crude oil used', '', plan.crude, 'per second'), row('jacks', 'pumpjack', 'Pumpjacks', `at ${fmt(S.jackYield * 100)}% yield, ${fmt(FD.resources['crude-oil'].amount * (1 + S.mp / 100) * S.jackYield)} crude oil per second each${haveTxt(machinesOf('crude-oil'))}`, plan.jacks));
    if (!basic) mach.push(row('water', 'water', 'Water used', '', plan.water, 'per second'), row('pumps', 'offshore-pump', 'Offshore pumps', haveTxt(machinesOf('water')).replace(/^ · /, ''), plan.pumps));
    mach.push(row(null, 'small-electric-pole', 'Electricity', mode === 'coal' ? 'refineries and cracking plants' : 'refineries, cracking plants and pumpjacks', plan.mw, 'MW'));
    const notes = [];
    if (!basic) {
      const left = ['p', 'l', 'h'].filter(k => plan.spare[k] > 1e-6), many = left.length > 1, it = many ? 'them' : 'it';
      if (left.length) notes.push(`<div class="note">${left.map(k => fmt(plan.spare[k]) + ' ' + nameOf(OIL_ITEM[k]).toLowerCase()).join(' and ')} per second left over, even with everything cracked. With nothing using ${it}, ${many ? 'they back' : 'it backs'} up and ${many ? 'hold' : 'holds'} the refineries back; solid fuel is the usual way to use ${it} up.</div>`);
    }
    if (basic && (fac.l > 0 || fac.h > 0)) notes.push(`<div class="note">Basic processing makes only petroleum gas. Your factory also uses ${[fac.l > 0 ? fmt(fac.l) + ' light oil' : '', fac.h > 0 ? fmt(fac.h) + ' heavy oil' : ''].filter(Boolean).join(' and ')} per second, which needs advanced processing.</div>`);
    const cracks = ' Cracking turns heavy oil into light oil and light oil into petroleum gas, so the refineries make only what is used.';
    const intro = basic ? `Basic processing: one refinery turns ${rates.ins} into ${rates.outs} per second.`
      : mode === 'coal' ? `Coal liquefaction: one refinery turns ${rates.ins} into ${rates.outs} per second, more heavy oil than it takes.${cracks}`
      : `Advanced processing: one refinery turns ${rates.ins} into ${rates.outs} per second.${cracks}`;
    const yours = refN(mode) || refAll();
    const sized = changed ? '' : hasFac ? 'Sized to what your factory uses.' : yours > 0 ? `Nothing in your factory uses oil yet: this is your ${fmt(yours)} refineries at full speed.` : 'Nothing in your factory uses oil yet: this is 20 refineries.';
    const modeSeg = `<div class="settings" style="margin:0 0 10px"><span class="lead">Processing:</span><span class="seg">${[['basic', 'Basic', 'crude oil into petroleum gas only'], ['advanced', 'Advanced', 'crude oil and water into heavy oil, light oil and petroleum gas, with cracking'], ['coal', 'Coal liquefaction', 'coal and steam into heavy oil, light oil and petroleum gas, with cracking']].map(([v, l, t]) => `<button tabindex="-1" data-oil-mode="${v}" class="${v === mode ? 'on' : ''}" title="${t}">${icb('oil-refinery', 'xs')}<span>${l}</span></button>`).join('')}</span></div>`;
    // "In your factory" once its refineries, the cracking it needs and the pumpjacks for that crude oil are all there
    const want = oilWant(plan, basic), crudeNeed = oilCrudeNeed(want.refinery, mode, M.uses), crudeHave = saved(chainMem['crude-oil']) ? chainMem['crude-oil'].scale : 0;
    const crackOk = (id, n) => basic || !(n > 1e-9) || unitN(id) === want[id], jacksOk = crudeHave >= crudeNeed - 1e-9;
    const inFac = refN(mode) === want.refinery && crackOk('heavy-oil-cracking', plan.Hc) && crackOk('light-oil-cracking', plan.Lc) && jacksOk;
    const btn = !(plan.R > 0) ? '' : inFac ? `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="These machines are in your factory; open the ledger">In your factory ✓</button>`
      : `<button class="iconbtn sm${changed ? ' cta' : ''}" data-oil-tofactory tabindex="-1" title="Put ${want.refinery} refineries${basic ? '' : `, ${want['heavy-oil-cracking']} heavy and ${want['light-oil-cracking']} light oil cracking plants`}${jacksOk ? '' : ` and ${fmt(Math.ceil(crudeNeed * supply('crude-oil', 1).k - 1e-9))} pumpjacks`} into your factory">${refN(mode) > 0 ? 'Update in factory' : '+ Add to factory'}</button>`;
    $('#main').innerHTML = `<h1>${ic('oil-refinery', 'lg')}<span class="ttl">Oil processing<div class="sub">${intro}</div>${sized ? `<div class="sub">${sized}</div>` : ''}</span>${btn}</h1>
      ${modeSeg}${notes.join('')}
      <div class="tbl two"><div class="th">What</div><div class="th">How many</div>${prods}<div class="tr line"><div class="td"><span class="rule"></span></div></div>${mach.join('')}</div>`;
    doc.title = 'Oil processing – Factorio Ratios';
  }
  // the whole machines a plan takes, for "Add to factory"
  const oilWant = (plan, basic) => ({ refinery: Math.ceil(plan.R - 1e-9), 'heavy-oil-cracking': basic ? 0 : Math.ceil(plan.Hc - 1e-9), 'light-oil-cracking': basic ? 0 : Math.ceil(plan.Lc - 1e-9) });
  // the crude oil that many refineries take at full speed, plus what else in your factory takes crude oil
  const oilCrudeNeed = (R, mode, uses) => R * oilIn(OIL_PROC[oilModeOf(mode)], 'crude-oil', 'oil-refinery')
    + Object.keys(OIL_PROC).filter(m => m !== oilModeOf(mode)).reduce((a, m) => a + refN(m) * oilIn(OIL_PROC[m], 'crude-oil', 'oil-refinery'), 0)   // your refineries on another processing
    + ((uses && uses['crude-oil']) || []).filter(u => u.by !== 'refinery').reduce((a, u) => a + u.rate, 0);
  // a box on the Oil processing page: a product sets that product; any machine or flow box scales all three together
  function onOilInput(inp) {
    const key = inp.dataset.oil, text = inp.value, t = text.trim(), st = cardState('oil'), F = factoryModel().oil.D;
    const base = oilBase(oilProcOf(st), F);
    const dem = Object.assign({}, st.dem || base), v = t === '' ? 0 : parseFloat(t);
    if (!(v >= 0) || !isFinite(v)) { inp.classList.add('bad'); return; }
    if ('plh'.includes(key) && key.length === 1) dem[key] = v;
    else {
      const cur0 = oilPlan(dem, oilProcOf(st))[{ R: 'R', Hc: 'Hc', Lc: 'Lc', crude: 'crude', jacks: 'jacks', water: 'water', pumps: 'pumps', coal: 'coal', steam: 'steam', boilers: 'boilers' }[key]];
      if (!(cur0 > 0) || !(v > 0)) { inp.classList.add('bad'); return; }
      const f = v / cur0; dem.p *= f; dem.l *= f; dem.h *= f;
    }
    inp.classList.remove('bad');
    const same = near(dem.p, base.p) && near(dem.l, base.l) && near(dem.h, base.h);
    st.dem = same ? null : dem; st.anchor = same ? null : key; st.anchorN = same || ('plh'.includes(key) && key.length === 1) ? null : v;
    const sel = [inp.selectionStart, inp.selectionEnd], orig = inp.dataset.orig;
    renderOil();
    const again = $(`#main input.num[data-oil="${key}"]`);
    if (again) { again.value = text; restoringFocus = true; again.focus(); restoringFocus = false; if (orig !== undefined) again.dataset.orig = orig; try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { } }
  }

  // ---------- blueprint import: fill the ledger from a blueprint string ----------
  // Each import overwrites the counts of what the blueprint holds and leaves other rows alone. On a tab it only touches
  // that tab's rows (the rest is listed); rows already in the ledger update at once, new ones wait for a tick and Add.
  // Furnaces and drills do not record what they smelt or mine, so you split them. Modules and beacons are ignored.
  let bpImport = null;   // the result of the last import: { tab, total, updated, pending, others, splits, skipped, done, error, unticked, splitVals }
  let bpDraft = '';      // a string pasted into the import box but not imported yet
  async function bpDecode(str) {
    const s = String(str).trim().replace(/\s+/g, '');
    if (s.length < 2 || s[0] !== '0') throw new Error('That is not a blueprint string: they start with 0.');
    let bytes;
    try { const bin = atob(s.slice(1)); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    catch (e) { throw new Error('That is not a blueprint string.'); }
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack blueprint strings; Chrome, Edge or a recent Firefox can.');
    let text;
    try { text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text(); }
    catch (e) { throw new Error('That blueprint string is damaged or cut short.'); }
    try { return JSON.parse(text); } catch (e) { throw new Error('That string does not hold a blueprint.'); }
  }
  // every entity in a blueprint, or in every blueprint of a book (books inside books too)
  function bpEntities(obj, out) {
    out = out || [];
    if (!obj || typeof obj !== 'object') return out;
    if (obj.blueprint) for (const e of obj.blueprint.entities || []) out.push(e);
    if (obj.blueprint_book) for (const b of obj.blueprint_book.blueprints || []) bpEntities(b, out);
    return out;
  }
  const BP_CRAFTERS = new Set(['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'chemical-plant', 'centrifuge', 'rocket-silo']);
  const BP_UNITS = { lab: 'lab', boiler: 'boiler', 'steam-engine': 'steam-engine', 'solar-panel': 'solar-panel' };
  const BP_FURNACES = ['stone-furnace', 'steel-furnace', 'electric-furnace'];
  const SMELTED = ['iron-plate', 'copper-plate', 'steel-plate', 'stone-brick'], ORES = ['iron-ore', 'copper-ore', 'coal', 'stone', 'uranium-ore'];
  // what a group of n machines makes of an item per second
  function bpRate(item, machine, recipe, n) {
    if (item === 'crude-oil') return n * FD.resources['crude-oil'].amount * (1 + S.mp / 100) * S.jackYield;   // pumpjacks at your yield
    if (item === 'water') return n * FD.power.offshore_pump.per_s;
    if (recipe) return n * Engine.perMachine(FD.recipes[recipe], machine, item);
    const res = FD.resources[item];   // a drill on an ore
    return res && FD.machines[machine] ? n * FD.machines[machine].speed / res.time * (1 + S.mp / 100) : 0;
  }
  // one ledger entry for an item from its machines: the machine with the most wins (ties: the faster), and the others
  // count as the same output in that machine, so what the item makes stays exact
  function bpItemEntry(item, groups) {   // groups: { 'machine|recipe': n }
    let rate = 0; const byM = {}, byR = {};
    for (const [key, n] of Object.entries(groups)) {
      const [m, r] = key.split('|');
      rate += bpRate(item, m, r || null, n); byM[m] = (byM[m] || 0) + n; if (r) byR[r] = (byR[r] || 0) + n;
    }
    const speed = m => (FD.machines[m] && FD.machines[m].speed) || 0;
    const machine = Object.keys(byM).sort((a, b) => byM[b] - byM[a] || speed(b) - speed(a))[0];
    const recipe = Object.keys(byR).sort((a, b) => byR[b] - byR[a])[0] || null;
    const one = bpRate(item, machine, recipe, 1);
    // made with more than one recipe (solid fuel from two oils): a part per recipe, each on its most used machine
    const recs = Object.keys(byR), parts = recs.length > 1 ? recs.sort((a, b) => byR[b] - byR[a]).map(r => {
      const g = Object.entries(groups).filter(([key]) => key.split('|')[1] === r), byMr = {};
      for (const [key, n] of g) byMr[key.split('|')[0]] = (byMr[key.split('|')[0]] || 0) + n;
      return { recipe: r, machine: Object.keys(byMr).sort((a, b) => byMr[b] - byMr[a] || speed(b) - speed(a))[0], scale: g.reduce((a, [key, n]) => a + bpRate(item, key.split('|')[0], r, n), 0) };
    }) : null;
    return { kind: 'item', id: item, tab: tabOf(item), machine, recipe, rate, count: one > 0 ? rate / one : 0, parts };
  }
  function bpCount(entities) {
    const items = {}, units = {}, furnaces = {}, drills = {}, skipped = {}, oilMode = { basic: 0, advanced: 0, coal: 0 };
    const add = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
    for (const e of entities) {
      const n = e.name, r = e.recipe, rec = r && FD.recipes[r];
      if (BP_UNITS[n]) add(units, BP_UNITS[n]);
      else if (n === 'oil-refinery') {
        const om = Object.keys(OIL_PROC).find(m => OIL_PROC[m] === r);
        if (om) add(units, REF_KEY[om]);   // each processing's refineries count on their own
        else if (rec) add(skipped, rec.name);
      }
      else if (n === 'chemical-plant' && (r === 'heavy-oil-cracking' || r === 'light-oil-cracking')) add(units, r);
      else if (BP_CRAFTERS.has(n) && rec) {
        const item = rec.main || (rec.out.length === 1 ? rec.out[0][0] : null);
        if (item && FD.items[item] && Engine.byProduct[item] && !Engine.LEAVES.has(item)) add(items[item] = items[item] || {}, n + '|' + r);
        else add(skipped, rec.name);
      }
      else if (n === 'pumpjack') add(items['crude-oil'] = items['crude-oil'] || {}, 'pumpjack|');
      else if (n === 'offshore-pump') add(items.water = items.water || {}, 'offshore-pump|');
      else if (BP_FURNACES.includes(n)) add(furnaces, n);
      else if (DRILLS.includes(n)) add(drills, n);
    }
    return { items, units, furnaces, drills, skipped, oilMode };
  }
  // write one entry into the ledger, pinning its machine (and recipe, when the item has a choice)
  function bpApply(e) {
    if (e.kind === 'unit') { e.before = unitN(e.id); facUnits[e.id] = e.n; return; }
    const st = chainState(e.id), im0 = itemMachine(e.id);
    e.before = saved(st) && im0 ? st.scale * im0.k : 0;
    if (e.recipe && (Engine.byProduct[e.id] || []).length > 1) recipeOf[e.id] = e.recipe;
    const opts = e.recipe ? Engine.machineOptions(FD.recipes[e.recipe]) : FD.resources[e.id] && FD.resources[e.id].cat === 'basic-solid' ? DRILLS : [];
    if (opts.length > 1 && opts.includes(e.machine)) machineOf[e.id] = e.machine;
    if (e.parts) { st.parts = e.parts.map(p => Object.assign({}, p)); recipeOf[e.id] = e.parts[0].recipe; machineOf[e.id] = e.parts[0].machine; } else delete st.parts;
    st.scale = e.rate; st.anchor = { path: e.id, kind: 'mach' }; st.touched = true; chainMem[e.id] = st;
  }
  async function bpRun(str) {
    const tab = facTab;
    bpDraft = '';
    let obj;
    try { obj = await bpDecode(str); } catch (err) { bpImport = { tab, error: err.message }; renderFactory(true); return; }
    const ents = bpEntities(obj);
    if (!ents.length) { bpImport = { tab, error: 'That blueprint has no machines in it.' }; renderFactory(true); return; }
    const c = bpCount(ents), entries = [];
    for (const [item, groups] of Object.entries(c.items)) entries.push(bpItemEntry(item, groups));
    for (const [u, n] of Object.entries(c.units)) entries.push({ kind: 'unit', id: u, tab: UNITS[u].tab, n });
    const inScope = t => tab === 'all' || t === tab;
    const updated = [], pending = [], others = [];
    for (const e of entries) {
      if (!inScope(e.tab)) others.push(e);
      else if (e.kind === 'unit' ? unitN(e.id) > 0 : saved(chainMem[e.id])) { bpApply(e); updated.push(e); }
      else pending.push(e);
    }
    const hasSplit = Object.keys(c.furnaces).length || Object.keys(c.drills).length;
    let splits = null;
    if (hasSplit && inScope('mining')) splits = { furnaces: c.furnaces, drills: c.drills };
    else if (hasSplit) for (const [m, n] of Object.entries(Object.assign({}, c.furnaces, c.drills))) others.push({ kind: 'raw', id: m, tab: 'mining', n });
    if (updated.length) { persist(); clearViews(); }
    bpImport = { tab, total: ents.length, updated, pending, others, splits, skipped: c.skipped, unticked: new Set(), splitVals: {} };
    renderFactory(true);
  }
  // Add: the ticked new rows, and the furnaces and drills as you split them
  function bpConfirm() {
    const b = bpImport; if (!b || b.done || b.error) return;
    const added = [], root = $('#main');
    for (const cb of root.querySelectorAll('input[data-bp-add]')) if (cb.checked) { const e = b.pending[Number(cb.dataset.bpAdd)]; bpApply(e); added.push(e); }
    const groups = {};
    for (const inp of root.querySelectorAll('input[data-bp-split]')) {
      const v = parseFloat(inp.value); if (!(v > 0)) continue;
      const [m, item] = inp.dataset.bpSplit.split('|'), rid = FD.resources[item] ? '' : Engine.byProduct[item][0];
      const g = groups[item] = groups[item] || {}; g[m + '|' + rid] = (g[m + '|' + rid] || 0) + v;
    }
    for (const [item, g] of Object.entries(groups)) { const e = bpItemEntry(item, g); bpApply(e); added.push(e); }
    persist(); clearViews();
    bpImport = { tab: b.tab, total: b.total, done: true, updated: b.updated, added, pending: [], others: b.others, splits: null, skipped: b.skipped };
    renderFactory(true);
  }
  // a furnace or drill line of an import: how many of its machines you have not given an item yet, counted down as you type
  function bpLeft(n, vals) {
    const left = n - vals.reduce((a, v) => a + Math.max(0, parseFloat(v) || 0), 0);
    if (Math.abs(left) < 1e-9) return '<span class="bp-left done">all assigned</span>';
    return left > 0 ? `<span class="bp-left">${fmt(left)} unassigned</span>` : `<span class="bp-left over">${fmt(-left)} too many</span>`;
  }
  // the import box, or what the last import did
  function bpHtml() {
    const tabName = t => FAC_TABS.find(x => x[0] === t)[1];
    const box = `<div class="bp"><span class="lead">Import a blueprint${facTab === 'all' ? '' : ' into ' + esc(tabName(facTab))}:</span><input class="txt" id="bpq" placeholder="Paste a blueprint or blueprint book string" autocomplete="off" spellcheck="false" aria-label="blueprint string" value="${esc(bpDraft)}"><button class="iconbtn sm" data-bp-import tabindex="-1">Import</button></div>`;
    const b = bpImport && bpImport.tab === facTab ? bpImport : null;
    if (!b) return box;
    if (b.error) return `<div class="bp-panel"><span class="bp-err">${esc(b.error)}</span> <button class="iconbtn sm" data-bp-close tabindex="-1">OK</button></div>` + box;
    const name = e => e.kind === 'unit' ? UNITS[e.id].name : nameOf(e.id), icon = e => e.kind === 'unit' ? UNITS[e.id].icon : e.id;
    const what = e => e.kind === 'unit' || e.kind === 'raw' ? fmt(e.n) : e.parts ? e.parts.map(p => `${fmt(p.scale * partMachine(e.id, p).k)} × ${nameOf(p.machine)} (${FD.recipes[p.recipe].name})`).join(' + ') : `${fmt(e.count)} × ${nameOf(e.machine)}`;
    const chip = (e, extra) => `<span class="chip2 static">${ic(icon(e), 'sm')}${esc(name(e))}<span class="sub">${esc(what(e))}${extra || ''}</span></span>`;
    const parts = [`<div class="lead">${b.done ? 'Added from the blueprint.' : `Read ${fmt(b.total)} machines and other entities from the blueprint.`}</div>`];
    if (b.updated.length) parts.push(`<div class="bp-row"><span class="lead">Updated:</span>${b.updated.map(e => chip(e, e.before ? ` (was ${fmt(e.before)})` : '')).join('')}</div>`);
    if (b.added && b.added.length) parts.push(`<div class="bp-row"><span class="lead">Added:</span>${b.added.map(e => chip(e)).join('')}</div>`);
    if (!b.done && b.pending.length) parts.push(`<div class="bp-row"><span class="lead">Not in your factory yet, add them?</span>${b.pending.map((e, i) => `<label class="chip2 bp-pick"><input type="checkbox" data-bp-add="${i}"${b.unticked && b.unticked.has(i) ? '' : ' checked'} tabindex="-1">${ic(icon(e), 'sm')}${esc(name(e))}<span class="sub">${esc(what(e))}${b.tab === 'all' ? ' · ' + esc(tabName(e.tab)) : ''}</span></label>`).join('')}</div>`);
    if (!b.done && b.splits) {
      // furnaces and drills: you say what they make; starts from how your ledger splits that machine today
      const pre = (m, targets, n) => {
        const cur = targets.map(i => { const st = chainMem[i], im = itemMachine(i); return saved(st) && im && im.machine === m ? st.scale * im.k : 0; }), tot = cur.reduce((a, v) => a + v, 0);
        if (!(tot > 0)) return targets.map(() => '');
        const raw = cur.map(v => v / tot * n), whole = raw.map(Math.floor); let left = n - whole.reduce((a, v) => a + v, 0);
        raw.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { whole[i]++; left--; } });
        return whole.map(v => v ? String(v) : '');
      };
      const split = (m, n, targets, verb) => {
        const p = pre(m, targets, n), vals = targets.map((i, j) => b.splitVals && (m + '|' + i) in b.splitVals ? b.splitVals[m + '|' + i] : p[j]);
        return `<div class="bp-split" data-bp-total="${n}"><span class="lead">${fmt(n)} × ${esc(nameOf(m))} ${verb}:</span>${bpLeft(n, vals)}${targets.map((i, j) => `<label>${ic(i, 'xs')}<span>${esc(nameOf(i))}</span><input class="num" inputmode="decimal" data-bp-split="${m}|${i}" value="${esc(vals[j])}" placeholder="0" aria-label="${esc(nameOf(m))} on ${esc(nameOf(i))}" tabindex="-1"></label>`).join('')}</div>`;
      };
      for (const [m, n] of Object.entries(b.splits.furnaces)) parts.push(split(m, n, SMELTED, 'make'));
      for (const [m, n] of Object.entries(b.splits.drills)) parts.push(split(m, n, m === 'burner-mining-drill' ? ORES.filter(o => !FD.resources[o].fluid) : ORES, 'mine'));
    }
    if (b.others.length) {   // an import on a tab only adds that tab's machines: the rest, by the tab they go on, and how to add them
      for (const t of FAC_ORDER) { const list = b.others.filter(e => e.tab === t); if (list.length) parts.push(`<div class="bp-row"><span class="lead">Not added here, these go on the ${esc(tabName(t))} tab:</span>${list.map(e => chip(e)).join('')}</div>`); }
      parts.push(`<div class="bp-row sub">To add them, import the same string on their tab, or on Everything.</div>`);
    }
    const sk = Object.entries(b.skipped || {});
    if (sk.length) parts.push(`<div class="bp-row sub">Not counted: ${sk.map(([k, n]) => `${fmt(n)} × ${esc(k)}`).join(', ')}</div>`);
    const ask = !b.done && (b.pending.length || b.splits);
    parts.push(`<div class="bp-row">${ask ? '<button class="iconbtn sm cta" data-bp-confirm tabindex="-1">Add ticked</button>' : ''}<button class="iconbtn sm" data-bp-close tabindex="-1">${ask ? 'Skip' : 'Done'}</button></div>`);
    return `<div class="bp-panel">${parts.join('')}</div>`;
  }

  function renderCard(id, spec) {
    if (id === 'factory') { renderFactory(); return; }
    if (id === 'oil') { renderOil(spec); return; }
    const st = preview ? Object.assign({}, cardState(id)) : cardState(id);
    const c = CARDS[id];
    if (id === 'reference') { renderReference(); return; }
    if (spec && spec.layout && id === 'nuclear') { st.layout = spec.layout; st.touched = true; if (!preview) saveCard(id, st); }
    const def = cardFields(id, st);
    const fields = def.fields;
    if (spec && spec.n !== null && fields.length) {
      const qs = words((spec.wantQ !== null && spec.haveQ) ? spec.haveQ : spec.haveQ || '');
      let best = -1, bestSc = 0;
      fields.forEach((f, i) => {
        if (f.fixed) return;
        const fw = words((f.id ? nameOf(f.id) : '') + ' ' + (f.label || '') + ' ' + (f.id ? (ALIASES[f.id] || []).join(' ') : ''));
        let sc = 0; for (const t of qs) if (fw.some(w => w.startsWith(t))) sc++;
        if (spec.unit === 'mw' && f.unit === 'MW') sc += 5;
        if (spec.unit === 'labs' && f.id === 'lab') sc += 5;
        if (sc > bestSc) { bestSc = sc; best = i; }
      });
      if (best < 0) best = fields.findIndex(f => !f.fixed);
      if (best >= 0) { st.scale = spec.n / fields[best].k; st.anchor = 'f' + best; st.touched = true; if (!preview) saveCard(id, st); }
    }
    if (!(st.scale > 0) || !st.touched) st.scale = cardHave(id) || def.defaultScale;   // the ledger's count, else the card's usual start
    if (def.isScience) { st.labs = st.scale; }
    curCard = { id, st, fields, defaultScale: def.defaultScale, def };
    const R = st.scale;
    const row = (f, i) => {
      const key = 'f' + i;
      const label = `<b>${esc(f.label)}</b>${f.nick ? ` <span class="sub">(${f.nick})</span>` : ''}`;
      const isRate = f.flow || f.fluid, unitTxt = isRate ? (f.fluid ? 'per second' : unitShort()) : f.unit;
      let ctl;
      if (f.fixed && !unitTxt) ctl = `<span class="big"><span data-k="${f.k}" data-kind="whole">${wholeText(f.k * R)}</span></span><span class="build" data-k="${f.k}" data-kind="exact">${exactText(f.k * R)}</span>`;
      else if (f.fixed) ctl = `<span class="big"><span data-k="${f.k}" data-kind="${isRate ? 'rate' : 'plain'}" data-fluid="${f.fluid ? 1 : 0}">${isRate ? fmt(toUnit(f.k * R, !!f.fluid)) : fmt(f.k * R)}</span></span><span class="unit">${esc(unitTxt)}</span>`;
      else ctl = `<input class="num" inputmode="decimal" data-path="${key}" data-k="${f.k}" data-kind="${isRate ? 'rate' : 'mach'}" data-fluid="${f.fluid ? 1 : 0}" value="${fmtIn(isRate ? toUnit(f.k * R, !!f.fluid) : f.k * R)}" aria-label="${esc(f.label)}"${st.anchor === key ? ' data-focus="1"' : ''}>${undoBtn('scale', st.anchor === key && !!st.touched)}${unitTxt ? `<span class="unit">${esc(unitTxt)}</span>` : `<span class="build" data-k="${f.k}" data-kind="build">${buildText(f.k * R)}</span>`}`;
      if (f.machine) ctl += `<span class="mbtn">${icb(f.machine)}<span class="mname">${esc(nameOf(f.machine))}</span></span>`;
      const icon = f.id ? icb(f.id) : f.icon ? ic(f.icon) : '<span style="display:inline-block;width:32px"></span>';
      const link = def.isScience && SCI.has(f.id) ? `<a class="lnk" href="#i/${f.id}" data-go="#i/${f.id}" title="Open the full ${esc(f.label)} chain">${label}</a>` : label;
      return `<div class="tr" data-path="${key}"><div class="td item"><span class="exp none"></span>${icon}<span class="nmtxt">${link}</span></div><div class="td mach" data-label="how many">${ctl}</div></div>`;
    };
    let body;
    if (def.isScience) {
      const perLab = (1 + st.bonus / 100) / st.time;
      body = `<div class="tbl two"><div class="th">What</div><div class="th">How many</div>
        <div class="tr product"><div class="td item"><span class="exp none"></span>${ic('lab')}<span class="nmtxt"><b>Labs</b><div class="sub">${def.extra}</div></span></div><div class="td mach" data-label="how many"><input class="num" inputmode="decimal" data-path="f0" data-k="1" data-kind="mach" value="${fmtIn(R)}" aria-label="labs" data-focus="1">${undoBtn('scale', st.anchor === 'f0' && !!st.touched)}<span class="build" data-k="1" data-kind="build">${buildText(R)}</span><span class="mbtn">${ic('lab')}<span class="mname">Lab</span></span></div></div>
        <div class="tr sep"><div class="td">use <b><span data-k="${perLab * 60}" data-kind="plain" data-unit=" per minute">${fmt(perLab * R * 60)} per minute</span></b> of each science pack the technology asks for, which takes these assemblers:</div></div>
        ${fields.slice(1).map((f, i) => row(f, i + 1)).join('')}</div>`;
    } else {
      body = `${def.extra ? `<div class="settings" style="margin:0 0 8px">${def.extra}</div>` : ''}<div class="tbl two"><div class="th">What</div><div class="th">How many</div>${fields.map(row).join('')}</div>`;
    }
    $('#main').innerHTML = `<h1>${ic(c.icon, 'lg')}<span class="ttl">${esc(c.title)}<div class="sub">${def.intro ? def.intro : esc(c.desc)}</div></span>${['science', 'steam'].includes(id) ? cardFacBtn(id, cardCount(id, def, R)) : ''}</h1>
      ${body}
      ${id === 'steam' ? `<p class="hint">A full ${beltColour()} belt of coal (${Engine.beltRate(S)} per second) feeds ${fmt(Engine.beltRate(S) / 0.45)} boilers, which is ${fmt(Engine.beltRate(S) / 0.45 * 1.8)} MW. One steam engine (900 kW) runs ${fmt(900 / 77.5)} assembler 1s, ${fmt(900 / 155)} assembler 2s, ${fmt(900 / 387.5)} assembler 3s, ${fmt(900 / 90)} electric drills or ${fmt(900 / 186)} electric furnaces at full load.</p>` : ''}
      ${id === 'mining' ? `<p class="hint">A full ${beltColour()} belt (${Engine.beltRate(S)} per second) takes ${fmt(Engine.beltRate(S) / (FD.machines[S.drill].speed * (1 + S.mp / 100)))} ${nameOf(S.drill).toLowerCase()}s and keeps ${fmt(Engine.beltRate(S) / 0.3125)} stone or ${fmt(Engine.beltRate(S) / 0.625)} steel or electric furnaces busy. Steel: one furnace on iron plates for each furnace on steel (5 plates per steel plate, 16 s). Stone bricks: 2 stone per brick, at plate speed. Burner drills burn 0.0375 coal per second each; stone and steel furnaces 0.0225.</p>` : ''}`;
    doc.title = c.title + ' – Factorio Ratios';
  }
  function onCardInput(inp) {
    const v0 = parseFloat(inp.value); if (!(v0 > 0)) { inp.classList.add('bad'); return; }
    inp.classList.remove('bad');
    const v = inp.dataset.kind === 'rate' ? fromUnit(v0, inp.dataset.fluid === '1') : v0;
    curCard.st.scale = v / parseFloat(inp.dataset.k);
    const changed = !near(curCard.st.scale, cardHave(curCard.id) || curCard.defaultScale);   // a what-if; labs and boilers are saved on the ledger
    curCard.st.anchor = changed ? inp.dataset.path : null; curCard.st.touched = changed;
    if (curCard.id === 'science') curCard.st.labs = curCard.st.scale;
    showUndo(inp, changed); refreshFacBtn();
    if (!preview) saveCard(curCard.id, curCard.st);
    const R = curCard.st.scale;
    $('#main').querySelectorAll('[data-k]').forEach(el => {
      if (el === inp) return; const k = parseFloat(el.dataset.k), kind = el.dataset.kind, fluid = el.dataset.fluid === '1';
      if (el.tagName === 'INPUT') el.value = fmtIn(kind === 'rate' ? toUnit(k * R, fluid) : k * R);
      else if (kind === 'rate') el.textContent = fmt(toUnit(k * R, fluid));
      else if (kind === 'build') el.textContent = buildText(k * R);
      else if (kind === 'whole') el.textContent = wholeText(k * R);
      else if (kind === 'exact') el.textContent = exactText(k * R);
      else if (kind === 'plain') el.textContent = fmt(k * R) + (el.dataset.unit || '');
    });
  }

  function renderReference() {
    curCard = { id: 'reference', st: {}, fields: [] };
    const caps = FD.tech.inserter_capacity;
    const hand = lvl => { let reg = 1, bulk = FD.tech.bulk_base; for (const c of caps) if (c.level <= lvl) { reg += c.reg; bulk += c.bulk; } return { reg, bulk }; };
    const ins = Object.entries(FD.inserters).map(([id, i]) => `<tr><td>${ic(id, 'sm')} ${esc(i.name)}</td><td class="n">${fmt(i.ticks / 60, 2)} s</td><td class="n">${fmt(i.swings_per_s, 2)}</td><td class="n">${i.bulk ? fmt(i.swings_per_s * hand(S.cap).bulk, 1) : fmt(i.swings_per_s * hand(S.cap).reg, 2)}</td><td class="n">${i.bulk ? fmt(i.swings_per_s * 12, 1) : fmt(i.swings_per_s * 3, 2)}</td></tr>`).join('');
    const am = FD.machines[Engine.TIERS[S.tier - 1]].speed;
    const belts = Object.entries(FD.belts).map(([id, b]) => `<tr><td>${ic(id, 'sm')} ${esc(b.name)}</td><td class="n">${b.per_s}</td><td class="n">${b.per_s / 2}</td><td class="n">${fmt(b.per_s / (2 * am))}</td><td class="n">${fmt(b.per_s / (4 * am))}</td><td class="n">${fmt(b.per_s / (2 * am))}</td><td class="n">${fmt(b.per_s / 0.3125)} / ${fmt(b.per_s / 0.625)}</td></tr>`).join('');
    const fuels = ['wood', 'coal', 'solid-fuel', 'rocket-fuel', 'nuclear-fuel'].map(f => `<tr><td>${ic(f, 'sm')} ${esc(nameOf(f))}</td><td class="n">${fmt(FD.items[f].fuel)} MJ</td><td class="n">${fmt(1.8 / FD.items[f].fuel, 3)}</td><td class="n">${fmt(0.09 / FD.items[f].fuel * 60, 3)}</td><td class="n">${fmt(0.15 / FD.items[f].fuel * 60, 3)}</td></tr>`).join('');
    const poles = Object.entries(FD.poles).map(([id, p]) => `<tr><td>${ic(id, 'sm')} ${esc(p.name)}</td><td class="n">${p.area} × ${p.area}</td><td class="n">${p.wire}</td></tr>`).join('');
    const ug = Object.entries(FD.undergrounds).map(([id, u]) => `<tr><td>${ic(id, 'sm')} ${esc(u.name)}</td><td class="n">${u.gap}</td></tr>`).join('') + `<tr><td>${ic('pipe-to-ground', 'sm')} Pipe to ground</td><td class="n">9</td></tr>`;
    const draws = [['electric-mining-drill', 90], ['assembling-machine-1', 77.5], ['assembling-machine-2', 155], ['assembling-machine-3', 387.5], ['electric-furnace', 186], ['chemical-plant', 217], ['oil-refinery', 434], ['centrifuge', 361.7], ['pumpjack', 90], ['lab', 60], ['beacon', 480], ['radar', 300], ['inserter', 13.6], ['fast-inserter', 46.5], ['bulk-inserter', 133]]
      .map(([id, kw]) => `<tr><td>${ic(id, 'sm')} ${esc(nameOf(id))}</td><td class="n">${fmt(kw)} kW</td><td class="n">${fmt(900 / kw)}</td><td class="n">${fmt(1000 / kw)}</td></tr>`).join('');
    const stacks = [['iron-ore', 'Ore, coal, stone', 50], ['iron-plate', 'Plates, steel, bricks, gears', 100], ['electronic-circuit', 'Cable, circuits, batteries', 200], ['automation-science-pack', 'Science packs', 200], ['plastic-bar', 'Plastic, processing units', 100], ['engine-unit', 'Engines, LDS, frames, solid fuel', 50], ['rocket-fuel', 'Rocket fuel', 20]]
      .map(([id, l, s]) => `<tr><td>${ic(id, 'sm')} ${l}</td><td class="n">${s}</td><td class="n">${(s * 40).toLocaleString()}</td></tr>`).join('');
    $('#main').innerHTML = `<h1>${ic('fast-inserter', 'lg')}<span class="ttl">Belts, inserters &amp; more<div class="sub">Reference numbers</div></span></h1>
      <h2>Belts</h2><div class="panel"><table><tr><th>Belt</th><th class="n">Items per second</th><th class="n">Per lane</th><th class="n">Gear assemblers to fill it</th><th class="n">Cable assemblers</th><th class="n">Green circuit assemblers</th><th class="n">Furnaces to fill it, stone / steel</th></tr>${belts}</table><div class="hint">A belt has two lanes, one each side. Assembler counts use ${esc(nameOf(Engine.TIERS[S.tier - 1]))}, from the strip above.</div></div>
      <h2>Inserters <span class="pill">chest or machine to chest or machine</span></h2><div class="panel"><div class="settings" style="margin:0 0 6px"><label>Inserter capacity research <select data-set="cap" tabindex="-1">${[0, 1, 2, 3, 4, 5, 6, 7].map(l => `<option value="${l}" ${l === S.cap ? 'selected' : ''}>${l ? 'bonus ' + l + ' (hand ' + hand(l).reg + ', bulk ' + hand(l).bulk + ')' : 'none'}</option>`).join('')}</select></label></div>
      <table><tr><th>Inserter</th><th class="n">One swing</th><th class="n">Swings per second</th><th class="n">Items per second now</th><th class="n">Fully researched</th></tr>${ins}</table><div class="hint">Items per second = swings per second × hand size. Picking from a belt is slower, so choose the next size up.</div></div>
      <h2>Fuel</h2><div class="panel"><table><tr><th>Fuel</th><th class="n">Energy</th><th class="n">A boiler burns per second</th><th class="n">A furnace burns per minute</th><th class="n">A burner drill burns per minute</th></tr>${fuels}</table></div>
      <h2>What one steam engine (900 kW) runs</h2><div class="panel"><table><tr><th>Machine</th><th class="n">Draw at full load</th><th class="n">Per steam engine</th><th class="n">Per MW</th></tr>${draws}</table></div>
      <h2>Poles &amp; undergrounds</h2><div class="panel"><table><tr><th>Pole</th><th class="n">Area it powers (tiles)</th><th class="n">Wire reach (tiles)</th></tr>${poles}</table><table style="margin-top:8px"><tr><th>Underground</th><th class="n">Gap it can jump (tiles)</th></tr>${ug}</table><div class="hint">A pump moves 1,200 fluid per second. Storage tank 25,000. Fluid wagon 50,000. Chests: wooden 16, iron 32, steel 48 stacks.</div></div>
      <h2>Cargo wagon (40 stacks)</h2><div class="panel"><table><tr><th>Cargo</th><th class="n">Stack size</th><th class="n">Per wagon</th></tr>${stacks}</table></div>`;
    doc.title = 'Reference – Factorio Ratios';
  }


  // ---------- boot ----------
  // ledger entries saved before machines were pinned keep the machines they show today
  for (const [id, m] of Object.entries(chainMem)) if (saved(m)) pin(id);
  persist();
  renderSettings();
  render();   // the root URL is always the home screen; a chain is only restored when its own #i/... address is opened
  if (fine()) { q.focus(); }
})();
