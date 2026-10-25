#!/usr/bin/env python3
"""Fuses real satellite-derived 3D building footprints from Overture Maps (`2026-09-23.1` /

Zenodo Global 3D Building Footprints `doi:10.5281/zenodo.8174931`) into the 1,600 Beijing
1km x 1km chunks (`data/chunks/c_{cx}_{cz}.json`) and rebuilds `data/city_buildings_lod.bin`.

Preserves 100% of existing OpenStreetMap buildings (`osm_id < 2_000_000_000`) and only adds
non-overlapping real building footprints in blocks where OSM lacked building coverage.
"""

from collections import defaultdict
import concurrent.futures
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_beijing_world as bbw

OVERTURE_URLS = [
    'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-09-23.1/theme=buildings/type=building/part-00494-9725af6e-67fd-531d-9350-55d35be90778-c000.zstd.parquet',
    'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-09-23.1/theme=buildings/type=building/part-00492-8364bd96-2f9f-581f-92f4-9d75e3286eac-c000.zstd.parquet',
]
OVERTURE_ID_BASE = 2_000_000_000

STRICT_MIN_LON = bbw.CENTER_LON - bbw.HALF_SIZE_M / bbw.M_PER_DEG_LON
STRICT_MAX_LON = bbw.CENTER_LON + bbw.HALF_SIZE_M / bbw.M_PER_DEG_LON
STRICT_MIN_LAT = bbw.CENTER_LAT - bbw.HALF_SIZE_M / bbw.M_PER_DEG_LAT
STRICT_MAX_LAT = bbw.CENTER_LAT + bbw.HALF_SIZE_M / bbw.M_PER_DEG_LAT


class CompactReader:
  """Minimal Thrift CompactProtocol reader for Parquet FileMetaData & PageHeader."""

  def __init__(self, data, p=0):
    self.d = data
    self.p = p

  def read_byte(self):
    b = self.d[self.p]
    self.p += 1
    return b

  def read_varint(self):
    res = 0
    shift = 0
    while True:
      b = self.d[self.p]
      self.p += 1
      res |= (b & 0x7F) << shift
      if not (b & 0x80):
        return res
      shift += 7

  def read_zigzag(self):
    n = self.read_varint()
    return (n >> 1) ^ -(n & 1)

  def read_binary(self):
    n = self.read_varint()
    s = self.d[self.p : self.p + n]
    self.p += n
    return s

  def skip(self, t):
    if t in (1, 2):
      pass
    elif t == 3:
      self.p += 1
    elif t in (4, 5, 6):
      self.read_varint()
    elif t == 7:
      self.p += 8
    elif t == 8:
      self.read_binary()
    elif t in (9, 10):
      b = self.read_byte()
      sz = (b >> 4) & 0x0F
      et = b & 0x0F
      if sz == 15:
        sz = self.read_varint()
      for _ in range(sz):
        self.skip(et)
    elif t == 11:
      sz = self.read_varint()
      if sz > 0:
        kv = self.read_byte()
        kt, vt = (kv >> 4) & 0x0F, kv & 0x0F
        for _ in range(sz):
          self.skip(kt)
          self.skip(vt)
    elif t == 12:
      while True:
        b = self.read_byte()
        if b == 0:
          break
        ft = b & 0x0F
        if (b >> 4) == 0:
          self.read_zigzag()
        self.skip(ft)


def get_matching_geom_ranges(url):
  req = urllib.request.Request(url, headers={'Range': 'bytes=-8'})
  with urllib.request.urlopen(req, timeout=10) as r:
    flen, _ = struct.unpack('<I4s', r.read())
  req = urllib.request.Request(url, headers={'Range': f'bytes=-{flen+8}'})
  with urllib.request.urlopen(req, timeout=15) as r:
    footer = r.read()[:-8]

  cr = CompactReader(footer)
  last_fid = 0
  out = []
  while True:
    b = cr.read_byte()
    if b == 0:
      break
    delta = (b >> 4) & 0x0F
    ft = b & 0x0F
    fid = last_fid + delta if delta else cr.read_zigzag()
    last_fid = fid
    if fid == 4 and ft == 9:
      hdr = cr.read_byte()
      sz = (hdr >> 4) & 0x0F
      if sz == 15:
        sz = cr.read_varint()
      for rg_i in range(sz):
        rfid = 0
        nrows = 0
        cols = {}
        while True:
          rb = cr.read_byte()
          if rb == 0:
            break
          rd = (rb >> 4) & 0x0F
          rft = rb & 0x0F
          rfid = rfid + rd if rd else cr.read_zigzag()
          if rfid == 1 and rft == 9:
            chdr = cr.read_byte()
            csz = (chdr >> 4) & 0x0F
            if csz == 15:
              csz = cr.read_varint()
            for _ in range(csz):
              cfid = 0
              path = []
              foff = 0
              csize = 0
              dpoff = 0
              min_v = max_v = b''
              while True:
                cb = cr.read_byte()
                if cb == 0:
                  break
                cd = (cb >> 4) & 0x0F
                cft = cb & 0x0F
                cfid = cfid + cd if cd else cr.read_zigzag()
                if cfid == 3 and cft == 12:
                  mfid = 0
                  while True:
                    mb = cr.read_byte()
                    if mb == 0:
                      break
                    md = (mb >> 4) & 0x0F
                    mft = mb & 0x0F
                    mfid = mfid + md if md else cr.read_zigzag()
                    if mfid == 3 and mft == 9:
                      ph = cr.read_byte()
                      psz = (ph >> 4) & 0x0F
                      if psz == 15:
                        psz = cr.read_varint()
                      path = [cr.read_binary().decode() for _ in range(psz)]
                    elif mfid == 7 and mft == 6:
                      csize = cr.read_zigzag()
                    elif mfid == 9 and mft == 6:
                      foff = cr.read_zigzag()
                    elif mfid == 11 and mft == 6:
                      dpoff = cr.read_zigzag()
                    elif mfid == 12 and mft == 12:
                      stfid = 0
                      while True:
                        stb = cr.read_byte()
                        if stb == 0:
                          break
                        std = (stb >> 4) & 0x0F
                        stft = stb & 0x0F
                        stfid = stfid + std if std else cr.read_zigzag()
                        if stfid in (1, 5) and stft == 8:
                          max_v = cr.read_binary()
                        elif stfid in (2, 6) and stft == 8:
                          min_v = cr.read_binary()
                        else:
                          cr.skip(stft)
                    else:
                      cr.skip(mft)
                else:
                  cr.skip(cft)
              cols['.'.join(path)] = (
                  dpoff if dpoff > 0 else foff,
                  csize,
                  min_v,
                  max_v,
              )
          elif rfid == 3 and rft == 6:
            nrows = cr.read_zigzag()
          else:
            cr.skip(rft)
        xmin = struct.unpack('<d', cols['bbox.xmin'][2])[0]
        xmax = struct.unpack('<d', cols['bbox.xmax'][3])[0]
        ymin = struct.unpack('<d', cols['bbox.ymin'][2])[0]
        ymax = struct.unpack('<d', cols['bbox.ymax'][3])[0]
        if (
            xmin <= 116.625
            and xmax >= STRICT_MIN_LON
            and ymin <= STRICT_MAX_LAT
            and ymax >= STRICT_MIN_LAT
        ):
          out.append((url, rg_i, nrows, cols['geometry'][0], cols['geometry'][1]))
    else:
      cr.skip(ft)
  return out


def fetch_and_extract_polygons(task):
  """Downloads one RowGroup geometry column chunk, decompresses in one zstd call, and extracts Beijing polygons."""
  url, rg_i, _, start, size = task
  for attempt in range(3):
    try:
      req = urllib.request.Request(
          url, headers={'Range': f'bytes={start}-{start+size-1}'}
      )
      with urllib.request.urlopen(req, timeout=20) as r:
        geom_chunk = r.read()
      break
    except Exception:
      if attempt == 2:
        raise
      time.sleep(0.4)

  p = 0
  zstd_frames = []
  while p < len(geom_chunk):
    cr = CompactReader(geom_chunk, p)
    fid = 0
    csize = 0
    while True:
      b = cr.read_byte()
      if b == 0:
        break
      d = (b >> 4) & 0x0F
      ft = b & 0x0F
      fid = fid + d if d else cr.read_zigzag()
      if fid == 3 and ft == 5:
        csize = cr.read_zigzag()
      else:
        cr.skip(ft)
    zstd_frames.append(geom_chunk[cr.p : cr.p + csize])
    p = cr.p + csize

  # Single zstd invocation decompresses all concatenated frames in ~15ms
  all_raw = subprocess.check_output(['/usr/bin/zstd', '-d', '-q'], input=b''.join(zstd_frames))

  polys = []
  idx = 0
  n_len = len(all_raw)
  center_lon = bbw.CENTER_LON
  center_lat = bbw.CENTER_LAT
  m_lon = bbw.M_PER_DEG_LON
  m_lat = bbw.M_PER_DEG_LAT
  half_m = bbw.HALF_SIZE_M

  while True:
    idx = all_raw.find(b'\x01\x03\x00\x00\x00', idx)
    if idx == -1 or idx + 29 > n_len:
      break
    nrings, npts = struct.unpack_from('<II', all_raw, idx + 5)
    if 1 <= nrings <= 30 and 4 <= npts <= 300 and idx + 13 + npts * 16 <= n_len:
      lon0, lat0 = struct.unpack_from('<dd', all_raw, idx + 13)
      if STRICT_MIN_LON <= lon0 <= STRICT_MAX_LON and STRICT_MIN_LAT <= lat0 <= STRICT_MAX_LAT:
        coords = struct.unpack_from(f'<{npts*2}d', all_raw, idx + 13)
        ring = [
            (round((coords[k] - center_lon) * m_lon, 1), round((center_lat - coords[k + 1]) * m_lat, 1))
            for k in range(0, (npts - 1) * 2, 2)
        ]
        if len(ring) > 10:
          ring = bbw.simplify_ring(ring, 0.9)
        n_v = len(ring)
        if n_v >= 3:
          area2 = 0.0
          cx_s = 0.0
          cz_s = 0.0
          for i in range(n_v):
            x1, z1 = ring[i]
            x2, z2 = ring[(i + 1) % n_v]
            cross = x1 * z2 - x2 * z1
            area2 += cross
            cx_s += x1
            cz_s += z1
          area = abs(area2) * 0.5
          cx = cx_s / n_v
          cz = cz_s / n_v
          if 14.0 <= area <= 65000.0 and abs(cx) <= half_m and abs(cz) <= half_m:
            polys.append((ring, area, cx, cz))
      idx += 13 + npts * 16
    else:
      idx += 5
  return rg_i, len(polys), polys


def point_in_flat_ring(px, pz, flat):
  inside = False
  n = len(flat)
  j = n - 2
  for i in range(0, n, 2):
    xi, zi = flat[i], flat[i + 1]
    xj, zj = flat[j], flat[j + 1]
    if (zi > pz) != (zj > pz) and px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi:
      inside = not inside
    j = i
  return inside


def compute_oriented_bbox(flat):
  """Computes principal edge orientation yaw and oriented width/depth for a flat [x0, z0, ...] ring."""
  n = len(flat) // 2
  if n < 3:
    return 0.0, 0.0, 10.0, 10.0, 0.0
  best_len2 = -1.0
  best_dx, best_dz = 1.0, 0.0
  for i in range(n):
    x1, z1 = flat[i * 2], flat[i * 2 + 1]
    x2, z2 = flat[((i + 1) % n) * 2], flat[((i + 1) % n) * 2 + 1]
    dx, dz = x2 - x1, z2 - z1
    l2 = dx * dx + dz * dz
    if l2 > best_len2:
      best_len2 = l2
      best_dx, best_dz = dx, dz
  yaw = math.atan2(-best_dz, best_dx)
  cos_y = math.cos(yaw)
  sin_y = math.sin(yaw)
  u_min = v_min = 1e9
  u_max = v_max = -1e9
  for i in range(n):
    x, z = flat[i * 2], flat[i * 2 + 1]
    u = x * cos_y - z * sin_y
    v = x * sin_y + z * cos_y
    if u < u_min:
      u_min = u
    if u > u_max:
      u_max = u
    if v < v_min:
      v_min = v
    if v > v_max:
      v_max = v
  uc = (u_min + u_max) * 0.5
  vc = (v_min + v_max) * 0.5
  cx = uc * cos_y + vc * sin_y
  cz = -uc * sin_y + vc * cos_y
  w = max(4.0, min(180.0, u_max - u_min))
  d = max(4.0, min(180.0, v_max - v_min))
  return cx, cz, w, d, yaw


def main():
  t0 = time.time()
  data_dir = Path(__file__).resolve().parent.parent / 'data'
  chunks_dir = data_dir / 'chunks'

  print('[1/4] Reading Overture Maps Parquet footers for Beijing bounding box...', flush=True)
  tasks = []
  for u in OVERTURE_URLS:
    tasks.extend(get_matching_geom_ranges(u))
  print(
      f'  -> Found {len(tasks)} matching RowGroups'
      f' ({sum(t[4] for t in tasks)/1e6:.1f} MB compressed geometry).',
      flush=True,
  )

  print('[2/4] Downloading & decoding WKB building footprints in parallel...', flush=True)
  chunk_candidates = defaultdict(list)
  total_extracted = 0
  with concurrent.futures.ProcessPoolExecutor(max_workers=8) as ex:
    futs = [ex.submit(fetch_and_extract_polygons, t) for t in tasks]
    for fut in concurrent.futures.as_completed(futs):
      rg_i, cnt, polys = fut.result()
      total_extracted += cnt
      for ring, area, cx, cz in polys:
        cxi = max(0, min(bbw.GRID_DIM - 1, int((cx + bbw.HALF_SIZE_M) // bbw.CHUNK_SIZE_M)))
        czi = max(0, min(bbw.GRID_DIM - 1, int((cz + bbw.HALF_SIZE_M) // bbw.CHUNK_SIZE_M)))
        chunk_candidates[(cxi, czi)].append((ring, area, cx, cz))
      print(f'  -> Decoded RG {rg_i:2d}: +{cnt:,} buildings (cumulative {total_extracted:,})', flush=True)

  print(
      f'  -> Extracted {total_extracted:,} candidate Beijing footprints across'
      f' {len(chunk_candidates)} chunks in {round(time.time() - t0, 2)}s.',
      flush=True,
  )

  print('[3/4] Fusing non-overlapping footprints into 1,600 chunk files...', flush=True)
  added_count = 0
  kept_osm_count = 0
  lod_records = []
  next_ov_id = OVERTURE_ID_BASE + 1

  for cxi in range(bbw.GRID_DIM):
    for czi in range(bbw.GRID_DIM):
      cpath = chunks_dir / f'c_{cxi}_{czi}.json'
      with open(cpath, 'r', encoding='utf-8') as f:
        cdata = json.load(f)

      ox = -bbw.HALF_SIZE_M + cxi * bbw.CHUNK_SIZE_M + 500.0
      oz = -bbw.HALF_SIZE_M + czi * bbw.CHUNK_SIZE_M + 500.0

      # Keep only authentic OSM buildings (< OVERTURE_ID_BASE) so script is idempotent
      osm_blds = [b for b in cdata.get('buildings', []) if b[0] < OVERTURE_ID_BASE]
      kept_osm_count += len(osm_blds)

      cands = chunk_candidates.get((cxi, czi), [])
      if cands:
        # Spatial grid (100m x 100m cells inside 1km chunk) for fast O(1) overlap check
        cell_boxes = defaultdict(list)
        for b in osm_blds:
          fo = b[11]
          if len(fo) >= 6:
            xs = fo[0::2]
            zs = fo[1::2]
            bx0, bz0, bx1, bz1 = min(xs), min(zs), max(xs), max(zs)
            box_entry = (bx0, bz0, bx1, bz1, fo)
            for gx in range(int((bx0 + 500) // 100), int((bx1 + 500) // 100) + 1):
              for gz in range(int((bz0 + 500) // 100), int((bz1 + 500) // 100) + 1):
                cell_boxes[(gx, gz)].append(box_entry)

        water_polys = cdata.get('water_polys', [])
        road_segs = []
        for r in cdata.get('roads', []):
          rcls = r[1]
          if rcls in ('footway', 'cycleway', 'steps', 'service'):
            continue
          rw = max(4.0, r[5] * 0.55)
          rflat = r[10]
          for k in range(0, len(rflat) - 3, 3):
            x1, z1 = rflat[k], rflat[k + 2]
            x2, z2 = rflat[k + 3], rflat[k + 5]
            road_segs.append((min(x1, x2) - rw, min(z1, z2) - rw, max(x1, x2) + rw, max(z1, z2) + rw, x1, z1, x2 - x1, z2 - z1, rw * rw))

        for ring, area, cx, cz in cands:
          lx = cx - ox
          lz = cz - oz
          fo = []
          min_x = min_z = 1e9
          max_x = max_z = -1e9
          for x, z in ring:
            rx = round(x - ox, 1)
            rz = round(z - oz, 1)
            fo.extend((rx, rz))
            if rx < min_x:
              min_x = rx
            if rx > max_x:
              max_x = rx
            if rz < min_z:
              min_z = rz
            if rz > max_z:
              max_z = rz

          gx0, gz0 = int((min_x + 500) // 100), int((min_z + 500) // 100)
          gx1, gz1 = int((max_x + 500) // 100), int((max_z + 500) // 100)

          overlap = False
          for gx in range(gx0, gx1 + 1):
            for gz in range(gz0, gz1 + 1):
              for ex0, ez0, ex1, ez1, efo in cell_boxes.get((gx, gz), ()):
                if max_x < ex0 - 1.5 or min_x > ex1 + 1.5 or max_z < ez0 - 1.5 or min_z > ez1 + 1.5:
                  continue
                ix0 = max(min_x, ex0)
                iz0 = max(min_z, ez0)
                ix1 = min(max_x, ex1)
                iz1 = min(max_z, ez1)
                if ix1 > ix0 and iz1 > iz0:
                  inter = (ix1 - ix0) * (iz1 - iz0)
                  a1 = max(1.0, (max_x - min_x) * (max_z - min_z))
                  a2 = max(1.0, (ex1 - ex0) * (ez1 - ez0))
                  if inter / min(a1, a2) > 0.20:
                    overlap = True
                    break
                if point_in_flat_ring(lx, lz, efo):
                  overlap = True
                  break
              if overlap:
                break
            if overlap:
              break
          if overlap:
            continue

          in_water = False
          for wp in water_polys:
            wfo = wp[2]
            if len(wfo) >= 6 and point_in_flat_ring(lx, lz, wfo):
              in_water = True
              break
          if in_water:
            continue

          on_road = False
          for rx0, rz0, rx1, rz1, x1, z1, vx, vz, rw2 in road_segs:
            if lx < rx0 or lx > rx1 or lz < rz0 or lz > rz1:
              continue
            l2 = vx * vx + vz * vz
            if l2 < 0.1:
              continue
            t = max(0.0, min(1.0, ((lx - x1) * vx + (lz - z1) * vz) / l2))
            dx = lx - (x1 + vx * t)
            dz = lz - (z1 + vz * t)
            if dx * dx + dz * dz < rw2:
              on_road = True
              break
          if on_road:
            continue

          wid = next_ov_id
          next_ov_id += 1
          span_w = max_x - min_x
          span_d = max_z - min_z
          aspect = max(span_w, span_d) / max(1.0, min(span_w, span_d))
          dist_center = math.hypot(cx, cz)
          synth_tags = {'building': 'yes'}
          if dist_center < 16000 and 150.0 <= area <= 2200.0 and aspect >= 1.65:
            synth_tags['building'] = 'apartments'
          elif dist_center < 14000 and area >= 2200.0:
            synth_tags['building'] = 'commercial'

          h, min_h, lvl, style, _, col, rcol, rshape = bbw.estimate_building_height_and_style(
              synth_tags, area, cx, cz, wid
          )
          new_b = [wid, '', synth_tags['building'], 0, h, min_h, lvl, style, col, rcol, rshape, fo, []]
          osm_blds.append(new_b)
          box_entry = (min_x, min_z, max_x, max_z, fo)
          for gx in range(gx0, gx1 + 1):
            for gz in range(gz0, gz1 + 1):
              cell_boxes[(gx, gz)].append(box_entry)
          added_count += 1

        cdata['buildings'] = osm_blds
        with open(cpath, 'w', encoding='utf-8') as f:
          json.dump(cdata, f, ensure_ascii=False, separators=(',', ':'))

      for b in osm_blds:
        osm_id, _, _, is_part, raw_h, raw_min_h, _, style, _, _, _, fo, _ = b
        if is_part or len(fo) < 6:
          continue
        bcx, bcz, bw, bd, byaw = compute_oriented_bbox(fo)
        if bw * bd < 20.0:
          continue
        wx = ox + bcx
        wz = oz + bcz
        if style == 'imperial':
          r8, g8, b8 = 168, 72, 62
        elif style == 'hutong':
          r8, g8, b8 = 132, 134, 138
        elif style == 'glass':
          r8, g8, b8 = 108, 138, 168
        else:
          v = (osm_id * 2654435761) & 0xFF
          base = 162 + (v % 38)
          r8, g8, b8 = base + 6, base + 2, base - 4
        lod_records.append(
            struct.pack(
                '<ffffHHhBBBBBB',
                wx,
                wz,
                bw,
                bd,
                min(65535, max(20, int(round(raw_h * 10)))),
                min(65535, max(0, int(round(raw_min_h * 10)))),
                max(-32767, min(32767, int(round(byaw * 10000)))),
                cxi,
                czi,
                r8,
                g8,
                b8,
                0,
            )
        )

  print(
      f'  -> Kept {kept_osm_count:,} OSM buildings + added {added_count:,} Overture real'
      f' buildings = {kept_osm_count + added_count:,} total buildings!',
      flush=True,
  )

  print(f'[4/4] Writing {len(lod_records):,} oriented 3D LOD boxes to city_buildings_lod.bin...', flush=True)
  lod_path = data_dir / 'city_buildings_lod.bin'
  with open(lod_path, 'wb') as lf:
    lf.write(struct.pack('<I', len(lod_records)))
    for rec in lod_records:
      lf.write(rec)

  print(
      f'Done in {round(time.time() - t0, 2)}s! city_buildings_lod.bin ='
      f' {lod_path.stat().st_size / (1024*1024):.2f} MB',
      flush=True,
  )


if __name__ == '__main__':
  main()
