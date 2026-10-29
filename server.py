#!/usr/bin/env python3
"""Multithreaded HTTP server for World Explorer: static files + the /api/sky live-aircraft proxy and the
/api/ships live-vessel relay."""

import base64
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import ssl
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request
import zlib

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


# [live-ships] Same-origin live vessel relay for places the browser can't reach directly.
# GET /api/ships?lat=..&lon=.. -> {source, full, warming, ships: [[id, name, lat, lon, sog m/s|null,
# cog deg|null, heading deg|null, shipType, length, beam, ageS], ...]}. Always 200; source 'none' when
# nothing covers the spot. Sources:
#  - aisstream.io (global AIS, full traffic) when AISSTREAM_API_KEY is set in the server's environment. Its
#    WebSocket refuses browser connections (the key would leak), so one server-side connection subscribes
#    to the bounding boxes pages asked for in the last few minutes and keeps the latest report per ship.
#  - Keyless GTFS-realtime ferry feeds that send no CORS headers (NYC Ferry, Brisbane CityCat / ferries).
AIS_KEY = os.environ.get('AISSTREAM_API_KEY', '').strip()
SHIP_HALF_DEG = 0.3
GTFS_FERRIES = [
    ('NYC Ferry', 'https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition',
     (40.45, -74.30, 40.95, -73.70)),
    ('TransLink SEQ ferries', 'https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions/Ferry',
     (-27.75, 152.85, -27.25, 153.45)),
]
GTFS_CACHE = {}
GTFS_LOCK = threading.Lock()


def _pb_fields(b):
  """Minimal protobuf reader: yields (field, wire type, value)."""
  i, n = 0, len(b)
  def varint():
    nonlocal i
    v = s = 0
    while True:
      c = b[i]
      i += 1
      v |= (c & 0x7f) << s
      s += 7
      if c < 0x80:
        return v
  while i < n:
    k = varint()
    f, w = k >> 3, k & 7
    if w == 0:
      v = varint()
    elif w == 1:
      v = b[i:i + 8]
      i += 8
    elif w == 5:
      v = b[i:i + 4]
      i += 4
    elif w == 2:
      ln = varint()
      v = b[i:i + ln]
      i += ln
    else:
      return
    yield f, w, v


def _gtfs_vehicles(data):
  """GTFS-realtime FeedMessage -> [(id, label, lat, lon, bearing|None, speed|None, timestamp)]."""
  out = []
  for f, _, ent in _pb_fields(data):
    if f != 2:
      continue
    for f2, _, vp in _pb_fields(ent):
      if f2 != 4:
        continue
      r = {'id': '', 'label': '', 'lat': None, 'lon': None, 'brg': None, 'spd': None, 'ts': 0}
      for f3, w3, v3 in _pb_fields(vp):
        if f3 == 2:
          for f4, w4, v4 in _pb_fields(v3):
            if w4 == 5:
              x = struct.unpack('<f', v4)[0]
              key = {1: 'lat', 2: 'lon', 3: 'brg', 5: 'spd'}.get(f4)
              if key:
                r[key] = x
        elif f3 == 5 and w3 == 0:
          r['ts'] = v3
        elif f3 == 8:
          for f4, _, v4 in _pb_fields(v3):
            if f4 == 1:
              r['id'] = v4.decode('utf-8', 'replace')
            elif f4 == 2:
              r['label'] = v4.decode('utf-8', 'replace')
      if r['lat'] is not None and r['lon'] is not None:
        out.append(r)
  return out


def _gtfs_ships(lat, lon):
  now = time.time()
  for name, url, (la0, lo0, la1, lo1) in GTFS_FERRIES:
    if not (la0 <= lat <= la1 and lo0 <= lon <= lo1):
      continue
    with GTFS_LOCK:
      hit = GTFS_CACHE.get(url)
      if hit and now - hit[0] < 15:
        return hit[1]
    result = None
    try:
      req = urllib.request.Request(url, headers=_UA)
      with urllib.request.urlopen(req, timeout=8) as resp:
        vehicles = _gtfs_vehicles(resp.read())
      ships = []
      for v in vehicles:
        age = max(0.0, now - v['ts']) if v['ts'] else 0.0
        if age > 1800:
          continue
        ships.append([v['id'] or v['label'], v['label'], v['lat'], v['lon'], v['spd'], v['brg'], v['brg'], 60, 0, 0,
                      round(age, 1)])
      result = {'source': name, 'full': False, 'ferries': True, 'time': now, 'ships': ships}
    except Exception:
      result = None
    with GTFS_LOCK:
      GTFS_CACHE[url] = (now, result)
    return result
  return None


class _WebSocket:
  """Tiny RFC 6455 client (TLS, text frames, ping/pong, permessage-deflate) - stdlib only."""

  def __init__(self, host, path, timeout=30):
    raw = socket.create_connection((host, 443), timeout=timeout)
    self.s = ssl.create_default_context().wrap_socket(raw, server_hostname=host)
    key = base64.b64encode(os.urandom(16)).decode()
    self.s.sendall((
        'GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
        'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n'
        'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n'
        'User-Agent: world-explorer (+live-ships)\r\n\r\n' % (path, host, key)).encode())
    head = b''
    while b'\r\n\r\n' not in head:
      chunk = self.s.recv(4096)
      if not chunk:
        raise ConnectionError('websocket handshake closed')
      head += chunk
    head, self.buf = head.split(b'\r\n\r\n', 1)
    lines = head.decode('latin1').split('\r\n')
    if ' 101 ' not in lines[0] + ' ':
      raise ConnectionError('websocket handshake: ' + lines[0])
    ext = ' '.join(l for l in lines if l.lower().startswith('sec-websocket-extensions')).lower()
    self.deflate = 'permessage-deflate' in ext
    self.reset_ctx = 'server_no_context_takeover' in ext
    self.inflater = zlib.decompressobj(-15)

  def _read(self, n):
    while len(self.buf) < n:
      chunk = self.s.recv(65536)
      if not chunk:
        raise ConnectionError('websocket closed')
      self.buf += chunk
    out, self.buf = self.buf[:n], self.buf[n:]
    return out

  def send(self, text, opcode=1):
    data = text.encode() if isinstance(text, str) else text
    n = len(data)
    hdr = bytes([0x80 | opcode])
    if n < 126:
      hdr += bytes([0x80 | n])
    elif n < 65536:
      hdr += bytes([0x80 | 126]) + struct.pack('>H', n)
    else:
      hdr += bytes([0x80 | 127]) + struct.pack('>Q', n)
    mask = os.urandom(4)
    self.s.sendall(hdr + mask + bytes(b ^ mask[i & 3] for i, b in enumerate(data)))

  def recv(self):
    """Next complete text/binary message as str."""
    parts, compressed = [], False
    while True:
      b0, b1 = self._read(2)
      fin, op = b0 & 0x80, b0 & 0x0f
      n = b1 & 0x7f
      if n == 126:
        n = struct.unpack('>H', self._read(2))[0]
      elif n == 127:
        n = struct.unpack('>Q', self._read(8))[0]
      if b1 & 0x80:
        mask = self._read(4)
        payload = bytes(b ^ mask[i & 3] for i, b in enumerate(self._read(n)))
      else:
        payload = self._read(n)
      if op == 8:
        raise ConnectionError('websocket close: ' + payload[2:].decode('utf-8', 'replace'))
      if op == 9:
        self.send(payload, 0xA)
        continue
      if op == 0xA:
        continue
      if op in (1, 2):
        parts, compressed = [payload], bool(b0 & 0x40)
      else:
        parts.append(payload)
      if fin:
        data = b''.join(parts)
        if compressed and self.deflate:
          data = self.inflater.decompress(data + b'\x00\x00\xff\xff')
          if self.reset_ctx:
            self.inflater = zlib.decompressobj(-15)
        return data.decode('utf-8', 'replace')

  def close(self):
    try:
      self.s.close()
    except Exception:
      pass


class AisStream:
  """One background aisstream.io connection subscribed to the boxes pages asked for recently."""

  def __init__(self, key):
    self.key = key
    self.lock = threading.Lock()
    self.cells = {}      # (lat, lon) rounded to 0.25 deg -> last request time
    self.since = {}      # cell -> first request time (warm-up)
    self.ships = {}      # mmsi -> dict
    self.subscribed = None
    self.status = 'idle'
    self.thread = None

  def query(self, lat, lon):
    now = time.time()
    cell = (round(lat * 4) / 4, round(lon * 4) / 4)
    with self.lock:
      self.cells[cell] = now
      self.since.setdefault(cell, now)
      warming = now - self.since[cell] < 45
      if self.thread is None or not self.thread.is_alive():
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
      out = []
      for m, v in self.ships.items():
        if v.get('lat') is None or abs(v['lat'] - lat) > SHIP_HALF_DEG or abs(v['lon'] - lon) > SHIP_HALF_DEG * 1.6:
          continue
        age = now - v['t']
        if age > 1800:
          continue
        out.append([m, v.get('name', ''), v['lat'], v['lon'], v.get('sog'), v.get('cog'), v.get('hdg'),
                    v.get('type', 0), v.get('len', 0), v.get('beam', 0), round(age, 1)])
    return {'source': 'aisstream.io', 'full': not warming, 'warming': warming, 'status': self.status, 'time': now,
            'ships': out}

  def _boxes(self):
    now = time.time()
    with self.lock:
      for c in [c for c, t in self.cells.items() if now - t > 300]:
        self.cells.pop(c, None)
        self.since.pop(c, None)
      cells = sorted(self.cells)
    return [[[c[0] - SHIP_HALF_DEG - 0.15, c[1] - SHIP_HALF_DEG * 1.6 - 0.15],
             [c[0] + SHIP_HALF_DEG + 0.15, c[1] + SHIP_HALF_DEG * 1.6 + 0.15]] for c in cells]

  def _subscribe(self, ws, boxes):
    ws.send(json.dumps({'APIKey': self.key, 'BoundingBoxes': boxes, 'FilterMessageTypes': [
        'PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData',
        'StaticDataReport']}))
    self.subscribed = boxes

  def _run(self):
    backoff = 5
    while True:
      boxes = self._boxes()
      if not boxes:
        self.status = 'idle'
        return
      ws = None
      try:
        self.status = 'connecting'
        ws = _WebSocket('stream.aisstream.io', '/v0/stream')
        ws.s.settimeout(2.0)
        self._subscribe(ws, boxes)
        self.status = 'live'
        last_sub = time.time()
        while True:
          try:
            msg = ws.recv()
          except socket.timeout:
            msg = None
          if msg:
            self._ingest(msg)
          if time.time() - last_sub > 5:
            boxes = self._boxes()
            if not boxes:
              self.status = 'idle'
              return
            if boxes != self.subscribed:
              self._subscribe(ws, boxes)
            last_sub = time.time()
            self._prune()
        backoff = 5
      except Exception as e:  # bad key, network, server close: retry with backoff
        self.status = 'error: %s' % str(e)[:120]
        time.sleep(backoff)
        backoff = min(300, backoff * 2)
      finally:
        if ws:
          ws.close()

  def _prune(self):
    now = time.time()
    with self.lock:
      if len(self.ships) > 20000:
        for m in [m for m, v in self.ships.items() if now - v['t'] > 900]:
          self.ships.pop(m, None)

  def _ingest(self, text):
    try:
      d = json.loads(text)
    except ValueError:
      return
    if 'error' in d:
      raise ConnectionError(str(d['error'])[:120])
    meta = d.get('MetaData') or {}
    mmsi = meta.get('MMSI')
    if not mmsi:
      return
    kind = d.get('MessageType')
    body = (d.get('Message') or {}).get(kind) or {}
    now = time.time()
    with self.lock:
      v = self.ships.setdefault(mmsi, {'t': now})
      name = (meta.get('ShipName') or '').strip()
      if name:
        v['name'] = name
      if kind in ('PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'):
        lat, lon = body.get('Latitude', meta.get('latitude')), body.get('Longitude', meta.get('longitude'))
        if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
          return
        v['lat'], v['lon'], v['t'] = lat, lon, now
        sog = body.get('Sog')
        v['sog'] = min(25.0, sog * 0.514444) if sog is not None and sog < 102.3 else None
        cog = body.get('Cog')
        v['cog'] = cog if cog is not None and cog < 360 else None
        hdg = body.get('TrueHeading')
        v['hdg'] = hdg if hdg is not None and hdg < 360 else None
        if kind == 'ExtendedClassBPositionReport':
          self._static(v, body.get('Type'), body.get('Dimension'), body.get('Name'))
      elif kind == 'ShipStaticData':
        self._static(v, body.get('Type'), body.get('Dimension'), body.get('Name'))
      elif kind == 'StaticDataReport':
        ra, rb = body.get('ReportA') or {}, body.get('ReportB') or {}
        if ra.get('Valid'):
          self._static(v, None, None, ra.get('Name'))
        if rb.get('Valid'):
          self._static(v, rb.get('ShipType'), rb.get('Dimension'), None)

  @staticmethod
  def _static(v, typ, dim, name):
    if typ:
      v['type'] = int(typ)
    if dim:
      a, b, c, d = (dim.get(k) or 0 for k in 'ABCD')
      if a + b > 0:
        v['len'] = a + b
      if c + d > 0:
        v['beam'] = c + d
    if name and name.strip():
      v['name'] = name.strip()


AIS_STREAM = AisStream(AIS_KEY) if AIS_KEY else None


def ship_states(lat, lon):
  if AIS_STREAM:
    return AIS_STREAM.query(lat, lon)
  return _gtfs_ships(lat, lon) or {'source': 'none', 'full': False, 'ships': []}


class GameRequestHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
    self.send_header('Access-Control-Allow-Origin', '*')
    self.send_header('X-Live-Sky', '1')  # [live-sky] tells the page the /api/sky proxy exists
    self.send_header('X-Live-Ships', '1')  # [live-ships] tells the page the /api/ships relay exists
    super().end_headers()

  def do_GET(self):
    if self.path.startswith('/api/ships'):
      q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
      try:
        lat = max(-85.0, min(85.0, float(q.get('lat', ['0'])[0])))
        lon = max(-180.0, min(180.0, float(q.get('lon', ['0'])[0])))
        body = json.dumps(ship_states(lat, lon), separators=(',', ':')).encode('utf-8')
      except Exception:
        body = b'{"source":"none","ships":[]}'
      self.send_response(200)
      self.send_header('Content-Type', 'application/json')
      self.send_header('Content-Length', str(len(body)))
      self.end_headers()
      self.wfile.write(body)
      return
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
    if '/data/chunks/' not in first and '/api/sky' not in first and '/api/ships' not in first:
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
