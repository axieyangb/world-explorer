#!/usr/bin/env python3
"""Random Multi-State Visual Sampling & Contact-Sheet Audit Tool for Beijing 3D Open-World.

Samples diverse random locations (lakes, rivers, parks, bridges/interchanges,
arterials, subway stations, mountains, urban blocks, landmarks) and random game
states (drive / walk / freecam modes, chase / street / topdown camera angles,
vehicles, altitudes 2m..1400m, times of day noon/sunset/night/overcast),
captures WebGL2 screenshots via Headless Chrome CDP, and stitches them into a
labeled 3x3 grid contact sheet PNG for visual defect inspection.
"""

import argparse
import base64
import io
import json
import math
import os
import random
import subprocess
import time
import urllib.request
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = '.'
OVERVIEW_PATH = os.path.join(PROJECT_ROOT, 'data', 'global_overview.json')
DEFAULT_OUT_DIR = '/tmp'


class CDPClient:
  """Minimal Chrome DevTools Protocol client over --remote-debugging-pipe."""

  def __init__(self, r_fd, w_fd):
    self.r_fd = r_fd
    self.w_fd = w_fd
    self.msg_id = 0
    self.buf = b''
    self.console_logs = []
    self.errors = []
    self.session_id = None

  def send(self, method, params=None, use_session=True):
    self.msg_id += 1
    mid = self.msg_id
    msg_obj = {'id': mid, 'method': method, 'params': params or {}}
    if use_session and self.session_id:
      msg_obj['sessionId'] = self.session_id
    payload = json.dumps(msg_obj).encode('utf-8') + b'\0'
    os.write(self.w_fd, payload)
    while True:
      while b'\0' in self.buf:
        raw, self.buf = self.buf.split(b'\0', 1)
        if not raw:
          continue
        msg = json.loads(raw.decode('utf-8'))
        if msg.get('method') == 'Runtime.consoleAPICalled':
          args = [
              a.get('value', a.get('description', ''))
              for a in msg.get('params', {}).get('args', [])
          ]
          self.console_logs.append(' '.join(str(x) for x in args))
        elif msg.get('method') == 'Runtime.exceptionThrown':
          self.errors.append(str(msg.get('params', {})))
        if msg.get('id') == mid:
          return msg
      chunk = os.read(self.r_fd, 65536)
      if not chunk:
        raise RuntimeError('CDP pipe closed unexpectedly')
      self.buf += chunk

  def eval_js(self, expr, await_promise=True):
    res = self.send(
        'Runtime.evaluate',
        {
            'expression': expr,
            'awaitPromise': await_promise,
            'returnByValue': True,
        },
    )
    if 'error' in res:
      self.errors.append(str(res['error']))
    exc = res.get('result', {}).get('exceptionDetails')
    if exc:
      self.errors.append(str(exc))
    return res.get('result', {}).get('result', {}).get('value')

  def capture_png_bytes(self):
    res = self.send('Page.captureScreenshot', {'format': 'png'})
    return base64.b64decode(res['result']['data'])


def sample_scenarios(overview, seed, count=9):
  """Generates `count` diverse random location + state scenarios."""
  rng = random.Random(seed)

  bookmarks = overview.get('bookmarks', [])
  waters = overview.get('water', [])
  water_polys = [w for w in waters if w[2] == 'poly' and len(w[4]) >= 6]
  water_lines = [w for w in waters if w[2] == 'line' and len(w[4]) >= 4]
  parks = [p for p in overview.get('parks', []) if len(p[2]) >= 6]
  arterials = [a for a in overview.get('arterials', []) if not a[5] and len(a[7]) >= 6]
  bridges = [a for a in arterials if a[4]]
  stations = overview.get('stations', [])

  categories = [
      'water_poly',
      'water_line',
      'park',
      'interchange_bridge',
      'bookmark',
      'mountain_dem',
      'arterial',
      'station',
      'urban_grid',
  ]

  scenarios = []
  for i in range(count):
    cat = categories[i % len(categories)]
    if i >= len(categories):
      cat = rng.choice(categories)

    tx, tz = 0.0, 0.0
    label = ''

    if cat == 'bookmark' and bookmarks:
      bm = rng.choice(bookmarks)
      tx, tz = float(bm['x']), float(bm['z'])
      label = f"BM:{bm['name']}"
    elif cat == 'water_poly' and water_polys:
      w = rng.choice(water_polys)
      pts = w[4]
      xs = pts[0::2]
      zs = pts[1::2]
      tx = (min(xs) + max(xs)) * 0.5
      tz = (min(zs) + max(zs)) * 0.5
      label = f"Lake#{w[0]}({w[1] or '水面'})"
    elif cat == 'water_line' and water_lines:
      w = rng.choice(water_lines)
      pts = w[4]
      mid = (len(pts) // 4) * 2
      tx, tz = float(pts[mid]), float(pts[mid + 1])
      label = f"River#{w[0]}({w[1] or '河道'})"
    elif cat == 'park' and parks:
      p = rng.choice(parks)
      pts = p[2]
      xs = pts[0::2]
      zs = pts[1::2]
      tx = (min(xs) + max(xs)) * 0.5
      tz = (min(zs) + max(zs)) * 0.5
      pname = p[3] if len(p) > 3 and p[3] else p[1]
      label = f'Park:{pname}#{p[0]}'
    elif cat == 'interchange_bridge' and bridges:
      b = rng.choice(bridges)
      pts = b[7]
      mid = (len(pts) // 6) * 3
      tx, tz = float(pts[mid]), float(pts[mid + 2])
      label = f"Bridge:{b[2] or b[1]}(L{b[6]})"
    elif cat == 'arterial' and arterials:
      a = rng.choice(arterials)
      pts = a[7]
      mid = (len(pts) // 6) * 3
      tx, tz = float(pts[mid]), float(pts[mid + 2])
      label = f"Road:{a[2] or a[1]}"
    elif cat == 'station' and stations:
      s = rng.choice(stations)
      tx, tz = float(s[2]), float(s[3])
      label = f"Subway:{s[1]}"
    elif cat == 'mountain_dem':
      tx = rng.uniform(-18500, -10800)
      tz = rng.uniform(-13500, 2500)
      label = 'WesternHills/DEM'
    else:
      tx = rng.uniform(-14000, 14000)
      tz = rng.uniform(-14000, 14000)
      label = 'UrbanGrid'

    tx = max(-19200.0, min(19200.0, tx))
    tz = max(-19200.0, min(19200.0, tz))

    # Choose mode and camera parameters tailored to test all combinations
    if cat in ('water_poly', 'mountain_dem', 'park'):
      mode = rng.choice(['freecam', 'freecam', 'drive', 'walk'])
    elif cat in ('interchange_bridge', 'water_line'):
      mode = rng.choice(['freecam', 'drive', 'walk'])
    else:
      mode = rng.choice(['drive', 'walk', 'freecam'])

    time_of_day = rng.choices(
        ['noon', 'sunset', 'night', 'overcast'],
        weights=[0.42, 0.22, 0.20, 0.16],
    )[0]

    cam_mode = 'chase'
    if mode in ('drive', 'walk'):
      cam_mode = rng.choices(
          ['chase', 'street', 'topdown'],
          weights=[0.5, 0.3, 0.2] if mode == 'drive' else [0.6, 0.3, 0.1],
      )[0]

    vehicle_idx = rng.randint(0, 3)
    yaw = rng.uniform(-math.pi, math.pi)
    pitch = rng.uniform(0.12, 0.48)
    topdown_h = rng.uniform(95, 290)

    # Free-cam altitude & pitch
    alt_tier = rng.choice(['low', 'mid', 'high'])
    if alt_tier == 'low':
      freecam_rel_h = rng.uniform(28.0, 95.0)
      freecam_pitch = rng.uniform(-0.35, -0.16)
    elif alt_tier == 'mid':
      freecam_rel_h = rng.uniform(110.0, 360.0)
      freecam_pitch = rng.uniform(-0.62, -0.24)
    else:
      freecam_rel_h = rng.uniform(420.0, 1250.0)
      freecam_pitch = rng.uniform(-1.05, -0.38)

    scenarios.append({
        'index': i + 1,
        'category': cat,
        'label': label,
        'tx': round(tx, 1),
        'tz': round(tz, 1),
        'mode': mode,
        'camMode': cam_mode,
        'timeOfDay': time_of_day,
        'vehicleIdx': vehicle_idx,
        'yaw': round(yaw, 3),
        'pitch': round(pitch, 3),
        'topDownHeight': round(topdown_h, 1),
        'freeCamRelH': round(freecam_rel_h, 1),
        'freeCamPitch': round(freecam_pitch, 3),
        'collapseDrawer': True,
    })

  return scenarios


def ensure_http_server(port):
  try:
    urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=0.5)
    return None
  except Exception:
    env = dict(os.environ)
    env['PORT'] = str(port)
    srv = subprocess.Popen(
        ['python3', '-I', os.path.join(PROJECT_ROOT, 'server.py')],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(30):
      time.sleep(0.1)
      try:
        urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=0.5)
        return srv
      except Exception:
        pass
    return srv


def run_audit(seed, count, out_path, port=8098):
  srv_proc = ensure_http_server(port)
  with open(OVERVIEW_PATH, 'r', encoding='utf-8') as f:
    overview = json.load(f)

  scenarios = sample_scenarios(overview, seed, count)

  c2b_r, c2b_w = os.pipe()
  b2c_r, b2c_w = os.pipe()

  def pass_fds():
    os.dup2(c2b_r, 3)
    os.dup2(b2c_w, 4)

  user_data_dir = f'/tmp/chrome_cdp_audit_{os.getpid()}'
  cmd = [
      '/usr/bin/google-chrome',
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      f'--user-data-dir={user_data_dir}',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=default',
      '--window-size=1280,720',
      '--remote-debugging-pipe',
      'about:blank',
  ]
  proc = subprocess.Popen(
      cmd,
      preexec_fn=pass_fds,
      pass_fds=(3, 4),
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
  )
  os.close(c2b_r)
  os.close(b2c_w)

  tiles = []
  results_meta = []

  try:
    cdp = CDPClient(b2c_r, c2b_w)
    res = cdp.send('Target.getTargets', use_session=False)
    targets = res['result']['targetInfos']
    page_target = next(t for t in targets if t['type'] == 'page')
    attach = cdp.send(
        'Target.attachToTarget',
        {'targetId': page_target['targetId'], 'flatten': True},
        use_session=False,
    )
    cdp.session_id = attach['result']['sessionId']

    cdp.send('Runtime.enable')
    cdp.send('Page.enable')
    cdp.send(
        'Emulation.setDeviceMetricsOverride',
        {'width': 1280, 'height': 720, 'deviceScaleFactor': 1, 'mobile': False},
    )
    cdp.send('Page.navigate', {'url': f'http://127.0.0.1:{port}/'})

    # Wait for initial scene + DEM + LOD load
    for _ in range(80):
      time.sleep(0.25)
      ready = cdp.eval_js(
          'Boolean(window.__BEIJING_WORLD__ &&'
          ' window.__BEIJING_WORLD__.getState().loadedChunks >= 25 &&'
          ' window.__BEIJING_WORLD__.getState().pendingChunks === 0)',
          False,
      )
      if ready:
        break

    for sc in scenarios:
      js_code = f"""
      (async () => {{
        const app = window.__BEIJING_WORLD__.app;
        const sc = {json.dumps(sc)};
        const drawer = document.getElementById('landmark-drawer');
        if (drawer) {{
          drawer.classList.toggle('collapsed', Boolean(sc.collapseDrawer));
        }}
        document.getElementById('osm-inspector').classList.add('hidden');
        if (app.highlightGroup) {{
          app.scene.remove(app.highlightGroup);
          app.highlightGroup = null;
        }}

        app.setTimeOfDay(sc.timeOfDay);
        document.querySelectorAll('.time-btn').forEach((b) => {{
          b.classList.toggle('active', b.dataset.time === sc.timeOfDay);
        }});

        await app.teleportToWorld(sc.tx, sc.tz, sc.label);

        if (sc.mode === 'freecam') {{
          app.setMode('freecam');
          const { '{ getBeijingTerrainElevation }' } = await import('/src/environment.js');
          const terrY = getBeijingTerrainElevation(sc.tx, sc.tz);
          const relH = sc.freeCamRelH;
          const pitch = sc.freeCamPitch;
          const yaw = sc.yaw;
          // Back up camera horizontally so the target coordinate (tx, terrY, tz) is centered in view
          const horizBack = Math.min(900, Math.max(20, relH / Math.tan(Math.max(0.18, -pitch)) * 0.65));
          const camX = Math.max(-19500, Math.min(19500, sc.tx - Math.sin(yaw) * horizBack));
          const camZ = Math.max(-19500, Math.min(19500, sc.tz - Math.cos(yaw) * horizBack));
          const camTerrY = getBeijingTerrainElevation(camX, camZ);
          app.freeCamPos.set(camX, Math.max(camTerrY + 8, terrY + relH), camZ);
          app.freeCamYaw = yaw;
          app.freeCamPitch = pitch;
          app.pos.set(camX, app.freeCamPos.y, camZ);
        }} else if (sc.mode === 'walk') {{
          app.setMode('walk');
          app.camMode = sc.camMode;
          app.topDownHeight = sc.topDownHeight;
          app.yaw = sc.yaw;
          app.camYaw = sc.yaw + 0.25;
          app.camPitch = sc.pitch;
          app.speed = 6.5;
          app.walkAnimTime += 1.1;
          app._updatePhysics(0.032);
        }} else {{
          app.setMode('drive');
          while (app.vehicleIdx !== sc.vehicleIdx) {{
            app.cycleVehicle();
          }}
          app.camMode = sc.camMode;
          app.topDownHeight = sc.topDownHeight;
          app.camPitch = sc.pitch;
          app.camYaw = app.yaw + 0.12;
          app.speed = 16.0;
          app._updatePhysics(0.032);
        }}

        const camLabels = {{ chase: '🎥 3D 追尾', topdown: '🦅 GTA 俯视', street: '🏙️ 街景低角' }};
        document.getElementById('cam-badge').textContent = camLabels[app.camMode] || '🎥 3D 追尾';

        await app._updateStreamingChunks(true);
        for (let f = 0; f < 6; f++) {{
          app.traffic.update(0.12, app.pos, app.loadedChunks);
        }}
        app._updateCamera(0.1);
        app._updateHud();
        app.renderer.render(app.scene, app.camera);
        return window.__BEIJING_WORLD__.getState();
      }})()
      """
      state = cdp.eval_js(js_code, True)
      for _ in range(30):
        if cdp.eval_js('window.__BEIJING_WORLD__.getState().pendingChunks === 0', False):
          break
        time.sleep(0.08)
      time.sleep(0.05)
      state = cdp.eval_js(
          """(() => {
            const app = window.__BEIJING_WORLD__.app;
            app._updateCamera(0.05);
            app.renderer.render(app.scene, app.camera);
            const st = window.__BEIJING_WORLD__.getState();
            st.camY = Math.round(app.camera.position.y);
            return st;
          })()""",
          False,
      )
      png_bytes = cdp.capture_png_bytes()
      img = Image.open(io.BytesIO(png_bytes)).convert('RGB')
      tiles.append((sc, state, img))
      results_meta.append({'scenario': sc, 'state': state})
      print(
          f"Tile #{sc['index']} [{sc['category']}] {sc['mode']}/{sc['camMode']}/{sc['timeOfDay']} "
          f"pos=({state.get('x')}, {state.get('z')}, camY={state.get('camY')}m) label={sc['label']}"
      )

    if cdp.errors:
      print(f'CDP JS Errors ({len(cdp.errors)}):')
      for e in cdp.errors:
        print('  ERR:', e)
  finally:
    proc.terminate()
    proc.wait()
    if srv_proc is not None:
      srv_proc.terminate()
      srv_proc.wait()

  # Stitch into a 3x3 grid contact sheet (each tile scaled to 800x450 -> 2400x1350 total)
  cols = 3
  rows = math.ceil(len(tiles) / cols)
  tw, th = 800, 450
  sheet = Image.new('RGB', (cols * tw, rows * th), (15, 19, 26))
  draw = ImageDraw.Draw(sheet)

  try:
    font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 14)
  except Exception:
    try:
      font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
    except Exception:
      font = ImageFont.load_default()

  for idx, (sc, st, img) in enumerate(tiles):
    r = idx // cols
    c = idx % cols
    x0 = c * tw
    y0 = r * th
    resized = img.resize((tw, th), Image.Resampling.LANCZOS)
    sheet.paste(resized, (x0, y0))

    # Draw bottom metadata overlay bar on tile so top HUD isn't covered
    bar_h = 28
    by0 = y0 + th - bar_h
    draw.rectangle([x0, by0, x0 + tw, y0 + th], fill=(10, 14, 22))
    draw.rectangle([x0, y0, x0 + tw - 1, y0 + th - 1], outline=(70, 95, 130), width=2)

    caption = (
        f"#{sc['index']} [{sc['category']}] {sc['mode'].upper()}/{sc['camMode']}/{sc['timeOfDay']} "
        f"| X:{st.get('x')} Z:{st.get('z')} CamY:{st.get('camY')}m "
        f"| {sc['label'][:28]}"
    )
    draw.text((x0 + 8, by0 + 6), caption, fill=(255, 228, 130), font=font)

  os.makedirs(os.path.dirname(out_path), exist_ok=True)
  sheet.save(out_path, format='PNG', optimize=True)
  meta_path = out_path.rsplit('.', 1)[0] + '.json'
  with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump({'seed': seed, 'tiles': results_meta}, f, ensure_ascii=False, indent=2)
  print(f'Saved stitched 3x3 montage: {out_path} ({os.path.getsize(out_path)} bytes)')


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--seed', type=int, default=101)
  parser.add_argument('--count', type=int, default=9)
  parser.add_argument(
      '--out',
      type=str,
      default=os.path.join(DEFAULT_OUT_DIR, 'montage_round_1.png'),
  )
  parser.add_argument('--port', type=int, default=8098)
  args = parser.parse_args()
  run_audit(args.seed, args.count, args.out, args.port)


if __name__ == '__main__':
  main()
