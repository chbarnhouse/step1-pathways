import sys, pathlib
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).parent
js = (here / 'compgrid-proto.js').read_text()  # usage: python3 tools/compgrid-render.py urea+tca heme+tca (writes PNGs beside this file)
pairs = sys.argv[1:]
with sync_playwright() as pw:
    b = pw.webkit.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000}); pg.set_default_timeout(600000)
    pg.goto('http://localhost:8124/#/'); pg.wait_for_timeout(3000)
    pg.add_script_tag(content=js)
    for pair in pairs:
        for mode in ['now', 'bands']:
            wh = pg.evaluate("""([ids, mode]) => { const p = stitchPathway(ids.split('+'));
              const svg = mode === 'now' ? flowSVG(modelFor(p), () => 'shown', { zones: true })
                : (() => { const gp = compGrid(p); return gridSVG(modelFor(gp), compGridStatus(() => 'shown'), { zones: true }); })();
              let host = document.getElementById('shot'); if (!host) { host = document.createElement('div'); host.id = 'shot'; document.body.innerHTML = ''; document.body.append(host); }
              host.innerHTML = svg; const s = 0.6, el = host.querySelector('svg'), vb = el.viewBox.baseVal;
              el.setAttribute('width', vb.width * s); el.setAttribute('height', vb.height * s); host.style.cssText = 'position:absolute;left:0;top:0;background:#16191d';
              return [vb.width * s, vb.height * s]; }""", [pair, mode])
            pg.set_viewport_size({'width': max(400, int(wh[0]) + 2), 'height': min(int(wh[1]) + 2, 16000)})
            pg.wait_for_timeout(300); pg.locator('#shot').screenshot(path=str(here / f'{pair}-{mode}.png')); print(pair, mode, [round(x) for x in wh])
    b.close()
