#!/usr/bin/env python3
"""Build apps-script/Index.html: dashboard.html with every library built in.

The hosted dashboard loads Chart.js, its plugins and morphicons from jsDelivr. Networks that
block GitHub often block public CDNs too, so the Apps Script copy carries them inline from
vendor/. Only Google (the web app itself, and Google Fonts) needs to be reachable.

Every inline script is also passed through esbuild to drop all comments and turn template
literals into plain string concatenation. Something on the way to the hospital's browsers
(Apps Script or a web filter) strips JavaScript comments with a pre-ES2015 tool: it doesn't know
template literals, so `https://…` inside one was cut at the // and the page failed to parse.
The build checks every script still parses after that kind of stripping (needs Node.js).

Run after every change to dashboard.html:
    python3 tools/build_apps_script.py
then commit apps-script/Index.html and merge into main: the Apps Script web app fetches it
from there (see apps-script/README.md).
"""
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CDN = 'https://cdn.jsdelivr.net/npm/'

# (tag exactly as it appears in dashboard.html, vendored file)
SCRIPTS = [
    (f'<script src="{CDN}chart.js@4.4.0/dist/chart.umd.min.js"></script>', 'chart.umd.min.js'),
    (f'<script src="{CDN}chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js"></script>', 'chartjs-plugin-datalabels.min.js'),
    (f'<script src="{CDN}chartjs-chart-matrix@2.0.1/dist/chartjs-chart-matrix.min.js"></script>', 'chartjs-chart-matrix.min.js'),
]
MORPH_MODULE = f"""<script type="module">
  import {{ defineMorphIcon }} from '{CDN}morphicons@1.7.1/dist/element.js';
  defineMorphIcon();
</script>"""


def inline(name):
    code = (ROOT / 'vendor' / name).read_text(encoding='utf-8')
    if '</script' in code.lower():
        raise SystemExit(f'vendor/{name} contains </script and cannot be inlined')
    # Shadow any AMD/CommonJS loader the host page defines, so each UMD library takes its
    # browser-global path (window.Chart, …) instead of registering as a module nobody imports.
    return (f'<script>/* vendor/{name} */\n(function (define, module, exports, require) {{\n'
            f'{code}\n}}).call(window);\n</script>')


def esbuild(js):
    """Drop comments and lower template literals; keep top-level names (globals used by the page)."""
    res = subprocess.run(['npx', '--yes', 'esbuild@0.24.2', '--loader=js', '--minify', '--legal-comments=none',
                          '--supported:template-literal=false', '--log-level=error'],
                         input=js, capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit('esbuild failed:\n' + res.stderr)
    return res.stdout.strip()


def naive_strip(js):
    """What a pre-ES2015 comment stripper does: knows '…' and "…" strings, not templates or regexes."""
    out, i, n, q = [], 0, len(js), None
    while i < n:
        c = js[i]
        if q:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(js[i + 1]); i += 2; continue
            if c == q:
                q = None
            i += 1; continue
        if c in '"\'':
            q = c; out.append(c); i += 1; continue
        if js.startswith('//', i):
            j = js.find('\n', i); i = n if j < 0 else j; continue
        if js.startswith('/*', i):
            j = js.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        out.append(c); i += 1
    return ''.join(out)


def check_survives_stripping(js, label):
    stripped = naive_strip(js)
    if stripped == js:
        return
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write(stripped)
    res = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
    Path(f.name).unlink()
    if res.returncode != 0:
        raise SystemExit(f'{label} would break under comment stripping:\n{res.stderr[:600]}')


def harden_scripts(html):
    """Run every inline classic script through esbuild and check it survives naive stripping."""
    def fix(m):
        attrs, body = m.group(1), m.group(2)
        if 'src=' in attrs or 'type=' in attrs:
            return m.group(0)
        label = (re.search(r'/\* (vendor/[^ ]+) \*/', body) or [None, 'inline script'])[1]
        js = esbuild(body)
        if '</script' in js.lower():
            raise SystemExit(f'{label}: </script in output')
        check_survives_stripping(js, label)
        return f'<script{attrs}>{js}</script>'
    return re.sub(r'<script([^>]*)>(.*?)</script>', fix, html, flags=re.S)


def main():
    html = (ROOT / 'dashboard.html').read_text(encoding='utf-8')
    for tag, name in SCRIPTS:
        if html.count(tag) != 1:
            raise SystemExit(f'Expected exactly one {tag!r} in dashboard.html')
        html = html.replace(tag, inline(name))
    if html.count(MORPH_MODULE) != 1:
        raise SystemExit('Expected exactly one morphicons <script type="module"> block in dashboard.html')
    html = html.replace(MORPH_MODULE, inline('morphicons-element.min.js'))
    # Any CDN left outside comments would break on a blocked network
    # (the kit's usage comments quote CDN tags with an escaped <\/script>; those never load)
    leftover = [l.strip() for l in html.splitlines() if CDN in l and '<\\/script>' not in l]
    if leftover:
        raise SystemExit('CDN references left in the output:\n' + '\n'.join(leftover))
    html = harden_scripts(html)
    out = ROOT / 'apps-script' / 'Index.html'
    out.write_text(html, encoding='utf-8')
    print(f'Wrote {out.relative_to(ROOT)} ({len(html.encode()) // 1024} KB)')


if __name__ == '__main__':
    main()
