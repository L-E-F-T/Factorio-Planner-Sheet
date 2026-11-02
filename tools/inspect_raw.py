import json, sys, os
raw = sys.argv[1]
L = lambda n: json.load(open(os.path.join(raw, n)))
rec = L('recipe.json').get('recipe', {})
print('recipes:', len(rec))
cats = {}
for r in rec.values():
    c = r.get('category') or 'crafting'
    cats[c] = cats.get(c, 0) + 1
print('categories:', cats)
for n in ['engine-unit', 'copper-cable', 'advanced-oil-processing', 'kovarex-enrichment-process', 'uranium-processing',
          'rocket-part', 'steel-plate', 'iron-plate', 'solid-fuel-from-light-oil', 'heavy-oil-cracking', 'coal-liquefaction',
          'nuclear-fuel-reprocessing', 'space-science-pack', 'satellite', 'uranium-fuel-cell', 'military-science-pack',
          'concrete', 'rail', 'basic-oil-processing', 'sulfuric-acid', 'battery', 'landfill', 'wood-processing']:
    r = rec.get(n)
    print(n, '->', None if r is None else {k: r.get(k) for k in ('category', 'energy_required', 'ingredients', 'results', 'enabled', 'allow_productivity', 'main_product', 'hidden', 'subgroup', 'order')})
print('recipes with hidden or parameter:', [n for n, r in rec.items() if r.get('hidden') or r.get('parameter')])
print('recipes with expr fields:', [n for n, r in rec.items() if any(isinstance(v, dict) and '__expr' in v for v in r.values())][:20])
ent = L('entities.json')
print('entity types:', {t: len(v) for t, v in ent.items()})
for t, n in [('assembling-machine', 'assembling-machine-1'), ('assembling-machine', 'assembling-machine-2'), ('assembling-machine', 'assembling-machine-3'),
             ('furnace', 'stone-furnace'), ('furnace', 'steel-furnace'), ('furnace', 'electric-furnace'), ('assembling-machine', 'chemical-plant'),
             ('assembling-machine', 'oil-refinery'), ('assembling-machine', 'centrifuge'), ('rocket-silo', 'rocket-silo'), ('boiler', 'boiler'),
             ('generator', 'steam-engine'), ('generator', 'steam-turbine'), ('boiler', 'heat-exchanger'), ('reactor', 'nuclear-reactor'),
             ('solar-panel', 'solar-panel'), ('accumulator', 'accumulator'), ('lab', 'lab'), ('offshore-pump', 'offshore-pump'), ('pump', 'pump'),
             ('inserter', 'inserter'), ('inserter', 'burner-inserter'), ('inserter', 'long-handed-inserter'), ('inserter', 'fast-inserter'), ('inserter', 'bulk-inserter'),
             ('beacon', 'beacon'), ('radar', 'radar'), ('roboport', 'roboport'), ('storage-tank', 'storage-tank'), ('cargo-wagon', 'cargo-wagon'), ('fluid-wagon', 'fluid-wagon'),
             ('locomotive', 'locomotive'), ('electric-pole', 'small-electric-pole'), ('electric-pole', 'medium-electric-pole'), ('electric-pole', 'big-electric-pole'), ('electric-pole', 'substation'),
             ('container', 'iron-chest'), ('container', 'steel-chest'), ('container', 'wooden-chest'), ('pipe-to-ground', 'pipe-to-ground')]:
    e = ent.get(t, {}).get(n)
    if e is None:
        print('MISSING', t, n); continue
    keep = {k: v for k, v in e.items() if k in ('crafting_speed', 'crafting_categories', 'energy_usage', 'energy_consumption', 'energy_source', 'module_slots',
            'fluid_usage_per_tick', 'maximum_temperature', 'target_temperature', 'consumption', 'neighbour_bonus', 'production', 'researching_speed', 'pumping_speed',
            'rotation_speed', 'extension_speed', 'bulk', 'stack_size_bonus', 'distribution_effectivity', 'supply_area_distance', 'maximum_wire_distance',
            'inventory_size', 'max_underground_distance', 'effectivity', 'heat_buffer', 'max_power', 'burner', 'base_productivity', 'inputs', 'charging_energy',
            'energy_per_sector', 'max_payload_size', 'allowed_effects')}
    print(t, n, '->', keep)
md = L('mining-drill.json').get('mining-drill', {})
for n, e in md.items():
    print('drill', n, {k: e.get(k) for k in ('mining_speed', 'energy_usage', 'resource_categories', 'energy_source', 'resource_drain_rate_percent', 'base_productivity')})
tb = L('transport-belts.json')
for t in ('transport-belt', 'underground-belt'):
    for n, e in tb.get(t, {}).items():
        print(t, n, {k: e.get(k) for k in ('speed', 'max_distance')})
res = L('resources.json').get('resource', {})
for n, e in res.items():
    print('resource', n, {k: e.get(k) for k in ('minable', 'infinite', 'category')})
items = L('item.json')
print('item types:', {t: len(v) for t, v in items.items()})
for n in ['iron-plate', 'coal', 'wood', 'solid-fuel', 'rocket-fuel', 'nuclear-fuel', 'uranium-fuel-cell', 'rail', 'engine-unit', 'processing-unit', 'rocket-part', 'space-science-pack', 'satellite']:
    for t, d in items.items():
        if n in d:
            e = d[n]
            print('item', t, n, {k: e.get(k) for k in ('subgroup', 'order', 'stack_size', 'fuel_value', 'fuel_category', 'place_result', 'burnt_result', 'weight', 'rocket_launch_products')})
fl = L('fluid.json').get('fluid', {})
print('fluids:', {n: {k: e.get(k) for k in ('subgroup', 'order', 'default_temperature', 'max_temperature', 'heat_capacity', 'fuel_value')} for n, e in fl.items()})
tech = L('technology.json').get('technology', {})
for n in ['inserter-capacity-bonus-1', 'inserter-capacity-bonus-2', 'inserter-capacity-bonus-3', 'inserter-capacity-bonus-4', 'inserter-capacity-bonus-5', 'inserter-capacity-bonus-6', 'inserter-capacity-bonus-7',
          'mining-productivity-1', 'mining-productivity-2', 'mining-productivity-3', 'mining-productivity-4', 'research-speed-1', 'research-speed-6', 'space-science-pack', 'nuclear-power', 'advanced-oil-processing']:
    t = tech.get(n)
    print('tech', n, None if t is None else {k: t.get(k) for k in ('effects', 'unit', 'max_level')})
# recipes unlocked by base technologies
unlocked = set()
for t in tech.values():
    for ef in t.get('effects') or []:
        if isinstance(ef, dict) and ef.get('type') == 'unlock-recipe':
            unlocked.add(ef.get('recipe'))
enabled = {n for n, r in rec.items() if r.get('enabled', True)}
print('enabled at start:', len(enabled), 'unlocked by tech:', len(unlocked))
print('never available in base:', sorted(n for n in rec if n not in enabled and n not in unlocked))
