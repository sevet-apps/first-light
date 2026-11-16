"""Vendor the NASA-derived Earth maps distributed with the official three.js examples.
Keep downloads local: the running game never depends on an external image host.
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import json
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets/textures/earth'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/'
MAPS = {
    'earth_day_4096.jpg': 'day.jpg',
    'earth_night_4096.jpg': 'night.jpg',
    'earth_normal_2048.jpg': 'normal.jpg',
    'earth_specular_2048.jpg': 'specular.jpg',
    'earth_bump_roughness_clouds_4096.jpg': 'surface-packed.jpg',
}

def download(item):
    name, dest = item
    response = requests.get(BASE+name, timeout=30)
    response.raise_for_status()
    im = Image.open(BytesIO(response.content))
    im.load()
    # Keep the documented 2K texture budget; source maps are antialiased down to 2K.
    if im.width > 2048: im.thumbnail((2048,1024), Image.Resampling.LANCZOS)
    if dest.endswith('.jpg'): im.convert('RGB').save(OUT/dest, quality=93, optimize=True)
    else: im.save(OUT/dest, optimize=True)
    print(f'{dest}: {im.size}', flush=True)
    return {'file':dest,'source':BASE+name,'source_size_bytes':len(response.content)}

with ThreadPoolExecutor(max_workers=5) as pool:
    sources = list(pool.map(download, MAPS.items()))
packed = Image.open(OUT/'surface-packed.jpg').convert('RGB')
packed.getchannel('B').point(lambda x: max(0, min(255, round((x-35)*255/220)))).save(OUT/'clouds.png')
packed.getchannel('R').save(OUT/'height.jpg', quality=95)
sources.extend({'file':name,'source':BASE+'earth_bump_roughness_clouds_4096.jpg','derived_channel':channel}
               for name,channel in [('clouds.png','B'),('height.jpg','R')])
(OUT/'sources.json').write_text(json.dumps(sources,indent=2)+'\n',encoding='utf-8')
