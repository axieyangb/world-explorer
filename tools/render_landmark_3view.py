#!/usr/bin/env python3
"""Headless Chrome 3-View + Isometric Renderer for the 40 Beijing Landmarks.

Usage:
  python3 tools/render_landmark_3view.py --all
  python3 tools/render_landmark_3view.py --batch 1
  python3 tools/render_landmark_3view.py --id taihedian
"""

import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

OUT_DIR = Path(
    '/tmp/3view'
)


def recv_cdp_until(r_fd, target_id, buf_holder, timeout=30.0):
  t0 = time.time()
  while time.time() - t0 < timeout:
    while b'\0' in buf_holder[0]:
      raw, buf_holder[0] = buf_holder[0].split(b'\0', 1)
      if not raw:
        continue
      obj = json.loads(raw.decode('utf-8', errors='replace'))
      if obj.get('id') == target_id:
        return obj
    chunk = os.read(r_fd, 65536)
    if not chunk:
      break
    buf_holder[0] += chunk
  raise TimeoutError(f'Timeout waiting for CDP id={target_id}')


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--all', action='store_true', help='Render all 40 landmarks')
  parser.add_argument('--batch', type=int, help='Render 1..10 batch (4 landmarks)')
  parser.add_argument('--id', type=str, help='Render a single landmark ID')
  parser.add_argument('--night', action='store_true', help='Also render night view')
  args = parser.parse_args()

  OUT_DIR.mkdir(parents=True, exist_ok=True)
  c2p_r, c2p_w = os.pipe()
  p2c_r, p2c_w = os.pipe()
  user_dir = tempfile.mkdtemp(prefix='chrome_3view_')

  def pass_fds_preexec():
    os.dup2(p2c_r, 3)
    os.dup2(c2p_w, 4)

  cmd = [
      'google-chrome',
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=default',
      '--window-size=1600,1000',
      f'--user-data-dir={user_dir}',
      '--remote-debugging-pipe',
      'about:blank',
  ]
  proc = subprocess.Popen(
      cmd,
      preexec_fn=pass_fds_preexec,
      pass_fds=(3, 4),
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
  )
  os.close(p2c_r)
  os.close(c2p_w)

  buf = [b'']
  msg_id = 1

  def call(method, params=None, session_id=None):
    nonlocal msg_id
    cid = msg_id
    msg_id += 1
    msg = {'id': cid, 'method': method}
    if params:
      msg['params'] = params
    if session_id:
      msg['sessionId'] = session_id
    os.write(p2c_w, (json.dumps(msg) + '\0').encode('utf-8'))
    return recv_cdp_until(c2p_r, cid, buf)

  def eval_js(expr, sid):
    res = call(
        'Runtime.evaluate',
        {'expression': expr, 'returnByValue': True, 'awaitPromise': True},
        session_id=sid,
    )
    if 'exceptionDetails' in res.get('result', {}):
      raise RuntimeError(f"JS Exception: {res['result']['exceptionDetails']}")
    return res.get('result', {}).get('result', {}).get('value')

  def screenshot(out_path: Path, sid):
    res = call('Page.captureScreenshot', {'format': 'png'}, session_id=sid)
    b64 = res['result']['data']
    out_path.write_bytes(base64.b64decode(b64))

  try:
    t_res = call('Target.getTargets')
    pages = [
        t for t in t_res['result']['targetInfos'] if t.get('type') == 'page'
    ]
    target_id = pages[0]['targetId']
    s_res = call(
        'Target.attachToTarget', {'targetId': target_id, 'flatten': True}
    )
    sid = s_res['result']['sessionId']

    call('Page.enable', session_id=sid)
    call('Runtime.enable', session_id=sid)
    call('Network.enable', session_id=sid)
    call('Network.setCacheDisabled', {'cacheDisabled': True}, session_id=sid)
    call(
        'Emulation.setDeviceMetricsOverride',
        {
            'width': 1600,
            'height': 1000,
            'deviceScaleFactor': 1,
            'mobile': False,
        },
        session_id=sid,
    )

    url = f'http://127.0.0.1:8098/landmark_workbench.html?t={int(time.time()*1000)}'
    call('Page.navigate', {'url': url}, session_id=sid)
    ready = False
    for _ in range(60):
      ready = eval_js('Boolean(window.__WORKBENCH__)', sid)
      if ready:
        break
      time.sleep(0.15)
    assert ready, 'landmark_workbench.html failed to load'

    all_lms = eval_js('window.__WORKBENCH__.getLandmarks()', sid)
    if args.id:
      target_ids = [args.id]
    elif args.batch:
      b_idx = args.batch - 1
      target_ids = [x['id'] for x in all_lms[b_idx * 4 : (b_idx + 1) * 4]]
    else:
      target_ids = [x['id'] for x in all_lms]

    for lid in target_ids:
      stats = eval_js(
          f'window.__WORKBENCH__.renderLandmarkById({json.dumps(lid)}, false)',
          sid,
      )
      out_png = OUT_DIR / f'{lid}.png'
      screenshot(out_png, sid)
      if args.night:
        eval_js(
            f'window.__WORKBENCH__.renderLandmarkById({json.dumps(lid)}, true)',
            sid,
        )
        screenshot(OUT_DIR / f'{lid}_night.png', sid)
      print(json.dumps({'id': lid, 'png': str(out_png), 'stats': stats}, ensure_ascii=False))

  finally:
    proc.terminate()
    shutil.rmtree(user_dir, ignore_errors=True)


if __name__ == '__main__':
  main()
