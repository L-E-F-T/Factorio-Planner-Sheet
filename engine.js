/* Factorio ratio engine. Pure functions over FD (data.js). No DOM here. */
const Engine = (() => {
  'use strict';

  // Items the chain stops at (shown as raw totals instead of expanded).
  const LEAVES = new Set(['iron-ore', 'copper-ore', 'coal', 'stone', 'uranium-ore', 'wood', 'raw-fish', 'water', 'steam',
    'crude-oil', 'petroleum-gas', 'light-oil', 'heavy-oil', 'uranium-235', 'uranium-238', 'depleted-uranium-fuel-cell']);
  // Default recipe when an item has several.
  const PREFERRED = { 'solid-fuel': 'solid-fuel-from-light-oil' };

  // Space science comes from a rocket launch (satellite + 100 rocket parts -> 1000 packs).
  FD.recipes['space-science-pack'] = { name: 'Rocket launch', cat: 'launch', time: 0, in: [['rocket-part', 100], ['satellite', 1]],
    out: [['space-science-pack', 1000]], main: 'space-science-pack', prod: false, icon: FD.items['space-science-pack'].icon, tech: null };

  const byProduct = {};
  for (const [rid, r] of Object.entries(FD.recipes)) {
    for (const [out] of r.out) {
      (byProduct[out] = byProduct[out] || []).push(rid);
    }
  }
  for (const [item, list] of Object.entries(byProduct)) {
    list.sort((a, b) => {
      const pa = PREFERRED[item] === a ? -2 : FD.recipes[a].main === item ? -1 : 0;
      const pb = PREFERRED[item] === b ? -2 : FD.recipes[b].main === item ? -1 : 0;
      return pa - pb || a.localeCompare(b);
    });
  }

  const TIERS = ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'];
  const FURNACES = ['stone-furnace', 'steel-furnace', 'electric-furnace'];

  const defaults = () => ({ tier: 2, furnace: 'steel-furnace', mp: 0, belt: 'transport-belt', drill: 'electric-mining-drill', labBonus: 0 });

  function machineFor(recipe, S) {
    const c = recipe.cat;
    if (c === 'crafting' || c === 'advanced-crafting') return TIERS[S.tier - 1];
    if (c === 'crafting-with-fluid') return TIERS[Math.max(S.tier, 2) - 1];
    if (c === 'smelting') return S.furnace;
    if (c === 'chemistry') return 'chemical-plant';
    if (c === 'oil-processing') return 'oil-refinery';
    if (c === 'centrifuging') return 'centrifuge';
    if (c === 'rocket-building') return 'rocket-silo';
    return null;
  }
  function machineOptions(recipe) {
    const c = recipe.cat;
    if (c === 'crafting' || c === 'advanced-crafting') return TIERS;
    if (c === 'crafting-with-fluid') return TIERS.slice(1);
    if (c === 'smelting') return FURNACES;
    const m = machineFor(recipe, defaults());
    return m ? [m] : [];
  }

  // items per second that one machine makes of `item` with this recipe
  function perMachine(recipe, machineId, item) {
    if (!machineId) return Infinity;
    const m = FD.machines[machineId];
    const out = recipe.out.find(o => o[0] === item);
    return (m.speed / recipe.time) * (out ? out[1] : 1);
  }
  // the drills that can mine a raw item: none for what is pumped or gathered, electric only where mining takes a fluid
  // (uranium ore); and items per second one of them mines
  const DRILLS = ['electric-mining-drill', 'burner-mining-drill'];
  function drillOptions(item) { const res = FD.resources[item]; return res && res.cat === 'basic-solid' ? (res.fluid ? DRILLS.slice(0, 1) : DRILLS) : []; }
  const perDrill = (item, drillId, S) => FD.machines[drillId].speed / FD.resources[item].time * (1 + S.mp / 100);

  /* Build a chain for making 1 unit/s of `item`. Every node carries k values per 1 unit/s of root output:
     kRate = units/s of this item needed, kMach = machines needed. A node can be made (or mined) on more than one machine:
     lines = [{ machine, share, per, kMach }], each making its share of the node (per: items/s one of them makes); machine
     is the first line's and kMach their sum. */
  function build(item, S, overrides, opts) {
    overrides = overrides || {};
    opts = opts || {};
    // A node's lines: those picked on this page win (overrides['l:' + path]: [{ machine, share }]), then what your factory
    // makes the item with (S.lines(item), on the pages: the ledger's lines that make it, on this recipe, so two tiers stay
    // two; S.machineOf for the ledger's own rows), then the default. dflt: the default made it.
    function lineUp(itemId, path, rid, options, made, def) {
      const ok = l => options.includes(l.machine);
      let ls = (overrides['l:' + path] || []).filter(ok), dflt = false;
      if (!ls.length && made) ls = made.filter(l => (l.recipe || rid) === rid && ok(l)).map(l => ({ machine: l.machine, share: l.scale }));
      if (!ls.length && !made && S.machineOf && options.includes(S.machineOf[itemId])) ls = [{ machine: S.machineOf[itemId], share: 1 }];
      if (!ls.length && def) { ls = [{ machine: def, share: 1 }]; dflt = true; }
      const tot = ls.reduce((a, l) => a + Math.max(0, l.share), 0);   // a line just added makes nothing yet
      return { dflt, lines: ls.map((l, i) => ({ machine: l.machine, share: tot > 0 ? Math.max(0, l.share) / tot : i ? 0 : 1 })) };
    }
    function node(itemId, kRate, path, ancestors) {
      const n = { item: itemId, path, kRate, children: [], leaf: true, recipe: null, machine: null, kMach: 0 };
      const choices = byProduct[itemId] || [];
      const forceLeaf = LEAVES.has(itemId) && !(opts.expandLeaf && opts.expandLeaf.has(path));
      const made = S.lines ? S.lines(itemId) : null;
      if (!choices.length || forceLeaf || ancestors.has(itemId)) {   // mined, pumped or gathered: an ore's drills
        const drills = drillOptions(itemId);
        if (drills.length) {
          n.machineChoices = drills;
          n.lines = lineUp(itemId, path, null, drills, made, drills.includes(S.drill) ? S.drill : drills[0]).lines
            .map(l => { const per = perDrill(itemId, l.machine, S); return Object.assign(l, { per, kMach: kRate * l.share / per }); });
        }
        return n;
      }
      // the recipe: one picked on this page, then the one your factory makes it with (its first line's), then the default
      const pickR = made ? made.length && made[0].recipe : S.recipeOf && S.recipeOf[itemId];
      const rid = overrides['r:' + path] && choices.includes(overrides['r:' + path]) ? overrides['r:' + path] : pickR && choices.includes(pickR) ? pickR : choices[0];
      const r = FD.recipes[rid], options = machineOptions(r);
      const { lines, dflt } = lineUp(itemId, path, rid, options, made, machineFor(r, S));
      n.leaf = false;
      n.recipe = rid;
      n.recipeChoices = choices;
      n.machineChoices = options;
      n.lines = lines.map(l => { const per = perMachine(r, l.machine, itemId); return Object.assign(l, { per, kMach: kRate * l.share / per }); });
      n.machine = lines.length ? lines[0].machine : null;
      n.fluidBump = r.cat === 'crafting-with-fluid' && S.tier === 1 && dflt;
      const outAmt = r.out.find(o => o[0] === itemId)[1];
      const kCrafts = kRate / outAmt;              // crafts per second per 1 root unit/s
      n.kCrafts = kCrafts;
      n.perMach = perMachine(r, n.machine, itemId);   // items/s per machine (the first line's)
      n.kMach = n.lines.reduce((a, l) => a + l.kMach, 0);
      n.byproducts = r.out.filter(o => o[0] !== itemId).map(([id, a]) => ({ item: id, kRate: kCrafts * a }));
      const anc = new Set(ancestors); anc.add(itemId);
      for (const [ing, amt] of r.in) {
        n.children.push(node(ing, kCrafts * amt, path + '>' + ing, anc));
      }
      return n;
    }
    return node(item, 1, item, new Set());
  }

  function walk(n, fn, depth) {
    fn(n, depth || 0);
    for (const c of n.children) walk(c, fn, (depth || 0) + 1);
  }

  /* Aggregate a tree into totals per item (machines) and raw inputs. All values per 1 root unit/s. */
  function totals(root, S) {
    const made = {};   // item -> {kRate, machines: {id: kMach}, recipes: Set}
    const raw = {};    // item -> kRate
    const by = {};     // byproducts item -> kRate
    walk(root, n => {
      if (n.leaf) {
        raw[n.item] = (raw[n.item] || 0) + n.kRate;
        return;
      }
      const t = made[n.item] || (made[n.item] = { kRate: 0, machines: {}, recipes: new Set() });
      t.kRate += n.kRate;
      t.recipes.add(n.recipe);
      if (n.machine) t.machines[n.machine] = (t.machines[n.machine] || 0) + n.kMach;
      for (const b of n.byproducts) by[b.item] = (by[b.item] || 0) + b.kRate;
    });
    // power draw (kW per 1 root unit/s) and burner fuel (MW)
    let kw = 0, burnerKw = 0;
    for (const t of Object.values(made)) {
      for (const [mid, k] of Object.entries(t.machines)) {
        const m = FD.machines[mid];
        if (m.burner) burnerKw += k * m.kw; else kw += k * (m.kw + m.drain);
      }
    }
    const rawInfo = rawConversions(raw, S);
    kw += rawInfo.kw; burnerKw += rawInfo.burnerKw;
    return { made, raw, rawInfo, byproducts: by, kw, burnerKw };
  }

  /* How to supply raw inputs: drills, pumps, refineries. Per 1 root unit/s. */
  function rawConversions(raw, S) {
    const out = { rows: [], kw: 0, burnerKw: 0, oil: null };
    const mp = 1 + S.mp / 100;
    for (const [item, kRate] of Object.entries(raw)) {
      const res = FD.resources[item];
      const row = { item, kRate, machines: [] };
      if (res && res.cat === 'basic-solid') {
        // the drill chosen for this ore in your factory, else Your base's (ores that need a fluid only take electric drills)
        const pick = S.machineOf && S.machineOf[item], drillId = res.fluid ? 'electric-mining-drill' : pick && FD.machines[pick] ? pick : S.drill;
        const drill = FD.machines[drillId];
        const perDrill = drill.speed / res.time * mp;
        const k = kRate / perDrill;
        row.machines.push({ id: drillId, k });
        if (drill.burner) out.burnerKw += k * drill.kw; else out.kw += k * drill.kw;
        if (res.fluid) row.fluid = { item: res.fluid[0], kRate: kRate / mp * res.fluid[1] };
      } else if (item === 'crude-oil') {
        const yld = S.jackYield || 1, perJack = FD.resources['crude-oil'].amount * mp * yld;   // at your pumpjacks' yield
        row.machines.push({ id: 'pumpjack', k: kRate / perJack, note: `at ${Math.round(yld * 100)}% yield` });
        out.kw += kRate / perJack * FD.machines.pumpjack.kw;
      } else if (item === 'water') {
        row.machines.push({ id: 'offshore-pump', k: kRate / FD.power.offshore_pump.per_s });
      } else if (item === 'steam') {
        row.machines.push({ id: 'boiler', k: kRate / FD.power.boiler.steam_per_s, note: '165°C' });
      }
      out.rows.push(row);
    }
    const P = raw['petroleum-gas'] || 0, Lt = raw['light-oil'] || 0, H = raw['heavy-oil'] || 0;
    if (P + Lt + H > 0) out.oil = oilBlock(P, Lt, H, S);
    return out;
  }

  /* Advanced oil processing + cracking to meet demands (per second). Returns machine counts per 1 root unit/s.
     Refinery cycle (5 s): 100 crude + 50 water -> 25 heavy, 45 light, 55 petroleum.
     Heavy cracking (2 s): 40 heavy + 30 water -> 30 light.  Light cracking (2 s): 30 light + 30 water -> 20 petroleum. */
  // one machine running a recipe flat out, per second, from the game's recipe: what it makes minus what it takes of each
  // oil (h, l, p), and what else it takes (crude oil, water, coal, steam)
  function oilRecipeRates(rid, machine) {
    const r = FD.recipes[rid], sp = (FD.machines[machine] || {}).speed || 1;
    const per = (side, item) => { const x = r ? r[side].find(([i]) => i === item) : null; return x ? x[1] / r.time * sp : 0; };
    const net = item => per('out', item) - per('in', item);
    return { h: net('heavy-oil'), l: net('light-oil'), p: net('petroleum-gas'), crude: per('in', 'crude-oil'), water: per('in', 'water'), coal: per('in', 'coal'), steam: per('in', 'steam') };
  }
  // refineries on a recipe (advanced oil processing unless told: coal liquefaction works the same way) plus cracking
  function oilBlock(P, L, H, S, rid) {
    // per-second production of one machine
    const r = oilRecipeRates(rid || 'advanced-oil-processing', 'oil-refinery');
    const hcR = oilRecipeRates('heavy-oil-cracking', 'chemical-plant'), lcR = oilRecipeRates('light-oil-cracking', 'chemical-plant');
    const hc = { in: -hcR.h, out: hcR.l, water: hcR.water };
    const lc = { in: -lcR.l, out: lcR.p, water: lcR.water };
    // Solve for refineries R, heavy crackers Hc, light crackers Lc (all >= 0) meeting demand exactly where possible.
    // Equations: r.h R - hc.in Hc = H ; r.l R + hc.out Hc - lc.in Lc = L ; r.p R + lc.out Lc = P
    // Try full solve first.
    let best = null;
    const tryCase = (useHc, useLc) => {
      // unknowns: R, Hc (if useHc), Lc (if useLc). Solve least-constrained: choose R as smallest satisfying all demands.
      // Express Hc, Lc as functions of R then check feasibility.
      // From heavy: Hc = (r.h R - H) / hc.in  (if useHc) else Hc=0 requires r.h R >= H
      // From petroleum: Lc = (P - r.p R) / lc.out (if useLc) else Lc=0 requires r.p R >= P
      // Light: r.l R + hc.out Hc - lc.in Lc >= L (surplus allowed when Lc=0; exact if useLc... treat as >= and minimize R)
      // Minimise R subject to Hc>=0, Lc>=0, light >= L. Scan R analytically via candidates.
      const f = R => {
        const Hc = useHc ? (r.h * R - H) / hc.in : 0;
        const Lc = useLc ? (P - r.p * R) / lc.out : 0;
        const light = r.l * R + hc.out * Hc - lc.in * Lc;
        const heavyOk = useHc ? Hc >= -1e-9 : r.h * R >= H - 1e-9;
        const petOk = useLc ? Lc >= -1e-9 : r.p * R >= P - 1e-9;
        return { R, Hc, Lc, light, ok: heavyOk && petOk && light >= L - 1e-9 };
      };
      // candidate R values: where each constraint becomes tight
      const cands = [H / r.h, P / r.p];
      if (useHc && useLc) {
        // light exact: r.l R + hc.out (r.h R - H)/hc.in - lc.in (P - r.p R)/lc.out = L
        const a = r.l + hc.out * r.h / hc.in + lc.in * r.p / lc.out;
        const b = L + hc.out * H / hc.in + lc.in * P / lc.out;
        cands.push(b / a);
      } else if (useHc) {
        const a = r.l + hc.out * r.h / hc.in; const b = L + hc.out * H / hc.in; cands.push(b / a);
      } else if (useLc) {
        const a = r.l + lc.in * r.p / lc.out; const b = L + lc.in * P / lc.out; cands.push(b / a);
      } else {
        cands.push(L / r.l);
      }
      let res = null;
      for (const R of cands) {
        if (!(R >= 0)) continue;
        const s = f(R);
        if (s.ok && (!res || s.R < res.R - 1e-12)) res = s;
      }
      return res;
    };
    for (const [uh, ul] of [[true, true], [true, false], [false, true], [false, false]]) {
      const s = tryCase(uh, ul);
      if (s && (!best || s.R < best.R - 1e-9)) best = s;
    }
    const R = best.R;
    let Hc = Math.max(0, best.Hc), Lc = Math.max(0, best.Lc);
    const surplus = { heavy: r.h * R - hc.in * Hc - H, light: best.light - L, petroleum: r.p * R + lc.out * Lc - P };
    // oil nothing uses is cracked as far as it goes, heavy into light and light into petroleum gas, as players do: so
    // only petroleum gas is ever left over (a refinery stops once any of its oils has nowhere to go)
    if (surplus.heavy > 1e-9) { const x = surplus.heavy / hc.in; Hc += x; surplus.light += x * hc.out; surplus.heavy = 0; }
    if (surplus.light > 1e-9) { const y = surplus.light / lc.in; Lc += y; surplus.petroleum += y * lc.out; surplus.light = 0; }
    const crude = R * r.crude, water = R * r.water + Hc * hc.water + Lc * lc.water, coal = R * r.coal, steam = R * r.steam;
    const mp = 1 + S.mp / 100;
    const kw = R * FD.machines['oil-refinery'].kw + (Hc + Lc) * FD.machines['chemical-plant'].kw;
    return { refineries: R, heavyCrackers: Hc, lightCrackers: Lc, crude, water, coal, steam, pumpjacks: crude / (FD.resources['crude-oil'].amount * mp * (S.jackYield || 1)), surplus, kw,
      basic: { refineries: P / (45 / 5), crude: P / (45 / 5) * 20, note: L + H > 0 ? 'basic oil makes petroleum gas only' : '' } };
  }

  /* Classic integer ratio among a set of k values. Returns {mult, values[]} with values near-integers when found. */
  function niceRatio(ks, maxMult) {
    const min = Math.min(...ks.filter(k => k > 0));
    const base = ks.map(k => k / min);
    for (let m = 1; m <= (maxMult || 60); m++) {
      const sc = base.map(v => v * m);
      if (sc.every(v => Math.abs(v - Math.round(v)) < 0.02)) return { exact: true, values: sc.map(v => Math.round(v)) };
    }
    return { exact: false, values: base };
  }

  // Belt helpers
  const beltRate = S => FD.belts[S.belt].per_s;

  // Inserter helper: which inserter keeps up with r items/s (machine to machine), given capacity bonus level.
  function inserterFor(rate, capLevel) {
    const caps = FD.tech.inserter_capacity;
    let reg = 1, bulk = FD.tech.bulk_base;
    for (const c of caps) if (c.level <= capLevel) { reg += c.reg; bulk += c.bulk; }
    const order = ['inserter', 'long-handed-inserter', 'fast-inserter'];
    for (const id of order) {
      const ips = FD.inserters[id].swings_per_s * reg;
      if (ips >= rate - 1e-9) return { id, hand: reg, count: 1, ips };
    }
    const bips = FD.inserters['bulk-inserter'].swings_per_s * bulk;
    return { id: 'bulk-inserter', hand: bulk, count: Math.ceil(rate / bips - 1e-9), ips: bips };
  }

  /* ---------- Power cards (linked quantities, k per 1 unit of the card's base) ---------- */
  function steamCard(S) {
    const b = FD.power.boiler, e = FD.power.steam_engine;
    const mp = 1 + S.mp / 100;
    const coalPerBoiler = b.kw / (FD.items.coal.fuel * 1000);
    const enginesPerBoiler = b.steam_per_s / e.steam_per_s;
    return [
      { id: 'boiler', k: 1 },
      { id: 'steam-engine', k: enginesPerBoiler },
      { id: 'offshore-pump', k: b.water_per_s / FD.power.offshore_pump.per_s },
      { label: 'MW', k: enginesPerBoiler * e.kw / 1000, unit: 'MW' },
      { id: 'coal', k: coalPerBoiler, unit: '/s', label: 'coal/s' },
      { id: 'electric-mining-drill', k: coalPerBoiler / (FD.machines['electric-mining-drill'].speed * mp), label: 'drills on coal' },
      { id: 'solid-fuel', k: b.kw / (FD.items['solid-fuel'].fuel * 1000), unit: '/s', label: 'solid fuel/s' },
      { id: 'wood', k: b.kw / (FD.items.wood.fuel * 1000), unit: '/s', label: 'wood/s' },
    ];
  }
  function solarCard() {
    const s = FD.power.solar;
    return [
      { id: 'solar-panel', k: 1 },
      { id: 'accumulator', k: s.accumulators_per_panel },
      { label: 'MW average', k: s.avg_kw / 1000, unit: 'MW' },
      { label: 'MW peak (noon)', k: s.peak_kw / 1000, unit: 'MW' },
    ];
  }
  function nuclearLayout(rows, cols) {
    let mw = 0;
    const base = FD.power.reactor.kw / 1000, bonus = FD.power.reactor.neighbour_bonus;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let nb = 0;
      if (r > 0) nb++; if (r < rows - 1) nb++; if (c > 0) nb++; if (c < cols - 1) nb++;
      mw += base * (1 + bonus * nb);
    }
    const hx = FD.power.heat_exchanger, t = FD.power.steam_turbine;
    const exch = mw * 1000 / hx.kw;
    const steam = exch * hx.steam_per_s;
    return { reactors: rows * cols, mw, exchangers: exch, turbines: steam / t.steam_per_s, water: exch * hx.water_per_s,
      pumps: exch * hx.water_per_s / FD.power.offshore_pump.per_s, cellsPerMin: rows * cols * 60 / (FD.power.fuel_cell_mj * 1000 / FD.power.reactor.kw) };
  }
  function miningCard(S) {
    const mp = 1 + S.mp / 100;
    const d = FD.machines[S.drill];
    const ore = d.speed * mp;
    const plate = f => FD.machines[f].speed / FD.recipes['iron-plate'].time;
    return [
      { id: S.drill, k: 1 },
      { id: 'stone-furnace', k: ore / plate('stone-furnace') },
      { id: 'steel-furnace', k: ore / plate('steel-furnace'), label: 'steel / electric furnaces' },
      { id: 'iron-ore', k: ore, unit: '/s', label: 'ore/s' },
      { id: S.belt, k: ore / beltRate(S), label: 'belts' },
    ];
  }

  return { LEAVES, byProduct, defaults, machineFor, machineOptions, perMachine, build, walk, totals, oilBlock, oilRecipeRates, niceRatio,
    beltRate, inserterFor, steamCard, solarCard, nuclearLayout, miningCard, TIERS, FURNACES };
})();
