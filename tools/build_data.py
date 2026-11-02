"""Turn the raw Lua dumps in tools/raw into ../data.js for the app.
Usage: build_data.py <raw dir> <icons dir> <out data.js>"""
import json, os, re, sys

raw, icons_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
L = lambda n: json.load(open(os.path.join(raw, n), encoding='utf-8'))
items_raw = L('item.json')
fluids_raw = L('fluid.json')['fluid']
recipes_raw = L('recipe.json')['recipe']
groups_raw = L('item-groups.json')
tech_raw = L('technology.json')['technology']
ent_raw = L('entities.json')
drills_raw = L('mining-drill.json')['mining-drill']
belts_raw = L('transport-belts.json')
res_raw = L('resources.json')['resource']
loc = L('locale.json')
icon_files = set(os.listdir(icons_dir))


def energy(s):
    """'1.8MW' -> kW"""
    if s is None:
        return None
    m = re.fullmatch(r'([\d.]+)\s*([kMGT]?)([WJ])', str(s))
    v = float(m.group(1))
    mult = {'': 1e-3, 'k': 1, 'M': 1e3, 'G': 1e6, 'T': 1e9}[m.group(2)]
    return v * mult  # kW or kJ


def icon_for(name, icon_field=None):
    cands = []
    if isinstance(icon_field, str):
        cands.append(icon_field.split('/')[-1])
    cands.append(name + '.png')
    for c in cands:
        if c in icon_files:
            return c
    return None


def loc_name(name, *sections):
    for s in sections:
        v = loc.get(s, {}).get(name)
        if v:
            return v
    return name.replace('-', ' ').capitalize()


# ---------- item groups / subgroups for ordering ----------
group_order = {n: g.get('order', 'z') for n, g in groups_raw.get('item-group', {}).items()}
subgroups = {n: (sg.get('group'), sg.get('order', 'z')) for n, sg in groups_raw.get('item-subgroup', {}).items()}


def sort_key(subgroup, order):
    g, so = subgroups.get(subgroup, ('zz', 'z'))
    return (group_order.get(g, 'z'), g, so, subgroup, order or 'z')


# ---------- items ----------
items = {}
for itype, d in items_raw.items():
    for name, e in d.items():
        if e.get('hidden') or e.get('parameter'):
            continue
        ic = icon_for(name, e.get('icon'))
        items[name] = {
            'name': loc_name(name, 'item-name', 'entity-name', 'equipment-name'),
            'group': subgroups.get(e.get('subgroup'), ('other',))[0] or 'other',
            'subgroup': e.get('subgroup') or 'other',
            'order': e.get('order') or '',
            'stack': e.get('stack_size'),
            'fuel': energy(e.get('fuel_value')) / 1000 if e.get('fuel_value') else None,  # MJ
            'icon': ic,
            'type': 'item',
        }
for name, e in fluids_raw.items():
    items[name] = {
        'name': loc_name(name, 'fluid-name'),
        'group': 'fluids', 'subgroup': 'fluid', 'order': e.get('order') or '',
        'stack': None, 'fuel': None, 'icon': icon_for(name, e.get('icon')), 'type': 'fluid',
    }
# fluid group order after intermediates
group_order['fluids'] = 'c2'
subgroups['fluid'] = ('fluids', 'a')

# ---------- recipes ----------
unlocked_by = {}
for tname, t in tech_raw.items():
    for ef in t.get('effects') or []:
        if isinstance(ef, dict) and ef.get('type') == 'unlock-recipe':
            unlocked_by.setdefault(ef['recipe'], []).append(tname)

recipes = {}
for name, r in recipes_raw.items():
    if r.get('hidden') or r.get('parameter'):
        continue
    enabled = r.get('enabled', True)
    if enabled is None:
        enabled = True
    if not enabled and name not in unlocked_by:
        continue
    cats = r.get('categories') or ([r['category']] if r.get('category') else ['crafting'])
    if isinstance(cats, str):
        cats = [cats]
    ins = []
    for i in r.get('ingredients') or []:
        ins.append([i['name'], i.get('amount', 1)])
    outs = []
    for o in r.get('results') or []:
        amt = o.get('amount')
        if amt is None:
            amt = (o.get('amount_min', 0) + o.get('amount_max', 0)) / 2
        prob = o.get('probability', 1)
        sp = o.get('shared_probability')
        if isinstance(sp, dict):
            prob = sp['max'] - sp['min']
        outs.append([o['name'], amt * prob])
    main = r.get('main_product')
    if not main:
        main = outs[0][0] if len(outs) == 1 else None
    t = r.get('energy_required')
    if t is None:
        t = 0.5
    recipes[name] = {
        'name': loc_name(name, 'recipe-name') if name not in items else items[name]['name'],
        'cat': cats[0],
        'time': t,
        'in': ins,
        'out': outs,
        'main': main,
        'prod': bool(r.get('allow_productivity')),
        'icon': icon_for(name, r.get('icon')) or (items.get(main, {}).get('icon') if main else None) or (items.get(outs[0][0], {}).get('icon') if outs else None),
        'tech': unlocked_by.get(name, [None])[0] if not enabled else None,
        'subgroup': r.get('subgroup'),
        'order': r.get('order'),
    }

# ---------- machines ----------
def ent(t, n):
    return ent_raw.get(t, {}).get(n) or {}


def crafter(t, n, extra=None):
    e = ent(t, n)
    kw = energy(e.get('energy_usage'))
    src = e.get('energy_source') or {}
    drain = energy(src.get('drain')) if src.get('drain') else (kw / 30 if kw and src.get('type') == 'electric' else 0)
    m = {
        'name': loc_name(n, 'entity-name'),
        'speed': e.get('crafting_speed', 1),
        'cats': e.get('crafting_categories', []),
        'kw': kw, 'drain': drain,
        'burner': src.get('type') == 'burner',
        'slots': e.get('module_slots', 0),
        'icon': icon_for(n, e.get('icon')),
    }
    if extra:
        m.update(extra)
    return m


machines = {}
for n in ['assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'chemical-plant', 'oil-refinery', 'centrifuge']:
    machines[n] = crafter('assembling-machine', n)
for n in ['stone-furnace', 'steel-furnace', 'electric-furnace']:
    machines[n] = crafter('furnace', n)
machines['rocket-silo'] = crafter('rocket-silo', 'rocket-silo')
for n, e in drills_raw.items():
    src = e.get('energy_source') or {}
    kw = energy(e.get('energy_usage'))
    machines[n] = {
        'name': loc_name(n, 'entity-name'), 'speed': e.get('mining_speed', 1), 'cats': ['mining:' + c for c in e.get('resource_categories', [])],
        'kw': kw, 'drain': 0, 'burner': src.get('type') == 'burner', 'slots': e.get('module_slots', 0), 'icon': icon_for(n, e.get('icon')),
    }
lab = ent('lab', 'lab')
machines['lab'] = {'name': loc_name('lab', 'entity-name'), 'speed': lab.get('researching_speed', 1), 'cats': ['research'], 'kw': energy(lab.get('energy_usage')), 'drain': 0, 'burner': False, 'slots': lab.get('module_slots', 0), 'icon': 'lab.png'}

# ---------- power & misc constants ----------
boiler = ent('boiler', 'boiler')
hx = ent('boiler', 'heat-exchanger')
eng = ent('generator', 'steam-engine')
turb = ent('generator', 'steam-turbine')
reactor = ent('reactor', 'nuclear-reactor')
steam_cap = energy(fluids_raw['steam'].get('heat_capacity'))  # kJ per unit per degree
water_cap = energy(fluids_raw['water'].get('heat_capacity'))
water_t = fluids_raw['water'].get('default_temperature', 15)


def gen(e):
    per_s = e['fluid_usage_per_tick'] * 60
    kw = per_s * steam_cap * (e['maximum_temperature'] - water_t) * e.get('effectivity', 1)
    return {'steam_per_s': per_s, 'kw': kw, 'temp': e['maximum_temperature']}


def boil(e):
    # Energy balance: water is heated using water's heat capacity, steam carries energy by steam's heat capacity,
    # so 1 water becomes 10 steam (2 kJ vs 0.2 kJ per degree). Boiler: 6 water/s -> 60 steam/s at 165 C.
    kw = energy(e['energy_consumption'])
    dt = e['target_temperature'] - water_t
    return {'kw': kw, 'steam_per_s': kw / (steam_cap * dt), 'water_per_s': kw / (water_cap * dt), 'temp': e['target_temperature']}


power = {
    'boiler': boil(boiler), 'heat_exchanger': boil(hx),
    'steam_engine': gen(eng), 'steam_turbine': gen(turb),
    'reactor': {'kw': energy(reactor.get('consumption')), 'neighbour_bonus': reactor.get('neighbour_bonus', 1)},
    'solar': {'peak_kw': energy(ent('solar-panel', 'solar-panel').get('production')), 'avg_kw': 42, 'accumulators_per_panel': 0.847},
    'accumulator': {'mj': energy((ent('accumulator', 'accumulator').get('energy_source') or {}).get('buffer_capacity')) / 1000, 'kw': energy((ent('accumulator', 'accumulator').get('energy_source') or {}).get('output_flow_limit'))},
    'offshore_pump': {'per_s': ent('offshore-pump', 'offshore-pump').get('pumping_speed', 20) * 60},
    'pump': {'per_s': ent('pump', 'pump').get('pumping_speed', 20) * 60},
    'fuel_cell_mj': items['uranium-fuel-cell']['fuel'],
}

inserters = {}
for n in ['burner-inserter', 'inserter', 'long-handed-inserter', 'fast-inserter', 'bulk-inserter']:
    e = ent('inserter', n)
    import math
    half = math.ceil(0.5 / e['rotation_speed'])
    inserters[n] = {'name': loc_name(n, 'entity-name'), 'rot': e['rotation_speed'], 'ticks': 2 * half, 'swings_per_s': 60 / (2 * half), 'bulk': bool(e.get('bulk')), 'icon': icon_for(n)}

belts = {}
for n, e in belts_raw['transport-belt'].items():
    belts[n] = {'name': loc_name(n, 'entity-name'), 'per_s': round(e['speed'] * 60 * 8, 4), 'icon': icon_for(n)}
undergrounds = {n: {'name': loc_name(n, 'entity-name'), 'gap': e['max_distance'] - 1, 'icon': icon_for(n)} for n, e in belts_raw['underground-belt'].items()}

resources = {}
for n in ['iron-ore', 'copper-ore', 'coal', 'stone']:
    resources[n] = {'time': 1, 'cat': 'basic-solid', 'fluid': None}
u = res_raw['uranium-ore']['minable']
resources['uranium-ore'] = {'time': u['mining_time'], 'cat': 'basic-solid', 'fluid': [u['required_fluid'], u['fluid_amount'] / 10]}
resources['crude-oil'] = {'time': 1, 'cat': 'basic-fluid', 'fluid': None, 'amount': 10}

tech = {
    'inserter_capacity': [],
    'mining_productivity_per_level': 0.1,
}
for i in range(1, 8):
    t = tech_raw['inserter-capacity-bonus-%d' % i]
    reg = sum(ef.get('modifier', 0) for ef in t['effects'] if ef.get('type') == 'inserter-stack-size-bonus')
    bulk = sum(ef.get('modifier', 0) for ef in t['effects'] if ef.get('type') == 'bulk-inserter-capacity-bonus')
    tech['inserter_capacity'].append({'level': i, 'reg': reg, 'bulk': bulk})
bulk_base = 1 + sum(ef.get('modifier', 0) for ef in tech_raw['bulk-inserter']['effects'] if ef.get('type') == 'bulk-inserter-capacity-bonus')
tech['bulk_base'] = bulk_base
tech['lab_speed'] = [sum(ef.get('modifier', 0) for ef in tech_raw['research-speed-%d' % i]['effects']) for i in range(1, 7)]

# poles / storage reference
poles = {}
for n in ['small-electric-pole', 'medium-electric-pole', 'big-electric-pole', 'substation']:
    e = ent('electric-pole', n)
    poles[n] = {'name': loc_name(n, 'entity-name'), 'wire': e.get('maximum_wire_distance'), 'area': e.get('supply_area_distance', 0) * 2, 'icon': icon_for(n)}
chests = {n: {'name': loc_name(n, 'entity-name'), 'slots': ent('container', n).get('inventory_size'), 'icon': icon_for(n)} for n in ['wooden-chest', 'iron-chest', 'steel-chest']}

data = {
    'version': '2.1.23',
    'items': items, 'recipes': recipes, 'machines': machines, 'power': power, 'inserters': inserters,
    'belts': belts, 'undergrounds': undergrounds, 'resources': resources, 'tech': tech, 'poles': poles, 'chests': chests,
    'groupOrder': group_order, 'subgroups': {k: list(v) for k, v in subgroups.items()},
    'techNames': {k: v for k, v in loc.get('technology-name', {}).items()},
}
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Generated by tools/build_data.py from Factorio ' + data['version'] + ' base-game prototypes. Do not edit by hand.\n')
    f.write('const FD = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')

# ---------- report ----------
missing_icons = [n for n, it in items.items() if not it['icon']]
print('items:', len(items), 'recipes:', len(recipes), 'machines:', len(machines))
print('items without icon:', missing_icons)
print('recipes without icon:', [n for n, r in recipes.items() if not r['icon']])
used = set()
for coll in (items, recipes, machines, inserters, belts, undergrounds, poles, chests):
    for v in coll.values():
        if v.get('icon'):
            used.add(v['icon'])
print('icon files used:', len(used), 'of', len(icon_files))
json.dump(sorted(used), open(os.path.join(raw, 'used_icons.json'), 'w'))
print('power:', json.dumps(power))
print('inserters:', json.dumps(inserters))
print('belts:', json.dumps(belts), json.dumps(undergrounds))
print('tech:', json.dumps(tech))
print('machines:', json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'icon'} for k, v in machines.items()}))
multi = {}
for n, r in recipes.items():
    for o, a in r['out']:
        multi.setdefault(o, []).append(n)
print('items with several recipes:', {k: v for k, v in multi.items() if len(v) > 1})
print('recipe cats:', sorted(set(r['cat'] for r in recipes.values())))
print('items made by no recipe:', sorted(n for n in items if n not in multi))
