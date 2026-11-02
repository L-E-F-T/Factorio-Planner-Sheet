"""Dump every data:extend prototype in a Factorio Lua file to JSON (no Lua interpreter needed).
Usage: lua_dump.py <in.lua> <out.json>
Scalar fields are kept; table fields are kept only when whitelisted (graphics/sounds dropped)."""
import re, json, sys, traceback

KEEP_TABLES = {'ingredients', 'results', 'crafting_categories', 'allowed_effects', 'energy_source', 'minable',
               'resource_categories', 'heat_buffer', 'inputs', 'fuel_categories', 'burner', 'effect',
               'module_specification', 'effects', 'localised_name', 'surface_conditions', 'categories', 'prerequisites', 'unit'}
BINOPS = re.compile(r'\.\.|==|~=|<=|>=|[-+*/%^<>]|\band\b|\bor\b')
IDENT = re.compile(r'[A-Za-z_]\w*')


class P:
    def __init__(s, t):
        s.t = t
        s.i = 0
        s.n = len(t)

    def ws(s):
        while s.i < s.n:
            m = re.match(r'\s+|--\[(=*)\[.*?\]\1\]|--[^\n]*', s.t[s.i:], re.S)
            if not m:
                return
            s.i += m.end()

    def ch(s):
        return s.t[s.i] if s.i < s.n else ''

    def balanced(s, open_, close):
        d = 0
        start = s.i
        while s.i < s.n:
            c = s.t[s.i]
            if c in '"\'':
                s.string()
                continue
            if c == open_:
                d += 1
            elif c == close:
                d -= 1
                if d == 0:
                    s.i += 1
                    break
            s.i += 1
        return s.t[start:s.i]

    def string(s):
        c = s.t[s.i]
        if c == '[':
            m = re.match(r'\[(=*)\[(.*?)\]\1\]', s.t[s.i:], re.S)
            s.i += m.end()
            return m.group(2)
        if c == '"':
            m = re.match(r'"((?:[^"\\]|\\.)*)"', s.t[s.i:])
        else:
            m = re.match(r"'((?:[^'\\]|\\.)*)'", s.t[s.i:])
        s.i += m.end()
        return re.sub(r'\\(.)', r'\1', m.group(1))

    def skip_function(s):
        s.ws()
        s.balanced('(', ')')
        depth = 1
        tok = re.compile(r'\b(function|if|do|end)\b|"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|--[^\n]*')
        while depth:
            mm = tok.search(s.t, s.i)
            if not mm:
                raise SyntaxError('unterminated function')
            s.i = mm.end()
            w = mm.group(1)
            if w in ('function', 'if', 'do'):
                depth += 1
            elif w == 'end':
                depth -= 1
        return {'__expr': 'function'}

    def primary(s):
        s.ws()
        c = s.ch()
        if c == '{':
            return s.table()
        if c in '"\'' or s.t.startswith('[[', s.i) or re.match(r'\[=+\[', s.t[s.i:]):
            return s.string()
        if c == '(':
            return {'__expr': s.balanced('(', ')')}
        m = re.match(r'-?\s*\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|-?\s*\.\d+', s.t[s.i:])
        if m and not re.match(r'[A-Za-z_]', s.t[s.i + m.end():s.i + m.end() + 1]):
            s.i += m.end()
            txt = m.group(0).replace(' ', '')
            v = float(txt)
            return int(v) if re.fullmatch(r'-?\d+', txt) else v
        if c == '-':
            s.i += 1
            v = s.primary()
            return {'__expr': '-' + json.dumps(v)}
        m = re.match(r'not\b', s.t[s.i:])
        if m:
            s.i += m.end()
            v = s.primary()
            return {'__expr': 'not ' + json.dumps(v)}
        m = re.match(r'function\b', s.t[s.i:])
        if m:
            s.i += m.end()
            return s.skip_function()
        m = IDENT.match(s.t, s.i)
        if not m:
            raise SyntaxError('unexpected at %d: %r' % (s.i, s.t[s.i:s.i + 60]))
        w = m.group(0)
        s.i = m.end()
        if w == 'true':
            return True
        if w == 'false':
            return False
        if w == 'nil':
            return None
        expr = w
        while True:
            c = s.ch()
            if c == '.' and not s.t.startswith('..', s.i):
                s.i += 1
                mm = IDENT.match(s.t, s.i)
                expr += '.' + mm.group(0)
                s.i = mm.end()
            elif c == ':':
                s.i += 1
                mm = IDENT.match(s.t, s.i)
                expr += ':' + mm.group(0)
                s.i = mm.end()
            elif c == '(':
                expr += s.balanced('(', ')')
            elif c == '[' and not s.t.startswith('[[', s.i) and not re.match(r'\[=+\[', s.t[s.i:]):
                expr += s.balanced('[', ']')
            elif c == '{':
                s.table()
                expr += '{...}'
            elif c in '"\'':
                expr += json.dumps(s.string())
            else:
                break
        return {'__expr': expr}

    def val(s):
        v = s.primary()
        while True:
            s.ws()
            m = BINOPS.match(s.t, s.i)
            if not m:
                return v
            s.i = m.end()
            r = s.primary()
            op = m.group(0)
            if isinstance(v, (int, float)) and isinstance(r, (int, float)) and op in ('+', '-', '*', '/'):
                if op == '+':
                    v = v + r
                elif op == '-':
                    v = v - r
                elif op == '*':
                    v = v * r
                else:
                    v = v / r if r else float('nan')
            else:
                v = {'__expr': json.dumps(v) + op + json.dumps(r)}

    def table(s):
        s.ws()
        assert s.ch() == '{'
        s.i += 1
        arr, obj = [], {}
        while True:
            s.ws()
            if s.ch() == '}':
                s.i += 1
                break
            if s.ch() == '':
                raise SyntaxError('eof in table')
            m = re.match(r'([A-Za-z_]\w*)\s*=(?!=)', s.t[s.i:])
            if m:
                s.i += m.end()
                obj[m.group(1)] = s.val()
            elif s.ch() == '[' and not s.t.startswith('[[', s.i) and not re.match(r'\[=+\[', s.t[s.i:]):
                s.i += 1
                k = s.val()
                s.ws()
                assert s.ch() == ']'
                s.i += 1
                s.ws()
                assert s.ch() == '='
                s.i += 1
                obj[str(k)] = s.val()
            else:
                arr.append(s.val())
            s.ws()
            if s.ch() in ',;':
                s.i += 1
        if obj and arr:
            obj['__list'] = arr
            return obj
        return obj if obj else arr


def prune(e):
    out = {}
    for k, v in e.items():
        if isinstance(v, (dict, list)):
            if k in KEEP_TABLES:
                out[k] = v
        else:
            out[k] = v
    return out


src = open(sys.argv[1], encoding='utf-8').read()
entries = []
for m in re.finditer(r'data:extend\s*\(?\s*(?=\{)', src):
    p = P(src)
    p.i = m.end()
    try:
        tbl = p.table()
    except Exception as e:
        print('PARSE ERROR in block at line', src.count('\n', 0, m.start()) + 1, ':', e, file=sys.stderr)
        traceback.print_exc(limit=2, file=sys.stderr)
        continue
    if isinstance(tbl, dict) and '__list' in tbl:
        tbl = tbl['__list']
    if isinstance(tbl, list):
        for e in tbl:
            if isinstance(e, dict) and e.get('type') and e.get('name'):
                entries.append(prune(e))
by = {}
for e in entries:
    t = e['type']
    n = e.get('name')
    if isinstance(n, str):
        by.setdefault(t, {})[n] = e
json.dump(by, open(sys.argv[2], 'w'), indent=0)
print(sys.argv[1].replace('\\', '/').split('/')[-1], '->', {t: len(v) for t, v in by.items()})
