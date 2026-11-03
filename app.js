/* Factorio Ratios UI. All the maths is in engine.js; this file is search, routing and DOM. */
(() => {
  'use strict';
  let doc = document;            // the document the app currently lives in (changes when popped out)
  const $ = s => doc.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    off: false,   // while the tutorial runs nothing is saved but which of its parts you have done
    get(k, d) { try { const v = localStorage.getItem('fr:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { if (store.off && k !== 'tutorial') return; try { localStorage.setItem('fr:' + k, JSON.stringify(v)); } catch (e) { } },
  };
  const fine = () => matchMedia('(pointer:fine)').matches;

  // ---------- settings ----------
  // "Your base" has no defaults to go back to: a fresh browser starts at the early game (assembler 1, stone furnace,
  // burner drill, yellow belt, no research) and from then on it is simply whatever was chosen last.
  const fresh = () => Object.assign(Engine.defaults(), { tier: 1, furnace: 'stone-furnace', drill: 'burner-mining-drill', mp: 0, rateUnit: 'lane', cap: 0 });
  const S = Object.assign(fresh(), store.get('settings', {}));
  if (!['lane', 'belt', 's', 'min'].includes(S.rateUnit)) S.rateUnit = 'lane';
  const saveS = () => { const { machineOf, recipeOf, ...base } = S; store.set('settings', base); modelMemo = null; };   // the factory's choices are saved with the factory
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
  // amount shown in a cell: a plain number in the column's unit, or "x per second" for fluids
  const amountText = (perS, fluid) => fluid ? fmt(perS) + ' per second' : fmt(toUnit(perS, fluid));
  // water and crude oil are counted in the machines that pump them, never per second
  const PUMP_OF = { water: 'offshore pump', 'crude-oil': 'pumpjack' };
  const pumpRate = id => id === 'water' ? FD.power.offshore_pump.per_s : FD.resources['crude-oil'].amount * (1 + S.mp / 100) * S.jackYield;
  const pumpsText = (id, perS) => { const n = fmt(perS / pumpRate(id)); return `${n} ${PUMP_OF[id]}${n === '1' ? '' : 's'}`; };
  function buildText(x) { if (!isFinite(x) || x <= 0) return ''; const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? '' : 'build ' + c; }
  // a machine count that is shown, not typed: the whole number to build in big, and the exact count beside it when it is not whole
  function wholeText(x) { if (!isFinite(x) || x <= 0) return fmt(x > 0 ? x : 0); const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? fmt(x) : String(c); }
  function exactText(x) { if (!isFinite(x) || x <= 0) return ''; const c = Math.ceil(x - 1e-9); return Math.abs(c - x) < 1e-9 ? '' : 'exactly ' + fmt(x); }

  const nameOf = id => (FD.items[id] && FD.items[id].name) || (FD.machines[id] && FD.machines[id].name) || (FD.recipes[id] && FD.recipes[id].name) || id;
  // a machine beside a count or on a picker, short as the Your base strip has it: "Assembler 2", "Electric drill"
  const mName = id => nameOf(id).replace('Assembling machine', 'Assembler').replace(' mining drill', ' drill');
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
  // The game hides the rocket part item, so the data has its recipe but no item: give it one, so it has a page (the space
  // science chain links to it) and "rocket" or "silo" finds it
  if (!FD.items['rocket-part'] && FD.recipes['rocket-part']) FD.items['rocket-part'] = { name: FD.recipes['rocket-part'].name, group: 'intermediate-products', subgroup: 'intermediate-product', order: 'd[rocket-parts]-d[rocket-part]', stack: null, fuel: null, icon: FD.recipes['rocket-part'].icon, type: 'item' };
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
  const GROUPS = [['intermediate-products', 'Intermediate products'], ['logistics', 'Logistics'], ['production', 'Production'], ['combat', 'Combat']];

  const CARDS = {
    factory: { title: 'Your factory', desc: 'What you have making each item, and where it runs short', icon: 'assembling-machine-2', keys: ['factory', 'my factory', 'your factory', 'bottleneck', 'bottlenecks', 'short', 'shortage', 'spare', 'fulfilled', 'surplus', 'deficit', 'balance', 'ledger'] },
    steam: { title: 'Steam power', desc: 'Boilers, steam engines, fuel', icon: 'boiler', keys: ['steam', 'boiler', 'boilers', 'power', 'steam engine', 'steam engines', 'engines', 'coal', 'electricity', 'generator', 'water', 'offshore pump', 'water pump', 'mw'] },
    solar: { title: 'Solar power', desc: 'Panels and accumulators', icon: 'solar-panel', keys: ['solar', 'accumulator', 'accumulators', 'panels', 'solar panels', 'power', 'electricity', 'accum'] },
    nuclear: { title: 'Nuclear power', desc: 'Reactors, heat exchangers, turbines, fuel cells', icon: 'nuclear-reactor', keys: ['nuclear', 'reactor', 'reactors', 'turbine', 'turbines', 'heat exchanger', 'exchangers', 'power', 'fuel cell'] },
    mining: { title: 'Mining & smelting', desc: 'Drills and furnaces', icon: 'electric-mining-drill', keys: ['mining', 'drill', 'drills', 'furnace', 'furnaces', 'smelting', 'smelter', 'ore', 'miner', 'miners'] },
    oil: { title: 'Oil processing', desc: 'Refineries, cracking, pumpjacks', icon: 'oil-refinery', keys: ['oil', 'refinery', 'refineries', 'cracking', 'petroleum', 'petrol', 'gas', 'crude', 'pumpjack', 'pumpjacks', 'heavy oil', 'light oil', 'aop', 'liquefaction', 'coal liquefaction'] },
    science: { title: 'Labs & science', desc: 'Labs and science packs', icon: 'lab', keys: ['lab', 'labs', 'research', 'science', 'packs', 'spm'] },
    uranium: { title: 'Uranium', desc: 'Centrifuges, drills, acid', icon: 'uranium-235', keys: ['uranium', 'centrifuge', 'centrifuges', 'kovarex', 'enrichment', 'u235', 'u238', 'uranium ore'] },
    reference: { title: 'Belts, inserters & more', desc: 'Throughput, fuel, poles, undergrounds', icon: 'fast-inserter', keys: ['belt', 'belts', 'inserter', 'inserters', 'fuel', 'pole', 'poles', 'underground', 'train', 'wagon', 'reference', 'throughput', 'chest', 'pipe', 'stack'] },
  };

  const INDEX = [];
  for (const [id, it] of Object.entries(FD.items)) {
    if (!((Engine.byProduct[id] && !ROUTE[id]) || isResource(id))) continue;
    INDEX.push({ kind: 'item', id, name: it.name, keys: (ALIASES[id] || []).map(a => a.toLowerCase()), pri: PRIORITY[id] || 3 });
  }
  for (const [id, c] of Object.entries(CARDS)) {
    const keys = c.keys.slice();
    for (const [item, card] of Object.entries(ROUTE)) if (card === id) keys.push(nameOf(item).toLowerCase(), ...(ALIASES[item] || []));
    INDEX.push({ kind: 'card', id, name: c.title, keys, pri: id === 'reference' ? 5 : 7 });   // the reference tables' words (belt, inserter) are also things you make: those come first
  }
  // a count of a machine that a card counts ("8 stone furnaces", "4 reactors", "2 offshore pumps") opens that card, set to
  // that many of it
  const MACHINE_CARD = { 'stone-furnace': 'mining', 'steel-furnace': 'mining', 'electric-furnace': 'mining', 'electric-mining-drill': 'mining', 'burner-mining-drill': 'mining',
    boiler: 'steam', 'steam-engine': 'steam', 'offshore-pump': 'steam', 'solar-panel': 'solar', accumulator: 'solar', 'nuclear-reactor': 'nuclear', 'heat-exchanger': 'nuclear',
    'steam-turbine': 'nuclear', centrifuge: 'uranium', lab: 'science', 'oil-refinery': 'oil', pumpjack: 'oil' };
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
    const U = '(?:(belts?|b|lanes?|\\/s|\\/m(?:in)?|per min|per minute|per second|spm|labs?|mw)(?![a-z]))?';   // a whole word: the b of "4 batteries" is not a belt
    let m = s.match(new RegExp('^(\\d+(?:\\.\\d+)?)\\s*' + U + '\\s*(?:of\\s+)?(.*)$'));
    if (m) { out.n = parseFloat(m[1]); out.unit = m[2] || null; s = m[3]; if (!s.trim() && /^belts?$/.test(out.unit || '')) { s = out.unit; out.unit = null; } }   // "10 belts" with nothing after: the belts themselves
    else { m = s.match(new RegExp('^(.*?)\\s+(\\d+(?:\\.\\d+)?)\\s*' + U + '$')); if (m) { out.n = parseFloat(m[2]); out.unit = m[3] || null; s = m[1]; } }
    if (out.unit) out.unit = out.unit.replace(/^belts?$|^b$/, 'belt').replace(/^lanes?$/, 'lane').replace(/^\/m(in)?$|^per min(ute)?$/, '/min').replace(/^per second$/, '/s').replace(/^labs?$/, 'labs');
    // "pipe to ground" is a name, not pipe feeding ground: the words split only where no name runs on through them
    const named = s.trim() && INDEX.some(e => e.name.toLowerCase().startsWith(s.trim()));
    const parts = s.split(named ? /\s*(?:>|->|→)\s*/ : /\s*(?:>|->|→|\bfor\b|\bto\b|\binto\b|\bfeeding\b)\s*/);
    out.haveQ = parts[0].trim(); out.wantQ = parts[1] ? parts[1].trim() : null;
    if (!out.haveQ && out.unit) out.haveQ = { labs: 'labs', mw: 'steam power', spm: 'labs & science' }[out.unit] || '';
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
  // The pages make an item the way your factory does: on the machines (and recipe) of its ledger lines that make something,
  // in the shares they make, so a row on two furnaces is on both there too. What your factory does not make is on
  // Defaults. A page's own picks win over both for this visit (the engine's overrides). A row at 0 makes nothing: its
  // machine stays the ledger's own.
  function madeWith(id) {
    const st = chainMem[id]; if (!saved(st)) return [];
    const parts = partsOf(id);
    return parts ? parts.filter(p => p.scale > 0) : [{ recipe: recipeOf[id] || null, machine: machineOf[id] || null, scale: st.scale }];
  }
  const PAGE = Object.assign(Object.create(S), { lines: madeWith });
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
  // your factory worked out (factoryModel), kept until the ledger or Defaults change: item pages read what it uses
  let modelMemo = null;
  function persist() { modelMemo = null; store.set('mem', memNow()); }
  // your factory as it is saved: what persist writes (and the tutorial's Back puts back)
  function memNow() {
    const chains = {}, cards = {}, units = {}, machines = {}, recipes = {};
    for (const [k, v] of Object.entries(chainMem)) if (saved(v)) chains[k] = Object.assign({ scale: v.scale, anchor: v.anchor, touched: true }, v.parts && v.parts.length > 1 ? { parts: v.parts.map(p => ({ recipe: p.recipe, machine: p.machine, scale: p.scale })) } : {});
    for (const [k, v] of Object.entries(cardMem)) if (cardKept(k, v)) cards[k] = { time: v.time, bonus: v.bonus, basic: v.basic, coal: v.coal, yield: v.yield, fuel: v.fuel };
    for (const [k, n] of Object.entries(facUnits)) if (n > 0) units[k] = n;
    // a row emptied to 0 keeps its machine while you are here (type a new number and it is still on it), not after
    for (const [k, m] of Object.entries(machineOf)) if (m && saved(chainMem[k])) machines[k] = m;
    for (const [k, r] of Object.entries(recipeOf)) if (r && saved(chainMem[k])) recipes[k] = r;
    return { chains, cards, units, machines, recipes, dismissed: [...facDismiss], refs: 2 };
  }
  // your factory as another tab of this page saved it, in place of this tab's copy (persist writes all of it, so an older
  // copy would go back over it); what this visit has open or picked on a page stays
  function loadMem(m) {
    modelMemo = null;
    for (const st of Object.values(chainMem)) { st.scale = null; st.anchor = null; st.touched = false; delete st.parts; }
    for (const [k, v] of Object.entries(m.chains || {})) { const st = chainState(k); Object.assign(st, { scale: v.scale, anchor: v.anchor, touched: true }); if (v.parts) st.parts = v.parts.map(p => Object.assign({}, p)); }
    const cards = m.cards || {};
    for (const id of new Set([...Object.keys(cardMem), ...Object.keys(cards)])) { const st = cardState(id); for (const f of ['time', 'bonus', 'basic', 'coal', 'yield', 'fuel']) st[f] = cards[id] && f in cards[id] ? cards[id][f] : CARD_DEF[f]; }
    for (const [to, from] of [[facUnits, m.units], [machineOf, m.machines], [recipeOf, m.recipes]]) { for (const k of Object.keys(to)) delete to[k]; Object.assign(to, from); }
    facDismiss.clear(); for (const d of m.dismissed || []) facDismiss.add(d);
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
  const remembered = (kind, id) => kind === 'c' ? (id === 'oil' ? refAll() > 0 : id === 'nuclear' ? nucAll() > 0 : facUnits[CARD_UNIT[id]] > 0) : saved(chainMem[id]);
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
  function go(hash) { if (location.hash === hash) render(); else if (tour) { history.replaceState(null, '', hash); render(); } else location.hash = hash; }   // the tour leaves no history behind
  window.addEventListener('hashchange', () => {
    if (tour) { tour.from.hash = location.hash; tourEnd(); return; }   // the browser's Back during the tutorial ends it, on the page Back went to
    if (skipRender) { skipRender = false; return; } preview = null; render();
  });
  const route = () => { const [kind, id] = location.hash.replace(/^#\/?/, '').split('/'); return { kind: kind || 'home', id }; };
  let preview = null;   // {kind,id,spec} while typing in the search box
  let cur = null;       // current item view
  let curCard = null;   // current card view
  let curRes = null;    // current raw-resource view

  let keepPlace = false;   // set while a "Your base" change redraws the page: stay where you are, leave the focus alone
  const setBg = k => { doc.body.style.setProperty('--bgimg', `url(bg/${k}.webp)`); };   // the page's background: bg/<kind of page>.webp, a different in-game view for each
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
  // What you typed on a page stays when Defaults change: a count of machines stays that many machines, now of the new
  // tier, furnace or drill (and makes more or less), and an amount stays that amount (on more or fewer machines). The
  // ledger's machines are its own and never change. Call before the change; the function it returns puts the counts back.
  function keepTyped() {
    const node = (tree, path) => { let f = null; Engine.walk(tree, n => { if (!f && n.path === path) f = n; }); return f; };
    // a row's machines per root unit/s: the typed line's, or all its lines' (a mined row's lines are its drills), or what
    // pumps it
    const rowMach = (n, a) => n.lines && n.lines.length ? (a.line !== undefined && n.lines[a.line] ? n.lines[a.line].kMach : n.lines.reduce((s, l) => s + l.kMach, 0)) : (supply(n.item, n.kRate) || {}).k || 0;
    // machines at a page's typed box, per unit of the number the page keeps (its top row's units per second)
    const kOf = (id, a) => {
      if (isResource(id)) {
        const blk = a.path.split('>')[0], tree = Engine.build(blk, PAGE, chainState(blk).overrides);
        const n = node(tree, a.path), need = blk === id ? 1 : itemTotals(tree, id).kRate; if (!n || !(need > 0)) return 0;
        return rowMach(n, a) / need;
      }
      if (!FD.items[id] || !Engine.byProduct[id]) return 0;
      const n = node(Engine.build(id, PAGE, chainState(id).overrides), a.path); return n ? rowMach(n, a) : 0;
    };
    const pages = Object.entries(viewMem).filter(([, v]) => v && v.anchor && v.anchor.kind === 'mach').map(([id, v]) => [id, v, kOf(id, v.anchor) * v.scale]).filter(x => x[2] > 0);
    const fieldK = (id, st) => { const f = (cardFields(id, st) || { fields: [] }).fields[Number(st.anchor.slice(1))]; return f ? f.k : 0; };   // a card's typed box, whatever it counts
    const cards = Object.entries(cardMem).filter(([id, st]) => CARDS[id] && st.touched && st.scale > 0 && /^f\d+$/.test(st.anchor || '')).map(([id, st]) => [id, st, fieldK(id, st) * st.scale]).filter(x => x[2] > 0);
    return () => {
      for (const [id, v, n] of pages) { const k = kOf(id, v.anchor); if (k > 0) v.scale = n / k; }
      for (const [id, st, n] of cards) { const k = fieldK(id, st); if (k > 0) st.scale = n / k; }
    };
  }
  // a "Your base" change: save it and redraw the page without jumping to the top
  function baseChanged() { saveS(); keepPlace = true; try { renderSettings(); render(); } finally { keepPlace = false; } }

  // ---------- settings bar ----------
  // on a narrow screen "Your base" folds into one line (what it is set to, as icons) that opens the full strip
  let baseOpen = false;
  function renderSettings() {
    const seg = (name, opts, cur, lab) => `<label>${lab}<span class="seg" data-set="${name}">${opts.map(o => `<button tabindex="-1" data-v="${o.v}" class="${String(o.v) === String(cur) ? 'on' : ''}" title="${esc(o.t)}">${o.i ? icb(o.i, 'xs') : ''}<span>${o.l}</span></button>`).join('')}</span></label>`;
    const half = fmt(Engine.beltRate(S) / 2), full = fmt(Engine.beltRate(S)), c = beltColour();
    const folded = `<button class="base-sum" data-base-toggle tabindex="-1" aria-expanded="${baseOpen}" title="${baseOpen ? 'Fold' : 'Change defaults'}"><span class="lead">Defaults:</span>${[`assembling-machine-${S.tier}`, S.furnace, S.drill, S.belt].map(i => icb(i, 'xs')).join('')}<span>${esc(unitShort())}${S.mp ? ` · mining +${S.mp}%` : ''}</span><span class="arr">${baseOpen ? '▴' : '▾'}</span></button>`;
    $('#settings').classList.toggle('open', baseOpen);
    $('#settings').innerHTML = folded + `<span class="lead">Defaults:</span>` +
      seg('tier', [1, 2, 3].map(t => ({ v: t, i: 'assembling-machine-' + t, l: 'Assembler ' + t, t: 'Assembling machine ' + t })), S.tier, '') +
      seg('furnace', Engine.FURNACES.map(f => ({ v: f, i: f, l: nameOf(f).replace(' furnace', ''), t: nameOf(f) })), S.furnace, 'Furnace') +
      seg('drill', [['electric-mining-drill', 'Electric'], ['burner-mining-drill', 'Burner']].map(([f, l]) => ({ v: f, i: f, l, t: nameOf(f) })), S.drill, 'Drill') +
      seg('belt', [['transport-belt', 'Yellow'], ['fast-transport-belt', 'Red'], ['express-transport-belt', 'Blue']].map(([b, l]) => ({ v: b, i: b, l, t: nameOf(b) + ', ' + FD.belts[b].per_s + ' items per second' })), S.belt, 'Belt') +
      `<label>Mining productivity <select data-set="mp" tabindex="-1">${[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 300].map(p => `<option value="${p}" ${p === S.mp ? 'selected' : ''}>${p ? '+' + p + '%' : 'none'}</option>`).join('')}</select></label>` +
      seg('rateUnit', [{ v: 'lane', l: `${c} lanes (${half}/s)`, t: 'Half a belt' }, { v: 'belt', l: `${c} belts (${full}/s)`, t: 'A full belt' }, { v: 's', l: 'items per second', t: 'Items per second' }, { v: 'min', l: 'items per minute', t: 'Items per minute' }], S.rateUnit, 'Amounts in');
  }

  // ---------- search box & live preview ----------
  const q = document.getElementById('q'), strip = document.getElementById('strip');
  let hits = [], selIdx = 0, parsed = null, haveHit = null;
  function runSearch() {
    parsed = parseQuery(q.value);
    if (!parsed.haveQ && !parsed.wantQ) {   // nothing to look for: an amount on its own ("15/s") still shows it was read
      hits = [];
      if (parsed.n !== null && parsed.unit) showStrip(true); else { strip.hidden = true; strip.innerHTML = ''; }
      if (preview) { preview = null; render(); }
      return;
    }
    const targetQ = parsed.wantQ !== null ? parsed.wantQ : parsed.haveQ;
    hits = targetQ ? search(targetQ) : [];
    const mc = parsed.n !== null && !parsed.unit && parsed.wantQ === null && hits[0] && hits[0].kind === 'item' && MACHINE_CARD[hits[0].id];   // "8 stone furnaces": that card first
    if (mc) { const c = INDEX.find(e => e.kind === 'card' && e.id === mc); hits = [c].concat(hits.filter(e => e !== c)).slice(0, 8); }
    const tw = q.value.trim().toLowerCase();   // "tour", "help", "guide", "tutorial": the tour first, started only by Enter or a tap
    if (tw.length >= 3 && TOUR_WORDS.some(w => w.startsWith(tw))) hits = [TOUR_HIT].concat(hits).slice(0, 8);
    haveHit = parsed.wantQ !== null && parsed.haveQ ? (search(parsed.haveQ)[0] || null) : null;
    selIdx = Math.min(selIdx, Math.max(0, hits.length - 1));
    showStrip();
    showPreview();
  }
  function showStrip(amountOnly) {
    const ch = [];
    const s = fmt(parsed.n) === '1' ? '' : 's';   // "1 belt", "2 belts"
    if (parsed.n !== null) ch.push(`<span class="ch n">${fmt(parsed.n)}${parsed.unit ? ' ' + ({ belt: 'belt' + s, lane: 'lane' + s, '/s': 'per second', '/min': 'per minute', labs: 'lab' + s, spm: 'science per minute', mw: 'MW' }[parsed.unit] || parsed.unit) : ''}</span>`);
    if (parsed.wantQ !== null) ch.push(haveHit ? `<span class="ch">${ic(haveHit.kind === 'card' ? CARDS[haveHit.id].icon : haveHit.id, 'xs')}${esc(haveHit.name)}</span><span>→</span>` : `<span class="ch">?</span><span>→</span>`);
    strip.innerHTML = (ch.length ? `<span class="parse">${ch.join('')}</span>` : '') +
      (hits.length ? hits.map((e, i) => `<span class="hit ${i === selIdx ? 'sel' : ''}" data-i="${i}">${e.kind === 'tour' ? `<span class="tourq">${TOUR_SVG}</span>` : ic(e.kind === 'card' ? CARDS[e.id].icon : e.id, 'sm')}<span class="nm">${i === selIdx ? '<kbd>↵</kbd>' : ''}${esc(e.name)}</span></span>`).join('') : amountOnly ? '' : '<span class="sub">nothing called that</span>');
    strip.hidden = false;
    // on a narrow screen the suggestions are one line that scrolls sideways: keep the chosen one in sight
    const sel = strip.querySelector('.hit.sel'); if (sel && strip.scrollWidth > strip.clientWidth) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function showPreview() {
    if (!hits.length) return;
    const e = hits[selIdx];
    if (e.kind === 'tour') { if (preview) { preview = null; render(); } return; }   // nothing to show before it starts
    // on a card, the machine the query counts: the first match that card counts ("4 reactors": Nuclear reactor)
    const machine = e.kind === 'card' ? (hits.find(h => h.kind === 'item' && MACHINE_CARD[h.id] === e.id) || {}).id || null : null;
    const spec = { n: parsed.n, unit: parsed.unit, have: haveHit && haveHit.kind === 'item' ? haveHit.id : null, layout: parsed.layout, haveQ: parsed.haveQ, wantQ: parsed.wantQ, machine };
    preview = { kind: e.kind === 'card' ? 'c' : 'i', id: e.id, spec };
    render();
  }
  function commitPreview(focusBox) {
    if (!preview) return;
    const p = preview; preview = null;
    const hash = '#' + p.kind + '/' + p.id;
    if (p.kind === 'i' && cur && cur.id === p.id && cur.view) viewMem[cur.id] = cur.view;
    if (p.kind === 'i' && curRes && curRes.id === p.id && curRes.view) viewMem[curRes.id] = curRes.view;
    if (p.kind === 'c' && p.id === 'oil' && curCard && curCard.id === 'oil' && curCard.view) { const st = cardState('oil'); st.dem = curCard.view.dem; st.anchor = curCard.view.anchor; st.anchorN = curCard.view.anchorN; }
    else if (p.kind === 'c' && curCard && curCard.id === p.id && curCard.def) cardMem[p.id] = curCard.st;   // the count (and layout) the search set stays on the next redraw
    touch(p.kind + '/' + p.id);
    if (location.hash !== hash) { if (tour) history.replaceState(null, '', hash); else { skipRender = true; location.hash = hash; } }
    $('#back').style.visibility = 'visible';
    if (focusBox) { const box = $('#main input.num[data-focus]') || $('#main input.num'); if (box) { box.focus(); box.select(); } }
  }
  q.addEventListener('input', runSearch);
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.altKey)) {
      if (!hits.length) return; e.preventDefault();
      selIdx = (selIdx + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : hits.length - 1)) % hits.length;
      showStrip(); showPreview();
    } else if (e.key === 'Enter') { e.preventDefault(); if (hits[selIdx] && hits[selIdx].kind === 'tour') { tourStart(true); return; } if (preview) commitPreview(fine()); else if (hits.length) { showPreview(); commitPreview(fine()); } if (!fine()) q.blur(); }   // a phone's keyboard goes away
    else if (e.key === 'Escape') { e.preventDefault(); if (q.value) { q.value = ''; hits = []; strip.hidden = true; preview = null; render(); } else { q.blur(); back(); } }
    else if (e.key === 'Tab' && preview) { commitPreview(false); }
  });
  strip.addEventListener('mousedown', e => { const h = e.target.closest('.hit'); if (h) { e.preventDefault(); selIdx = Number(h.dataset.i); if (hits[selIdx] && hits[selIdx].kind === 'tour') { tourStart(true); return; } showStrip(); showPreview(); commitPreview(false); if (!fine()) q.blur(); } });
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
      if (e.key === 'Escape') { e.preventDefault(); if (consUnarm()) return; closePop(); back(); }   // Esc first lets go of a − clicked once
      else if (e.key.length === 1 && e.key !== ' ') { q.focus(); q.select(); }
    });
    d.addEventListener('click', e => {
      if (!e.target.closest('[data-cons-rm]')) consUnarm();   // a − clicked once: any other click lets go of it
      const popCtx = () => !popEl ? null : cur ? (popEl.dataset.block === cur.id ? { id: cur.id, st: cur.st, nodes: cur.nodes } : null) : (curRes && curRes.blocks[popEl.dataset.block]) || null;
      const pm = e.target.closest('[data-pick-m]');
      if (pm && popEl) {   // a machine for that line (a line moved onto another line's machine joins it), or back to the start
        const c = popCtx(); if (!c) return; const path = popEl.dataset.path, n = c.nodes[path], j = Number(popEl.dataset.line || 0);
        if (pm.dataset.pickM && n && n.lines) setLines(c.st, path, n.lines.map((l, i) => i === j ? Object.assign({}, l, { machine: pm.dataset.pickM }) : l));
        else delete c.st.overrides['l:' + path];
        saveChain(c.id, c.st); closePop(); rerender(); return;
      }
      const pr = e.target.closest('[data-pick-r]');
      if (pr && popEl) { const c = popCtx(); if (!c) return; c.st.overrides['r:' + popEl.dataset.path] = pr.dataset.pickR; saveChain(c.id, c.st); closePop(); rerender(); return; }
      const fm = e.target.closest('[data-fac-m]'); if (fm && popEl && popEl.dataset.facItem) { facSetMachine(popEl.dataset.facItem, fm.dataset.facM, null, popEl.dataset.part); return; }
      const fr = e.target.closest('[data-fac-r]'); if (fr && popEl && popEl.dataset.facItem) { facSetMachine(popEl.dataset.facItem, null, fr.dataset.facR, popEl.dataset.part); return; }
      const rto = e.target.closest('[data-ref-to]'); if (rto && popEl && popEl.dataset.refFrom) { refMove(popEl.dataset.refFrom, rto.dataset.refTo); return; }
      const nto = e.target.closest('[data-nuc-to]'); if (nto && popEl && popEl.dataset.nucFrom) { nucMove(popEl.dataset.nucFrom, nto.dataset.nucTo); return; }
      // the add row's picker: a recipe brings a machine that runs it
      const ad = e.target.closest('[data-add-m],[data-add-r],[data-add-proc],[data-add-lay]');
      if (ad && popEl && popEl.dataset.addPick && addSel) {
        if (ad.dataset.addProc) addSel.proc = ad.dataset.addProc;
        if (ad.dataset.addLay) addSel.layout = ad.dataset.addLay;
        if (ad.dataset.addR) { addSel.recipe = ad.dataset.addR; const pm = addLine(addSel); if (pm) addSel.machine = pm.machine; }
        if (ad.dataset.addM) addSel.machine = ad.dataset.addM;
        closePop(); addRefresh(); return;
      }
      if (!e.target.closest('.pop') && !e.target.closest('[data-popover]') && !e.target.closest('[data-fac-pick]') && !e.target.closest('[data-ref-pick]') && !e.target.closest('[data-nuc-pick]') && !e.target.closest('[data-add-mpick]')) closePop();
    });
  }
  bindDoc(document);
  window.addEventListener('focus', () => { if (tour) return; const a = doc.activeElement; if (a && a.matches && a.matches('input.num')) a.select(); else if (fine() && !(a && a.matches && a.matches('input,select'))) { q.focus(); q.select(); } });
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
    doc.title = 'Factorio Ratios'; setBg('home');
    const chip = id => FD.items[id] ? `<button class="chip2${remembered('i', id) ? ' mem' : ''}" data-go="#i/${id}" tabindex="-1"${remembered('i', id) ? ' title="In your factory"' : ''}>${ic(id, 'sm')}${esc(nameOf(id))}</button>` : '';
    $('#main').innerHTML = `
      <div class="cards">${Object.entries(CARDS).filter(([id]) => id !== 'factory').map(([id, c]) => `<button class="card${remembered('c', id) ? ' mem' : ''}" data-go="#c/${id}" tabindex="-1"${remembered('c', id) ? ' title="In your factory"' : ''}>${ic(c.icon, 'lg')}<span><span class="t">${esc(c.title)}</span><br><span class="d">${esc(c.desc)}</span></span></button>`).join('')}</div>
      ${GROUPS.map(([g, title]) => { const ids = makeable.filter(id => (FD.items[id].group || 'other') === g); return ids.length ? `<h3>${esc(title)}</h3><div class="chips">${ids.map(chip).join('')}</div>` : ''; }).join('')}
      ${(() => { const rest = makeable.filter(id => !GROUPS.some(([g]) => (FD.items[id].group || 'other') === g)); return rest.length ? `<h3>Other</h3><div class="chips">${rest.map(chip).join('')}</div>` : ''; })()}`;
  }

  // ---------- item chain view (a table: Item | Machines making it | Amount) ----------
  function findNode(tree, item) { let found = null; Engine.walk(tree, n => { if (!found && n.item === item && n !== tree) found = n; }); return found; }
  function supply(item, kRate, machine) {
    const res = FD.resources[item];
    const mp = 1 + S.mp / 100;
    if (res && res.cat === 'basic-solid') {   // the drill given (one line of a ledger row), else the one chosen for this ore in your factory, else Your base's (fluid ores: electric only)
      const pick = DRILLS.includes(machine) ? machine : S.machineOf[item], id = res.fluid ? 'electric-mining-drill' : DRILLS.includes(pick) ? pick : S.drill, d = FD.machines[id];
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
  const undoBtn = (key, show) => `<button class="undo" data-undo="${esc(key)}" tabindex="-1" title="Undo" aria-label="Undo"${show ? '' : ' hidden'}>↺</button>`;
  // line: which of the row's lines it is (a row on more than one machine has one each); x: a × that takes the line off
  const machLine = (path, k, R, machineId, pickable, note, focus, undo, line, x) => {
    const la = line === undefined ? '' : ` data-line="${line}"`;
    return `<input class="num" inputmode="decimal" data-path="${esc(path)}"${la} data-k="${k}" data-kind="mach" value="${fmtIn(k * R)}" aria-label="number of ${esc(nameOf(machineId))}"${focus ? ' data-focus="1"' : ''}>${undoBtn('scale', undo)}<span class="build" data-k="${k}" data-kind="build">${buildText(k * R)}</span>` +
      (pickable ? `<button class="mbtn can" data-popover="${esc(path)}"${la} tabindex="-1" title="Change machine">${icb(machineId)}<span class="mname">${esc(mName(machineId))}</span><span class="arr">▾</span></button>` : `<span class="mbtn">${icb(machineId)}<span class="mname">${esc(mName(machineId))}${note ? ' <span class="sub">' + esc(note) + '</span>' : ''}</span></span>`) +
      (x ? `<button class="partx" data-line-x="${esc(path)}"${la} tabindex="-1" title="Remove" aria-label="Remove these machines">×</button>` : '');
  };
  const machCell = (path, k, R, machineId, pickable, note, focus, undo) => `<div class="td mach" data-label="machines">${machLine(path, k, R, machineId, pickable, note, focus, undo)}</div>`;
  // A row's cell from its lines (Engine.build): one machine as above, or a line per machine with its own count, picker and
  // ×, as on the ledger; then a + while another machine is free. fl: the line whose box was set.
  function linesCell(n, R, focus, undo, fl) {
    const pick = n.machineChoices.length > 1 || (n.recipeChoices || []).length > 1, many = n.lines.length > 1;
    const more = n.machineChoices.some(m => !n.lines.some(l => l.machine === m)) ? addLineBtn(`data-line-plus="${esc(n.path)}"`, n.leaf ? 'drill' : 'machine') : '';
    const one = (l, j) => machLine(n.path, l.kMach, R, l.machine, pick, null, focus && j === fl, undo && j === fl, j, many);
    return many ? `<div class="td mach parts" data-label="machines">${n.lines.map((l, j) => `<div class="part">${one(l, j)}</div>`).join('')}${more}</div>`
      : `<div class="td mach" data-label="machines">${one(n.lines[0], 0)}${more}</div>`;
  }
  // machines per 1 unit/s of a row: its lines' (made or mined), else what pumps it (water) or makes it (steam)
  const rowK = n => n.lines && n.lines.length ? n.lines.reduce((a, l) => a + l.kMach, 0) / n.kRate : (s => s && s.k)(supply(n.item, 1));
  // a row's machines in words, for `rate` units/s of it: "24 × Stone furnace and 16 × Steel furnace"
  const linesWords = (n, rate) => n.lines.filter(l => l.share > 0).map(l => `${fmt(rate * l.share / l.per)} × ${mName(l.machine)}`).join(' and ');
  const amtCell = (kRate, R, fluid) => `<div class="td amt" data-label="${fluid ? 'amount' : esc(unitShort())}"><span class="rate" data-k="${kRate}" data-kind="rate" data-fluid="${fluid ? 1 : 0}">${amountText(kRate * R, fluid)}</span></div>`;
  const header = (first) => `<div class="th">${first}</div><div class="th">Machines</div><div class="th amth">Amount<span class="u">${esc(unitShort())}</span></div>`;

  function renderItem(id, spec) {
    setBg('item-' + FD.items[id].group);   // one view per category: intermediate products, logistics, production, combat, fluids
    const st = preview ? cloneState(chainState(id)) : chainState(id);   // a preview must not change what is remembered
    const tree = Engine.build(id, PAGE, st.overrides);
    const nodes = {}; Engine.walk(tree, n => { nodes[n.path] = n; });
    const def = tree.kMach ? 1 / tree.kMach : 1;   // 1 machine
    let note = '', view = null;
    if (spec && spec.n !== null) {   // a query ("8 gear", "5 iron plate > engine") is a what-if for this page; only the ledger saves
      let n = tree;
      if (spec.have && spec.have !== id) { n = findNode(tree, spec.have); if (!n) { note = `<div class="note">${esc(nameOf(spec.have))} is not used in ${esc(nameOf(id))}.</div>`; n = tree; } }
      // "5 iron plate > engine": the 5 furnaces cover every place iron plate appears in the chain, not just the first
      const t = itemTotals(tree, n.item);
      const asRate = unitToPerS(spec.n, spec.unit);
      let scale = null;
      if (asRate !== null) scale = asRate / t.kRate;
      else if (!n.leaf && t.kMach > 0) scale = spec.n / t.kMach;
      else if (n.leaf) { const k = rowK(n); if (k) scale = spec.n / (t.kRate * k); }
      if (scale > 0) { view = { scale, anchor: { path: n.path, kind: asRate !== null ? 'rate' : 'mach' } }; if (!preview) viewMem[id] = view; }
      if (t.places > 1) note += `<div class="note">Split over the ${t.places} places ${esc(nameOf(n.item).toLowerCase())} is used.</div>`;
    } else if (spec && spec.have && spec.have !== id && !findNode(tree, spec.have)) note = `<div class="note">${esc(nameOf(spec.have))} is not used in ${esc(nameOf(id))}.</div>`;
    // What the page shows: a what-if made here this session, else the item's number in your factory, else what the
    // tightest factory component in its chain has spare, else 1 machine.
    const d = driver(tree, id), dl = d && d.limit > 0 ? d : null;
    const base = st.touched && st.scale > 0 ? st.scale : dl ? dl.limit : def;
    const v = view || viewMem[id];
    const mode = v ? 'view' : st.touched && st.scale > 0 ? 'own' : dl ? 'driven' : 'default';
    const R = v ? v.scale : base;
    const anchor = v ? v.anchor : mode === 'own' ? (st.anchor || { path: tree.path, kind: 'mach' }) : mode === 'driven' ? { path: dl.path, kind: 'mach' } : { path: tree.path, kind: 'mach' };
    cur = { id, tree, nodes, st, scale: R, base, mode, drivenBy: dl, view };
    // the row that matters must be on screen: open the rows above it
    if (anchor.path !== tree.path) { const parts = anchor.path.split('>'); for (let i = 2; i < parts.length; i++) { const p = parts.slice(0, i).join('>'); if (nodes[p] && !st.open.includes(p)) st.open.push(p); } }
    const fs = { open: st.open, anchor, touched: mode === 'view' };   // the ↺ drops a what-if; the ledger owns saved numbers
    const sized = mode === 'driven' || (mode === 'default' && d) ? `<div class="sub">${drivenText(d)}</div>` : '';
    const rec = FD.recipes[tree.recipe];
    const perCraft = rec.out.find(o => o[0] === id)[1];
    const recipeLine = rec.cat === 'launch'
      ? `Rocket launch: <span class="nw">100 ${ic('rocket-part', 'xs')} rocket parts</span> + <span class="nw">1 ${ic('satellite', 'xs')} satellite</span> → 1,000 packs`
      : `${rec.in.map(([i, a]) => `<span class="nw">${fmt(a)} ${ic(i, 'xs')} ${esc(nameOf(i))}</span>`).join(' + ')} → <span class="nw">${fmt(perCraft)} ${ic(id, 'xs')} ${esc(nameOf(id))}</span> in ${fmt(rec.time)} s`;
    const bump = tree.fluidBump ? `<div class="note">Needs a fluid, so it runs in Assembler 2.</div>` : '';
    // science: labs row
    let labsRow = '';
    if (SCI.has(id)) {
      const sc = cardState('science');
      const kLabs = sc.time / (1 + sc.bonus / 100);   // labs per 1 pack/s
      labsRow = `<div class="tr" style="--d:1"><div class="td item"><span class="exp none"></span>${ic('lab')}<span class="nmtxt"><b>Labs</b><div class="sub">research time <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === sc.time ? 'selected' : ''}>${t} s</option>`).join('')}</select>${undoBtn('sci:time', sc.time !== 30)}${sc.bonus ? ' · lab speed +' + sc.bonus + '%' : ''}</div></span></div>` +
        `<div class="td mach" data-label="labs"><input class="num" inputmode="decimal" data-path="labs" data-k="${kLabs}" data-kind="mach" value="${fmtIn(kLabs * R)}" aria-label="labs"><span class="build" data-k="${kLabs}" data-kind="build">${buildText(kLabs * R)}</span><span class="mbtn">${ic('lab')}<span class="mname">Lab</span></span></div><div class="td amt"></div></div>`;
    }
    const focusPath = mode === 'driven' ? tree.path : anchor.path;   // Enter lands on the top row, even when a component sizes the page
    $('#main').innerHTML = `
      <h1>${ic(id, 'lg')}<span class="ttl">${esc(nameOf(id))}${nick(id)}<div class="sub">${recipeLine}</div>${sized}</span>
        ${facBtn(id, R, mode)}</h1>
      ${note}${bump}
      <div class="tbl" id="tree">${header('')}${rowHtml(tree, 0, R, fs, focusPath)}${labsRow}<div class="tr sep"><div class="td">needs</div></div>${tree.children.map(c => subtree(c, 1, R, fs, focusPath)).join('')}</div>
      ${usedInHtml(id)}`;
    const an = nodes[anchor.path];
    let sub = '';
    if (mode === 'driven') sub = ' · limited by your ' + (dl.used > 1e-9 ? 'spare ' + nameOf(dl.item).toLowerCase() : savedText(dl.item, dl.rate, true));
    else if (an && an !== tree) {   // the tab title names what was set, over every place the item appears, in the page's unit
      const t = itemTotals(tree, an.item), fl = isFluid(an.item);
      if (anchor.kind === 'rate') { const v2 = toUnit(t.kRate * R, fl); sub = ` · ${fmt(v2)} ${fl ? 'per second' : unitWord(v2)} of ${nameOf(an.item)}`; }
      else {
        const s = an.lines && an.lines.length ? null : an.leaf && supply(an.item, 1), what = s ? `${fmt(t.kRate * R * s.k)} × ${mName(s.id)}` : an.lines && an.lines.length ? linesWords(an, t.kRate * R) : '';
        if (what) sub = ` · ${what} ${an.leaf ? (isFluid(an.item) ? 'pumping' : 'mining') : 'making'} ${nameOf(an.item).toLowerCase()}`;
      }
    }
    doc.title = `${nameOf(id)}${sub} – Factorio Ratios`;
    if (!preview && !keepPlace && fine() && doc.activeElement !== q) { const inp = $('#tree input.num[data-focus]') || $('#tree input.num'); if (inp) { inp.focus(); inp.select(); } }
  }
  // the page's top row as lines of your factory: its recipe and the machines making something, each with its share (null:
  // no machine makes it, as for a rocket launch, water or wood)
  const pageTop = () => { const n = cur ? cur.tree : curRes ? curRes.top : null; return n && n.lines && n.lines.length ? { recipe: n.recipe || null, lines: n.lines.filter(l => l.share > 0) } : null; };
  // does the page's top row make the item on the machines your factory makes it on (with that recipe), in the same shares?
  function sameAsFactory(id) {
    const top = pageTop(); if (!top) return true;
    const made = madeWith(id).filter(l => (l.recipe || top.recipe) === top.recipe), tot = made.reduce((a, l) => a + l.scale, 0);
    return made.length === top.lines.length && made.every(l => top.lines.some(t => (l.machine || t.machine) === t.machine && Math.abs(t.share - l.scale / tot) < 1e-6));
  }
  // what Add to factory writes for a page's top row at R (units/s): a line for each machine making something on the page,
  // each in whole machines (a page can say 3.33 × Assembler 2: you build 4); lines on another recipe (solid fuel's) keep
  // theirs and the page's take the rest, or the page's lines alone when they make that much already. parts is null for a
  // row on one machine, or one no machine makes (wood), whose amount is then taken as it is
  function addParts(id, R) {
    const top = pageTop(), whole = p => { const pm = partMachine(id, p); if (pm && pm.k > 0) p.scale = Math.ceil(p.scale * pm.k - 1e-9) / pm.k; return p; };
    if (top && top.lines.length && itemMachine(id)) {
      const others = linesOf(id).filter(l => l.scale > 0 && (l.recipe || top.recipe) !== top.recipe), rest = R - others.reduce((a, l) => a + l.scale, 0);
      const parts = top.lines.map(l => whole({ recipe: top.recipe, machine: l.machine, scale: (rest > 1e-9 ? rest : R) * l.share })).concat(rest > 1e-9 ? others.map(l => Object.assign({}, l)) : []);
      return { parts, scale: parts.reduce((a, p) => a + p.scale, 0) };
    }
    const im = itemMachine(id);
    return { parts: null, scale: im && im.k > 0 ? Math.ceil(R * im.k - 1e-9) / im.k : R };
  }
  // the button that puts a page's top row into the ledger, its lines as they are on the page: Add, Update, or, when the
  // ledger has it so already (the page's count, or the whole machines it rounds up to), a link to the ledger
  function facBtn(id, R, mode) {
    const st = chainMem[id], inFac = saved(st), same = !inFac || sameAsFactory(id);
    if (inFac && same && (near(R, st.scale) || near(addParts(id, R).scale, st.scale))) return `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="Open your factory">In your factory ✓</button>`;
    return `<button class="iconbtn sm${mode === 'view' || !same ? ' cta' : ''}" data-tofactory tabindex="-1">${inFac ? 'Update in factory' : '+ Add to factory'}</button>`;
  }
  // the same for a card's count (labs, or boilers): the ledger's number against what the card shows now
  // the cards whose count goes into the ledger (labs, boilers, solar panels, reactor blocks in the card's layout) and the
  // count it goes on
  const CARD_ADD = ['science', 'steam', 'solar', 'nuclear'];
  // st: the card's state as it is drawn (on Nuclear, its layout decides which line of the ledger it is)
  const cardUnitKey = (id, st) => id === 'nuclear' ? NUC_KEY((st || cardState('nuclear')).layout) : CARD_UNIT[id];
  const cardHave = (id, st) => CARD_ADD.includes(id) && unitN(cardUnitKey(id, st)) > 0 ? unitN(cardUnitKey(id, st)) : 0;
  function cardFacBtn(id, n, st) {
    st = st || cardState(id); const have = cardHave(id, st);
    if (have > 0 && (near(n, have) || near(Math.ceil(n - 1e-9), have))) return `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="Open your factory">In your factory ✓</button>`;
    return `<button class="iconbtn sm${st.touched ? ' cta' : ''}" data-tofactory-card="${id}" tabindex="-1">${have > 0 ? 'Update in factory' : '+ Add to factory'}</button>`;
  }
  const cardCount = (id, def, R) => R;   // labs or boilers shown on the card
  // Your factory: the components in a chain it makes, each with what the rest of your factory leaves of it. Going down the
  // chain, the first such component on a branch feeds that branch (what is under it is not counted again: it is made
  // already); the tightest decides how much of the item can be made (limit 0: one of them has none to spare).
  function driver(tree, id) {
    const need = {}, first = {}, uses = (modelMemo || (modelMemo = factoryModel())).uses;   // item -> units/s per root unit/s
    const down = n => { for (const c of n.children) { if (c.item !== id && saved(chainMem[c.item])) { need[c.item] = (need[c.item] || 0) + c.kRate; first[c.item] = first[c.item] || c.path; } else down(c); } };
    down(tree);
    let best = null;
    for (const [item, k] of Object.entries(need)) {
      if (!(k > 0)) continue;
      const rate = chainMem[item].scale, used = (uses[item] || []).reduce((a, u) => a + u.rate, 0), spare = Math.max(0, rate - used);
      const limit = spare / k;          // root rate what this component has spare allows
      if (!best || limit < best.limit) best = { item, limit, path: first[item], rate, used, spare };
    }
    return best;
  }
  // an amount of an item in words, in the page's unit: "1.2 yellow lanes", "30 per second", water and crude oil in pumps
  const amountWords = (item, rate) => { const fl = isFluid(item), v = toUnit(rate, fl); return PUMP_OF[item] ? pumpsText(item, rate) : `${fmt(v)} ${fl ? 'per second' : unitWord(v)}`; };
  // the line under an item page's title that says what in your factory sizes it, or that a component has none to spare
  function drivenText(d) {
    if (!d) return '';
    const nm = esc(nameOf(d.item).toLowerCase());
    if (!(d.limit > 0)) return `Your factory has no ${nm} to spare.`;
    return d.used > 1e-9 ? `Limited by your spare ${nm}: ${esc(amountWords(d.item, d.spare))}.` : `Limited by your ${esc(savedText(d.item, d.rate, true))}.`;
  }
  // a saved number in words: "8 × Assembling machine 2" (short) or "8 × Assembling machine 2 making iron gear wheels"
  function savedText(item, rate, sentence) {
    const fl = isFluid(item), parts = partsOf(item);
    if (parts && near(rate, chainMem[item].scale)) {   // your factory's own number, on more than one machine: each line's
      const s = parts.filter(q => q.scale > 0).map(q => { const pm = partMachine(item, q); return pm ? `${fmt(q.scale * pm.k)} × ${mName(pm.machine)}` : ''; }).filter(Boolean).join(' and ');
      return sentence ? `${s} ${crafted(item) ? 'making' : 'mining'} ${nameOf(item).toLowerCase()}` : s;
    }
    if (!isResource(item) && Engine.byProduct[item]) {
      const t = Engine.build(item, S, {});   // your factory's machine, not one picked on a page
      if (t.kMach > 0) { const s = `${fmt(t.kMach * rate)} × ${mName(t.machine)}`; return sentence ? `${s} making ${nameOf(item).toLowerCase()}` : s; }
    }
    const sup = supply(item, 1);   // a resource counts in drills (or pumps), like everything else counts in machines
    if (sup) { const s = `${fmt(sup.k * rate)} × ${mName(sup.id)}`; return sentence ? `${s} ${fl ? 'pumping' : 'mining'} ${nameOf(item).toLowerCase()}` : s; }
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
    cur = null; curCard = null; setBg('resource');
    const fluid = isFluid(id);
    const st = preview ? cloneState(chainState(id)) : chainState(id);   // scale = units of the resource per second: its saved number
    const top = Engine.build(id, PAGE, st.overrides);  // the first row: an ore's drills (its lines, as for any row)
    const sup = top.lines ? null : supply(id, 1);      // else what pumps it ({id, k}: machines per 1 unit/s), or null for wood
    const k1 = top.lines ? rowK(top) : sup ? sup.k : null;
    const def = resDefault(id);
    let view = null;
    if (spec && spec.n !== null) {   // "2 lanes of stone": a what-if for this page; only the ledger saves
      const perS = unitToPerS(spec.n, spec.unit);
      let scale = null, kind = 'rate';
      if (perS !== null) scale = perS; else if (k1) { scale = spec.n / k1; kind = 'mach'; }
      if (scale > 0) { view = { scale, anchor: { path: id, kind } }; if (!preview) viewMem[id] = view; }
    }
    // One number runs this page: the supply of the resource. The first row is that supply (its number in your factory, or
    // one lane); every item below is sized as if all of it went to that item. Any box you change moves the supply for now.
    const v = view || viewMem[id];
    const base = st.touched && st.scale > 0 ? st.scale : def;
    const mode = v ? 'view' : st.touched && st.scale > 0 ? 'own' : 'default';
    const Rs = v ? v.scale : base;
    const anchor = v ? v.anchor : mode === 'own' && st.anchor ? st.anchor : { path: id, kind: k1 ? 'mach' : 'rate' };
    const showU = mode === 'view';
    const focusPath = anchor.path;
    const blocks = { [id]: { id, st, nodes: { [id]: top }, tree: null, need: 1 } };
    const focusTop = focusPath === id, focusRate = focusTop && anchor.kind === 'rate';
    const topMach = top.lines ? linesCell(top, Rs, focusTop && !focusRate, focusTop && !focusRate && showU, anchor.line || 0)
      : sup ? machCell(id, sup.k, Rs, sup.id, false, sup.note, focusTop && !focusRate, focusTop && !focusRate && showU) : `<div class="td mach" data-label="machines"><span class="sub">${originText(id)}</span></div>`;
    const topAmt = PUMP_OF[id] ? '<div class="td amt"></div>' : `<div class="td amt" data-label="${fluid ? 'amount' : esc(unitShort())}"><input class="num" inputmode="decimal" data-path="${id}" data-k="1" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${fmtIn(toUnit(Rs, fluid))}" aria-label="amount of ${esc(nameOf(id))}"${focusTop && (focusRate || !k1) ? ' data-focus="1"' : ''}>${undoBtn('scale', focusTop && (focusRate || !k1) && showU)}${fluid ? '<span class="unit">per second</span>' : ''}</div>`;
    const topRow = `<div class="blk" data-block="${id}"><div class="tr product" data-path="${id}"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(id)}<span class="nmtxt"><b>${esc(nameOf(id))}</b></span></div>${topMach}${topAmt}</div></div>`;
    const products = [...(usedIn[id] || [])].sort(productOrder);
    const line = `<div class="tr line"><div class="td"><span class="rule"></span></div></div>`;
    const blockHtml = products.map(p => {
      const bst = chainState(p);                      // the product's own machine choices apply here too
      const tree = Engine.build(p, PAGE, bst.overrides);
      const nodes = {}; Engine.walk(tree, n => { nodes[n.path] = n; });
      const need = itemTotals(tree, id).kRate;        // units of the resource per 1 product/s, over the product's whole chain
      if (!(need > 0)) return '';
      blocks[p] = { id: p, st: bst, nodes, tree, need };
      const Rb = Rs / need, fs = { open: [], anchor, touched: showU };
      return line + `<div class="blk" data-block="${p}">${rowHtml(tree, 0, Rb, fs, focusPath, { noExp: true, rootLink: true })}${tree.children.filter(c => c.item !== id).map(c => rowHtml(c, 1, Rb, fs, focusPath, { noExp: true })).join('')}</div>`;
    }).join('');
    // one step further: what those items go into
    const further = products.map(p => { const list = [...(usedIn[p] || [])].filter(o => o !== id).sort(fullOrder); return list.length ? `<h3>${ic(p, 'xs')} ${esc(nameOf(p))} is used in</h3><div class="chips">${list.map(useChip).join('')}</div>` : ''; }).join('');
    curRes = { id, st, blocks, top, scale: Rs, base, mode, view };
    // one line: what one drill (of each kind on the first row) or pump gives, and that every item below takes all of the first row
    const gives = top.lines ? top.lines.map((l, i) => `${i ? 'one' : 'One'} ${esc(nameOf(l.machine).toLowerCase())} gives ${fmt(l.per)} per second`).join(', ') : sup ? `One ${esc(nameOf(sup.id).toLowerCase())} gives ${fmt(1 / sup.k)} per second` : '';
    const intro = [gives ? `${gives}${!fluid && S.mp ? ' at +' + S.mp + '% mining productivity' : ''}.` : '', products.length ? 'Each item below uses all of it.' : ''].filter(Boolean).join(' ');
    $('#main').innerHTML = `
      <h1>${ic(id, 'lg')}<span class="ttl">${esc(nameOf(id))}${intro ? `<div class="sub">${intro}</div>` : ''}</span>
        ${facBtn(id, Rs, mode)}</h1>
      <div class="tbl" id="tree">${header('')}${topRow}${blockHtml}</div>
      ${further}`;
    doc.title = `${nameOf(id)}${mode !== 'default' ? ' · ' + (top.lines ? linesWords(top, Rs) : savedText(id, Rs)) : ''} – Factorio Ratios`;
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
    const fl = (st.anchor && st.anchor.line) || 0;                                   // (on a row on more than one machine, that line's)
    let mach, amt;
    if (!n.leaf) {
      mach = n.machine ? linesCell(n, R, focus && !focusRate, focus && !focusRate && touched, fl) : `<div class="td mach" data-label="machines"><span class="sub">rocket launch</span></div>`;
      amt = isRoot
        ? `<div class="td amt" data-label="${fluid ? 'amount' : esc(unitShort())}"><input class="num" inputmode="decimal" data-path="${esc(n.path)}" data-k="${n.kRate}" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${fmtIn(toUnit(n.kRate * R, fluid))}" aria-label="amount made"${focusRate ? ' data-focus="1"' : ''}>${undoBtn('scale', focusRate && touched)}${fluid ? '<span class="unit">per second</span>' : ''}</div>`
        : amtCell(n.kRate, R, fluid);
    } else {   // an ore's drills; what pumps water or crude oil; nothing for wood
      const s = n.lines ? null : supply(n.item, n.kRate);
      mach = n.lines ? linesCell(n, R, focus, focus && touched, fl) : s ? machCell(n.path, s.k, R, s.id, false, s.note, focus, focus && touched) : `<div class="td mach" data-label="machines"><span class="sub">${originText(n.item)}</span></div>`;
      amt = PUMP_OF[n.item] ? '<div class="td amt"></div>' : amtCell(n.kRate, R, fluid);   // water: its offshore pumps say it
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
    const ln = ctx.nodes[inp.dataset.path];
    if (ln && ln.lines && ln.lines.length > 1 && inp.dataset.line !== undefined) { lineInput(inp, ctx, ln, Number(inp.dataset.line), p); return; }
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
  // A page row's lines picked here (overrides 'l:' + path, [{ machine, share }]): a what-if for this visit, like any pick
  // on a page. Lines on the same machine join.
  function setLines(st, path, lines) {
    const out = [];
    for (const l of lines) { const o = out.find(x => x.machine === l.machine); if (o) o.share += l.share; else out.push({ machine: l.machine, share: l.share }); }
    st.overrides['l:' + path] = out;
  }
  // a page's count box for one line of a row (on a resource page, inside that row's block)
  const boxSel = (block, path, line) => `#tree ${curRes ? `.blk[data-block="${block}"] ` : ''}input.num[data-path="${path}"][data-line="${line}"]`;
  // a count typed on one line of a row on more than one machine: that line has that many, the others keep theirs (as on the
  // ledger), and the whole page follows the row's new amount
  function lineInput(inp, ctx, n, j, p) {
    const rates = n.lines.map(l => n.kRate * l.share * ctx.scale);   // what each line makes now, units/s
    rates[j] = p.kind === 'rate' ? p.perS : p.v * n.lines[j].per;
    const tot = rates.reduce((a, x) => a + x, 0); if (!(tot > 0)) return;
    setLines(ctx.st, n.path, n.lines.map((l, i) => Object.assign({}, l, { share: rates[i] / tot })));
    const anchor = { path: n.path, kind: 'mach', line: j };
    if (curRes) viewMem[curRes.id] = { scale: tot / n.kRate * ctx.need, anchor }; else viewMem[cur.id] = { scale: tot / n.kRate, anchor };
    const text = inp.value, s0 = inp.selectionStart, s1 = inp.selectionEnd, orig = inp.dataset.orig, sel = boxSel(ctx.id, n.path, j);
    keepPlace = true; try { rerender(); } finally { keepPlace = false; }
    const b = $(sel);   // back in the box, as you left it
    if (b) { b.value = text; restoringFocus = true; b.focus(); restoringFocus = false; if (orig !== undefined) b.dataset.orig = orig; try { b.setSelectionRange(s0, s1); } catch (e) { } }
  }
  // keep the Add / Update / In your factory button honest while typing
  function refreshFacBtn() {
    const old = $('#main h1 .iconbtn.sm'); if (!old) return;
    const page = cur || curRes;
    const html = page ? facBtn(page.id, page.scale, page.mode) : curCard && curCard.def && CARD_ADD.includes(curCard.id) ? cardFacBtn(curCard.id, cardCount(curCard.id, curCard.def, curCard.st.scale), curCard.st) : null;
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
  // the picker for one line of a page row: its machine, the row's recipe, and, once the row is off what it started on, a
  // way back (your factory's lines for the item, or Defaults)
  function openPop(btn, n, ctx) {
    closePop();
    const j = Number(btn.dataset.line || 0), on = (n.lines[j] || n.lines[0]).machine;
    const needsFluid = !n.leaf && FD.recipes[n.recipe].cat === 'crafting-with-fluid';
    const opts = n.machineChoices.map(m => `<button data-pick-m="${m}" class="${m === on ? 'on' : ''}" ${needsFluid && m === 'assembling-machine-1' ? 'disabled title="needs a fluid input: Assembler 2 or 3"' : ''} tabindex="-1">${icb(m)}<span>${esc(mName(m))}</span></button>`).join('');
    const recs = (n.recipeChoices || []).length > 1 ? n.recipeChoices.map(rid => `<button data-pick-r="${rid}" class="${rid === n.recipe ? 'on' : ''}" tabindex="-1">${ic(rid, 'sm')}<span>${esc(FD.recipes[rid].name)}</span></button>`).join('') : '';
    const back = ctx.st.overrides['l:' + n.path] ? `<button data-pick-m="" tabindex="-1"><span>${madeWith(n.item).length ? 'as your<br>factory' : 'as<br>Defaults'}</span></button>` : '';
    popEl = doc.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = `<span class="lead">${n.leaf ? 'Mine' : 'Make'} ${esc(nameOf(n.item))} ${n.leaf ? 'with' : 'in'}:</span>` + opts + back + (recs ? `<span class="lead">using recipe:</span>` + recs : '');
    popEl.dataset.path = n.path; popEl.dataset.block = ctx.id; popEl.dataset.line = j;
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
    if (e.target.id === 'addn') { e.target.dataset.typed = '1'; return; }   // the add row keeps what you typed when its machine changes
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
      if (fg.dataset.forget === 'ask') fg.outerHTML = `<span class="lead">${facTab === 'all' ? 'Clear all?' : 'Clear this tab?'}</span><button class="iconbtn sm" data-forget="yes" tabindex="-1">Yes</button><button class="iconbtn sm" data-forget="no" tabindex="-1">No</button>`;
      else if (fg.dataset.forget === 'yes' && facTab === 'all') { forgetAll(); bpImport = null; render(); }
      else { if (fg.dataset.forget === 'yes') { forgetTab(facTab); bpImport = null; } renderFactory(true); }   // No, or one tab: the rest stays as it is
      return;
    }
    const tf = e.target.closest('[data-tofactory]');
    if (tf) {   // the page's top row into the ledger as it is on the page, in whole machines (addParts)
      const page = cur || curRes; if (!page) return;
      const id = page.id, st = chainState(id), a = addParts(id, page.scale);
      if (a.parts) { st.parts = a.parts; st.anchor = { path: id, kind: 'mach' }; facPartsSettled(id, st); chainMem[id] = st; }
      else { delete st.parts; st.scale = a.scale; st.anchor = { path: id, kind: 'mach' }; st.touched = true; }
      delete st.overrides['l:' + id]; delete st.overrides['r:' + id];   // the page now shows the ledger's own
      persist(); delete viewMem[page.id]; clearViews(); rerender(); return;
    }
    const tc = e.target.closest('[data-tofactory-card]');
    if (tc && curCard && curCard.def) {   // labs, boilers with their steam engines, solar panels or reactor blocks into the ledger, whole
      const id = tc.dataset.tofactoryCard, n = Math.ceil(cardCount(id, curCard.def, curCard.st.scale) - 1e-9);
      facUnits[cardUnitKey(id, curCard.st)] = n;
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
    const apt = e.target.closest('[data-add-line]'); if (apt) { const id = apt.dataset.addLine, nx = nextLine(id); if (nx) facAddLine(id, nx.recipe, nx.machine); return; }
    const pxt = e.target.closest('[data-part-x]'); if (pxt) { facDropPart(pxt.dataset.partX, Number(pxt.dataset.part)); return; }
    // the refinery row's lines: which processing a line runs, another processing, or one taken off
    const rpk = e.target.closest('[data-ref-pick]'); if (rpk) { if (popEl && popEl.dataset.refFrom === rpk.dataset.refPick) closePop(); else openRefPick(rpk, rpk.dataset.refPick); return; }
    const radd = e.target.closest('[data-ref-add]'); if (radd) { refAddLine(); return; }
    const rxx = e.target.closest('[data-ref-x]'); if (rxx) { refDropLine(rxx.dataset.refX); return; }
    // the nuclear row's lines: a layout picker, another layout, or one taken off
    const npk = e.target.closest('[data-nuc-pick]'); if (npk) { if (popEl && popEl.dataset.nucFrom === npk.dataset.nucPick) closePop(); else openNucPick(npk, npk.dataset.nucPick); return; }
    if (e.target.closest('[data-nuc-add]')) { nucAddLine(); return; }
    const nxx = e.target.closest('[data-nuc-x]'); if (nxx) { nucDropLine(nxx.dataset.nucX); return; }
    if (e.target.closest('[data-add-close]')) { addClose(); return; }
    const amp = e.target.closest('[data-add-mpick]'); if (amp) { if (popEl && popEl.dataset.addPick) closePop(); else openAddPick(amp); return; }
    const ap = e.target.closest('[data-add-pick]'); if (ap) { addPick(ap.dataset.addPick); return; }
    if (e.target.closest('[data-add]')) { addItem(); return; }
    const of = e.target.closest('[data-open-f]'); if (of) { const i = of.dataset.openF; if (facOpen.has(i)) facOpen.delete(i); else facOpen.add(i); renderFactory(true); return; }
    // the ledger's short list: × dismisses, Bring back lists them again (rows, space-separated)
    const dz = e.target.closest('[data-dismiss-f]'); if (dz) { for (const d of dz.dataset.dismissF.split(' ')) if (d) facDismiss.add(d); persist(); renderFactory(true, true); return; }
    const uz = e.target.closest('[data-undismiss-f]'); if (uz) { for (const d of uz.dataset.undismissF.split(' ')) facDismiss.delete(d); persist(); renderFactory(true, facFilter !== 'short'); return; }   // under the short filter, their rows join the table
    // a count at the top (short, used but not entered, fulfilled): show only those rows, or every row again
    const fl = e.target.closest('[data-fac-filter]'); if (fl) { facFilter = facFilter === fl.dataset.facFilter ? null : fl.dataset.facFilter; facFiltSeen.clear(); renderFactory(true); return; }
    // Remove on a row: out of your factory; Put back: as it was
    const rm = e.target.closest('[data-rm-f]'); if (rm) { facRemove(rm.dataset.rmF); return; }
    // − before a line of an opened row: the first click arms it (red, "remove?"), the second takes the line out
    const cr = e.target.closest('[data-cons-rm]');
    if (cr) { if (cr.classList.contains('sure')) consRemove(cr.dataset.consRm); else { consUnarm(); cr.classList.add('sure'); cr.title = 'Click again to take it out'; const sd = cr.parentElement.querySelector('.side'); if (sd) { sd.classList.add('sure'); sd.textContent = 'remove?'; } } return; }
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
    const lp = e.target.closest('[data-line-plus]');
    if (lp) {   // + on a page row: a line at 0 on a machine the row is not on yet, its box ready to type in
      const c = ctxOf(lp), n = c && c.nodes[lp.dataset.linePlus], m = n && n.lines && n.machineChoices.find(x => !n.lines.some(l => l.machine === x)); if (!m) return;
      setLines(c.st, n.path, n.lines.concat({ machine: m, share: 0 })); closePop(); rerender();
      const box = $(boxSel(c.id, n.path, n.lines.length)); if (box && fine()) box.focus();
      return;
    }
    const lx = e.target.closest('[data-line-x]');
    if (lx) {   // × on a line of a page row: those machines go, and the row's other lines make its amount
      const c = ctxOf(lx), n = c && c.nodes[lx.dataset.lineX], j = Number(lx.dataset.line); if (!n || !n.lines) return;
      setLines(c.st, n.path, n.lines.filter((l, i) => i !== j)); closePop(); rerender(); return;
    }
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
      if (page) {   // a count typed on one line of a row also gave that row new lines: it goes back to the ones it had
        const a = (viewMem[page.id] || {}).anchor, b = a && a.line !== undefined && (cur || curRes.blocks[a.path.split('>')[0]]);
        if (b) delete b.st.overrides['l:' + a.path];
        delete viewMem[page.id]; rerender(); return;
      }
      if (curCard) { const st = curCard.st; st.scale = null; st.anchor = null; st.touched = false; renderCard(curCard.id); }
      return;
    }
    if (key === 'sci:time' || key === 'sci:bonus') { const st = cardState('science'); st[key.slice(4)] = key === 'sci:time' ? 30 : 0; saveCard('science', st); if (cur) renderItem(cur.id); else renderCard('science'); return; }
    if (key === 'layout' && curCard) { curCard.st.layout = nucHome(); saveCard(curCard.id, curCard.st); renderCard(curCard.id); return; }
  }
  document.getElementById('settings').addEventListener('click', e => {
    if (e.target.closest('[data-base-toggle]')) { baseOpen = !baseOpen; keepPlace = true; try { renderSettings(); } finally { keepPlace = false; } return; }
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const name = b.closest('[data-set]').dataset.set, keep = keepTyped();
    S[name] = name === 'tier' ? Number(b.dataset.v) : b.dataset.v;
    keep(); baseChanged();
  });
  document.getElementById('settings').addEventListener('change', e => {
    const sel = e.target.closest('select[data-set]'); if (!sel) return;
    const v = Number(sel.value), keep = keepTyped();
    if (sel.dataset.set === 'mp') rescaleMined((1 + v / 100) / (1 + S.mp / 100));   // your drills and pumpjacks stay as many; what they mine changes
    S[sel.dataset.set] = v; keep(); baseChanged();
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
      return { defaultScale: 20, fields: [
        { id: 'boiler', k: 1, label: 'Boilers' }, { id: 'steam-engine', k: eng, label: 'Steam engines' }, { id: 'offshore-pump', k: b.water_per_s / FD.power.offshore_pump.per_s, label: 'Offshore pumps' },
        { k: eng * e.kw / 1000, label: 'Electricity made', unit: 'MW', icon: 'small-electric-pole' },
        { id: fuel, k: per(fuel), label: `${nameOf(fuel)} burned`, flow: true },
        ...(fuel === 'coal' ? [{ id: S.drill, k: coal / (FD.machines[S.drill].speed * mp), label: nameOf(S.drill) + 's on coal' }] : []),
        ...others.map(f => ({ id: f, k: per(f), label: `${nameOf(f)} burned instead`, flow: true }))] };
    }
    if (id === 'solar') {
      const s = FD.power.solar;
      return { defaultScale: 25, fields: [
        { id: 'solar-panel', k: 1, label: 'Solar panels' }, { id: 'accumulator', k: s.accumulators_per_panel, label: 'Accumulators' },
        { k: s.avg_kw / 1000, label: 'Electricity, day and night average', unit: 'MW', icon: 'small-electric-pole' }, { k: s.peak_kw / 1000, label: 'Electricity at noon', unit: 'MW', icon: 'small-electric-pole' }] };
    }
    if (id === 'mining') {
      const d = FD.machines[S.drill];
      const ore = d.speed * mp;
      const plate = f => FD.machines[f].speed / FD.recipes['iron-plate'].time;
      return { defaultScale: 5, fields: [
        { id: S.drill, k: 1, label: nameOf(S.drill) + 's' }, { id: 'stone-furnace', k: ore / plate('stone-furnace'), label: 'Stone furnaces' }, { id: 'steel-furnace', k: ore / plate('steel-furnace'), label: 'Steel or electric furnaces' },
        { id: 'iron-ore', k: ore, label: 'Ore mined', flow: true }] };
    }
    if (id === 'nuclear') {
      const [rows, cols] = st.layout.split('x').map(Number);
      const L = Engine.nuclearLayout(rows, cols);
      const cent = L.reactors * 0.0005 / (0.007 / 12);
      // how many blocks of the layout you build (what Add to factory puts on the ledger), and what they take and make
      return { defaultScale: 1, fields: [
        { id: 'nuclear-reactor', k: 1, label: st.layout + ' blocks' }, { id: 'nuclear-reactor', k: L.reactors, fixed: true, label: 'Reactors' }, { k: L.mw, label: 'Electricity made', unit: 'MW', fixed: true, icon: 'small-electric-pole' }, { id: 'heat-exchanger', k: L.exchangers, fixed: true, label: 'Heat exchangers' }, { id: 'steam-turbine', k: L.turbines, fixed: true, label: 'Steam turbines' },
        { id: 'offshore-pump', k: L.pumps, fixed: true, label: 'Offshore pumps' }, { id: 'uranium-fuel-cell', k: L.cellsPerMin, label: 'Fuel cells used', unit: 'per minute', fixed: true },
        { id: 'centrifuge', k: cent, fixed: true, label: 'Centrifuges, without Kovarex' }, { id: 'electric-mining-drill', k: cent * (10 / 12) / (FD.machines['electric-mining-drill'].speed / 2 * mp), fixed: true, label: 'Drills on uranium ore, without Kovarex' }],
        extra: `<label>Reactor layout <select data-layout tabindex="-1">${NUC_LAYOUTS.map(l => `<option ${l === st.layout ? 'selected' : ''}>${l}</option>`).join('')}</select>${undoBtn('layout', st.layout !== nucHome())}</label>` };
    }
    if (id === 'uranium') {
      const orePerDrill = FD.machines['electric-mining-drill'].speed / 2 * mp;
      const centOre = 10 / 12;
      return { defaultScale: 6, fields: [
        { id: 'centrifuge', k: 1, label: 'Centrifuges' }, { id: 'electric-mining-drill', k: centOre / orePerDrill, label: 'Electric drills on uranium ore' }, { id: 'sulfuric-acid', k: centOre / mp, label: 'Sulfuric acid used', fluid: true },
        { id: 'uranium-238', k: 0.993 / 12 * 60, label: 'U-238 made', unit: 'per minute' }, { id: 'uranium-235', k: 0.007 / 12 * 60, label: 'U-235 made', unit: 'per minute' },
        { id: 'nuclear-reactor', k: (0.007 / 12) / 0.0005, label: 'Reactors fuelled, without Kovarex' }] };
    }
    if (id === 'science') {
      const perLab = (1 + st.bonus / 100) / st.time;    // packs per second one lab uses
      const fields = [{ id: 'lab', k: 1, label: 'Labs' }];
      for (const p of SCI_PACKS) { const t = Engine.build(p, PAGE, {}); fields.push({ id: p, k: t.kMach * perLab, label: nameOf(p), nick: COLOUR[p], machines: t.lines.map(l => l.machine) }); }
      fields.push({ id: 'space-science-pack', k: perLab * 60 / 1000, label: 'Space science pack', nick: 'white', unit: 'rocket launches per minute', fixed: true });
      return { defaultScale: 10, fields, isScience: true,
        extra: `research time <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === st.time ? 'selected' : ''}>${t} s</option>`).join('')}</select>${undoBtn('sci:time', st.time !== 30)} · lab speed <select data-sci="bonus" tabindex="-1">${[0, 20, 50, 90, 140, 190, 250].map((b, i) => `<option value="${b}" ${b === st.bonus ? 'selected' : ''}>${i ? 'level ' + i + ' (+' + b + '%)' : 'none'}</option>`).join('')}</select>${undoBtn('sci:bonus', st.bonus !== 0)}` };
    }
    return null;
  }

  // ---------- your factory: the machines you have, against what they use ----------
  // The ledger is split into tabs by what makes each row: mining & smelting, assembling, oil & chemicals, power, science.
  // "Everything" shows them all. A tab's dashed add row only offers what belongs in that tab.
  const FAC_TABS = [['all', 'Everything', ''], ['mining', 'Mining & smelting', 'electric-mining-drill'], ['assembling', 'Assembling', 'assembling-machine-2'], ['oil', 'Oil & chemicals', 'oil-refinery'], ['power', 'Power', 'steam-engine'], ['science', 'Science', 'lab']];
  const FAC_ORDER = ['mining', 'assembling', 'oil', 'power', 'science'];
  let facTab = store.get('factab', 'all'); if (!FAC_TABS.some(t => t[0] === facTab)) facTab = 'all';
  const facOpen = new Set();   // rows opened to show what uses the item
  let facFilter = null;            // 'short', 'none' or 'ok': the table shows only what that count at the top counts (this visit)
  // a − clicked once goes back to how it was: another click anywhere, or Esc
  const consUnarm = () => { const b = $('#main .exp.minus.sure'); if (!b) return false; b.classList.remove('sure'); b.title = b.getAttribute('aria-label'); const sd = b.parentElement.querySelector('.side.sure'); if (sd) { sd.classList.remove('sure'); sd.textContent = sd.dataset.side; } return true; };
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
  const PROC_SHORT = { basic: 'Basic', advanced: 'Advanced', coal: 'Coal liquefaction' };   // beside "Oil refinery" on a picker
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
    nuclear: { tab: 'power', name: 'Nuclear reactors', icon: 'nuclear-reactor', machine: 'nuclear-reactor', go: '#c/nuclear', keys: ['nuclear', 'reactor', 'reactors', 'nuclear reactor', 'nuclear reactors'] },
  };
  const unitN = id => facUnits[id] > 0 ? facUnits[id] : 0;
  // nuclear reactors come in blocks of a layout (1x1 to 2x8), each layout its own count of blocks, on the Nuclear
  // reactors row (a line per layout, as refineries have a line per processing)
  const NUC_LAYOUTS = ['1x1', '1x2', '2x2', '2x3', '2x4', '2x5', '2x6', '2x8'];
  const NUC_KEY = l => 'nuclear-' + l;
  for (const l of NUC_LAYOUTS) UNITS[NUC_KEY(l)] = { tab: 'power', name: `Nuclear reactors (${l})`, icon: 'nuclear-reactor', machine: 'nuclear-reactor', go: '#c/nuclear', keys: [], part: true };
  const nucN = l => unitN(NUC_KEY(l)), nucAll = () => NUC_LAYOUTS.reduce((a, l) => a + nucN(l), 0);
  const nucOf = l => { const [r, c] = l.split('x').map(Number); return Engine.nuclearLayout(r, c); };   // one block: reactors, MW, water, fuel cells
  const nucReactors = () => NUC_LAYOUTS.reduce((a, l) => a + nucN(l) * nucOf(l).reactors, 0);
  const nucMain = () => NUC_LAYOUTS.reduce((a, l) => nucN(l) > nucN(a) ? l : a, cardState('nuclear').layout || '2x2');   // the one with most blocks
  const nucHome = () => NUC_LAYOUTS.reduce((a, l) => nucN(l) > nucN(a) ? l : a, '2x2');   // the Nuclear card's own: your factory's most-built layout, else 2x2
  const nucShown = new Set();   // layouts put on the nuclear row this visit that have no count yet
  const nucLines = () => { const s = NUC_LAYOUTS.filter(l => nucN(l) > 0 || nucShown.has(l)); return s.length ? s : [nucMain()]; };
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
  // A row can hold lines on different machines or recipes (gears in assembler 1 and 2, solid fuel from two oils, iron ore
  // under burner and electric drills): one part per line, each with its machine, recipe and how much it makes. The row's
  // number is their sum, and the first line is the row's own machine and recipe.
  const partsOf = id => { const st = chainMem[id]; return st && st.parts && st.parts.length > 1 ? st.parts : null; };
  const partsTotal = st => st.parts.reduce((a, p) => a + (p.scale > 0 ? p.scale : 0), 0);
  const sWith = (id, machine, recipe) => Object.assign(Object.create(S), { machineOf: Object.assign({}, machineOf, machine ? { [id]: machine } : {}), recipeOf: Object.assign({}, recipeOf, recipe ? { [id]: recipe } : {}) });
  const crafted = id => !isResource(id) && !!Engine.byProduct[id] && !Engine.LEAVES.has(id);   // else mined or pumped
  // one line's machine: machines per 1 unit/s, and the choices for it (a mined line: its drill)
  function partMachine(id, p) {
    if (!crafted(id)) { const s = supply(id, 1, p.machine), res = FD.resources[id]; return s && { machine: s.id, k: s.k, options: res && res.cat === 'basic-solid' && !res.fluid ? DRILLS : [s.id], recipe: null, recipes: [] }; }
    const t = Engine.build(id, sWith(id, p.machine, p.recipe), {});
    return { machine: t.machine, k: t.kMach, options: t.machineChoices, recipe: t.recipe, recipes: t.recipeChoices, tree: t };
  }
  // a row's lines in your factory ({ recipe, machine, scale }): its parts, or its one machine; none when it is not entered
  function linesOf(id) {
    const p = partsOf(id); if (p) return p;
    const st = chainMem[id], im = itemMachine(id);
    return saved(st) && im ? [{ recipe: im.recipe || null, machine: im.machine, scale: st.scale }] : [];
  }
  const sameLine = (l, recipe, machine) => l.machine === machine && (l.recipe || null) === (recipe || null);
  // a line into your factory: it replaces the line on the same machine and recipe, or goes under the row's other lines
  function facPutLine(id, recipe, machine, rate) {
    const st = chainState(id), lines = linesOf(id).filter(l => l.scale > 0 || sameLine(l, recipe, machine)).map(l => Object.assign({}, l)), i = lines.findIndex(l => sameLine(l, recipe, machine));   // emptied lines go
    if (i >= 0) lines[i].scale = rate; else lines.push({ recipe: recipe || null, machine, scale: rate });
    st.parts = lines; st.anchor = { path: id, kind: 'mach' };
    facPartsSettled(id, st); chainMem[id] = st;
  }
  // the line a row's "+" adds: another machine for its first line's recipe, else another recipe
  function nextLine(id) {
    const im = itemMachine(id); if (!im) return null;
    const lines = partsOf(id) || [{ recipe: im.recipe || null, machine: im.machine }], r0 = lines[0].recipe || null, pm = partMachine(id, { recipe: r0, machine: null });
    const m = (pm ? pm.options : []).find(x => !lines.some(l => sameLine(l, r0, x)));
    if (m) return { recipe: r0, machine: m };
    const r = (im.recipes || []).find(x => !lines.some(l => l.recipe === x));
    return r ? { recipe: r, machine: partMachine(id, { recipe: r }).machine } : null;
  }
  // "+" at the end of a row's machines: a line on a machine (recipe, processing) the row is not on yet
  const addLineBtn = (attr, what) => `<button class="addline" ${attr} tabindex="-1" title="Another ${what}" aria-label="Add a line on another ${what}">+</button>`;
  // a row's machine count and its machine (a picker when there is a choice). A row on more than one machine or recipe has
  // a line for each, with its own count, picker and ×; a row with a recipe it does not use yet offers another
  // what a line's picker shows: its machine (and recipe, small, when the item has more than one), or, for an item made in
  // one machine with more than one recipe (solid fuel), the recipe itself
  const lineLabel = im => {
    const recs = (im.recipes || []).length > 1, rname = recs ? esc(FD.recipes[im.recipe].name) : '';
    return im.options.length < 2 && recs ? `${ic(im.recipe)}<span class="mname">${rname}</span>` : `${icb(im.machine)}<span class="mname">${esc(mName(im.machine))}${recs ? ` <small>· ${rname}</small>` : ''}</span>`;
  };
  const facOne = (i, k, v, im, part, many) => {
    const choice = im.options.length > 1 || (im.recipes || []).length > 1, pa = part === undefined ? '' : ` data-part="${part}"`;
    return `<input class="num" inputmode="decimal" data-path="${i}"${pa} data-k="${k}" data-kind="mach" value="${v ? fmtIn(v) : ''}" placeholder="0" aria-label="number of ${esc(nameOf(im.machine))} making ${esc(nameOf(i))}">` +
      (choice ? `<button class="mbtn can" data-fac-pick="${i}"${pa} tabindex="-1" title="Change machine${(im.recipes || []).length > 1 ? ' or recipe' : ''}">${lineLabel(im)}<span class="arr">▾</span></button>` : `<span class="mbtn">${lineLabel(im)}</span>`) +
      (many ? `<button class="partx" data-part-x="${i}"${pa} tabindex="-1" title="Remove" aria-label="Remove these machines">×</button>` : '');
  };
  const facBox = (i, k, v, im) => {
    const parts = partsOf(i), nx = (v || parts) && nextLine(i);   // a row with machines entered
    const more = nx ? addLineBtn(`data-add-line="${i}"`, nx.recipe !== (parts ? parts[0].recipe : im.recipe || null) ? 'recipe' : 'machine') : '';
    if (!parts) return `<div class="td mach" data-label="machines">${facOne(i, k, v, im)}${more}</div>`;
    return `<div class="td mach parts" data-label="machines">${parts.map((p, j) => { const pm = partMachine(i, p); return `<div class="part">${facOne(i, pm.k, p.scale > 0 ? p.scale * pm.k : null, pm, j, true)}</div>`; }).join('')}${more}</div>`;
  };

  // the drills (or pumps) on a mined row, a [machine, how many] for each of its lines
  const minedRuns = (id, rate) => (partsOf(id) || [{ machine: null, scale: rate }]).map(q => { const s = supply(id, 1, q.machine); return s && [s.id, s.k * (q.scale > 0 ? q.scale : 0)]; }).filter(Boolean);
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
      for (const [tree, r] of runs) for (const c of tree.children) push(c.item, { by: p, rate: c.kRate * r, machines: tree.kMach * r, machine: tree.machine, recipe: tree.recipe });
    }
    // burner drills and stone or steel furnaces burn coal
    const coalPerKw = 1 / (FD.items.coal.fuel * 1000);
    const burn = (machine, count, by) => { const m = FD.machines[machine]; if (m && m.burner && count > 0) push('coal', { by, rate: m.kw * coalPerKw * count, machines: count, machine, fuel: true }); };
    for (const [p, rate] of Object.entries(have)) { const r = runsOf[p]; if (r) for (const [t, x] of r) burn(t.machine, t.kMach * x, p); else for (const [m, n] of minedRuns(p, rate)) burn(m, n, p); }
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
    // nuclear reactors burn fuel cells, and their heat exchangers drink water, block by block
    const manyLay = NUC_LAYOUTS.filter(l => nucN(l) > 0).length > 1;   // then a line of what they use is one layout's
    for (const l of NUC_LAYOUTS) {
      const n = nucN(l); if (!(n > 0)) continue;
      const L = nucOf(l), on = Object.assign({ label: `Nuclear reactors (${l})`, machines: n * L.reactors }, manyLay ? { layout: l } : {});
      push('uranium-fuel-cell', unitUse('nuclear', n * L.cellsPerMin / 60, on)); push('water', unitUse('nuclear', n * L.water, on));
    }
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
      const proc = OIL_PROC[m], on = Object.assign({ machines: rm[m] }, N.r > rm[m] ? { label: `Oil refineries (${OIL_PROC_NAME[m]})`, proc: m } : {});
      for (const [item, label] of [['crude-oil'], ['water'], ['coal', 'Coal liquefaction']]) { const n = rm[m] * oilIn(proc, item, 'oil-refinery'); if (n > 0) push(item, unitUse('refinery', n, Object.assign({}, on, label ? { label } : {}))); }
      const steamN = rm[m] * oilIn(proc, 'steam', 'oil-refinery'); if (steamN > 0) steamUses.push(unitUse('refinery', steamN, Object.assign({}, on, { label: 'Coal liquefaction' })));
    }
    if (!basic && N.a) push('water', unitUse('heavy-oil-cracking', N.a * oilIn('heavy-oil-cracking', 'water', 'chemical-plant')));
    if (!basic && N.b) push('water', unitUse('light-oil-cracking', N.b * oilIn('light-oil-cracking', 'water', 'chemical-plant')));
    // electricity: steam engines and solar panels against what every electric machine draws
    const power = { made: unitN('steam-engine') * E.kw / 1000 + unitN('solar-panel') * FD.power.solar.avg_kw / 1000 + NUC_LAYOUTS.reduce((a, l) => a + nucN(l) * nucOf(l).mw, 0), used: 0, parts: [] };
    const draw = (machine, count, by, label, go, recipe) => {
      const m = FD.machines[machine], kw = machine === 'lab' ? LAB_KW : m && !m.burner ? m.kw + (m.drain || 0) : 0;
      if (kw > 0 && count > 0) { power.used += kw * count / 1000; power.parts.push({ by, label, go, machines: count, machine, recipe, mw: kw * count / 1000 }); }
    };
    for (const [p, rate] of Object.entries(have)) { const r = runsOf[p]; if (r) for (const [t, x] of r) draw(t.machine, t.kMach * x, p, null, null, t.recipe); else for (const [m, n] of minedRuns(p, rate)) draw(m, n, p); }
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
    cur = null; curRes = null; curCard = { id: 'factory', st: {}, fields: [] }; setBg('factory');
    closePop();   // a picker belongs to the rows it was opened on
    // arriving on the page (a Your base change redraws in place and keeps them): no kept rows, Put back or filter yet
    if (!fromInput && !keepPlace) { facKeep.clear(); for (const k of Object.keys(facRemoved)) delete facRemoved[k]; facFilter = null; facFiltSeen.clear(); refShown.clear(); nucShown.clear(); }
    const { have, uses, runsOf, ids, power, steam, oil, sci } = factoryModel();
    const shared = {};   // rows the Oil tab shows too: coal, steam and water, when its machines take them
    const laneTab = new Set();   // tabs with an item row counted in your belt's unit, so their headers name it
    const capOf = (word, fluid) => fluid ? word : `${word}, ${esc(unitShort())}`;   // a caption on a phone: a fluid's amount says "per second" itself
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
    // the left-over cell: short (red, with how many machines close the gap), not entered (grey), fulfilled (green). Its bar
    // fills as what you have covers what is needed, and is full once it is enough (no bar: nothing is needed)
    const cellOf = (cls, txt, pct, tip, label = '') => `<div class="td amt bal"${label ? ` data-label="${label}"` : ''}><span class="${cls}">${txt}</span>${pct === null ? '' : `<span class="meter${cls === 'spare' ? '' : ' ' + cls}"${tip ? ` title="${esc(tip)}"` : ''}><i style="width:${pct}%"></i></span>`}</div>`;
    const cell = cellOf;
    const empty = { st: null, miss: 0, html: `<div class="td amt bal"><span class="sub">–</span></div>` };
    const balance = (made, used, word, k, machine) => {
      if (!made && !used) return empty;
      const bal = made - used, isShort = bal < 0 && !near(bal, 0), v = Math.abs(bal), pct = used > 0 ? Math.min(100, made / used * 100) : 100;
      // how many machines close a gap: on a short row the gap, on a row with nothing entered all that is used
      const add = n => k > 0 && machine ? `<small>add ${fmt(Math.ceil(n * k - 1e-9))} × ${esc(mName(machine))}</small>` : '';
      if (!made) return { st: 'none', miss: 0, html: cell('none', 'missing' + add(used), 0, 'nothing making it is entered') };
      const tip = !used ? 'nothing uses it' : `${fmt(made / used * 100)}% of what your factory uses`;
      if (isShort) return { st: 'short', miss: v, html: cell('short', word(v) + ' short' + add(v), pct, tip) };
      if (near(bal, 0)) return { st: 'balanced', miss: 0, html: cell('spare', 'fulfilled', pct, tip) };
      return { st: 'spare', miss: 0, html: cell('spare', `fulfilled<small>${word(v)} left over</small>`, pct, tip) };
    };
    const expBtn = (key, has, what) => has ? `<button class="exp" data-open-f="${key}" tabindex="-1" title="${facOpen.has(key) ? 'Hide' : 'Show'} ${esc(what)}">${facOpen.has(key) ? '▾' : '▸'}</button>` : '<span class="exp none"></span>';
    const iconOf = by => UNITS[by] ? UNITS[by].icon : by;
    // Remove, under the name of a row you entered: out of your factory. The row stays while you are on the page, with Put
    // back, which brings it back as it was; entering it again any other way drops Put back.
    const inFac = k => k === 'unit:refinery' ? refAll() > 0 : k === 'unit:nuclear' ? nucAll() > 0 : k.startsWith('unit:') ? unitN(k.slice(5)) > 0 : saved(chainMem[k]);
    for (const k of Object.keys(facRemoved)) if (inFac(k)) delete facRemoved[k];
    const rmBtn = (key, name, on) => on ? `<button class="rm" data-rm-f="${esc(key)}" tabindex="-1" title="Take ${esc(name)} out of your factory">Remove</button>`
      : facRemoved[key] ? `<button class="rm back" data-unrm-f="${esc(key)}" tabindex="-1" title="Put ${esc(name)} back in your factory${facRemoved[key].txt ? ': ' + esc(facRemoved[key].txt) : ''}">Put back</button>` : '';
    // a row opened with ▸: what makes it, then what uses it (biggest first), each with its machines and how much, the
    // amount under Makes or under Uses so it reads like the row above it
    // what the − before such a line takes out of your factory: that item's line (its machine and recipe), a unit's count, or
    // one processing's refineries or one layout's reactor blocks; null for nothing you entered
    const consKey = u => u.proc ? 'proc|' + u.proc : u.layout ? 'lay|' + u.layout
      : UNITS[u.by] ? ((u.by === 'refinery' ? refAll() : u.by === 'nuclear' ? nucAll() : unitN(u.by)) > 0 ? 'unit|' + u.by : null)
      : saved(chainMem[u.by]) ? ['line', u.by, u.machine || '', u.recipe || ''].join('|') : null;
    // a − takes its line out on a second click: the first turns it red and its "made by" / "used by" reads "remove?"
    const flowRows = (makers, users, fluid, amt) => {
      const a = amt || (v => amountText(v, fluid)), cap = w => capOf(w, fluid || !!amt);   // an amount given its own unit (MW) says it itself
      const line = (u, mk) => { const go = u.go || '#i/' + u.by, nm = u.label || nameOf(u.by), k = consKey(u), what = esc(nm) + (u.machine ? ` (${fmt(u.machines)} × ${esc(mName(u.machine))})` : '');
        const minus = k ? `<button class="exp minus" data-cons-rm="${esc(k)}" tabindex="-1" title="Take ${what} out of your factory" aria-label="Take ${what} out of your factory">−</button>` : '<span class="exp gap"></span>';
        return `<div class="tr cons ${mk ? 'makes' : 'uses'}"><div class="td item" style="--d:0">${minus}<span class="cwho"><span class="side" data-side="${mk ? 'made by' : 'used by'}">${mk ? 'made by' : 'used by'}</span>${ic(iconOf(u.by), 'sm')}<span class="nmtxt"><a class="lnk" href="${go}" data-go="${go}" title="Open ${esc(nm)}">${esc(nm)}</a>${u.fuel ? ' <span class="sub">fuel</span>' : ''}</span></span></div><div class="td mach" data-label="machines">${u.machine ? `${fmt(u.machines)} × ${esc(mName(u.machine))}` : esc(u.what || 'rocket launches')}</div><div class="td amt"${mk ? ` data-label="${cap('supply')}"` : ''}>${mk ? a(u.rate) : ''}</div><div class="td amt"${mk ? '' : ` data-label="${cap('demand')}"`}>${mk ? '' : a(u.rate)}</div><div class="td amt"></div></div>`; };
      return makers.map(u => line(u, true)).join('') + users.slice().sort((x, y) => y.rate - x.rate).map(u => line(u, false)).join('');
    };
    const showUnit = id => (id === 'refinery' ? refAll() : id === 'nuclear' ? nucAll() + nucShown.size : unitN(id)) > 0 || facKeep.has('unit:' + id) || STARTER_UNITS.includes(id);
    const unitRow = (id, sub, bal) => {
      const u = UNITS[id], cnt = unitN(id), mid = u.machine || id;
      return `<div class="tr${cnt ? ' product' : ''}" data-fac="unit:${id}"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(u.icon)}<span class="nmtxt"><a class="lnk" href="${u.go}" data-go="${u.go}" title="Open ${esc(u.name)}">${esc(u.name)}</a>${sub ? `<div class="sub">${sub}</div>` : ''}${rmBtn('unit:' + id, u.name, cnt > 0)}</span></div><div class="td mach" data-label="machines"><input class="num" inputmode="decimal" data-path="unit:${id}" data-k="1" data-kind="mach" value="${cnt ? fmtIn(cnt) : ''}" placeholder="0" aria-label="${esc(u.name)}"><span class="mbtn">${ic(mid)}<span class="mname">${esc(nameOf(mid))}</span></span></div><div class="td amt"></div><div class="td amt"></div>${bal ? bal.html : '<div class="td amt"></div>'}</div>`;
    };
    // a row that adds up other rows (steam, electricity, an oil product): no box of its own
    const sumRow = (key, icon, name, sub, from, made, used, unitTxt, bal, n, listHtml) => `<div class="tr${made ? ' product' : ''}" data-fac="${key}"><div class="td item" style="--d:0">${expBtn(key, n, 'what uses it')}${ic(icon)}<span class="nmtxt"><b>${esc(name)}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</span></div><div class="td mach" data-label="made by"><span class="sub">${from}</span></div><div class="td amt" data-label="supply">${made ? fmt(made) + ` <span class="unit">${unitTxt}</span>` : '<span class="sub">–</span>'}</div><div class="td amt" data-label="demand">${used ? fmt(used) + ` <span class="unit">${unitTxt}</span>` : '<span class="sub">–</span>'}</div>${bal.html}</div>` + (facOpen.has(key) ? listHtml : '');

    // power: boilers, steam engines, solar panels, then steam and electricity added up
    const B = FD.power.boiler, E = FD.power.steam_engine;
    // what your boilers burn: picked on their row, and counted on that fuel's row
    const fuel = boilerFuel(), fuelSel = `<select data-boiler-fuel tabindex="-1" aria-label="what your boilers burn">${BOILER_FUELS.map(f => `<option value="${f}" ${f === fuel ? 'selected' : ''}>${esc(nameOf(f).toLowerCase())}</option>`).join('')}</select>`;
    if (showUnit('boiler')) head.power.push(unitRow('boiler', `burning ${fuelSel}`));
    if (showUnit('steam-engine')) head.power.push(unitRow('steam-engine', ''));
    if (showUnit('solar-panel')) head.power.push(unitRow('solar-panel', ''));
    // nuclear reactors: a line per layout you have, each with its count of blocks and a picker for the layout
    if (showUnit('nuclear')) {
      const u = UNITS.nuclear, shown = nucLines(), many = shown.length > 1, cnt = nucAll();
      const lines = shown.map(l => `<div class="part"><input class="num" inputmode="decimal" data-path="unit:nuclear" data-nuc="${l}" data-k="1" data-kind="mach" value="${nucN(l) ? fmtIn(nucN(l)) : ''}" placeholder="0" aria-label="${l} reactor blocks"><button class="mbtn can" data-nuc-pick="${l}" tabindex="-1" title="Change layout">${ic('nuclear-reactor')}<span class="mname">${l} block</span><span class="arr">▾</span></button>${many ? `<button class="partx" data-nuc-x="${l}" tabindex="-1" title="Remove" aria-label="Remove these reactors">×</button>` : ''}</div>`).join('');
      const more = cnt > 0 && NUC_LAYOUTS.some(l => !shown.includes(l)) ? addLineBtn('data-nuc-add', 'layout') : '';
      head.power.push(`<div class="tr${cnt ? ' product' : ''}" data-fac="unit:nuclear"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(u.icon)}<span class="nmtxt"><a class="lnk" href="${u.go}" data-go="${u.go}" title="Open ${esc(u.name)}">${esc(u.name)}</a>${rmBtn('unit:nuclear', u.name, cnt > 0)}</span></div><div class="td mach${many ? ' parts' : ''}" data-label="machines">${lines}${more}</div><div class="td amt"></div><div class="td amt"></div><div class="td amt"></div></div>`);
    }
    const steamUsed = steam.uses.reduce((a, u) => a + u.rate, 0);
    if (steam.made || steamUsed) {
      const b = balance(steam.made, steamUsed, v => fmt(v) + ' per second', 1 / B.steam_per_s, 'boiler');
      tally('power', b.st, 'steam', 'Steam', 'steam', fmt(b.miss) + ' per second', b.miss / (steamUsed || 1));
      const boilers = unitN('boiler') ? [{ by: 'boiler', label: 'Boilers', go: '#c/steam', rate: steam.made, machines: unitN('boiler'), machine: 'boiler' }] : [];
      shared.steam = sumRow('steam', 'steam', 'Steam', '', unitN('boiler') ? `${fmt(unitN('boiler'))} × Boiler` : 'no boilers entered', steam.made, steamUsed, 'per second', b, steam.uses.length, flowRows(boilers, steam.uses, true));
      head.power.push(shared.steam);
    }
    if (power.made || power.used) {
      const viaSolar = !unitN('steam-engine') && unitN('solar-panel') > 0, mE = viaSolar ? 'solar-panel' : 'steam-engine';
      const b = balance(power.made, power.used, v => fmt(v) + ' MW', viaSolar ? 1000 / FD.power.solar.avg_kw : 1000 / E.kw, mE);
      tally('power', b.st, 'power', 'Electricity', 'small-electric-pole', fmt(b.miss) + ' MW', b.miss / (power.used || 1));
      const from = [unitN('steam-engine') ? `${fmt(unitN('steam-engine'))} × Steam engine` : '', unitN('solar-panel') ? `${fmt(unitN('solar-panel'))} × Solar panel` : '', nucAll() ? `${fmt(nucReactors())} × Nuclear reactor` : ''].filter(Boolean).join(' + ') || 'nothing entered';
      const mwMakers = [['steam-engine', 'Steam engines', E.kw], ['solar-panel', 'Solar panels', FD.power.solar.avg_kw]].filter(([id]) => unitN(id) > 0).map(([id, label, kw]) => ({ by: id, label, go: UNITS[id].go, rate: unitN(id) * kw / 1000, machines: unitN(id), machine: id }))
        .concat(NUC_LAYOUTS.filter(l => nucN(l) > 0).map((l, i, ls) => Object.assign({ by: 'nuclear', label: `Nuclear reactors (${l})`, go: '#c/nuclear', rate: nucN(l) * nucOf(l).mw, machines: nucN(l) * nucOf(l).reactors, machine: 'nuclear-reactor' }, ls.length > 1 ? { layout: l } : {})));
      const list = flowRows(mwMakers, power.parts.map(u => Object.assign({}, u, { rate: u.mw })), false, v => `${fmt(v)} <span class="unit">MW</span>`);
      head.power.push(sumRow('power', 'small-electric-pole', 'Electricity', '', from, power.made, power.used, 'MW', b, power.parts.length, list));
    }

    // science: labs (with the research they run), then the packs, from the item rows below
    const sciSel = `research time <select data-sci="time" tabindex="-1">${[5, 10, 15, 20, 30, 45, 60].map(t => `<option value="${t}" ${t === sci.time ? 'selected' : ''}>${t} s</option>`).join('')}</select> · lab speed <select data-sci="bonus" tabindex="-1">${[0, 20, 50, 90, 140, 190, 250].map((v, i) => `<option value="${v}" ${v === sci.bonus ? 'selected' : ''}>${i ? 'level ' + i + ' (+' + v + '%)' : 'none'}</option>`).join('')}</select>`;
    if (showUnit('lab') || ids.some(i => SCI.has(i))) head.science.push(unitRow('lab', sciSel));

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
    // an oil with nowhere to go fills its tank and stops the refineries: that is why a row can make more than is used at
    // full speed and still come up short
    const oilWords = ks => andJoin(ks.map(k => nameOf(OIL_ITEM[k]).toLowerCase())) + (ks.length > 1 ? ' back up' : ' backs up');
    const oilStop = ks => oilWords(ks) + ', so the refineries stop';
    const why = k => basic && k !== 'p' ? 'basic processing makes none'
      : more.length ? (backed.some(x => x !== k) ? oilStop(backed.filter(x => x !== k)) + ': ' : '') + 'add ' + andJoin(more)   // a short oil is not said to back up
      : stuck.length ? `${oilStop(stuck)}: nothing uses ${stuck.length > 1 ? 'them' : 'it'}` : '';
    // the oils that keep your refineries and cracking from running as fast as your factory needs: those short of cracking,
    // and those nothing uses
    const holdUp = [...new Set([...(!basic && N.a < need.Hc - 1e-6 ? ['h'] : []), ...(!basic && N.b < need.Lc - 1e-6 ? ['l'] : []), ...stuck])];
    const busyTxt = (run, hv, needN) => `${fmt(run / hv * 100)}% busy${run < Math.min(hv, needN) - 1e-6 && holdUp.length ? ': ' + oilWords(holdUp) : ''}`;
    // what your factory needs of a refinery or cracking row, in grey: idle (and why), too few (none entered reads the same:
    // these rows carry no verdict of their own, the oil they make does), or enough and how busy they are
    const unitNeed = (id, needN, run) => {
      const hv = unitN(id), add = n => `add ${fmt(Math.ceil(n - 1e-9))} × ${esc(mName(UNITS[id].machine))}`, cell = (cls, txt, pct) => cellOf(cls, txt, pct, '', '');
      if (!(hv > 0) && !(needN > 1e-9)) return empty;
      if (!(needN > 1e-9)) return { st: null, html: cell('none', `idle<small>${basic ? 'nothing to crack on basic' : 'no cracking needed'}</small>`, null) };
      if (hv < needN - 1e-6) return { st: null, html: cell('none', `needs ${fmt(needN)}<small>${add(needN - hv)}</small>`, hv / needN * 100) };
      return { st: null, html: cell('none', `needs ${fmt(needN)} of your ${fmt(hv)}<small>${busyTxt(run, hv, needN)}</small>`, 100) };
    };
    // what your factory needs of refineries, in grey: on the processing you have most of (mode), on top of the others
    const refNeed = () => {
      const hv = N.rm[mode] || 0, needN = need.R, on = manyProc ? ` on ${OIL_PROC_NAME[mode]}` : '';
      const cell = (cls, txt, pct) => cellOf(cls, txt, pct, '', ''), add = x => `add ${fmt(Math.ceil(x - 1e-9))} × Oil refinery${on}`;
      if (!(N.r > 0) && !(needN > 1e-9)) return empty;
      if (!(needN > 1e-9)) return { st: null, html: cell('none', `idle<small>${anyOil ? 'your other refineries make enough' : 'nothing uses their oil'}</small>`, null) };
      if (hv < needN - 1e-6) return { st: null, html: cell('none', `needs ${fmt(needN)}${on}<small>${add(needN - hv)}</small>`, hv / needN * 100) };
      return { st: null, html: cell('none', `needs ${fmt(needN)} of your ${fmt(hv)}${on}<small>${busyTxt(sol.rm[mode] || 0, hv, needN)}</small>`, 100) };
    };
    // the refinery row: a line per processing you run, each with its count and a picker for the processing (with none
    // entered, a line for the one your factory would add first); "+ another processing" adds a line
    const refineryRow = bal => {
      const u = UNITS.refinery, shown = Object.keys(OIL_PROC).filter(m => N.rm[m] > 0 || refShown.has(m));
      if (!shown.length) shown.push(mode);
      const many = shown.length > 1;
      const lines = shown.map(m => `<div class="part"><input class="num" inputmode="decimal" data-path="unit:refinery" data-proc="${m}" data-k="1" data-kind="mach" value="${N.rm[m] ? fmtIn(N.rm[m]) : ''}" placeholder="0" aria-label="oil refineries on ${OIL_PROC_NAME[m]}"><button class="mbtn can" data-ref-pick="${m}" tabindex="-1" title="Change processing">${ic(OIL_PROC[m])}<span class="mname">${PROC_SHORT[m]}</span><span class="arr">▾</span></button>${many ? `<button class="partx" data-ref-x="${m}" tabindex="-1" title="Remove this processing" aria-label="Remove this processing">×</button>` : ''}</div>`).join('');
      const more = N.r > 0 && shown.length < 3 ? addLineBtn('data-ref-add', 'processing') : '';
      return `<div class="tr${N.r ? ' product' : ''}" data-fac="unit:refinery"><div class="td item" style="--d:0"><span class="exp none"></span>${ic(u.icon)}<span class="nmtxt"><a class="lnk" href="${u.go}" data-go="${u.go}" title="Open ${esc(u.name)}">${esc(u.name)}</a>${rmBtn('unit:refinery', u.name, N.r > 0)}</span></div><div class="td mach${many ? ' parts' : ''}" data-label="machines">${lines}${more}</div><div class="td amt"></div><div class="td amt"></div>${bal.html}</div>`;
    };
    if (anyOil || showUnit('refinery')) head.oil.push(refineryRow(refNeed()));
    for (const [id, needN, run] of [['heavy-oil-cracking', need.Hc, sol.a], ['light-oil-cracking', need.Lc, sol.b]]) {
      if (!((!basic && needN > 1e-9) || showUnit(id))) continue;
      head.oil.push(unitRow(id, '', unitNeed(id, basic ? 0 : needN, run)));
    }
    for (const k of ['h', 'l', 'p']) {
      if (!((N.r > 0 && (!basic || k === 'p')) || D[k] > 0)) continue;
      const item = OIL_ITEM[k], own = refSum(oilIn, item);   // coal liquefaction takes some of its own heavy oil
      const made = refSum(oilOut, item) + crackOut[k], used = D[k] + crackIn[k] + own;
      const miss = basic && k !== 'p' ? D[k] : shortOf(k), pct = D[k] > 0 ? Math.max(0, 100 - miss / D[k] * 100) : 100;   // the share of your factory's use delivered
      let b;
      if (miss > 0 && (N.r > 0 || (basic && k !== 'p'))) b = { st: 'short', miss, html: cell('short', `${fmt(miss)} per second short${why(k) ? `<small>${why(k)}</small>` : ''}`, pct) };
      else if (D[k] > 0 && !N.r) b = { st: 'none', miss: 0, html: cell('none', `missing<small>add ${fmt(Math.ceil(need.R - 1e-9))} × Oil refinery</small>`, 0) };
      else if (anyShort && !(D[k] > 0) && (stuck.includes(k) || backed.includes(k))) b = { st: null, html: cell('none', 'backs up<small>nothing uses it</small>', 100) };
      else { const lo = made - used, tip = used ? '' : 'nothing uses it'; b = lo > 1e-6 * Math.max(1, made) ? { st: 'spare', html: cell('spare', `fulfilled<small>${fmt(lo)} per second left over</small>`, pct, tip) } : { st: 'balanced', html: cell('spare', 'fulfilled', pct, tip) }; }
      tally('oil', b.st, item, nameOf(item), item, fmt(miss) + ' per second', D[k] ? miss / D[k] : 1);
      const crackers = !basic && k === 'l' && N.a ? ` + ${fmt(N.a)} × Chemical plant` : !basic && k === 'p' && N.b ? ` + ${fmt(N.b)} × Chemical plant` : '';
      // what makes it: your refineries on each processing that makes it, and the cracking that turns the oil before into it
      const makers = Object.keys(OIL_PROC).filter(m => N.rm[m] > 0 && oilOut(OIL_PROC[m], item, 'oil-refinery') > 0).map(m => Object.assign({ by: 'refinery', label: manyProc ? `Oil refineries (${OIL_PROC_NAME[m]})` : 'Oil refineries', go: '#c/oil', rate: N.rm[m] * oilOut(OIL_PROC[m], item, 'oil-refinery'), machines: N.rm[m], machine: 'oil-refinery' }, manyProc ? { proc: m } : {}));
      if (crackOut[k] > 1e-9) makers.push({ by: k === 'l' ? 'heavy-oil-cracking' : 'light-oil-cracking', label: k === 'l' ? 'Heavy oil cracking' : 'Light oil cracking', go: '#c/oil', rate: crackOut[k], machines: k === 'l' ? N.a : N.b, machine: cp });
      const list = by[k].slice();
      if (own > 1e-9) list.push(Object.assign({ by: 'refinery', label: 'Coal liquefaction', go: '#c/oil', rate: own, machines: N.rm.coal || 0, machine: 'oil-refinery' }, manyProc ? { proc: 'coal' } : {}));
      if (crackIn[k] > 1e-9) list.push({ by: k === 'h' ? 'heavy-oil-cracking' : 'light-oil-cracking', label: k === 'h' ? 'Heavy oil cracking' : 'Light oil cracking', go: '#c/oil', rate: crackIn[k], machines: k === 'h' ? N.a : N.b, machine: cp });
      head.oil.push(sumRow(item, item, nameOf(item), '', N.r ? `${fmt(N.r)} × Oil refinery${crackers}` : 'no refineries entered', made, used, 'per second', b, list.length || makers.length > 1, flowRows(makers, list, true)));
    }

    // every item row, in the tab of the machine that makes it; crude oil goes first on the Oil tab, above the refineries
    // that take it, with your pumpjacks' yield (the % the game shows on an oil field), which sets how much each one pumps
    const oilFirst = [];
    const yieldLine = () => `<div class="sub"><input class="yld" data-yield inputmode="decimal" value="${fmtIn(S.jackYield * 100)}" tabindex="-1" aria-label="pumpjack yield in percent">% yield</div>`;
    for (const i of ids) {
      const tab = tabOf(i), fluid = isFluid(i), made = have[i] || 0, list = uses[i] || [], used = list.reduce((a, u) => a + u.rate, 0);
      if (!fluid) laneTab.add(tab);
      const im = itemMachine(i);
      // a cell's amount: water and crude oil in pumps, other fluids per second (the number big, its unit small), items bare
      const qty = v => { if (!fluid) return amountText(v, fluid); const n = fmt(PUMP_OF[i] ? v / pumpRate(i) : v); return `${n} <span class="unit">${PUMP_OF[i] ? PUMP_OF[i] + (n === '1' ? '' : 's') : 'per second'}</span>`; };
      const word = v => PUMP_OF[i] ? pumpsText(i, v) : amtWord(v, fluid);
      let mach, makes = `<div class="td amt" data-label="${capOf('supply', fluid)}">${made ? qty(made) : '<span class="sub">–</span>'}</div>`;
      if (im) mach = facBox(i, im.k, made ? im.k * made : null, im);
      else {   // nothing makes it by the machine: type the amount
        mach = `<div class="td mach" data-label="machines"><span class="sub">${originText(i) || 'not made by a machine'}</span></div>`;
        makes = `<div class="td amt" data-label="${capOf('supply', fluid)}"><input class="num" inputmode="decimal" data-path="${i}" data-k="1" data-kind="rate" data-fluid="${fluid ? 1 : 0}" value="${made ? fmtIn(toUnit(made, fluid)) : ''}" placeholder="0" aria-label="amount of ${esc(nameOf(i))} made">${fluid ? '<span class="unit">per second</span>' : ''}</div>`;
      }
      const b = balance(made, used, word, im ? im.k : 0, im ? im.machine : null);
      tally(tab, b.st, i, nameOf(i), i, word(b.miss), used ? b.miss / used : 1);
      const page = isResource(i) || (FD.items[i] && Engine.byProduct[i] && !Engine.LEAVES.has(i)) ? '#i/' + i : CARD_FEED[i] ? '#c/' + CARD_FEED[i].card : null;
      const link = page ? `<a class="lnk" href="${page}" data-go="${page}" title="Open ${esc(nameOf(i))}">${esc(nameOf(i))}</a>` : `<b>${esc(nameOf(i))}</b>`;
      // what makes it: your machines (each part of a split row), the drills or pumps on a resource, or the amount you typed
      const recs = new Set((partsOf(i) || []).map(q => q.recipe));   // lines on different recipes are named by their recipe
      const makers = runsOf[i] ? runsOf[i].map(([t, r]) => ({ by: i, label: recs.size > 1 ? FD.recipes[t.recipe].name : nameOf(i), go: page || '#i/' + i, rate: r, machines: t.kMach * r, machine: t.machine, recipe: t.recipe }))
        : made ? (partsOf(i) || [{ machine: null, scale: made }]).filter(q => q.scale > 0).map(q => { const s = supply(i, 1, q.machine); return { by: i, label: nameOf(i), go: page || '#i/' + i, rate: q.scale, machines: s ? s.k * q.scale : 0, machine: s ? s.id : null, what: s ? '' : originText(i) || 'what you entered' }; }) : [];
      const rowHtml = (`<div class="tr${made ? ' product' : ''}" data-fac="${i}"><div class="td item" style="--d:0">${expBtn(i, list.length || makers.length > 1, 'what makes and uses ' + nameOf(i))}${ic(i)}<span class="nmtxt">${link}${nick(i)}${i === 'crude-oil' ? yieldLine() : ''}${rmBtn(i, nameOf(i), made > 0)}</span></div>${mach}${makes}<div class="td amt" data-label="${capOf('demand', fluid)}">${used ? qty(used) : '<span class="sub">–</span>'}</div>${b.html}</div>` + (facOpen.has(i) ? flowRows(makers, list, fluid, fluid ? qty : undefined) : ''));
      (i === 'crude-oil' ? oilFirst : body[tab]).push(rowHtml);
      if (i === 'coal' || i === 'water') shared[i] = rowHtml;
    }

    // on the Oil tab, the other things its machines take sit with crude oil: coal and steam for coal liquefaction, water
    // for refineries, cracking and the chemical plants (the same rows as on Mining & smelting and Power, counted there)
    const byOil = x => (UNITS[x] ? UNITS[x].tab : tabOf(x)) === 'oil';
    const oilInputs = facTab !== 'oil' ? [] : ['coal', 'steam', 'water'].filter(x => shared[x] && (x === 'steam' ? steam.uses : uses[x] || []).some(u => byOil(u.by)));
    if (oilInputs.includes('coal')) laneTab.add('oil');
    head.oil.unshift(...oilFirst, ...oilInputs.map(x => shared[x]));
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
    // the short list: each name goes to its row, × dismisses it (a shortage you are fine with). Bring back acts on
    // this tab (Everything: every tab). Dismissing changes only this list, the short count and the tabs' red counts, never a row.
    const dids = list => esc(list.map(s => s.did).join(' '));
    const chip = s => `<span class="chip2 short dz"><button class="go" data-focus-f="${esc(s.did)}" tabindex="-1" title="Go to ${esc(s.label)}">${ic(s.icon, 'sm')}${esc(s.label)}${s.txt ? `<span class="sub">${s.txt}</span>` : ''}</button><button class="x" data-dismiss-f="${esc(s.did)}" tabindex="-1" title="Dismiss" aria-label="Dismiss ${esc(s.label)}">×</button></span>`;
    const bringBack = wavedHere.length ? `<button class="iconbtn sm" data-undismiss-f="${dids(wavedHere)}" tabindex="-1">Bring back ${wavedHere.length} dismissed</button>` : '';
    // each count is also a filter (a count of 0 is not, unless it is on); short is always shown
    const filt = (f, n, cls, label) => `<button class="s${cls}${facFilter === f ? ' on' : ''}" data-fac-filter="${f}" tabindex="-1" aria-pressed="${facFilter === f}" title="${facFilter === f ? 'Show every row' : 'Show only these'}"><b>${n}</b> ${label}</button>`;
    const counted = (cnt.short || facFilter === 'short' ? filt('short', cnt.short, cnt.short ? ' short' : '', 'short') : `<span class="s"><b>0</b> short</span>`)
      + (cnt.none || facFilter === 'none' ? filt('none', cnt.none, ' none', 'missing') : '')
      + (cnt.ok || facFilter === 'ok' ? filt('ok', cnt.ok, '', 'fulfilled') : '');
    const sum = entered || facFilter ? `<div class="summary fac-sum">${counted}${shortHere.length ? `<span class="chiprow"><span class="lead">Short:</span>${shortHere.map(chip).join('')}</span>` : ''}${bringBack}</div>` : '';
    const badge = t => { const n = t === 'all' ? FAC_ORDER.reduce((a, x) => a + counts[x].short, 0) : counts[t].short; return n ? `<span class="n" title="${n} short">${n}</span>` : ''; };
    const tabBar = `<div class="factabs" role="tablist">${FAC_TABS.map(([t, label, icon]) => `<button tabindex="-1" role="tab" data-fac-tab="${t}" class="${t === facTab ? 'on' : ''}">${icon ? ic(icon, 'xs') : ''}<span>${esc(label)}</span>${badge(t)}</button>`).join('')}</div>`;   // a tab's icon is its kind of machine, no tier
    const thU = tabs.some(t => laneTab.has(t)) ? `<span class="u">${esc(unitShort())}</span>` : '';   // Power counts no items, only steam and MW
    const th = `<div class="th"></div><div class="th">Machines</div><div class="th amth">Supply${thU}</div><div class="th amth">Demand${thU}</div><div class="th amth"></div>`;
    // dismissing only changes the top: redraw the tabs and the summary, and leave everything below them as it is
    if (topOnly) {
      const s = $('#main .fac-sum'), tb = $('#main .factabs');
      if (s && tb && sum) { const cr = s.querySelector('.chiprow'), x = cr ? cr.scrollLeft : 0; s.outerHTML = sum; tb.outerHTML = tabBar; const cr2 = $('#main .fac-sum .chiprow'); if (cr2) cr2.scrollLeft = x; return; }
    }
    const filtEmpty = facFilter === 'short' ? 'Nothing is short' + (wavedHere.length ? ' apart from what you dismissed.' : '.')
      : facFilter === 'ok' ? 'Nothing is fulfilled yet.' : 'Nothing is missing.';
    $('#main').innerHTML = `
      ${tabBar}${sum}
      <div class="tbl fac" id="tree">${th}${groups.map(g => g.join('')).join(line)}${groups.length ? line : ''}${facFilter ? (groups.length ? '' : `<div class="tr full"><div class="td"><span class="sub">${filtEmpty}</span></div></div>`) : addRowHtml()}</div>
      ${facFilter ? '' : bpHtml()}
      ${facTabKept(facTab) ? `<div class="summary" id="forget"><button class="iconbtn sm" data-forget="ask" tabindex="-1">${facTab === 'all' ? 'Clear all' : 'Clear this tab'}</button></div>` : ''}`;
    doc.title = 'Your factory – Factorio Ratios';
  }

  // the dashed "add" row at the bottom of a tab: name, then how many and on what (machine and recipe, or the refineries'
  // processing), then Enter or Add. It replaces the line on the same machine and recipe (the button reads Update), else
  // the row gets a line of its own
  let addSel = null;   // { kind: 'item' | 'unit', id, machine, recipe, proc }
  let addsMade = 0;    // how many times the add row has added or updated a line (the tutorial waits for one)
  const addName = s => s.kind === 'unit' ? UNITS[s.id].name : nameOf(s.id);
  const addIcon = s => s.kind === 'unit' ? UNITS[s.id].icon : s.id;
  // the line the add row would make: its machine, machines per 1 unit/s and the choices (null: typed as an amount)
  const addLine = s => s.kind === 'item' && itemMachine(s.id) ? partMachine(s.id, { recipe: s.recipe, machine: s.machine }) : null;
  function addMachineHtml(s) {
    if (s.kind === 'unit') {
      if (s.id === 'refinery') return `<button class="mbtn can" data-add-mpick tabindex="-1" title="Change processing">${ic(OIL_PROC[s.proc])}<span class="mname">${PROC_SHORT[s.proc]}</span><span class="arr">▾</span></button>`;
      if (s.id === 'nuclear') return `<button class="mbtn can" data-add-mpick tabindex="-1" title="Change layout">${ic('nuclear-reactor')}<span class="mname">${s.layout} block</span><span class="arr">▾</span></button>`;
      const m = UNITS[s.id].machine || s.id; return `<span class="mbtn">${ic(m)}<span class="mname">${esc(mName(m))}</span></span>`;
    }
    const pm = addLine(s); if (!pm) return '<span class="sub">amount per second</span>';
    return pm.options.length > 1 || pm.recipes.length > 1 ? `<button class="mbtn can" data-add-mpick tabindex="-1" title="Change machine${pm.recipes.length > 1 ? ' or recipe' : ''}">${lineLabel(pm)}<span class="arr">▾</span></button>`
      : `<span class="mbtn">${lineLabel(pm)}</span>`;
  }
  // what your factory has of that line now: machines (a unit's count), or the amount per second of a row typed as one
  function addCount(s) {
    if (s.kind === 'unit') return s.id === 'refinery' ? refN(s.proc) : s.id === 'nuclear' ? nucN(s.layout) : unitN(s.id);
    const pm = addLine(s), st = chainMem[s.id];
    if (!pm) return saved(st) ? st.scale : 0;
    const l = linesOf(s.id).find(x => sameLine(x, pm.recipe, pm.machine));
    return l && l.scale > 0 ? l.scale * pm.k : 0;
  }
  // Update when that line is in your factory already (its count is replaced), else Add
  const addVerb = s => s && addCount(s) > 0 ? 'Update' : 'Add';
  // after a pick or a new machine: the row's icon, the picker, Add or Update, and on Update the count it would replace
  // in the box (unless you typed one), so Enter keeps it and typing replaces it
  function addRefresh() {
    const i = $('#addi'), m = $('#addm'), g = $('#addgo'), n = $('#addn');
    if (i) i.innerHTML = addSel ? ic(addIcon(addSel)) : '';
    if (m) m.innerHTML = addSel ? addMachineHtml(addSel) : '';
    if (g) g.textContent = addVerb(addSel);
    if (n && !n.dataset.typed) { const c = addSel ? addCount(addSel) : 0; n.value = c > 0 ? fmtIn(c) : ''; }
  }
  const addRowHtml = () => `<div class="tr add"><div class="td item" style="--d:0"><span class="exp none"></span><span id="addi">${addSel ? ic(addIcon(addSel)) : ''}</span><input class="txt" id="addq" placeholder="Search" autocomplete="off" spellcheck="false" aria-label="what to add" value="${addSel ? esc(addName(addSel)) : ''}"></div><div class="td mach" data-label="how many"><input class="num" id="addn" inputmode="decimal" placeholder="1" aria-label="how many"><span id="addm">${addSel ? addMachineHtml(addSel) : ''}</span></div><div class="td amt"></div><div class="td amt"></div><div class="td amt"><button class="iconbtn sm" id="addgo" data-add tabindex="-1">${addVerb(addSel)}</button></div></div><div class="tr add-hits"><div class="td" id="addhits"></div></div>`;
  // the add row's picker: an item's machine and recipe, or the refineries' processing
  function openAddPick(btn) {
    closePop(); if (!addSel) return;
    const pm = addLine(addSel);
    const html = addSel.id === 'refinery' ? `<span class="lead">These refineries run:</span>` + Object.keys(OIL_PROC).map(m => `<button data-add-proc="${m}" class="${m === addSel.proc ? 'on' : ''}" tabindex="-1">${ic(OIL_PROC[m], 'sm')}<span>${esc(FD.recipes[OIL_PROC[m]].name)}</span></button>`).join('')
      : addSel.id === 'nuclear' ? `<span class="lead">Reactor layout:</span>` + NUC_LAYOUTS.map(l => `<button data-add-lay="${l}" class="${l === addSel.layout ? 'on' : ''}" tabindex="-1">${ic('nuclear-reactor', 'sm')}<span>${l}</span></button>`).join('')
      : pm ? machinePickHtml(addSel.id, pm, 'data-add-m', 'data-add-r') : '';
    if (!html) return;
    popEl = doc.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = html; popEl.dataset.addPick = '1';
    doc.body.appendChild(popEl); placePop(btn);
  }
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
    addSel = null; addRefresh();
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
    // it starts on the row's own machine and recipe (or Your base's), refineries on the processing you have most of
    const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1), im = kind === 'item' ? itemMachine(id) : null;
    addSel = { kind, id, machine: im ? im.machine : null, recipe: im ? im.recipe || null : null, proc: id === 'refinery' ? refMain() : null, layout: id === 'nuclear' ? nucMain() : null };
    const q2 = $('#addq'), n = $('#addn'), h = $('#addhits');
    if (q2) q2.value = addName(addSel);
    if (n) delete n.dataset.typed;
    addRefresh();
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
      facUnits[addSel.id === 'refinery' ? REF_KEY[addSel.proc] : addSel.id === 'nuclear' ? NUC_KEY(addSel.layout) : addSel.id] = v;   // refineries on the processing picked, reactor blocks on the layout
      // with one processing on the refinery row, it is also the one the Oil page plans with (as refMove keeps it)
      if (addSel.id === 'refinery' && refLines().length <= 1) { const o = cardState('oil'); o.basic = addSel.proc === 'basic'; o.coal = addSel.proc === 'coal'; saveCard('oil', o); }
      persist(); clearViews();
    } else {
      const id = addSel.id, pm = addLine(addSel), p = parseBox(text, 'mach', isFluid(id));
      if (!p) { if (nEl) nEl.classList.add('bad'); return; }
      const rate = p.kind === 'rate' ? p.perS : pm ? p.v / pm.k : p.v;   // "8" machines, or "2 lanes" / "15/s"; no machine: units per second
      if (!(rate > 0)) return;
      if (pm) facPutLine(id, pm.recipe, pm.machine, rate);   // the line on that machine and recipe, or a new one
      else { const st = chainState(id); st.scale = rate; st.anchor = { path: id, kind: 'mach' }; st.touched = true; chainMem[id] = st; }
      persist(); clearViews();
    }
    addSel = null; addsMade++; renderFactory(true);
    const q2 = $('#addq'); if (q2 && fine()) q2.focus();   // on a phone that would bring the keyboard and the list back over the ledger
  }
  let restoringFocus = false;
  // a box on the ledger: an item's number (empty or 0 takes it out) or a unit's count; then the whole page is recounted
  function onFactoryInput(inp) {
    const id = inp.dataset.path, text = inp.value, t = text.trim();
    if (id.startsWith('unit:')) {
      const v = t === '' ? 0 : parseFloat(t);
      if (!(v >= 0) || !isFinite(v)) { inp.classList.add('bad'); return; }
      facUnits[inp.dataset.proc ? REF_KEY[inp.dataset.proc] : inp.dataset.nuc ? NUC_KEY(inp.dataset.nuc) : id.slice(5)] = v; if (!(v > 0)) facKeep.add(id);   // a refinery or reactor line: its processing's or layout's count
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
    const again = $(`#main input.num[data-path="${id}"]${inp.dataset.part !== undefined ? `[data-part="${inp.dataset.part}"]` : inp.dataset.proc ? `[data-proc="${inp.dataset.proc}"]` : inp.dataset.nuc ? `[data-nuc="${inp.dataset.nuc}"]` : ''}`);
    if (again) { again.value = text; restoringFocus = true; again.focus(); restoringFocus = false; if (orig !== undefined) again.dataset.orig = orig; try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { } }
  }
  // the machine (and recipe) picker on a ledger row
  // a picker's choices: the machines for the line's recipe, then the recipes; mAttr and rAttr name what a click sets
  const machinePickHtml = (id, im, mAttr, rAttr) =>
    (im.options.length > 1 ? `<span class="lead">${esc(nameOf(id))} is ${crafted(id) ? 'made in' : 'mined by'}:</span>` + im.options.map(m => `<button ${mAttr}="${m}" class="${m === im.machine ? 'on' : ''}" tabindex="-1">${icb(m)}<span>${esc(mName(m))}</span></button>`).join('') : '') +
    ((im.recipes || []).length > 1 ? `<span class="lead">using recipe:</span>` + im.recipes.map(rid => `<button ${rAttr}="${rid}" class="${rid === im.recipe ? 'on' : ''}" tabindex="-1">${ic(rid, 'sm')}<span>${esc(FD.recipes[rid].name)}</span></button>`).join('') : '');
  function openFacPick(btn, id) {
    closePop();
    const parts = partsOf(id), j = btn.dataset.part === undefined ? null : Number(btn.dataset.part);
    const im = parts && j !== null ? partMachine(id, parts[j]) : itemMachine(id); if (!im) return;
    popEl = doc.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = machinePickHtml(id, im, 'data-fac-m', 'data-fac-r');
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
  // the nuclear row's lines, the same way: a picker for a line's layout (its blocks move there), another layout, or one off
  function openNucPick(btn, from) {
    closePop();
    popEl = doc.createElement('div'); popEl.className = 'pop';
    popEl.innerHTML = `<span class="lead">Reactor layout:</span>` + NUC_LAYOUTS.map(l => `<button data-nuc-to="${l}" class="${l === from ? 'on' : ''}" tabindex="-1">${ic('nuclear-reactor', 'sm')}<span>${l}</span></button>`).join('');
    popEl.dataset.nucFrom = from; doc.body.appendChild(popEl); placePop(btn);
  }
  function nucMove(from, to) {
    if (from !== to) { facUnits[NUC_KEY(to)] = nucN(to) + nucN(from); facUnits[NUC_KEY(from)] = 0; nucShown.delete(from); nucShown.add(to); }
    closePop(); persist(); clearViews(); renderFactory(true);
  }
  function nucAddLine() {
    const shown = nucLines(), next = NUC_LAYOUTS.find(l => !shown.includes(l)); if (!next) return;
    for (const l of shown) nucShown.add(l);
    nucShown.add(next); renderFactory(true);
    const box = $(`#main input.num[data-path="unit:nuclear"][data-nuc="${next}"]`); if (box && fine()) box.focus();
  }
  function nucDropLine(l) { facUnits[NUC_KEY(l)] = 0; nucShown.delete(l); facKeep.add('unit:nuclear'); persist(); clearViews(); renderFactory(true); }
  // after parts change: the first part is the row's machine and recipe, the row's number is their sum, and a row left with
  // one part is a plain row again
  function facPartsSettled(id, st) {
    const q = st.parts[0], pm = q && partMachine(id, q);
    if (q) {   // pinned only where there is a choice, as pin() does
      if (pm && pm.options.length > 1) machineOf[id] = q.machine; else delete machineOf[id];
      if (q.recipe && (Engine.byProduct[id] || []).length > 1) recipeOf[id] = q.recipe; else delete recipeOf[id];
    }
    if (st.parts.length < 2) { st.scale = q ? q.scale : null; delete st.parts; } else st.scale = partsTotal(st);
    st.touched = st.scale > 0; if (!st.touched) facKeep.add(id);
  }
  // another recipe on a row: a line at 0 for the next recipe it does not use yet
  // a new line on a row, at 0, on that machine and recipe (the row's "+"), its box ready to type in
  function facAddLine(id, recipe, machine) {
    const st = chainState(id), im = itemMachine(id); if (!im) return;
    if (!st.parts || st.parts.length < 2) st.parts = [{ recipe: im.recipe || null, machine: im.machine, scale: saved(st) ? st.scale : 0 }];
    st.parts.push({ recipe: recipe || null, machine, scale: 0 });
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
  // − before a line of an opened row (consKey): an item's line goes as its × would, or the item as Remove would when that
  // is its only line; a unit as Remove would; one processing's refineries or one layout's blocks as their × would
  function consRemove(key) {
    const [kind, a, m, r] = key.split('|');
    if (kind === 'proc') refDropLine(a);
    else if (kind === 'lay') nucDropLine(a);
    else if (kind === 'unit') facRemove('unit:' + a);
    else {
      const parts = partsOf(a) || [], j = parts.filter(p => p.scale > 0).length > 1 ? parts.findIndex(p => p.scale > 0 && p.machine === m && (!r || (p.recipe || '') === r)) : -1;
      if (j >= 0) facDropPart(a, j); else facRemove(a);
    }
  }
  function facRemove(key) {
    const was = { dismissed: facDismiss.has(key) };
    if (key === 'unit:refinery') {   // every processing's refineries go, and come back together
      was.mix = refMix(); was.txt = Object.keys(OIL_PROC).filter(m => was.mix[m] > 0).map(m => `${fmt(was.mix[m])} × Oil refinery (${OIL_PROC_NAME[m]})`).join(' and ');
      for (const m of Object.keys(OIL_PROC)) facUnits[REF_KEY[m]] = 0;
    }
    else if (key === 'unit:nuclear') {   // every layout's blocks go, and come back together
      was.nuc = Object.fromEntries(NUC_LAYOUTS.map(l => [l, nucN(l)])); was.txt = NUC_LAYOUTS.filter(l => was.nuc[l] > 0).map(l => `${fmt(was.nuc[l])} × ${l} block`).join(' and ');
      for (const l of NUC_LAYOUTS) facUnits[NUC_KEY(l)] = 0;
    }
    else if (key.startsWith('unit:')) { const id = key.slice(5); was.n = facUnits[id]; was.txt = `${fmt(was.n)} × ${nameOf(UNITS[id].machine || id)}`; facUnits[id] = 0; }
    else {
      const st = chainState(key), im = itemMachine(key), fl = isFluid(key);
      const parts = partsOf(key), each = parts && parts.filter(p => p.scale > 0).map(p => { const pm = partMachine(key, p); return `${fmt(p.scale * pm.k)} × ${mName(pm.machine)}`; });
      Object.assign(was, { scale: st.scale, anchor: st.anchor, machine: machineOf[key], recipe: recipeOf[key], parts: parts ? parts.map(p => Object.assign({}, p)) : null,
        txt: each ? each.join(' and ') : im ? `${fmt(st.scale * im.k)} × ${mName(im.machine)}` : `${fmt(toUnit(st.scale, fl))} ${fl ? 'per second' : unitWord(toUnit(st.scale, fl))}` });
      st.scale = null; st.anchor = null; st.touched = false; delete st.parts; delete machineOf[key]; delete recipeOf[key];
    }
    facRemoved[key] = was; facDismiss.delete(key); facKeep.add(key);
    closePop(); persist(); clearViews(); renderFactory(true);
  }
  function facPutBack(key) {
    const was = facRemoved[key]; if (!was) return;
    if (was.mix) for (const m of Object.keys(OIL_PROC)) facUnits[REF_KEY[m]] = was.mix[m];
    else if (was.nuc) for (const l of NUC_LAYOUTS) facUnits[NUC_KEY(l)] = was.nuc[l];
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
    for (const [id, st] of Object.entries(chainMem)) { const res = FD.resources[id]; if (saved(st) && res && (id === 'crude-oil' || (!onlyCrude && res.cat === 'basic-solid'))) { st.scale *= f; for (const q of st.parts || []) q.scale *= f; } }
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
    cur = null; curRes = null; setBg('oil');
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
      if (d) { dem = d; anchor = key; view = { dem: d, anchor, anchorN: k ? null : n }; if (!preview) { st.dem = d; st.anchor = anchor; st.anchorN = view.anchorN; } }
    }
    curCard = { id: 'oil', st, fields: [], view };
    const plan = oilPlan(dem, mode), changed = !!anchor;
    const box = (key, v, label) => `<input class="num" inputmode="decimal" data-oil="${key}" value="${fmtIn(v)}" aria-label="${esc(label)}"${anchor === key ? ' data-focus="1"' : ''}>${undoBtn('oil', anchor === key)}`;
    const row = (key, icon, label, sub, v, unit, cls, extra) => `<div class="tr${cls ? ' ' + cls : ''}"><div class="td item"><span class="exp none"></span>${icb(icon)}<span class="nmtxt"><b>${esc(label)}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</span></div><div class="td mach" data-label="how many">${key && (v > 0 || 'plh'.includes(key) && key.length === 1) ? box(key, v, label) + (unit ? '' : `<span class="build">${buildText(v)}</span>`) : `<span class="big">${unit ? fmt(v) : wholeText(v)}</span>${unit ? '' : `<span class="build">${exactText(v)}</span>`}`}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}${extra || ''}</div></div>`;
    const useSub = k => { if (!(fac[k] > 0)) return ''; const names = [...new Set(F.by[k].map(u => (u.label || nameOf(u.by)).toLowerCase()))]; return `your factory uses ${fmt(fac[k])} per second: ${esc(names.join(', '))}`; };
    const vs = k => { if (!hasFac || !changed || !(fac[k] > 0)) return ''; const d = dem[k] - fac[k]; if (Math.abs(d) < 1e-6 * Math.max(1, fac[k])) return ''; return d < 0 ? `<span class="vs short">${fmt(-d)} short</span>` : `<span class="vs spare">fulfilled, ${fmt(d)} left over</span>`; };
    // the oils are what the machines above make: shown, not typed (the refineries and processing are what you set)
    const prods = (basic ? ['p'] : ['p', 'l', 'h']).map(k => row(null, OIL_ITEM[k], nameOf(OIL_ITEM[k]) + ' made', useSub(k), dem[k], 'per second', '', vs(k))).join('');
    // beside each machine, how many your factory has, to compare with what this takes
    const machinesOf = id => { const m = itemMachine(id), s = chainMem[id]; return m && saved(s) ? s.scale * m.k : 0; };
    const haveTxt = n => n > 0 ? `${fmt(n)} in your factory` : '';
    const rates = oilRates(OIL_PROC[mode], 'oil-refinery');
    const mach = [row('R', 'oil-refinery', 'Oil refineries', haveTxt(refN(mode)), plan.R, null, 'product')];
    if (!basic) mach.push(row('Hc', 'heavy-oil-cracking', 'Heavy oil cracking', haveTxt(unitN('heavy-oil-cracking')), plan.Hc), row('Lc', 'light-oil-cracking', 'Light oil cracking', haveTxt(unitN('light-oil-cracking')), plan.Lc));
    // coal liquefaction takes coal and steam (from boilers) instead of crude oil
    if (mode === 'coal') mach.push(row('coal', 'coal', 'Coal used', '', plan.coal, 'per second'), row('steam', 'steam', 'Steam used', '', plan.steam, 'per second'),
      row('boilers', 'boiler', 'Boilers', haveTxt(unitN('boiler')), plan.boilers));
    else mach.push(row('jacks', 'pumpjack', 'Pumpjacks', [`${fmt(S.jackYield * 100)}% yield`, haveTxt(machinesOf('crude-oil'))].filter(Boolean).join(' · '), plan.jacks));   // crude oil and water in the machines that pump them
    if (!basic) mach.push(row('pumps', 'offshore-pump', 'Offshore pumps', haveTxt(machinesOf('water')), plan.pumps));
    mach.push(row(null, 'small-electric-pole', 'Electricity', '', plan.mw, 'MW'));
    const notes = [];
    if (!basic) {
      const left = ['p', 'l', 'h'].filter(k => plan.spare[k] > 1e-6), many = left.length > 1;
      if (left.length) notes.push(`<div class="note">${left.map(k => fmt(plan.spare[k]) + ' ' + nameOf(OIL_ITEM[k]).toLowerCase()).join(' and ')} per second left over with everything cracked: ${many ? 'they back up and stop' : 'it backs up and stops'} the refineries.</div>`);
    }
    if (basic && (fac.l > 0 || fac.h > 0)) notes.push(`<div class="note">Basic makes only petroleum gas; your factory also uses ${[fac.l > 0 ? fmt(fac.l) + ' light oil' : '', fac.h > 0 ? fmt(fac.h) + ' heavy oil' : ''].filter(Boolean).join(' and ')} per second.</div>`);
    const intro = `One refinery: ${rates.ins} → ${rates.outs} per second.`;
    const yours = refN(mode) || refAll();
    const sized = changed ? '' : hasFac ? 'Sized to your factory.' : yours > 0 ? `Your ${fmt(yours)} refineries at full speed.` : '20 refineries at full speed.';
    const modeSeg = `<div class="settings" style="margin:0 0 10px"><span class="lead">Processing:</span><span class="seg">${[['basic', 'Basic', 'crude oil into petroleum gas only'], ['advanced', 'Advanced', 'crude oil and water into heavy oil, light oil and petroleum gas, with cracking'], ['coal', 'Coal liquefaction', 'coal and steam into heavy oil, light oil and petroleum gas, with cracking']].map(([v, l, t]) => `<button tabindex="-1" data-oil-mode="${v}" class="${v === mode ? 'on' : ''}" title="${t}">${icb('oil-refinery', 'xs')}<span>${l}</span></button>`).join('')}</span></div>`;
    // "In your factory" once its refineries, the cracking it needs and the pumpjacks for that crude oil are all there
    const want = oilWant(plan, basic), crudeNeed = oilCrudeNeed(want.refinery, mode, M.uses), crudeHave = saved(chainMem['crude-oil']) ? chainMem['crude-oil'].scale : 0;
    const crackOk = (id, n) => basic || !(n > 1e-9) || unitN(id) === want[id], jacksOk = crudeHave >= crudeNeed - 1e-9;
    const inFac = refN(mode) === want.refinery && crackOk('heavy-oil-cracking', plan.Hc) && crackOk('light-oil-cracking', plan.Lc) && jacksOk;
    const btn = !(plan.R > 0) ? '' : inFac ? `<button class="iconbtn sm infac" data-go="#c/factory" tabindex="-1" title="Open your factory">In your factory ✓</button>`
      : `<button class="iconbtn sm${changed ? ' cta' : ''}" data-oil-tofactory tabindex="-1" title="Put ${want.refinery} refineries${basic ? '' : `, ${want['heavy-oil-cracking']} heavy and ${want['light-oil-cracking']} light oil cracking plants`}${jacksOk ? '' : ` and ${fmt(Math.ceil(crudeNeed * supply('crude-oil', 1).k - 1e-9))} pumpjacks`} into your factory">${refN(mode) > 0 ? 'Update in factory' : '+ Add to factory'}</button>`;
    $('#main').innerHTML = `<h1>${ic('oil-refinery', 'lg')}<span class="ttl">Oil processing<div class="sub">${intro}</div>${sized ? `<div class="sub">${sized}</div>` : ''}</span>${btn}</h1>
      ${modeSeg}${notes.join('')}
      <div class="tbl two"><div class="th"></div><div class="th">How many</div>${mach.join('')}<div class="tr line"><div class="td"><span class="rule"></span></div></div>${prods}</div>`;
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
  // Each import overwrites the counts of what the blueprint holds and leaves the rest alone: an item gets a line for each
  // machine and recipe it is made on, replacing the line on the same machine and recipe. On a tab it only touches that
  // tab's rows (the rest is listed); rows already in the ledger update at once, new ones wait for a tick and Add. What a
  // blueprint does not say, you say: what furnaces smelt, what drills mine, and which processing refineries with no
  // recipe run. Modules and beacons are ignored.
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
  // one ledger entry for an item from its machines: a line for each machine and recipe, the one with the most machines
  // first (on a new row, that is the row's own machine)
  function bpItemEntry(item, groups) {   // groups: { 'machine|recipe': n }
    const lines = Object.entries(groups).map(([key, n]) => { const [m, r] = key.split('|'); return { recipe: r || null, machine: m, scale: bpRate(item, m, r || null, n), n }; }).sort((a, b) => b.n - a.n);
    return { kind: 'item', id: item, tab: tabOf(item), lines };
  }
  function bpCount(entities) {
    const items = {}, units = {}, furnaces = {}, drills = {}, skipped = {};
    let refAsk = 0;   // refineries with no recipe set
    const add = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
    for (const e of entities) {
      const n = e.name, r = e.recipe, rec = r && FD.recipes[r];
      if (BP_UNITS[n]) add(units, BP_UNITS[n]);
      else if (n === 'oil-refinery') {
        const om = Object.keys(OIL_PROC).find(m => OIL_PROC[m] === r);
        if (om) add(units, REF_KEY[om]);   // each processing's refineries count on their own
        else if (rec) add(skipped, rec.name);
        else refAsk++;
      }
      else if (n === 'chemical-plant' && (r === 'heavy-oil-cracking' || r === 'light-oil-cracking')) add(units, r);
      else if (BP_CRAFTERS.has(n) && rec) {
        const item = rec.main || (rec.out.length === 1 ? rec.out[0][0] : null);
        if (item && FD.items[item] && Engine.byProduct[item] && !Engine.LEAVES.has(item)) add(items[item] = items[item] || {}, n + '|' + r);
        else add(skipped, rec.name);
      }
      else if (BP_CRAFTERS.has(n)) add(skipped, `${mName(n)} with no recipe`);
      else if (n === 'pumpjack') add(items['crude-oil'] = items['crude-oil'] || {}, 'pumpjack|');
      else if (n === 'offshore-pump') add(items.water = items.water || {}, 'offshore-pump|');
      else if (BP_FURNACES.includes(n)) add(furnaces, n);
      else if (DRILLS.includes(n)) add(drills, n);
    }
    return { items, units, furnaces, drills, skipped, refAsk };
  }
  // whether writing an entry changed a count (bpApply notes what each one was)
  const bpChanged = e => e.kind === 'unit' ? !near(e.before || 0, e.n) : e.lines.some(l => !near(l.before || 0, l.n));
  // write one entry into the ledger: a unit's count, or each of an item's lines (with the count it replaces)
  function bpApply(e) {
    if (e.kind === 'unit') { e.before = unitN(e.id); facUnits[e.id] = e.n; return; }
    for (const l of e.lines) {
      const old = linesOf(e.id).find(x => sameLine(x, l.recipe, l.machine)), pm = old && partMachine(e.id, old);
      l.before = pm ? old.scale * pm.k : 0;
      facPutLine(e.id, l.recipe, l.machine, l.scale);
    }
  }
  async function bpRun(str) {
    const tab = facTab, t0 = tour;
    bpDraft = '';
    // the tutorial started or ended while the string was being read: nothing is imported, and the string goes back in the
    // box of the factory it was meant for (yours, once the tutorial is over)
    const moved = () => { if (tour === t0) return false; if (tour) tour.from.visit.bpDraft = str; else { bpDraft = str; if (curCard && curCard.id === 'factory') renderFactory(true); } return true; };
    const redraw = () => { if (curCard && curCard.id === 'factory') renderFactory(true); };   // unless you have gone to another page meanwhile
    let obj;
    try { obj = await bpDecode(str); } catch (err) { if (moved()) return; bpImport = { tab, error: err.message }; redraw(); return; }
    if (moved()) return;
    const ents = bpEntities(obj);
    if (!ents.length) { bpImport = { tab, error: 'That blueprint has no machines in it.' }; redraw(); return; }
    const c = bpCount(ents), entries = [];
    for (const [item, groups] of Object.entries(c.items)) entries.push(bpItemEntry(item, groups));
    for (const [u, n] of Object.entries(c.units)) entries.push({ kind: 'unit', id: u, tab: UNITS[u].tab, n });
    const inScope = t => tab === 'all' || t === tab;
    const updated = [], pending = [], others = [], matched = [];   // matched: rows already at the blueprint's counts
    for (const e of entries) {
      if (!inScope(e.tab)) others.push(e);
      else if (e.kind === 'unit' ? unitN(e.id) > 0 : saved(chainMem[e.id])) { bpApply(e); (bpChanged(e) ? updated : matched).push(e); }
      else pending.push(e);
    }
    const same = matched.length;
    // what the blueprint does not say is asked here: furnaces and drills on Mining & smelting, refineries with no recipe on Oil
    const splits = {};
    if (Object.keys(c.furnaces).length || Object.keys(c.drills).length) {
      if (inScope('mining')) Object.assign(splits, { furnaces: c.furnaces, drills: c.drills });
      else for (const [m, n] of Object.entries(Object.assign({}, c.furnaces, c.drills))) others.push({ kind: 'raw', id: m, tab: 'mining', n });
    }
    if (c.refAsk) { if (inScope('oil')) splits.refineries = c.refAsk; else others.push({ kind: 'raw', id: 'oil-refinery', tab: 'oil', n: c.refAsk }); }
    if (updated.length) { persist(); clearViews(); }
    bpImport = { tab, total: ents.length, updated, same, matched, pending, others, splits: Object.keys(splits).length ? splits : null, skipped: c.skipped, unticked: new Set(), splitVals: {} };
    redraw();
  }
  // Add: the ticked new rows, then the furnaces, drills and refineries as you split them
  function bpConfirm() {
    const b = bpImport; if (!b || b.done || b.error) return;
    const added = [], root = $('#main');
    for (const cb of root.querySelectorAll('input[data-bp-add]')) if (cb.checked) { const e = b.pending[Number(cb.dataset.bpAdd)]; bpApply(e); added.push(e); }
    const groups = {}, refs = {};
    for (const inp of root.querySelectorAll('input[data-bp-split]')) {
      const v = parseFloat(inp.value); if (!(v > 0)) continue;
      const [m, item] = inp.dataset.bpSplit.split('|');
      if (m === 'ref') { refs[item] = (refs[item] || 0) + v; continue; }   // refineries with no recipe: item is the processing
      const rid = FD.resources[item] ? '' : Engine.byProduct[item][0], g = groups[item] = groups[item] || {};
      g[m + '|' + rid] = (g[m + '|' + rid] || 0) + v;
    }
    // what you split goes under Updated when your factory had that row, Added when it is new, and nowhere when no count changed
    const upd = [], file = (e, had) => { if (bpChanged(e)) (had ? upd : added).push(e); };
    for (const [item, g] of Object.entries(groups)) { const e = bpItemEntry(item, g), had = saved(chainMem[item]); bpApply(e); file(e, had); }
    // refineries given a processing join the ones the blueprint has on it (also when those already matched your factory),
    // else they are its count
    for (const [m, v] of Object.entries(refs)) {
      const key = REF_KEY[m], e = b.updated.concat(added, b.matched || []).find(x => x.kind === 'unit' && x.id === key);
      if (e) { e.n += v; facUnits[key] = e.n; if ((b.matched || []).includes(e)) upd.push(e); } else { const ne = { kind: 'unit', id: key, tab: 'oil', n: v }, had = unitN(key) > 0; bpApply(ne); file(ne, had); }
    }
    persist(); clearViews();
    bpImport = { tab: b.tab, total: b.total, done: true, updated: b.updated.concat(upd), added, pending: [], others: b.others, splits: null, skipped: b.skipped };
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
    const box = `<div class="bp"><span class="lead">Import a blueprint${facTab === 'all' ? '' : ' into ' + esc(tabName(facTab))}:</span><input class="txt" id="bpq" placeholder="Paste a blueprint string" autocomplete="off" spellcheck="false" aria-label="blueprint string" value="${esc(bpDraft)}"><button class="iconbtn sm" data-bp-import tabindex="-1">Import</button></div>`;
    const b = bpImport && bpImport.tab === facTab ? bpImport : null;
    if (!b) return box;
    if (b.error) return `<div class="bp-panel"><span class="bp-err">${esc(b.error)}</span> <button class="iconbtn sm" data-bp-close tabindex="-1">OK</button></div>` + box;
    const proc = id => Object.keys(REF_KEY).find(p => REF_KEY[p] === id);   // a refinery count's processing
    const name = e => e.kind === 'unit' ? (proc(e.id) ? `Oil refineries · ${PROC_SHORT[proc(e.id)]}` : UNITS[e.id].name) : nameOf(e.id), icon = e => e.kind === 'unit' ? UNITS[e.id].icon : e.id;
    // what an entry holds: a count, or "N × machine" for each line (its recipe when the item has more than one), each with
    // the count it replaced when that changed; a chip with more than one line has a line for each
    const recTxt = (e, l) => l.recipe && (Engine.byProduct[e.id] || []).length > 1 ? ` (${FD.recipes[l.recipe].name})` : '';
    const wasTxt = (was, before, n) => was && before && !near(before, n) ? ` (was ${fmt(before)})` : '';
    const what = (e, was) => e.kind === 'unit' || e.kind === 'raw' ? [fmt(e.n) + wasTxt(was, e.before, e.n)] : e.lines.map(l => `${fmt(l.n)} × ${mName(l.machine)}${recTxt(e, l)}${wasTxt(was, l.before, l.n)}`);
    const sub = (e, was) => { const w = what(e, was); return w.length > 1 ? w.map(x => `<span class="bl">${esc(x)}</span>`).join('') : esc(w[0]); };
    const many = e => e.kind === 'item' && e.lines.length > 1 ? ' lines' : '';
    const chip = (e, was) => `<span class="chip2 static${many(e)}">${ic(icon(e), 'sm')}${esc(name(e))}<span class="sub">${sub(e, was)}</span></span>`;
    const listed = b.updated.length || (b.added && b.added.length) || (!b.done && (b.pending.length || b.splits)) || b.others.length;
    const parts = listed ? [] : [`<div class="lead">${b.done ? 'Nothing changed.' : b.same ? 'Your factory already matches it.' : 'No machines the ledger counts.'}</div>`];
    if (b.updated.length) parts.push(`<div class="bp-row"><span class="lead">Updated:</span>${b.updated.map(e => chip(e, true)).join('')}</div>`);
    if (b.added && b.added.length) parts.push(`<div class="bp-row"><span class="lead">Added:</span>${b.added.map(e => chip(e)).join('')}</div>`);
    if (!b.done && b.pending.length) parts.push(`<div class="bp-row"><span class="lead">Not in your factory yet:</span>${b.pending.map((e, i) => `<label class="chip2 bp-pick${many(e)}"><input type="checkbox" data-bp-add="${i}"${b.unticked && b.unticked.has(i) ? '' : ' checked'} tabindex="-1">${ic(icon(e), 'sm')}${esc(name(e))}<span class="sub">${sub(e)}${b.tab === 'all' ? ' · ' + esc(tabName(e.tab)) : ''}</span></label>`).join('')}</div>`);
    if (!b.done && b.splits) {
      // furnaces and drills: you say what they make; starts from how your ledger splits that machine today
      const pre = (m, targets, n) => {
        const cur = targets.map(i => { const l = linesOf(i).find(x => x.machine === m), pm = l && partMachine(i, l); return pm ? l.scale * pm.k : 0; }), tot = cur.reduce((a, v) => a + v, 0);
        if (!(tot > 0)) return targets.map(() => '');
        const raw = cur.map(v => v / tot * n), whole = raw.map(Math.floor); let left = n - whole.reduce((a, v) => a + v, 0);
        raw.map((v, i) => [v - whole[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { whole[i]++; left--; } });
        return whole.map(v => v ? String(v) : '');
      };
      const split = (m, n, targets, verb) => {
        const p = pre(m, targets, n), vals = targets.map((i, j) => b.splitVals && (m + '|' + i) in b.splitVals ? b.splitVals[m + '|' + i] : p[j]);
        return `<div class="bp-split" data-bp-total="${n}"><span class="lead">${fmt(n)} × ${esc(mName(m))} ${verb}:</span>${bpLeft(n, vals)}${targets.map((i, j) => `<label>${ic(i, 'xs')}<span>${esc(nameOf(i))}</span><input class="num" inputmode="decimal" data-bp-split="${m}|${i}" value="${esc(vals[j])}" placeholder="0" aria-label="${esc(nameOf(m))} on ${esc(nameOf(i))}" tabindex="-1"></label>`).join('')}</div>`;
      };
      for (const [m, n] of Object.entries(b.splits.furnaces || {})) parts.push(split(m, n, SMELTED, 'make'));
      for (const [m, n] of Object.entries(b.splits.drills || {})) parts.push(split(m, n, m === 'burner-mining-drill' ? ORES.filter(o => !FD.resources[o].fluid) : ORES, 'mine'));
      // refineries with no recipe: which processing they run
      const rn = b.splits.refineries;
      if (rn) { const vals = Object.keys(OIL_PROC).map(m => b.splitVals && ('ref|' + m) in b.splitVals ? b.splitVals['ref|' + m] : '');
        parts.push(`<div class="bp-split" data-bp-total="${rn}"><span class="lead">${fmt(rn)} × Oil refinery (no recipe) run:</span>${bpLeft(rn, vals)}${Object.keys(OIL_PROC).map((m, j) => `<label>${ic(OIL_PROC[m], 'xs')}<span>${esc(PROC_SHORT[m])}</span><input class="num" inputmode="decimal" data-bp-split="ref|${m}" value="${esc(vals[j])}" placeholder="0" aria-label="oil refineries on ${OIL_PROC_NAME[m]}" tabindex="-1"></label>`).join('')}</div>`); }
    }
    // an import on a tab only adds that tab's machines: the rest, by the tab they go on
    for (const t of FAC_ORDER) { const list = b.others.filter(e => e.tab === t); if (list.length) parts.push(`<div class="bp-row"><span class="lead">For the ${esc(tabName(t))} tab:</span>${list.map(e => chip(e)).join('')}</div>`); }
    const sk = Object.entries(b.skipped || {});
    if (sk.length) parts.push(`<div class="bp-row sub">Not counted: ${sk.map(([k, n]) => `${fmt(n)} × ${esc(k)}`).join(', ')}</div>`);
    const ask = !b.done && (b.pending.length || b.splits);
    parts.push(`<div class="bp-row">${ask ? '<button class="iconbtn sm cta" data-bp-confirm tabindex="-1">Add</button>' : ''}<button class="iconbtn sm" data-bp-close tabindex="-1">${ask ? 'Skip' : 'Done'}</button></div>`);
    return `<div class="bp-panel">${parts.join('')}</div>`;
  }

  function renderCard(id, spec) {
    if (id === 'factory') { renderFactory(); return; }
    if (id === 'oil') { renderOil(spec); return; }
    const st = preview ? Object.assign({}, cardState(id)) : cardState(id);
    const c = CARDS[id];
    if (id === 'reference') { renderReference(); return; }
    if (spec && spec.layout && id === 'nuclear' && NUC_LAYOUTS.includes(spec.layout)) { st.layout = spec.layout; st.touched = true; if (!preview) saveCard(id, st); }   // a layout the ledger has a line for
    else if (id === 'nuclear' && !st.touched) st.layout = nucHome();   // untouched, the card is your reactors: their layout
    const def = cardFields(id, st);
    const fields = def.fields;
    setBg(id);
    if (spec && spec.n !== null && spec.unit === 'spm' && def.isScience) { st.scale = spec.n / 60 * st.time / (1 + st.bonus / 100); st.anchor = 'f0'; st.touched = true; }   // "60 spm": 60 of each pack a minute
    else if (spec && spec.n !== null && fields.length) {
      const qs = words(spec.haveQ || '');
      const perS = ['belt', 'lane', '/s', '/min'].includes(spec.unit) ? unitToPerS(spec.n, spec.unit) : null;   // "1 belt of ore": an amount, for a field that is one
      let best = -1, bestSc = 0;
      fields.forEach((f, i) => {
        // the field of the machine the query counts first, the words of its own label next; a count that is shown, not
        // typed, is set only by naming its machine ("4 reactors": four reactors, not four blocks)
        if (f.fixed && !(f.id && f.id === spec.machine && !f.unit)) return;
        const fw = words((f.id ? nameOf(f.id) : '') + ' ' + (f.label || '') + ' ' + (f.id ? (ALIASES[f.id] || []).join(' ') : '')), lw = words(f.label || '');
        let sc = f.id && f.id === spec.machine ? 10 : 0;
        for (const t of qs) { if (fw.some(w => w.startsWith(t))) sc++; if (lw.some(w => w.startsWith(t))) sc += 0.5; }
        if (spec.unit === 'mw' && f.unit === 'MW') sc += 5;
        if (spec.unit === 'labs' && f.id === 'lab') sc += 5;
        if (perS !== null && (f.flow || f.fluid)) sc += 5;
        if (sc > bestSc) { bestSc = sc; best = i; }
      });
      if (best < 0) best = fields.findIndex(f => !f.fixed);
      // an amount field takes the amount as typed in its box (the page's unit; fluids per second) unless the query names a unit
      const f = fields[best], amount = f && (f.flow || f.fluid) ? (perS !== null ? perS : fromUnit(spec.n, !!f.fluid)) : spec.n;
      if (best >= 0) { st.scale = amount / f.k; st.anchor = 'f' + (f.fixed ? fields.findIndex(x => !x.fixed) : best); st.touched = true; if (!preview) saveCard(id, st); }   // a shown count hands its ↺ to the card's box (reactors: the blocks)
    }
    if (!(st.scale > 0) || !st.touched) st.scale = cardHave(id, st) || def.defaultScale;   // the ledger's count, else the card's usual start
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
      for (const m of f.machines || []) ctl += `<span class="mbtn">${icb(m)}<span class="mname">${esc(nameOf(m))}</span></span>`;   // your factory's, both when it has two
      const icon = f.id ? icb(f.id) : f.icon ? ic(f.icon) : '<span style="display:inline-block;width:32px"></span>';
      const link = def.isScience && SCI.has(f.id) ? `<a class="lnk" href="#i/${f.id}" data-go="#i/${f.id}" title="Open the full ${esc(f.label)} chain">${label}</a>` : label;
      return `<div class="tr" data-path="${key}"><div class="td item"><span class="exp none"></span>${icon}<span class="nmtxt">${link}</span></div><div class="td mach" data-label="how many">${ctl}</div></div>`;
    };
    let body;
    if (def.isScience) {
      const perLab = (1 + st.bonus / 100) / st.time;
      body = `<div class="tbl two"><div class="th"></div><div class="th">How many</div>
        <div class="tr product"><div class="td item"><span class="exp none"></span>${ic('lab')}<span class="nmtxt"><b>Labs</b><div class="sub">${def.extra}</div></span></div><div class="td mach" data-label="how many"><input class="num" inputmode="decimal" data-path="f0" data-k="1" data-kind="mach" value="${fmtIn(R)}" aria-label="labs" data-focus="1">${undoBtn('scale', st.anchor === 'f0' && !!st.touched)}<span class="build" data-k="1" data-kind="build">${buildText(R)}</span><span class="mbtn">${ic('lab')}<span class="mname">Lab</span></span></div></div>
        <div class="tr sep"><div class="td">each pack: <b><span data-k="${perLab * 60}" data-kind="plain" data-unit=" per minute">${fmt(perLab * R * 60)} per minute</span></b></div></div>
        ${fields.slice(1).map((f, i) => row(f, i + 1)).join('')}</div>`;
    } else {
      body = `${def.extra ? `<div class="settings" style="margin:0 0 8px">${def.extra}</div>` : ''}<div class="tbl two"><div class="th"></div><div class="th">How many</div>${fields.map(row).join('')}</div>`;
    }
    $('#main').innerHTML = `<h1>${ic(c.icon, 'lg')}<span class="ttl">${esc(c.title)}${def.intro ? `<div class="sub">${def.intro}</div>` : ''}</span>${CARD_ADD.includes(id) ? cardFacBtn(id, cardCount(id, def, R), st) : ''}</h1>
      ${body}`;
    doc.title = c.title + ' – Factorio Ratios';
  }
  function onCardInput(inp) {
    const v0 = parseFloat(inp.value); if (!(v0 > 0)) { inp.classList.add('bad'); return; }
    inp.classList.remove('bad');
    const v = inp.dataset.kind === 'rate' ? fromUnit(v0, inp.dataset.fluid === '1') : v0;
    curCard.st.scale = v / parseFloat(inp.dataset.k);
    const changed = !near(curCard.st.scale, cardHave(curCard.id, curCard.st) || curCard.defaultScale);   // a what-if; labs and boilers are saved on the ledger
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
    curCard = { id: 'reference', st: {}, fields: [] }; setBg('reference');
    const caps = FD.tech.inserter_capacity;
    const hand = lvl => { let reg = 1, bulk = FD.tech.bulk_base; for (const c of caps) if (c.level <= lvl) { reg += c.reg; bulk += c.bulk; } return { reg, bulk }; };
    const ins = Object.entries(FD.inserters).map(([id, i]) => `<tr><td>${ic(id, 'sm')} ${esc(i.name)}</td><td class="n">${fmt(i.swings_per_s, 2)}</td><td class="n">${i.bulk ? fmt(i.swings_per_s * hand(S.cap).bulk, 1) : fmt(i.swings_per_s * hand(S.cap).reg, 2)}</td></tr>`).join('');
    const belts = Object.entries(FD.belts).map(([id, b]) => `<tr><td>${ic(id, 'sm')} ${esc(b.name)}</td><td class="n">${b.per_s}</td><td class="n">${b.per_s / 2}</td></tr>`).join('');
    const fuels = ['wood', 'coal', 'solid-fuel', 'rocket-fuel', 'nuclear-fuel'].map(f => `<tr><td>${ic(f, 'sm')} ${esc(nameOf(f))}</td><td class="n">${fmt(FD.items[f].fuel)} MJ</td><td class="n">${fmt(1.8 / FD.items[f].fuel, 3)}</td><td class="n">${fmt(0.09 / FD.items[f].fuel * 60, 3)}</td><td class="n">${fmt(0.15 / FD.items[f].fuel * 60, 3)}</td></tr>`).join('');
    const poles = Object.entries(FD.poles).map(([id, p]) => `<tr><td>${ic(id, 'sm')} ${esc(p.name)}</td><td class="n">${p.area} × ${p.area}</td><td class="n">${p.wire}</td></tr>`).join('');
    const ug = Object.entries(FD.undergrounds).map(([id, u]) => `<tr><td>${ic(id, 'sm')} ${esc(u.name)}</td><td class="n">${u.gap}</td></tr>`).join('') + `<tr><td>${ic('pipe-to-ground', 'sm')} Pipe to ground</td><td class="n">9</td></tr>`;
    const draws = [['electric-mining-drill', 90], ['assembling-machine-1', 77.5], ['assembling-machine-2', 155], ['assembling-machine-3', 387.5], ['electric-furnace', 186], ['chemical-plant', 217], ['oil-refinery', 434], ['centrifuge', 361.7], ['pumpjack', 90], ['lab', 60], ['beacon', 480], ['radar', 300], ['inserter', 13.6], ['fast-inserter', 46.5], ['bulk-inserter', 133]]
      .map(([id, kw]) => `<tr><td>${ic(id, 'sm')} ${esc(nameOf(id))}</td><td class="n">${fmt(kw)} kW</td><td class="n">${fmt(900 / kw)}</td><td class="n">${fmt(1000 / kw)}</td></tr>`).join('');
    const stacks = [['iron-ore', 'Ore, coal, stone', 50], ['iron-plate', 'Plates, steel, bricks, gears', 100], ['electronic-circuit', 'Cable, circuits, batteries', 200], ['automation-science-pack', 'Science packs', 200], ['plastic-bar', 'Plastic, processing units', 100], ['engine-unit', 'Engines, LDS, frames, solid fuel', 50], ['rocket-fuel', 'Rocket fuel', 20]]
      .map(([id, l, s]) => `<tr><td>${ic(id, 'sm')} ${l}</td><td class="n">${s}</td><td class="n">${(s * 40).toLocaleString()}</td></tr>`).join('');
    $('#main').innerHTML = `<h1>${ic('fast-inserter', 'lg')}<span class="ttl">Belts, inserters &amp; more</span></h1>
      <h2>Belts</h2><div class="panel"><table><tr><th>Belt</th><th class="n">Items per second</th><th class="n">Per lane</th></tr>${belts}</table></div>
      <h2>Inserters</h2><div class="panel"><div class="settings" style="margin:0 0 6px"><label>Inserter capacity research <select data-set="cap" tabindex="-1">${[0, 1, 2, 3, 4, 5, 6, 7].map(l => `<option value="${l}" ${l === S.cap ? 'selected' : ''}>${l ? 'bonus ' + l + ' (hand ' + hand(l).reg + ', bulk ' + hand(l).bulk + ')' : 'none'}</option>`).join('')}</select></label></div>
      <table><tr><th>Inserter</th><th class="n">Swings per second</th><th class="n">Items per second</th></tr>${ins}</table></div>
      <h2>Fuel</h2><div class="panel"><table><tr><th>Fuel</th><th class="n">Energy</th><th class="n">Boiler, per second</th><th class="n">Furnace, per minute</th><th class="n">Burner drill, per minute</th></tr>${fuels}</table></div>
      <h2>Power draw</h2><div class="panel"><table><tr><th>Machine</th><th class="n">At full load</th><th class="n">Per steam engine</th><th class="n">Per MW</th></tr>${draws}</table></div>
      <h2>Poles &amp; undergrounds</h2><div class="panel"><table><tr><th>Pole</th><th class="n">Area (tiles)</th><th class="n">Wire reach (tiles)</th></tr>${poles}</table><table style="margin-top:8px"><tr><th>Underground</th><th class="n">Gap (tiles)</th></tr>${ug}</table></div>
      <h2>Cargo wagon (40 stacks)</h2><div class="panel"><table><tr><th>Cargo</th><th class="n">Stack size</th><th class="n">Per wagon</th></tr>${stacks}</table></div>`;
    doc.title = 'Reference – Factorio Ratios';
  }


  // ---------- tutorial: a guided walk through the app, on a sample factory ----------
  // Opt-in: the ? button, or "tutorial" (help, guide, tour) in the search. It runs on a sample factory with fixed
  // Defaults, in memory only: nothing is saved while it runs (store.off), and other tabs' saves wait for it. It comes in
  // parts (the basics, the cards, oil processing, the Power and Oil tabs, adding machines), all listed on its first card.
  // A part starts from a clean sample; inside a part, what you did stays for the next step. A step that asks you to do
  // something (click, pick or type) waits for you to do it: it has no Next until then, and one that takes you to another
  // page or tab moves on by itself once you click. A step that only points something out has Next. Back is always there.
  // On the way out your own factory and Defaults come back from storage (with anything another tab saved meanwhile), and
  // what this visit had open or typed comes back as it was, on the page you started from. It moves between pages with
  // history.replaceState, so it leaves nothing for Back to walk through.
  const TOUR_WORDS = ['tutorial', 'help', 'guide', 'tour'];
  const TOUR_HIT = { kind: 'tour', id: 'tour', name: 'Open the tutorial' };
  const TOUR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.5c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.9v.1"/></svg>';
  const TOUR_DEFAULTS = { tier: 2, furnace: 'steel-furnace', drill: 'electric-mining-drill', belt: 'transport-belt', rateUnit: 'lane', mp: 0, cap: 0 };
  // the sample's rows, by machine count: iron plate on two furnaces, electronic circuits used but not entered (missing),
  // coal short, the rest fulfilled; oil on advanced processing with cracking, plastic and pumpjacks at 150% yield
  const TOUR_ROWS = [['iron-ore', 30], ['copper-ore', 16], ['coal', 3], ['iron-plate', [['steel-furnace', 16], ['stone-furnace', 12]]], ['copper-plate', 12],
    ['iron-gear-wheel', 3], ['copper-cable', 4], ['inserter', 1], ['transport-belt', 1], ['automation-science-pack', 6], ['logistic-science-pack', 8], ['plastic-bar', 2], ['crude-oil', 6]];
  const TOUR_UNITS = { boiler: 10, 'steam-engine': 20, lab: 10, refinery: 4, 'heavy-oil-cracking': 1, 'light-oil-cracking': 4 };
  function tourSample() {
    Object.assign(S, TOUR_DEFAULTS);
    const m = { chains: {}, cards: { oil: { yield: 150 } }, units: Object.assign({}, TOUR_UNITS), machines: {}, recipes: {}, dismissed: [] };
    loadMem(m);   // the pumpjacks' yield first: it sets what one of them pumps
    for (const [id, n] of TOUR_ROWS) {
      const im = itemMachine(id), recipe = im.recipe || null;
      if (Array.isArray(n)) {
        const parts = n.map(([machine, c]) => ({ recipe, machine, scale: c / partMachine(id, { recipe, machine }).k }));
        m.chains[id] = { scale: parts.reduce((a, p) => a + p.scale, 0), anchor: { path: id, kind: 'mach' }, touched: true, parts }; m.machines[id] = parts[0].machine;
      } else { m.chains[id] = { scale: n / im.k, anchor: { path: id, kind: 'mach' }, touched: true }; if (im.options.length > 1) m.machines[id] = im.machine; }
    }
    loadMem(m);
  }
  // what this visit has open, picked or typed besides your factory: put aside while the tutorial runs
  function visitState() {
    return { view: Object.assign({}, viewMem), chains: Object.fromEntries(Object.entries(chainMem).map(([k, v]) => [k, { overrides: Object.assign({}, v.overrides), open: (v.open || []).slice() }])),
      cards: Object.fromEntries(Object.entries(cardMem).map(([k, v]) => [k, { scale: v.scale, anchor: v.anchor, touched: v.touched, layout: v.layout, labs: v.labs, dem: v.dem, anchorN: v.anchorN }])),
      facOpen: [...facOpen], facKeep: [...facKeep], facFiltSeen: [...facFiltSeen], refShown: [...refShown], nucShown: [...nucShown], facRemoved: Object.assign({}, facRemoved),
      facFilter, addSel: addSel && Object.assign({}, addSel), bpImport, bpDraft, facTab, baseOpen, q: q.value, selIdx, previewing: !!preview };
  }
  function clearVisit() {
    closePop();
    for (const k of Object.keys(viewMem)) delete viewMem[k];
    for (const v of Object.values(chainMem)) { v.overrides = {}; v.open = []; }
    for (const v of Object.values(cardMem)) Object.assign(v, { scale: null, anchor: null, touched: false, layout: CARD_DEF.layout, labs: CARD_DEF.labs, dem: null, anchorN: null });
    for (const s of [facOpen, facKeep, facFiltSeen, refShown, nucShown]) s.clear();
    for (const k of Object.keys(facRemoved)) delete facRemoved[k];
    facFilter = null; addSel = null; bpImport = null; bpDraft = ''; baseOpen = false;
    q.value = ''; hits = []; selIdx = 0; preview = null; strip.hidden = true; strip.innerHTML = '';
  }
  function putVisit(v) {
    clearVisit();
    Object.assign(viewMem, v.view);
    for (const [k, c] of Object.entries(v.chains)) Object.assign(chainState(k), { overrides: Object.assign({}, c.overrides), open: c.open.slice() });   // copies: what happens next must not change the copy kept
    for (const [k, c] of Object.entries(v.cards)) Object.assign(cardState(k), c);
    for (const [s, l] of [[facOpen, v.facOpen], [facKeep, v.facKeep], [facFiltSeen, v.facFiltSeen], [refShown, v.refShown], [nucShown, v.nucShown]]) l.forEach(x => s.add(x));
    Object.assign(facRemoved, v.facRemoved);
    ({ facFilter, bpImport, bpDraft, facTab, baseOpen } = v); addSel = v.addSel && Object.assign({}, v.addSel);
  }
  // what the steps look at: the app's own rows, boxes and buttons
  const $$ = s => [...doc.querySelectorAll(s)];
  const facRow = id => $(`#tree .tr[data-fac="${id}"]`);
  const afterLine = () => { const rows = $$('#main .tbl.two > .tr'), i = rows.findIndex(r => r.classList.contains('line')); return i < 0 ? [] : rows.slice(i + 1); };
  const facTabTo = t => { if (facTab !== t || facFilter) { facTab = t; facFilter = null; facFiltSeen.clear(); renderFactory(true); } };
  const coalInView = () => { if (!facRow('coal')) facTabTo('all'); };
  const topBtn = () => $('#main h1 .iconbtn.sm');   // a page's Add to factory, Update in factory or In your factory
  const onFactory = () => !!$('#main h1 .iconbtn.sm.infac');
  const btnName = () => { const b = topBtn(); return b ? b.textContent.replace(/^\+\s*/, '').trim() : 'Add to factory'; };
  // where a step is: at() says whether it is showing, page is where to go when it is not (a step without one is shown
  // wherever you are)
  const HOME = { at: () => !location.hash || location.hash === '#', page: '#' };
  const ITEM = { at: () => !!cur && !preview && (!tour.item || cur.id === tour.item), page: () => '#i/' + (tour.item || 'electronic-circuit') };
  const FACTORY = { at: () => location.hash === '#c/factory', page: '#c/factory' };
  const CARD = id => ({ at: () => location.hash === '#c/' + id, page: '#c/' + id });
  // A step: where it is, what it says (text, or a function for text that depends on the page), what it rings (target)
  // and what it opens each time it is shown (show). A step you act on has done(mark): true once you have done it (mark is
  // what mark() gave when the step was shown); auto: it moves on as soon as you have (a click); otherwise Next appears
  // (after typing). nav: it takes you to another page or tab, and is skipped when you are there already; opener: a part's
  // first step, not counted. focus: the box to type in. try: what a step that only points can be used.
  const toStep = (sel, done, text, more) => Object.assign({ nav: true, auto: true, target: () => $(sel), done, text }, more);
  // a small blueprint for the Your factory part: 8 steel furnaces and 6 electric drills, which a blueprint cannot say the
  // use of
  const TOUR_BP = '0eNqV0tuKgzAQBuB3mWsVNaeNr7GXSynqzi6BJC0xlhbx3ZtaWApbNbkJZJL5hvxkgk6PeHbKemgmUB4NNC+1DHTboQ61T4PaK/sbSmi98goHaL6m5+Z2tKPp0EFTZWBbg6Fh8Ig6/xmdbXsMXefTELpO9jHnuly8hXWes39GHWuQdYPEGmzdoLGGWDdYrCHXDR6d6UaoIhrZSPUjGtmIVf4hqLH3TvW5UTZ8rfzbKa3fYMVTYwV751VlKkh3wCoVFDtgnfzkckckySLZEWmyyF/FQwYXdMNyzHgtqZSMloJzQeb5DnkPdOI=';
  const ironTwo = () => { const r = $('#tree .tr[data-path$=">iron-plate"]'); return !!r && r.querySelectorAll('.part').length > 1; };
  const shortBtn = () => $('#main [data-fac-filter="short"]');
  const TOUR_PARTS = {
    basics: { name: 'Basics', steps: [
      toStep('#home', HOME.at, 'Click Home to go to the home page.', { opener: true }),
      Object.assign({}, HOME, { target: () => $('#settings'), try: true, show: () => { if (matchMedia('(max-width:900px)').matches && !baseOpen) { baseOpen = true; renderSettings(); } },
        text: 'Defaults sets the tier of the assemblers, furnaces, drills and belts that every page uses. Set them to what you have built in your game.' }),
      Object.assign({}, HOME, { target: () => [q, strip], auto: true, focus: () => q, show: () => { if (baseOpen) { baseOpen = false; renderSettings(); } },
        done: () => !!cur && !preview && /^#i\//.test(location.hash), text: 'Type the name of something you want to make, like green circuit, then press Enter to open its page.' }),
      Object.assign({}, ITEM, { target: () => $('#main h1'), text: 'This is the page for the item you searched for. Under its name is the recipe from the game.' }),
      Object.assign({}, ITEM, { target: () => $('#tree .tr.product'), focus: () => $('#tree .tr.product input.num'), done: () => !!(cur && viewMem[cur.id]),
        text: 'The top row is the item itself. Type how many machines you want making it, and every ingredient below changes to match.' }),
      Object.assign({}, ITEM, { target: () => $('#tree .tr.product .mbtn.can'), auto: true, done: () => !!(cur && cur.st.overrides['l:' + cur.tree.path]),
        text: 'Click the machine and pick a different one, like a faster assembler. The counts change to match.' }),
      Object.assign({}, ITEM, { target: () => $('#tree .tr[data-path$=">iron-plate"]') || $('#tree .tr[data-path*=">"]'), try: true,
        text: () => `Pages use the same machines as your factory${ironTwo() ? ', so iron plate is made in both stone and steel furnaces here' : ''}. + adds another kind of machine, × removes one, and ▸ shows what a row needs.` }),
      Object.assign({}, ITEM, { target: topBtn, auto: true, done: onFactory,
        text: () => onFactory() ? 'This item is in your factory now.' : `Changes on an item page aren't saved. Click ${btnName()} to put the top row's machines in your factory.` }),
    ] },
    factory: { name: 'Your factory', steps: [
      toStep('#fac', FACTORY.at, 'Click Factory to open your factory.', { opener: true }),
      Object.assign({}, FACTORY, { target: () => $('#main .factabs'), auto: true, done: () => facTab === 'mining',
        text: 'This is a sample factory. Your own is saved in this browser and comes back when the tutorial ends. The tabs sort the rows by the kind of machine that makes them. Click Mining & smelting.' }),
      Object.assign({}, FACTORY, { target: () => facRow('coal'), show: coalInView,
        text: 'Each row compares Supply, what your machines make, with Demand, what the rest of your factory uses. Red means short and says how many machines to add, green means fulfilled, and grey means nothing makes it yet.' }),
      Object.assign({}, FACTORY, { target: () => $('#main .fac-sum'), show: coalInView, auto: true, done: () => facFilter === 'short',
        text: () => `These count the rows that are short, missing or fulfilled. Click ${shortBtn() ? shortBtn().textContent.trim() : 'short'} to see only what is short.` }),
      Object.assign({}, FACTORY, { target: () => facRow('coal'), show: coalInView, auto: true, done: () => facOpen.has('coal'),
        text: 'Coal is short. Click ▸ on Coal to see what makes it and what uses it.' }),
      Object.assign({}, FACTORY, { target: () => withCons('coal'), show: coalInView, try: true,
        text: () => { const top = $('#tree .tr.cons.uses .nmtxt .lnk'); return `The made by lines add up to Supply and the used by lines add up to Demand, biggest first, so you can see where a shortage comes from.${top ? ` Here ${top.textContent.trim()} use${/s$/.test(top.textContent.trim()) ? '' : 's'} the most.` : ''}`; } }),
      Object.assign({}, FACTORY, { target: () => { const r = facRow('coal'); return r ? [r.querySelector('input.num'), r.querySelector('.td.amt.bal')] : []; }, show: coalInView, focus: () => facRow('coal') && facRow('coal').querySelector('input.num'),
        mark: () => (chainMem.coal || {}).scale, done: m => (chainMem.coal || {}).scale !== m, text: 'Type how many drills you have on coal. The bar on the right fills up as Supply catches up with Demand.' }),
      Object.assign({}, FACTORY, { target: () => [$('#tree .tr.add'), $('#tree .tr.add-hits')], show: () => { if (facFilter) facTabTo(facTab); }, auto: true, done: () => !!addSel,
        text: 'To add an item, click this box and pick one from the list.' }),
      Object.assign({}, FACTORY, { target: () => [$('#tree .tr.add'), $('#tree .tr.add-hits')], auto: true, mark: () => addsMade, done: m => addsMade > m,
        text: 'Type how many you have. If the machine has a ▾, click it to pick the one that makes it. Then click Add to put it in your factory.' }),
      Object.assign({}, FACTORY, { target: () => $('#main .bp'), show: () => { addClose(); if (!bpImport && !bpDraft) { bpDraft = TOUR_BP; renderFactory(true); } }, auto: true, done: () => !!bpImport && bpImport.tab === facTab && !bpImport.error,
        text: 'You can also paste a blueprint string here to add its machines. This one has 8 steel furnaces and 6 electric drills. Click Import.' }),
      Object.assign({}, FACTORY, { target: () => $('#main .bp-panel'), auto: true, done: () => !bpImport || !!bpImport.done,
        text: 'A blueprint doesn\'t say what each furnace smelts or what each drill mines, so you split them between the items here. It starts with how your factory splits them now. Then click Add.' }),
    ] },
    power: { name: 'Power', steps: [
      toStep('#home', HOME.at, 'Click Home to go to the home page.', { opener: true }),
      Object.assign(toStep('#main .card[data-go="#c/steam"]', CARD('steam').at, 'The cards at the top work out power, mining, oil and science. Click Steam power.'), HOME),
      Object.assign({}, CARD('steam'), { target: () => [0, 1, 2, 3].map(i => $(`#main .tbl.two .tr[data-path="f${i}"]`)), focus: () => $('#main input.num[data-path="f0"]'), done: () => !!cardState('steam').touched,
        text: 'Type a number in any box, like how many boilers you have, and the rest change to match.' }),
      Object.assign({}, CARD('steam'), { target: topBtn, auto: true, done: onFactory,
        text: () => onFactory() ? 'These boilers are in your factory now.' : `Click ${btnName()} to put these boilers and steam engines in your factory.` }),
      Object.assign(toStep('#home', HOME.at, 'Click Home to go back to the cards.'), CARD('steam')),
      Object.assign(toStep('#main .card[data-go="#c/solar"]', CARD('solar').at, 'Click Solar power.'), HOME),
      Object.assign({}, CARD('solar'), { target: topBtn, auto: true, done: onFactory,
        text: () => onFactory() ? 'These solar panels are in your factory now.' : `Solar panels need accumulators to keep the power on at night, and this card counts both. Click ${btnName()} to put these solar panels in your factory.` }),
      Object.assign(toStep('#home', HOME.at, 'Click Home again.'), CARD('solar')),
      Object.assign(toStep('#main .card[data-go="#c/nuclear"]', CARD('nuclear').at, 'Click Nuclear power.'), HOME),
      Object.assign({}, CARD('nuclear'), { target: () => $('#main .settings'), auto: true, mark: () => cardState('nuclear').layout, done: m => cardState('nuclear').layout !== m,
        text: 'Pick how your reactors are laid out. Reactors next to each other make more heat, so the layout changes how much power you get.' }),
      Object.assign({}, CARD('nuclear'), { target: topBtn, auto: true, done: onFactory,
        text: () => onFactory() ? 'These reactors are in your factory now.' : `Click ${btnName()} to put these reactors in your factory.` }),
      Object.assign(toStep('#main h1 .iconbtn.sm.infac', FACTORY.at, 'Click In your factory to open your factory.'), CARD('nuclear')),
      Object.assign(toStep('#main [data-fac-tab="power"]', () => FACTORY.at() && facTab === 'power', 'Click Power.'), FACTORY),
      Object.assign({}, FACTORY, { target: () => facRow('unit:boiler'), show: () => facTabTo('power'), auto: true, mark: () => boilerFuel(), done: m => boilerFuel() !== m,
        text: 'Pick the fuel your boilers burn. What they burn is counted on that fuel\'s row.' }),
      Object.assign({}, FACTORY, { target: () => [facRow('steam'), facRow('power')], show: () => facTabTo('power'), try: true,
        text: 'Steam and Electricity add up what your boilers, engines, solar panels and reactors make, against what your machines use.' }),
    ] },
    oil: { name: 'Oil', steps: [
      toStep('#home', HOME.at, 'Click Home to go to the home page.', { opener: true }),
      Object.assign(toStep('#main .card[data-go="#c/oil"]', CARD('oil').at, 'Click Oil processing.'), HOME),
      Object.assign({}, CARD('oil'), { target: () => $('#main .settings'), auto: true, mark: () => oilProcOf(cardState('oil')), done: m => oilProcOf(cardState('oil')) !== m,
        text: 'Pick how your refineries process oil: basic, advanced, or coal liquefaction.' }),
      Object.assign({}, CARD('oil'), { target: () => $('#main .tbl.two .tr.product'), focus: () => $('#main input.num[data-oil="R"]'), done: () => !!cardState('oil').dem,
        text: 'Type how many refineries you want. The cracking, the pumpjacks and the oil they make change to match.' }),
      Object.assign({}, CARD('oil'), { target: afterLine, try: true,
        text: 'This is the oil they make. Under each name is how much of it your factory uses.' }),
      Object.assign({}, CARD('oil'), { target: topBtn, auto: true, done: onFactory,
        text: () => onFactory() ? 'These refineries are in your factory now.' : `Click ${btnName()} to put these refineries, the cracking and the pumpjacks in your factory.` }),
      Object.assign(toStep('#main h1 .iconbtn.sm.infac', FACTORY.at, 'Click In your factory to open your factory.'), CARD('oil')),
      Object.assign(toStep('#main [data-fac-tab="oil"]', () => FACTORY.at() && facTab === 'oil', 'Click Oil & chemicals.'), FACTORY),
      Object.assign({}, FACTORY, { target: () => facRow('crude-oil'), show: () => facTabTo('oil'), focus: () => $('#main input.yld'), mark: () => cardState('oil').yield, done: m => { const y = $('#main input.yld'); return cardState('oil').yield !== m || (!!y && parseFloat(y.value) > 0 && parseFloat(y.value) !== m); },
        text: 'Type your oil field\'s yield in the % yield box. The game shows it when you hover over the oil.' }),
      Object.assign({}, FACTORY, { target: () => facRow('unit:refinery'), show: () => facTabTo('oil'), try: true,
        text: 'This row shows how many refineries your factory needs and how busy they are. If an oil has nowhere to go, it backs up and stops them.' }),
    ] },
  };
  const TOUR_INTRO = { intro: true, text: () => `Hello! This is the Factorio Ratios tutorial. ${!tour.done.size ? 'Press Start to begin with the basics, or pick a part.' : tour.done.size < Object.keys(TOUR_PARTS).length ? 'Press Start for the next part, or pick one.' : 'You have done every part. Press Start to go through them again, or pick one.'}` };
  const TOUR_END = { end: true, target: () => $('#tourbtn'), text: 'That\'s it for this part. Done brings back your own factory, and the ? button opens the tutorial again.' };
  let tour = null, tourEl = null, tourRaf = 0, tourObs = null;
  const TOUR_EVENTS = ['focusin', 'focusout', 'input', 'change', 'keyup', 'click'];
  const tourList = () => tour.part ? TOUR_PARTS[tour.part].steps : [];
  const tourStep = () => !tour.part ? TOUR_INTRO : tour.i >= tourList().length ? TOUR_END : tourList()[tour.i];
  // what a step rings, with a picker you opened inside the ring (it opens outside it)
  const tourTargets = step => { const els = step.target ? [].concat(step.target()).filter(el => el && el.isConnected) : []; if (els.length && popEl && popEl.isConnected) els.push(popEl); return els; };
  const tourText = step => typeof step.text === 'function' ? step.text() : step.text;
  // Next is there on a step that only points, and on one you act on once you have done it (or when what it rings is
  // not on the page, so you are never stuck)
  const tourCanNext = step => !step.done || step.done(tour.mark) || !tourTargets(step).length;
  // what a step rings, as one rectangle on screen (a row above 700 px has no box of its own: its cells have)
  function tourRect(els) {
    let r = null;
    const add = b => { if (!(b.width > 0 && b.height > 0)) return; r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    for (const el of els) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) add(b); else for (const c of el.children) add(c.getBoundingClientRect()); }
    return r;
  }
  const tourSheet = () => matchMedia('(max-width:700px)').matches;   // on narrow screens the card is a sheet at the bottom
  function tourStart(fromSearch) {
    if (tour) return;
    if (fromSearch) { q.value = ''; hits = []; preview = null; strip.hidden = true; strip.innerHTML = ''; }   // the search that opened it is not kept
    if (!fine()) q.blur();
    closePop();
    const w = doc.defaultView || window;
    tour = { part: null, i: 0, item: null, busy: false, wasDone: false, mark: null, snaps: {}, done: new Set(store.get('tutorial', [])), from: { hash: location.hash, y: w.scrollY, visit: visitState() } };
    store.off = true;
    tourEl = doc.createElement('div'); tourEl.id = 'tour';
    tourEl.innerHTML = '<div class="tb"></div><div class="tb"></div><div class="tb"></div><div class="tb"></div><div class="tb"></div><div class="ring none"></div>'
      + '<div class="tcard" role="dialog" aria-label="Tutorial" tabindex="-1"><div class="tstep"><span class="tpos"></span><button class="tx" data-tour="end" title="Close the tutorial (Esc)" aria-label="Close the tutorial">×</button></div><p class="ttext" aria-live="polite"></p><div class="tnav"></div></div>';
    doc.body.appendChild(tourEl); doc.body.classList.add('touring');   // room below the page, so what a step rings can come up above the sheet
    tourEl.addEventListener('click', tourClick);
    w.addEventListener('keydown', tourKey, true);
    w.addEventListener('scroll', tourSoon, true);
    w.addEventListener('resize', tourSoon);
    for (const ev of TOUR_EVENTS) doc.addEventListener(ev, tourSoon);   // anything you do can be what a step waits for
    doc.addEventListener('focusin', tourFocus);
    tourObs = new MutationObserver(tourSoon);
    tourObs.observe($('#main'), { childList: true, subtree: true }); tourObs.observe($('header'), { childList: true, subtree: true }); tourObs.observe(doc.body, { childList: true });
    tourShowCard();
  }
  // a part from its start, on a clean sample, from wherever you are
  function tourPart(key) {
    clearVisit(); tourSample(); facTab = 'all'; tour.item = null; tour.snaps = {};
    renderSettings(); render();
    tour.part = key; tourEnter(0, 1);
  }
  // everything a step started from: the sample as it was then, what was open, Defaults, the page. Back puts it back, so
  // a step you go back to is as you first saw it.
  function tourSnap() { const { machineOf: m, recipeOf: r, ...base } = S; return { mem: JSON.parse(JSON.stringify(memNow())), visit: visitState(), S: base, hash: location.hash, item: tour.item }; }
  function tourRestore(sn) {
    clearVisit(); loadMem(sn.mem); putVisit(sn.visit); Object.assign(S, sn.S); tour.item = sn.item;
    history.replaceState(null, '', sn.hash || location.pathname + location.search);
    keepPlace = true; try { renderSettings(); render(); } finally { keepPlace = false; }   // as it was: the ledger keeps its filter and opened rows
  }
  // step i of the part. Forward (dir 1) a step that takes you somewhere you are already is skipped; back (-1) goes to
  // the last step you saw before this one, as it was then, or past a part's first step to the first card.
  function tourEnter(i, dir) {
    const list = tourList();
    if (dir < 0) {
      while (i >= 0 && !tour.snaps[i]) i--;
      if (i < 0) { tour.part = null; tour.i = 0; tourShowCard(); return; }
      tour.i = i; tour.busy = true;
      try { tourRestore(tour.snaps[i]); tourArrive(tourStep()); } finally { tour.busy = false; }
      tourShowCard(); return;
    }
    while (i < list.length && list[i].nav && list[i].done()) i++;
    tour.i = i;
    const step = tourStep();
    tour.busy = true;
    try {
      closePop();
      if (step.page && !step.at()) {   // you are not where it is (you went elsewhere): go there
        const want = typeof step.page === 'function' ? step.page() : step.page;
        preview = null; history.replaceState(null, '', want === '#' ? location.pathname + location.search : want); render();
      }
      if (cur && !preview && !tour.item) tour.item = cur.id;   // the item you typed, kept for the rest of the part
      if (step.end) { tour.done.add(tour.part); store.set('tutorial', [...tour.done]); } else tour.snaps[i] = tourSnap();   // the parts you have done are remembered in this browser
      tourArrive(step);
    } finally { tour.busy = false; }
    tourShowCard();
  }
  // a step being shown: what it opens, and where what it asks for stands now
  function tourArrive(step) {
    if (step.show) step.show();
    tour.mark = step.mark ? step.mark() : null;
    tour.wasDone = !!(step.done && step.done(tour.mark));
  }
  // the card for the step you are on, what it rings brought into sight, and the focus where you act (a box to type in,
  // with a mouse) or on the card
  function tourShowCard() {
    const step = tourStep(), w = doc.defaultView || window;
    tourCard(step); tourMini();   // the sheet at the size it will have, before it is measured
    const els = tourTargets(step), r = tourRect(els);
    if (r && !els.every(el => el.closest('header'))) {   // between the header and the sheet (what is in the header is always in sight)
      const top = $('header').getBoundingClientRect().bottom + 10, bottom = w.innerHeight - (tourSheet() ? tourEl.querySelector('.tcard').offsetHeight : 0) - 10;
      if (r.top < top || r.bottom > bottom) w.scrollBy(0, r.bottom - r.top > bottom - top || r.top < top ? r.top - top : r.bottom - bottom);
    }
    tour.busy = true; try { tourDraw(); } finally { tour.busy = false; }
    const box = step.focus && fine() ? step.focus() : null;
    if (box) { box.focus({ preventScroll: true }); if (box.select) box.select(); }
    else (tourEl.querySelector('.tnav .cta:not([hidden])') || tourEl.querySelector('.tcard')).focus({ preventScroll: true });
  }
  function tourCard(step) {
    const c = tourEl.querySelector('.tcard'), list = tourList(), counted = list.filter(s => !s.opener);
    // a part's button, with a ✓ once you have been through it
    const parts = keys => keys.map(k => `<button class="iconbtn sm" data-tour-part="${k}">${esc(TOUR_PARTS[k].name)}${tour.done.has(k) ? ' ✓' : ''}</button>`).join('');
    c.querySelector('.tpos').textContent = step.intro || step.end ? 'Tutorial' : step.opener ? TOUR_PARTS[tour.part].name : `${TOUR_PARTS[tour.part].name} · ${counted.indexOf(step) + 1} / ${counted.length}`;
    c.querySelector('.ttext').textContent = tourText(step);
    const keys = Object.keys(TOUR_PARTS), next = step.end && tourNextPart();
    c.querySelector('.tnav').innerHTML = step.intro ? `<div class="chaps"><span class="lead">Parts:</span>${parts(keys)}</div><button class="iconbtn sm cta" data-tour="next">Start</button>`
      : step.end ? `<div class="chaps"><span class="lead">Parts:</span>${parts(keys)}</div><button class="iconbtn sm" data-tour="back">Back</button><button class="iconbtn sm${next ? '' : ' cta'}" data-tour="end">Done</button>${next ? `<button class="iconbtn sm cta" data-tour-part="${next}">Next: ${esc(TOUR_PARTS[next].name)}</button>` : ''}`
      : `<button class="iconbtn sm" data-tour="back">Back</button><button class="iconbtn sm cta" data-tour="next"${tourCanNext(step) ? '' : ' hidden'}>Next</button>`;
  }
  // the next part you have not done
  const tourNextPart = () => Object.keys(TOUR_PARTS).find(k => k !== tour.part && !tour.done.has(k));
  // while a phone's keyboard is up for a box on the page, the sheet folds to its buttons
  const tourMini = () => { const a = doc.activeElement; tourEl.querySelector('.tcard').classList.toggle('mini', !fine() && !!a && !!a.matches && a.matches('input,textarea') && !a.closest('#tour')); };
  // the keyboard stays where you can act: on the card, or in what a step lets you use; Tab past the ring comes back
  function tourFocus(e) {
    const t = e.target, step = tour && tourStep();
    if (!step || tour.busy || !t || !t.closest || t.closest('#tour')) return;
    if ((step.try || step.done) && tourTargets(step).some(el => el.contains(t))) return;
    const c = tourEl.querySelector('.tnav .cta:not([hidden])') || tourEl.querySelector('.tcard'); if (c) c.focus({ preventScroll: true });
  }
  // redraw on the next frame (or shortly, where frames are held back)
  const tourSoon = () => {
    if (!tour || tourRaf) return;
    const draw = () => { if (!tourRaf) return; cancelAnimationFrame(tourRaf); tourRaf = 0; tourDraw(); };
    tourRaf = requestAnimationFrame(draw); setTimeout(draw, 80);
  };
  // the dimmed page with a ring around what the step is about; clear blockers around the ring take the clicks meant for
  // the rest of the page (and one over the ring, unless you are meant to use it); the card goes beside the ring, never
  // over it, or is the sheet at the bottom of a narrow screen. Once you have done what a step asks, it moves on (a click)
  // or shows Next (after typing).
  function tourDraw() {
    if (!tour) return;
    const step = tourStep();
    if (!tour.busy && step.auto && !tour.wasDone && step.done(tour.mark)) { tourEnter(tour.i + 1, 1); return; }
    const tx = tourText(step), te = tourEl.querySelector('.ttext'); if (te.textContent !== tx) te.textContent = tx;
    const nx = tourEl.querySelector('.tnav [data-tour="next"]'); if (nx && !step.intro) nx.hidden = !tourCanNext(step);
    const r0 = tourRect(tourTargets(step)), w = doc.defaultView || window, vw = doc.documentElement.clientWidth, vh = w.innerHeight;
    const [t, b, l, rt, lid] = tourEl.querySelectorAll('.tb'), ring = tourEl.querySelector('.ring'), card = tourEl.querySelector('.tcard');
    const box = (el, x, y, bw, bh) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: Math.max(0, bw) + 'px', height: Math.max(0, bh) + 'px' });
    tourMini();
    if (!r0) { ring.className = 'ring none'; ring.removeAttribute('style'); box(t, 0, 0, vw, vh); for (const x of [b, l, rt, lid]) box(x, 0, 0, 0, 0); }
    else {
      const p = 6, r = { left: Math.max(0, r0.left - p), top: Math.max(0, r0.top - p), right: Math.min(vw, r0.right + p), bottom: Math.min(vh, r0.bottom + p) };
      ring.className = 'ring'; box(ring, r.left, r.top, r.right - r.left, r.bottom - r.top);
      box(t, 0, 0, vw, r.top); box(b, 0, r.bottom, vw, vh - r.bottom); box(l, 0, r.top, r.left, r.bottom - r.top); box(rt, r.right, r.top, vw - r.right, r.bottom - r.top);
      if (step.try || step.done) box(lid, 0, 0, 0, 0); else box(lid, r.left, r.top, r.right - r.left, r.bottom - r.top);
    }
    if (tourSheet()) { card.style.left = card.style.top = ''; return; }
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 12, g = 6 + m;
    const cx = v => Math.max(m, Math.min(v, vw - cw - m)), cy = v => Math.max(m, Math.min(v, vh - ch - m));
    let x, y;
    if (!r0) { x = (vw - cw) / 2; y = Math.max(m, (vh - ch) / 2); }
    else if (r0.bottom + g + ch <= vh - m) { x = cx(r0.left); y = r0.bottom + g; }
    else if (r0.top - g - ch >= m) { x = cx(r0.left); y = r0.top - g - ch; }
    else if (r0.right + g + cw <= vw - m) { x = r0.right + g; y = cy(r0.top); }
    else if (r0.left - g - cw >= m) { x = r0.left - g - cw; y = cy(r0.top); }
    else { x = vw - cw - m; y = vh - ch - m; }
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  function tourClick(e) {
    if (e.target.closest('.tcard')) e.stopPropagation();   // the card's clicks are the tutorial's: they do not close a picker you opened
    const bt = e.target.closest('button'); if (!bt || bt.disabled || bt.hidden) return;
    if (bt.dataset.tourPart) { tourPart(bt.dataset.tourPart); return; }
    const a = bt.dataset.tour;
    if (a === 'end') tourEnd(); else if (a === 'next') tourNext(); else if (a === 'back') tourBack();
  }
  function tourNext() {
    const step = tourStep();
    if (step.intro) { tourPart(tourNextPart() || 'basics'); return; }   // the first part you have not done
    if (step.end) { const nx = tourNextPart(); if (nx) tourPart(nx); else tourEnd(); return; }
    if (tourCanNext(step)) tourEnter(tour.i + 1, 1);   // a step you act on waits for you
  }
  function tourBack() {
    const step = tourStep();
    if (step.intro) return;
    tourEnter((step.end ? tourList().length : tour.i) - 1, -1);
  }
  // ahead of the app's own keys: Esc first does what it does where you are (puts a changed box back, clears the search box,
  // closes the add list or a picker) and with nothing left to undo closes the tutorial; → and Enter go on where Next is
  // there, ← goes back; letters do not jump into the search box
  function tourKey(e) {
    if (!tour) return;
    const t = e.target, inCard = !!(t && t.closest && t.closest('#tour')), typing = !!(t && t.matches && t.matches('input,select,textarea'));
    if (e.key === 'Escape') {
      if (popEl) { e.preventDefault(); e.stopPropagation(); closePop(); tourSoon(); return; }
      if (t === q && q.value) return;
      if (typing && t.matches('input.num') && t.dataset.orig !== undefined && t.value !== t.dataset.orig) return;
      if (t && t.id === 'addq' && $('#addhits .chip2')) return;
      if ($('#main .exp.minus.sure')) return;   // a − clicked once lets go
      e.preventDefault(); e.stopPropagation(); tourEnd(); return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && !inCard)) { e.preventDefault(); e.stopPropagation(); tourNext(); }   // Enter on the card's own buttons presses them
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tourBack(); }
    else if (e.key.length === 1) e.stopPropagation();
  }
  function tourEnd() {
    if (!tour) return;
    const from = tour.from, w = doc.defaultView || window;
    tour = null;
    if (tourRaf) cancelAnimationFrame(tourRaf); tourRaf = 0;
    tourObs.disconnect(); tourObs = null;
    w.removeEventListener('keydown', tourKey, true); w.removeEventListener('scroll', tourSoon, true); w.removeEventListener('resize', tourSoon);
    for (const ev of TOUR_EVENTS) doc.removeEventListener(ev, tourSoon);
    doc.removeEventListener('focusin', tourFocus);
    tourEl.remove(); tourEl = null; doc.body.classList.remove('touring');
    // your own factory and Defaults as they are saved now, then what this visit had, on the page you were on
    store.off = false;
    clearVisit();
    loadMem(store.get('mem', {}));
    Object.assign(S, fresh(), store.get('settings', {})); if (!['lane', 'belt', 's', 'min'].includes(S.rateUnit)) S.rateUnit = 'lane';
    putVisit(from.visit);
    if (location.hash !== from.hash) history.replaceState(null, '', from.hash || location.pathname + location.search);
    keepPlace = true;
    try { renderSettings(); render(); if (from.visit.q) { q.value = from.visit.q; if (from.visit.previewing) { selIdx = from.visit.selIdx; runSearch(); } } } finally { keepPlace = false; }   // a search you had opened stays opened, not a preview again
    w.scrollTo(0, from.y);
    if (fine()) q.focus();
  }
  document.getElementById('tourbtn').addEventListener('click', () => tourStart());

  // ---------- boot ----------
  // ledger entries saved before machines were pinned keep the machines they show today; rows an earlier version kept a
  // machine for after they were emptied go back to Defaults, like anything else not in your factory
  for (const [id, m] of Object.entries(chainMem)) if (saved(m)) pin(id);
  for (const m of [machineOf, recipeOf]) for (const id of Object.keys(m)) if (!saved(chainMem[id])) delete m[id];
  persist();
  // another tab of this page saved Defaults or your factory: take them up here and redraw in place, so this tab never
  // saves its older copy back over them
  window.addEventListener('storage', e => {
    if (tour) return;   // the tour's sample stays; its end takes up whatever was saved meanwhile
    if (e.key !== null && e.key !== 'fr:settings' && e.key !== 'fr:mem') return;   // null: that tab cleared everything
    let v; try { v = JSON.parse(e.newValue) || {}; } catch (err) { return; }   // taken out: a fresh start
    modelMemo = null;
    if (e.key !== 'fr:settings') loadMem(v);
    if (e.key !== 'fr:mem') { Object.assign(S, fresh(), v); if (!['lane', 'belt', 's', 'min'].includes(S.rateUnit)) S.rateUnit = 'lane'; }
    keepPlace = true; try { renderSettings(); render(); } finally { keepPlace = false; }
  });
  renderSettings();
  render();   // the root URL is always the home screen; a chain is only restored when its own #i/... address is opened
  if (fine()) { q.focus(); }
})();
