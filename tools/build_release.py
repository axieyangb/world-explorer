#!/usr/bin/env python3
"""Builds a self-contained single-file HTML release of World Explorer for static-host."""

import base64
import gzip
from pathlib import Path
import re
import struct
import time

ROOT = Path(__file__).resolve().parent.parent  # repo (or worktree) containing this script
OUT_FILE = Path('/tmp/world_explorer.html')

MOD_ID_MAP = {
    'vendor/three.module.js': '__MOD_three',
    'src/i18n.js': '__MOD_i18n',
    'src/wfc/wfc_archetypes.js': '__MOD_wfc_archetypes',
    'src/global_tiles.js': '__MOD_global_tiles',
    'src/wfc/wfc_solver.js': '__MOD_wfc_solver',
    'src/wfc/wfc_mesh_builder.js': '__MOD_wfc_mesh_builder',
    'src/wfc/wfc_real_footprints.js': '__MOD_wfc_real_footprints',
    'src/wfc/wfc_demo_app.js': '__MOD_wfc_demo_app',
    'src/landmarks_core.js': '__MOD_landmarks_core',
    'src/landmarks/batch_01.js': '__MOD_landmarks_batch_01',
    'src/landmarks/batch_02.js': '__MOD_landmarks_batch_02',
    'src/landmarks/batch_03.js': '__MOD_landmarks_batch_03',
    'src/landmarks/batch_04.js': '__MOD_landmarks_batch_04',
    'src/landmarks/batch_05.js': '__MOD_landmarks_batch_05',
    'src/landmarks/batch_06.js': '__MOD_landmarks_batch_06',
    'src/landmarks/batch_07.js': '__MOD_landmarks_batch_07',
    'src/landmarks/batch_08.js': '__MOD_landmarks_batch_08',
    'src/landmarks/batch_09.js': '__MOD_landmarks_batch_09',
    'src/landmarks/batch_10.js': '__MOD_landmarks_batch_10',
    'src/landmarks_40.js': '__MOD_landmarks_40',
    'src/environment.js': '__MOD_environment',
    # Worker-side feature modules (imported by global_tiles.js / chunk_builder.js).
    'src/features/vegetation_extract.js': '__MOD_vegetation_extract',
    'src/features/places_extract.js': '__MOD_places_extract',
    'src/features/signals.js': '__MOD_signals',
    'src/features/traffic_graph.js': '__MOD_traffic_graph',
    'src/features/water_shore.js': '__MOD_water_shore',
    'src/features/street_worker.js': '__MOD_street_worker',
    'src/features/vegetation_worker.js': '__MOD_vegetation_worker',
    'src/features/places_worker.js': '__MOD_places_worker',
    'src/chunk_builder.js': '__MOD_chunk_builder',
    'src/chunk_worker.js': '__MOD_chunk_worker',
    'src/entities.js': '__MOD_entities',
    # Main-thread feature modules.
    'src/features/daylight.js': '__MOD_daylight',
    'src/features/traffic_models.js': '__MOD_traffic_models',
    'src/features/city_traffic.js': '__MOD_city_traffic',
    'src/features/map_tiles.js': '__MOD_map_tiles',
    'src/features/route_graph.js': '__MOD_route_graph',
    'src/features/street_furniture.js': '__MOD_street_furniture',
    'src/features/vegetation.js': '__MOD_vegetation',
    'src/features/places.js': '__MOD_places',
    'src/features/sky.js': '__MOD_sky',
    'src/features/rain.js': '__MOD_rain',
    'src/features/surfaces.js': '__MOD_surfaces',
    'src/features/atmosphere.js': '__MOD_atmosphere',
    'src/navigation.js': '__MOD_navigation',
    'src/map_modal.js': '__MOD_map_modal',
    # [kaiju] Kaiju Defense mode modules.
    'src/features/kaiju/kaiju_config.js': '__MOD_kaiju_config',
    'src/features/kaiju/kaiju_model.js': '__MOD_kaiju_model',
    'src/features/kaiju/kaiju_spawn.js': '__MOD_kaiju_spawn',
    'src/features/kaiju/kaiju_ai.js': '__MOD_kaiju_ai',
    'src/features/kaiju/kaiju_fx.js': '__MOD_kaiju_fx',
    'src/features/kaiju/kaiju_audio.js': '__MOD_kaiju_audio',
    'src/features/kaiju/kaiju_destruction.js': '__MOD_kaiju_destruction',
    'src/features/kaiju/kaiju_crowd.js': '__MOD_kaiju_crowd',
    'src/features/kaiju/kaiju_weapons.js': '__MOD_kaiju_weapons',
    'src/features/kaiju/kaiju_hud.js': '__MOD_kaiju_hud',
    'src/features/kaiju/kaiju_mode.js': '__MOD_kaiju_mode',
    'src/main.js': '__MOD_main',
}


def resolve_rel_import(from_rel: str, spec: str) -> str:
  base = (ROOT / from_rel).parent
  target = (base / spec).resolve()
  return str(target.relative_to(ROOT))


IMPORT_RE = re.compile(
    r'^\s*import\s+(?:\*\s+as\s+[A-Za-z0-9_$]+|\{[^}]*\})\s*from\s*[\'"]([^\'"]+)[\'"]', re.M | re.S
)


def module_order_for(entry: str) -> list:
  """Dependency-first (post-order DFS) module list; fails on cycles or unmapped modules."""
  order, state = [], {}

  def visit(rel, stack):
    if state.get(rel) == 2:
      return
    if state.get(rel) == 1:
      raise SystemExit(f'import cycle (IIFE bundle cannot handle it): {" -> ".join(stack + [rel])}')
    if rel not in MOD_ID_MAP:
      raise SystemExit(f'{rel} (imported by {stack[-1] if stack else "?"}) is missing from MOD_ID_MAP')
    state[rel] = 1
    code = (ROOT / rel).read_text(encoding='utf-8')
    for spec in IMPORT_RE.findall(code):
      visit(resolve_rel_import(rel, spec), stack + [rel])
    state[rel] = 2
    order.append(rel)

  visit(entry, [])
  return order


def wrap_es_module_as_iife(rel_path: str) -> str:
  mod_var = MOD_ID_MAP[rel_path]
  code = (ROOT / rel_path).read_text(encoding='utf-8')

  def repl_ns_import(m):
    ns_name = m.group(1)
    spec = m.group(2)
    target_rel = resolve_rel_import(rel_path, spec)
    return f'const {ns_name} = {MOD_ID_MAP[target_rel]};'

  code = re.sub(
      r'^\s*import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s+[\'"]([^\'"]+)[\'"]\s*;?',
      repl_ns_import,
      code,
      flags=re.M,
  )

  def repl_named_import(m):
    inner = m.group(1)
    spec = m.group(2)
    target_rel = resolve_rel_import(rel_path, spec)
    items = []
    for part in inner.split(','):
      p = part.strip()
      if not p:
        continue
      if ' as ' in p:
        orig, alias = [x.strip() for x in p.split(' as ', 1)]
        items.append(f'{orig}: {alias}')
      else:
        items.append(p)
    return f'const {{ {", ".join(items)} }} = {MOD_ID_MAP[target_rel]};'

  code = re.sub(
      r'^\s*import\s*\{([^}]*)\}\s*from\s*[\'"]([^\'"]+)[\'"]\s*;?',
      repl_named_import,
      code,
      flags=re.M | re.S,
  )

  exported_names = []

  def repl_export_decl(m):
    decl_prefix = m.group(1)
    name = m.group(2)
    exported_names.append(name)
    return f'{decl_prefix} {name}'

  code = re.sub(
      r'^export\s+((?:async\s+)?function|const|let|var|class)\s+([A-Za-z0-9_$]+)',
      repl_export_decl,
      code,
      flags=re.M,
  )

  brace_returns = []

  def repl_export_brace(m):
    inner = m.group(1)
    for part in inner.split(','):
      p = part.strip()
      if not p:
        continue
      if ' as ' in p:
        orig, alias = [x.strip() for x in p.split(' as ', 1)]
        brace_returns.append(f'{alias}: {orig}')
      else:
        brace_returns.append(p)
    return ''

  code = re.sub(
      r'^export\s*\{([^}]+)\}\s*;?',
      repl_export_brace,
      code,
      flags=re.M | re.S,
  )

  code = code.replace('import.meta.url', 'document.baseURI')
  for bad in ('import.meta', 'import(', 'export default', 'export *'):
    if bad in code:
      raise SystemExit(f'{rel_path}: unsupported syntax for the IIFE bundle: {bad!r}')
  if re.search(r'^\s*(import|export)\s', code, flags=re.M):
    raise SystemExit(f'{rel_path}: unconverted import/export statement left in the IIFE bundle')

  all_exports = exported_names + brace_returns
  ret_stmt = f'return {{ {", ".join(all_exports)} }};' if all_exports else 'return {};'
  return f'const {mod_var} = (() => {{\n{code}\n{ret_stmt}\n}})();\n'


def gz_b64(raw_bytes: bytes) -> str:
  gz = gzip.compress(raw_bytes, compresslevel=9)
  return base64.b64encode(gz).decode('ascii')


def pack_lod_soa() -> bytes:
  raw = (ROOT / 'data/city_buildings_lod.bin').read_bytes()
  cnt = struct.unpack_from('<I', raw, 0)[0]
  cols = [bytearray() for _ in range(9)]
  for i in range(cnt):
    off = 4 + i * 28
    wx, wz, bw, bd, h10, mh10, yaw, cx, cz, r8, g8, b8, _ = struct.unpack_from(
        '<ffffHHhBBBBBB', raw, off
    )
    ox = -20000.0 + cx * 1000.0 + 500.0
    oz = -20000.0 + cz * 1000.0 + 500.0
    lx = max(-32767, min(32767, int(round((wx - ox) * 2.0))))
    lz = max(-32767, min(32767, int(round((wz - oz) * 2.0))))
    wm = max(4, min(255, int(round(bw))))
    dm = max(4, min(255, int(round(bd))))
    hh = max(4, min(255, int(round(h10 / 5.0))))
    yi = max(-127, min(127, int(round(yaw / 250.0))))
    st = (
        1
        if (r8 == 168 and g8 == 72)
        else (2 if (r8 == 132 and g8 == 134) else (3 if (r8 == 108 and g8 == 138) else 0))
    )
    cols[0].append(cx)
    cols[1].append(cz)
    cols[2].extend(struct.pack('<h', lx))
    cols[3].extend(struct.pack('<h', lz))
    cols[4].append(wm)
    cols[5].append(dm)
    cols[6].append(hh)
    cols[7].extend(struct.pack('<b', yi))
    cols[8].append(st)
  return struct.pack('<I', cnt) + b''.join(cols)


def build_world_explorer_html():
  t0 = time.time()
  print('[1/2] Compressing datasets for World Explorer...', flush=True)
  b64_ov = gz_b64((ROOT / 'data/global_overview.json').read_bytes())
  b64_dem = gz_b64((ROOT / 'data/beijing_dem.json').read_bytes())
  b64_nav = gz_b64((ROOT / 'data/nav_graph.json').read_bytes())
  b64_lod = gz_b64(pack_lod_soa())
  b64_fstrip = base64.b64encode((ROOT / 'assets/facades/facade_strip.jpg').read_bytes()).decode('ascii')
  b64_fmask = base64.b64encode((ROOT / 'assets/facades/facade_mask_strip.jpg').read_bytes()).decode('ascii')
  b64_dstrip = base64.b64encode((ROOT / 'assets/doors/door_strip.jpg').read_bytes()).decode('ascii')
  b64_dmask = base64.b64encode((ROOT / 'assets/doors/door_mask_strip.jpg').read_bytes()).decode('ascii')

  print('[2/2] Bundling Three.js & World Explorer ES modules...', flush=True)
  # The worker bundle is chunk_worker.js (its self.onmessage handler) plus everything it imports.
  worker_module_order = module_order_for('src/chunk_worker.js')
  worker_bundled_js = '\n'.join(wrap_es_module_as_iife(m) for m in worker_module_order)
  b64_worker = gz_b64(worker_bundled_js.encode('utf-8'))

  module_order = module_order_for('src/main.js')
  print(f'  main bundle: {len(module_order)} modules, worker bundle: {len(worker_module_order)} modules', flush=True)
  bundled_js = '\n'.join(wrap_es_module_as_iife(m) for m in module_order)

  bootstrap_js = r"""
await (async function bootstrapWorldExplorer() {
  async function gunzipBase64ToBytes(elId) {
    const b64 = document.getElementById(elId).textContent.trim();
    const binStr = atob(b64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  const [ovBytes, demBytes, navBytes, lodSoaBytes, workerBytes] = await Promise.all([
    gunzipBase64ToBytes('b64-overview'),
    gunzipBase64ToBytes('b64-dem'),
    gunzipBase64ToBytes('b64-nav'),
    gunzipBase64ToBytes('b64-lod-soa'),
    gunzipBase64ToBytes('b64-worker'),
  ]);

  const td = new TextDecoder('utf-8');
  const overviewText = td.decode(ovBytes);
  const demText = td.decode(demBytes);
  const navText = td.decode(navBytes);

  try {
    const workerBlob = new Blob([workerBytes], { type: 'application/javascript' });
    window.__CHUNK_WORKER_BLOB_URL__ = URL.createObjectURL(workerBlob);
  } catch {}

  const dvIn = new DataView(lodSoaBytes.buffer, lodSoaBytes.byteOffset, lodSoaBytes.byteLength);
  const cnt = dvIn.getUint32(0, true);
  let p = 4;
  const colCx = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const colCz = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const offLx = p; p += cnt * 2;
  const offLz = p; p += cnt * 2;
  const colW = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const colD = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const colH = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const colYaw = new Int8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt); p += cnt;
  const colSt = new Uint8Array(lodSoaBytes.buffer, lodSoaBytes.byteOffset + p, cnt);

  const lodBuf = new ArrayBuffer(4 + cnt * 28);
  const dvOut = new DataView(lodBuf);
  dvOut.setUint32(0, cnt, true);

  for (let i = 0; i < cnt; i++) {
    const cx = colCx[i];
    const cz = colCz[i];
    const ox = -20000.0 + cx * 1000.0 + 500.0;
    const oz = -20000.0 + cz * 1000.0 + 500.0;
    const lx = dvIn.getInt16(offLx + i * 2, true) * 0.5;
    const lz = dvIn.getInt16(offLz + i * 2, true) * 0.5;
    const wx = ox + lx;
    const wz = oz + lz;
    const bw = colW[i];
    const bd = colD[i];
    const h10 = colH[i] * 5;
    const yawInt = colYaw[i] * 250;
    const st = colSt[i];
    let r8 = 180, g8 = 176, b8 = 170;
    if (st === 1) { r8 = 168; g8 = 72; b8 = 62; }
    else if (st === 2) { r8 = 132; g8 = 134; b8 = 138; }
    else if (st === 3) { r8 = 108; g8 = 138; b8 = 168; }
    else {
      const v = ((i * 2654435761) >>> 0) & 0xff;
      const base = 162 + (v % 38);
      r8 = base + 6; g8 = base + 2; b8 = base - 4;
    }

    const outOff = 4 + i * 28;
    dvOut.setFloat32(outOff, wx, true);
    dvOut.setFloat32(outOff + 4, wz, true);
    dvOut.setFloat32(outOff + 8, bw, true);
    dvOut.setFloat32(outOff + 12, bd, true);
    dvOut.setUint16(outOff + 16, h10, true);
    dvOut.setUint16(outOff + 18, 0, true);
    dvOut.setInt16(outOff + 20, yawInt, true);
    dvOut.setUint8(outOff + 22, r8);
    dvOut.setUint8(outOff + 23, g8);
    dvOut.setUint8(outOff + 24, b8);
    dvOut.setUint8(outOff + 25, cx);
    dvOut.setUint8(outOff + 26, cz);
    dvOut.setUint8(outOff + 27, 0);
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('global_overview.json')) {
      return new Response(overviewText, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('beijing_dem.json')) {
      return new Response(demText, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('nav_graph.json')) {
      return new Response(navText, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('city_buildings_lod.bin')) {
      return new Response(lodBuf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    }
    return origFetch(input, init);
  };
})();
"""

  html = (ROOT / 'index.html').read_text(encoding='utf-8')
  css = (ROOT / 'styles.css').read_text(encoding='utf-8')

  wm_css = (ROOT / 'src/features/worldmap.css').read_text(encoding='utf-8')
  # map_modal.js injectStyles() skips its <link> when #wm-styles already exists.
  kaiju_css = (ROOT / 'src/features/kaiju/kaiju.css').read_text(encoding='utf-8')  # [kaiju]
  # map_modal.js injectStyles() skips its <link> when #wm-styles already exists (kaiju_mode.js: #kaiju-styles).
  html = html.replace(
      '<link rel="stylesheet" href="styles.css" />',
      f'<style>\n{css}\n</style>\n<style id="wm-styles">\n{wm_css}\n</style>\n<style id="kaiju-styles">\n{kaiju_css}\n</style>',
  )

  embedded_payload = f"""
  <script type="application/octet-stream" id="b64-overview">{b64_ov}</script>
  <script type="application/octet-stream" id="b64-dem">{b64_dem}</script>
  <script type="application/octet-stream" id="b64-nav">{b64_nav}</script>
  <script type="application/octet-stream" id="b64-lod-soa">{b64_lod}</script>
  <script type="application/octet-stream" id="b64-worker">{b64_worker}</script>
  <script>
  window.__EMBEDDED_FACADE_STRIP__ = "data:image/jpeg;base64,{b64_fstrip}";
  window.__EMBEDDED_FACADE_MASK_STRIP__ = "data:image/jpeg;base64,{b64_fmask}";
  window.__EMBEDDED_DOOR_STRIP__ = "data:image/jpeg;base64,{b64_dstrip}";
  window.__EMBEDDED_DOOR_MASK_STRIP__ = "data:image/jpeg;base64,{b64_dmask}";
  </script>
  <script>
  (async () => {{
    {bootstrap_js}
    {bundled_js}
  }})();
  </script>
"""
  html = html.replace('<script type="module" src="src/main.js"></script>', embedded_payload)

  OUT_FILE.write_text(html, encoding='utf-8')
  print(
      f'  -> Wrote {OUT_FILE} ({OUT_FILE.stat().st_size / (1024*1024):.2f} MB) in {round(time.time() - t0, 2)}s',
      flush=True,
  )


if __name__ == '__main__':
  build_world_explorer_html()
