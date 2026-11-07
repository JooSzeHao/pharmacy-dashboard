#!/usr/bin/env python3
"""Build apps-script/Index.html: dashboard.html with every library built in.

The hosted dashboard loads Chart.js, its plugins and morphicons from jsDelivr. Networks that
block GitHub often block public CDNs too, so the Apps Script copy carries them inline from
vendor/. Only Google (the web app itself, and Google Fonts) needs to be reachable.

Run after every change to dashboard.html:
    python3 tools/build_apps_script.py
then commit apps-script/Index.html and merge into main: the Apps Script web app fetches it
from there (see apps-script/README.md).
"""
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
    return f'<script>/* vendor/{name} */\n{code}\n</script>'


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
    out = ROOT / 'apps-script' / 'Index.html'
    out.write_text(html, encoding='utf-8')
    print(f'Wrote {out.relative_to(ROOT)} ({len(html.encode()) // 1024} KB)')


if __name__ == '__main__':
    main()
