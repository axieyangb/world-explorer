#!/usr/bin/env python3
"""[street-detail] One-off builder for data/street_detail_sf.json.

Fetches real OSM street nodes (trees, lamps, signals, crossings, hydrants, benches, bins) for a block of
Z15 tiles around the default San Francisco start with ONE Overpass CSV query, and writes them in the same
compact per-tile format StreetDetail caches (see compactOsm() in src/features/street_detail.js), so the
default view is fully detailed even offline / in the single-file build (world_explorer.html).

  python3 tools/build_street_detail_seed.py            # default: SF Embarcadero, x 5239..5245, y 12660..12666
"""
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data/street_detail_sf.json'
TZ = 15
X0, X1, Y0, Y1 = 5239, 5245, 12660, 12666
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
UA = 'Mozilla/5.0 (world-explorer street-detail seed builder)'
COLS = ['::lat', '::lon', 'natural', 'highway', 'emergency', 'amenity', 'genus', 'species', 'taxon', 'species:en',
        'genus:en', 'taxon:en', 'leaf_type', 'height', 'est_height', 'crossing', 'crossing:markings', 'crossing_ref',
        'fire_hydrant:type', 'traffic_signals']
CAP = {'trees': 3000, 'lamps': 700, 'hyd': 400, 'bench': 400, 'bins': 400, 'sig': 300, 'cross': 500}
SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM = 0, 1, 2, 3
PALM_RE = re.compile(r'palm|phoenix|washingtonia|syagrus|trachycarpus|archontophoenix|cocos|roystonea|butia|sabal|chamaerops')
CONIFER_RE = re.compile(r'pinus|pine|cupressus|cypress|sequoia|redwood|cedrus|cedar|picea|spruce|abies|\bfir\b|junip|thuja|taxus|podocarpus|araucaria|cryptomeria|chamaecyparis|larix|larch')
TALL_RE = re.compile(r'eucalyptus|platanus|plane|populus|poplar|lophostemon|ginkgo|liriodendron|melaleuca|sycamore|tulip')


def tile_bbox(x, y, z=TZ):
  n = 2 ** z
  lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
  return {'w': x / n * 360 - 180, 'e': (x + 1) / n * 360 - 180, 'n': lat(y), 's': lat(y + 1)}


def tile_of(lat, lon, z=TZ):
  r = math.radians(lat)
  return (int((lon + 180) / 360 * 2 ** z), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** z))


def num(v):
  try:
    f = float(v)
    return f if math.isfinite(f) else 0
  except (TypeError, ValueError):
    return 0


def species(t):
  s = ' '.join(t.get(k, '') for k in ('genus', 'species', 'taxon', 'species:en', 'genus:en', 'taxon:en')).lower()
  if PALM_RE.search(s):
    return SP_PALM
  if t.get('leaf_type') == 'needleleaved' or CONIFER_RE.search(s):
    return SP_CONIFER
  if TALL_RE.search(s):
    return SP_TALL
  return SP_BROADLEAF


def add(out, t, lat, lon):
  """Mirror of compactOsm() for one node."""
  if t.get('natural') == 'tree':
    if len(out['trees']) < CAP['trees'] * 4:
      out['trees'] += [lat, lon, species(t), num(t.get('height')) or num(t.get('est_height'))]
  elif t.get('highway') == 'street_lamp':
    if len(out['lamps']) < CAP['lamps'] * 2:
      out['lamps'] += [lat, lon]
  elif t.get('highway') == 'traffic_signals':
    if t.get('traffic_signals', '') in ('', 'signal', 'traffic_lights') and len(out['sig']) < CAP['sig'] * 2:
      out['sig'] += [lat, lon]
  elif t.get('highway') == 'crossing':
    c, m = t.get('crossing', ''), t.get('crossing:markings', '')
    if c in ('unmarked', 'no') or m == 'no' or t.get('crossing_ref') == 'none':
      return
    if len(out['cross']) < CAP['cross'] * 2:
      out['cross'] += [lat, lon]
  elif t.get('emergency') == 'fire_hydrant':
    if t.get('fire_hydrant:type') in ('underground', 'wall'):
      return
    if len(out['hyd']) < CAP['hyd'] * 2:
      out['hyd'] += [lat, lon]
  elif t.get('amenity') == 'bench':
    if len(out['bench']) < CAP['bench'] * 2:
      out['bench'] += [lat, lon]
  elif t.get('amenity') == 'waste_basket':
    if len(out['bins']) < CAP['bins'] * 2:
      out['bins'] += [lat, lon]


def main():
  a, b = tile_bbox(X0, Y1), tile_bbox(X1, Y0)
  s, w, n, e = a['s'], a['w'], b['n'], b['e']
  cols = ','.join(c if c.startswith('::') else f'"{c}"' for c in COLS)
  q = (f'[out:csv({cols};false)][timeout:90][maxsize:268435456][bbox:{s:.6f},{w:.6f},{n:.6f},{e:.6f}];('
       'node["natural"="tree"];node["highway"~"^(street_lamp|traffic_signals|crossing)$"];'
       'node["emergency"="fire_hydrant"];node["amenity"~"^(bench|waste_basket)$"];);out qt;')
  body = urllib.parse.urlencode({'data': q}).encode()
  text = None
  for url in MIRRORS:
    try:
      t0 = time.time()
      req = urllib.request.Request(url, data=body, headers={'User-Agent': UA})
      with urllib.request.urlopen(req, timeout=150) as r:
        text = r.read().decode('utf-8')
      print(f'{url}: {len(text)} bytes in {time.time() - t0:.1f}s')
      break
    except Exception as ex:  # noqa: BLE001 - try the next mirror
      print(f'{url}: {ex}', file=sys.stderr)
  if text is None:
    sys.exit('all mirrors failed')
  tiles = {}
  for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
      tiles[f'{x}/{y}'] = {k: [] for k in ('trees', 'lamps', 'hyd', 'bench', 'bins', 'sig', 'cross')}
  rows = 0
  for line in text.split('\n'):
    p = line.split('\t')
    if len(p) < len(COLS):
      continue
    lat, lon = round(float(p[0]), 6), round(float(p[1]), 6)
    key = '%d/%d' % tile_of(lat, lon)
    if key not in tiles:
      continue
    add(tiles[key], {c: v for c, v in zip(COLS[2:], p[2:]) if v}, lat, lon)
    rows += 1
  doc = {'v': 1, 'z': TZ, 't': int(time.time() * 1000), 'tiles': tiles}
  OUT.write_text(json.dumps(doc, separators=(',', ':')), encoding='utf-8')
  print(f'{rows} nodes -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB)')
  for k, d in tiles.items():
    print(k, {c: len(v) // (4 if c == 'trees' else 2) for c, v in d.items()})


if __name__ == '__main__':
  main()
