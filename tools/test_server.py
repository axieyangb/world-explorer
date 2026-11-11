#!/usr/bin/env python3
"""Tests server.py on a scratch instance (loopback, free port) with every upstream call stubbed.

Usage: python3 tools/test_server.py [--source=FILE]   (FILE: another server.py to test, e.g. an old version)
Exits non-zero if any check fails. Nothing here contacts the real flight or ship feeds.
"""

import http.client
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
import types

ROOT = Path(__file__).resolve().parent.parent
SOURCE = next((Path(a.split('=', 1)[1]) for a in sys.argv[1:] if a.startswith('--source=')), ROOT / 'server.py')

mod = types.ModuleType('server_under_test')
mod.__file__ = str(ROOT / 'server.py')  # serve this checkout whichever source is under test
os.environ.pop('AISSTREAM_API_KEY', None)
exec(compile(SOURCE.read_text(encoding='utf-8'), str(SOURCE), 'exec'), mod.__dict__)

upstream_calls = []


def fake_get_json(url, timeout=8):
  upstream_calls.append(url)
  time.sleep(0.3)
  return {'time': time.time(), 'states': [], 'ac': []}


def no_network(*_a, **_k):
  raise AssertionError('test tried to reach a real upstream')


mod._get_json = fake_get_json
mod.urllib.request.urlopen = no_network
mod._WebSocket = no_network
mod.AisStream._run = lambda self: None  # never connect to aisstream.io
mod.AIS_STREAM = mod.AisStream('test-key')
mod.GameRequestHandler.log_message = lambda *a, **k: None

server = mod.ThreadingHTTPServer(('127.0.0.1', 0), mod.GameRequestHandler)
PORT = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

results = []


def check(name, ok, observed):
  results.append(ok)
  print(f"{'ok  ' if ok else 'FAIL'}  {name}: {observed}")


def get(path, headers=None, method='GET'):
  conn = http.client.HTTPConnection('127.0.0.1', PORT, timeout=10)
  conn.request(method, path, headers=headers or {})
  resp = conn.getresponse()
  body = resp.read()
  conn.close()
  return resp.status, dict(resp.getheaders()), body


def statuses(paths, **kw):
  return {p: get(p, **kw)[0] for p in paths}


# 1. The app itself is served.
app = statuses(['/', '/index.html', '/src/main.js?v=1', '/styles.css?v=1', '/vendor/three.module.js',
                '/data/nav_graph.json', '/assets/facades/facade_strip.jpg', '/world_explorer.html'], method='HEAD')
check('app files are served', all(v == 200 for v in app.values()), app)

# 2. Nothing else in the checkout is.
private = ['/.gitignore', '/server.py', '/tools/build_release.py', '/README.md', '/Dockerfile', '/src/../server.py',
           '/src/%2e%2e/server.py', '/assets/..%2f.gitignore', '/src/.hidden']
if (ROOT / '.git').is_dir():
  private.append('/.git/config')
else:
  private.append('/.git')
got = statuses(private)
check('private files are not served', all(v == 404 for v in got.values()), got)

# 3. No directory listings.
got = statuses(['/src/', '/src/features/', '/data/', '/tools/'])
check('no directory listings', all(v == 404 for v in got.values()), got)

# 4. No wildcard CORS; other sites cannot use the proxies.
_, h_static, _ = get('/index.html', method='HEAD')
st_same, h_api, _ = get('/api/sky?lat=10&lon=10')
acao = [h.get('Access-Control-Allow-Origin') for h in (h_static, h_api)]
check('no Access-Control-Allow-Origin header', acao == [None, None], acao)
before = len(upstream_calls)
cross = {
    'Origin: http://evil.example': get('/api/sky?lat=20&lon=20', headers={'Origin': 'http://evil.example'})[0],
    'Sec-Fetch-Site: cross-site': get('/api/sky?lat=21&lon=21', headers={'Sec-Fetch-Site': 'cross-site'})[0],
    'ships, Origin: http://evil.example': get('/api/ships?lat=20&lon=20', headers={'Origin': 'http://evil.example'})[0],
}
check('cross-site API requests are refused without an upstream call',
      all(v == 403 for v in cross.values()) and len(upstream_calls) == before,
      f'{cross}, upstream calls made: {len(upstream_calls) - before}')
same = get('/api/sky?lat=10&lon=10', headers={'Origin': f'http://127.0.0.1:{PORT}', 'Host': f'127.0.0.1:{PORT}',
                                               'Sec-Fetch-Site': 'same-origin'})[0]
check('same-origin API requests work', st_same == 200 and same == 200 and h_api.get('X-Live-Sky') == '1',
      f'status {st_same}/{same}, X-Live-Sky={h_api.get("X-Live-Sky")}')

# 5. Concurrent requests for one cell share one upstream call.
before = len(upstream_calls)
threads = [threading.Thread(target=get, args=('/api/sky?lat=33.3&lon=44.4',)) for _ in range(20)]
[t.start() for t in threads]
[t.join() for t in threads]
n = len(upstream_calls) - before
check('20 concurrent requests for one cell -> 1 upstream call', n == 1, f'{n} upstream call(s)')

# 6. /api/ships cannot grow the subscription without bound.
for i in range(200):
  get(f'/api/ships?lat={-60 + (i % 20) * 3}&lon={-150 + (i // 20) * 3}')
boxes = len(mod.AIS_STREAM._boxes())
check('ship subscription boxes are capped', boxes <= 16, f'{boxes} boxes after 200 distinct cells')

# 7. A silent client is disconnected.
handler_timeout = mod.GameRequestHandler.timeout
if handler_timeout is None:
  check('silent clients are disconnected', False, 'handler has no socket timeout (connection is held forever)')
else:
  mod.GameRequestHandler.timeout = 1
  s = socket.create_connection(('127.0.0.1', PORT))
  s.sendall(b'GET /index.html HTTP/1.1\r\n')  # never finishes the request
  s.settimeout(5)
  t0 = time.time()
  try:
    closed = s.recv(1) == b''
  except socket.timeout:
    closed = False
  check('silent clients are disconnected', closed and handler_timeout <= 60,
        f'configured {handler_timeout}s; with it set to 1s the server closed the socket after {time.time() - t0:.1f}s')
  mod.GameRequestHandler.timeout = handler_timeout
  s.close()

# 8. Routes match exactly.
got = statuses(['/api/skyXYZ?lat=1&lon=1', '/api/shipsABC', '/api/sky/extra', '/api/'])
check('only the exact /api routes exist', all(v == 404 for v in got.values()), got)

server.shutdown()

# 9. Bind address: by default reachable on loopback only; HOST=0.0.0.0 opens it to the network.
def lan_ip():
  s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
  try:
    s.connect(('10.255.255.255', 1))  # no packet is sent
    return s.getsockname()[0]
  except OSError:
    return None
  finally:
    s.close()


def reachable(host, port):
  try:
    socket.create_connection((host, port), timeout=2).close()
    return True
  except OSError:
    return False


def bind_test(extra_env):
  with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
  env = {k: v for k, v in os.environ.items() if k != 'HOST'}
  env.update(PORT=str(port), **extra_env)
  proc = subprocess.Popen([sys.executable, str(SOURCE)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  try:
    for _ in range(50):
      if reachable('127.0.0.1', port):
        break
      time.sleep(0.1)
    return reachable('127.0.0.1', port), reachable(ip, port)
  finally:
    proc.terminate()
    proc.wait(5)


ip = lan_ip()
if not ip or ip.startswith('127.'):
  print('skip  bind address: this machine has no network address to test from')
else:
  loop, lan = bind_test({})
  check('default bind is loopback only', loop and not lan, f'127.0.0.1 reachable={loop}, {ip} reachable={lan}')
  loop, lan = bind_test({'HOST': '0.0.0.0'})
  check('HOST=0.0.0.0 opens it to the network', loop and lan, f'127.0.0.1 reachable={loop}, {ip} reachable={lan}')

failed = results.count(False)
print(f'test_server: {len(results) - failed} passed, {failed} failed')
sys.exit(1 if failed else 0)
