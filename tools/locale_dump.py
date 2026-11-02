import sys, json
want = {'item-name', 'fluid-name', 'entity-name', 'recipe-name', 'equipment-name', 'technology-name', 'item-group-name'}
out = {}
sec = None
for line in open(sys.argv[1], encoding='utf-8'):
    line = line.rstrip('\n')
    if line.startswith('['):
        sec = line.strip('[]')
        continue
    if sec in want and '=' in line and not line.startswith('#') and not line.startswith(';'):
        k, v = line.split('=', 1)
        out.setdefault(sec, {})[k] = v
json.dump(out, open(sys.argv[2], 'w'), indent=0, ensure_ascii=False)
print({k: len(v) for k, v in out.items()})
