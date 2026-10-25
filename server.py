#!/usr/bin/env python3
"""Multithreaded HTTP server for World Explorer: static files + the /api/sky live-aircraft proxy."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import threading
import time
import urllib.parse
import urllib.request

ROOT_DIR = Path(__file__).resolve().parent


# [live-sky] Same-origin live aircraft proxy: OpenSky / ADS-B feeds do not send CORS headers for
# third-party origins, so the browser cannot call them directly. GET /api/sky?lat=..&lon=..
# returns {source, time, ac: [[id, callsign, lat, lon, altM|null, onGround, gs m/s, track deg,
# vrate m/s, cat, ageS], ...]}. Responses are cached ~10 s per 0.1 deg cell so many tabs share one
# upstream call, and OpenSky's anonymous daily quota falls back to adsb.fi / adsb.lol. Always 200.
SKY_CACHE = {}
SKY_LOCK = threading.Lock()
SKY_BACKOFF = {}
SKY_HALF_DEG = 0.6
_UA = {'User-Agent': 'world-explorer/5 (+live-sky)'}
_OSKY_CAT = {2: 'light', 3: 'small', 4: 'jet', 5: 'heavy', 6: 'heavy', 7: 'jet', 8: 'heli', 9: 'light',
             12: 'light', 13: 'light'}
_ADSB_CAT = {'A1': 'light', 'A2': 'small', 'A3': 'jet', 'A4': 'jet', 'A5': 'heavy', 'A6': 'jet',
             'A7': 'heli', 'B1': 'light', 'B4': 'light', 'B6': 'light'}


def _get_json(url, timeout=8):
  req = urllib.request.Request(url, headers=_UA)
  with urllib.request.urlopen(req, timeout=timeout) as resp:
    return json.loads(resp.read().decode('utf-8'))


def _from_opensky(lat, lon):
  url = ('https://opensky-network.org/api/states/all?extended=1&lamin=%.3f&lomin=%.3f&lamax=%.3f&lomax=%.3f'
         % (lat - SKY_HALF_DEG, lon - SKY_HALF_DEG, lat + SKY_HALF_DEG, lon + SKY_HALF_DEG))
  data = _get_json(url)
  now = data.get('time') or time.time()
  out = []
  for s in data.get('states') or []:
    if s[5] is None or s[6] is None:
      continue
    alt = s[7] if s[7] is not None else s[13]
    cat = _OSKY_CAT.get(s[17], '') if len(s) > 17 else ''
    age = max(0.0, now - (s[3] or now))
    out.append([s[0], (s[1] or '').strip(), s[6], s[5], alt, bool(s[8]), s[9] or 0, s[10] or 0,
                s[11] or 0, cat, round(age, 1)])
  return out


def _from_adsbx_v2(url):
  data = _get_json(url)
  out = []
  for a in data.get('ac') or data.get('aircraft') or []:
    if a.get('lat') is None or a.get('lon') is None:
      continue
    ab = a.get('alt_baro')
    ground = ab == 'ground'
    alt = None if ground or ab is None else ab * 0.3048
    if alt is None and not ground and a.get('alt_geom') is not None:
      alt = a['alt_geom'] * 0.3048
    out.append([a.get('hex', ''), (a.get('flight') or a.get('r') or '').strip(), a['lat'], a['lon'], alt, ground,
                (a.get('gs') or 0) * 0.514444, a.get('track') or a.get('true_heading') or 0,
                (a.get('baro_rate') or a.get('geom_rate') or 0) * 0.00508, _ADSB_CAT.get(a.get('category'), ''),
                round(a.get('seen_pos') or a.get('seen') or 0, 1)])
  return out


def sky_states(lat, lon):
  key = (round(lat, 1), round(lon, 1))
  now = time.time()
  with SKY_LOCK:
    hit = SKY_CACHE.get(key)
    if hit and now - hit[0] < 10:
      return hit[1]
  nm = int(SKY_HALF_DEG * 60 * 1.1)
  sources = [
      ('opensky', lambda: _from_opensky(lat, lon)),
      ('adsb.fi', lambda: _from_adsbx_v2('https://opendata.adsb.fi/api/v2/lat/%.4f/lon/%.4f/dist/%d' % (lat, lon, nm))),
      ('adsb.lol', lambda: _from_adsbx_v2('https://api.adsb.lol/v2/point/%.4f/%.4f/%d' % (lat, lon, nm))),
  ]
  result = {'source': 'none', 'time': now, 'ac': []}
  for name, fetch in sources:
    if SKY_BACKOFF.get(name, 0) > now:
      continue
    try:
      result = {'source': name, 'time': now, 'ac': fetch()}
      break
    except Exception as e:  # rate limit / outage: back off this source for a while
      code = getattr(e, 'code', 0)
      SKY_BACKOFF[name] = now + (900 if code == 429 else 60)
  with SKY_LOCK:
    SKY_CACHE[key] = (now, result)
    if len(SKY_CACHE) > 64:
      for k in sorted(SKY_CACHE, key=lambda k: SKY_CACHE[k][0])[:32]:
        SKY_CACHE.pop(k, None)
  return result


class GameRequestHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
    self.send_header('Access-Control-Allow-Origin', '*')
    self.send_header('X-Live-Sky', '1')  # [live-sky] tells the page the /api/sky proxy exists
    super().end_headers()

  def do_GET(self):
    if self.path.startswith('/api/sky'):
      q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
      try:
        lat = max(-85.0, min(85.0, float(q.get('lat', ['0'])[0])))
        lon = max(-180.0, min(180.0, float(q.get('lon', ['0'])[0])))
        body = json.dumps(sky_states(lat, lon), separators=(',', ':')).encode('utf-8')
      except Exception:
        body = b'{"source":"none","ac":[]}'
      self.send_response(200)
      self.send_header('Content-Type', 'application/json')
      self.send_header('Content-Length', str(len(body)))
      self.end_headers()
      self.wfile.write(body)
      return
    super().do_GET()

  def log_message(self, fmt, *args):
    # Suppress per-chunk request spam in terminal
    first = str(args[0]) if args else ''
    if '/data/chunks/' not in first and '/api/sky' not in first:
      sys.stderr.write('%s - - [%s] %s\n' % (
          self.address_string(),
          self.log_date_time_string(),
          fmt % args,
      ))


def main():
  port = int(os.environ.get('PORT', '8098'))
  server = ThreadingHTTPServer(('0.0.0.0', port), GameRequestHandler)
  print(f'World Explorer server listening on http://0.0.0.0:{port}')
  sys.stdout.flush()
  server.serve_forever()


if __name__ == '__main__':
  main()
