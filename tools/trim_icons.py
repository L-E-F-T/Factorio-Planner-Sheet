import json, os, sys
used = set(json.load(open(sys.argv[1])))
d = sys.argv[2]
n = 0
for f in os.listdir(d):
    if f.endswith('.png') and f not in used:
        os.remove(os.path.join(d, f)); n += 1
print('removed', n, 'unused icons; kept', len(os.listdir(d)))
