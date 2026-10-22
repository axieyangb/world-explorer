#!/usr/bin/env python3
"""Offline OpenStreetMap PBF Compiler for 40km x 40km Beijing 3D Open-World MVP.

Reads Geofabrik's official `beijing.osm.pbf` and compiles:
1. `data/global_overview.json`:
   - City-wide arterial road network & precomputed A* navigation graph
   - City-wide water bodies & rivers
   - City-wide subway network & stations
   - City-wide tall skyline (>= 55m) & landmarks
   - Curated fast-travel bookmarks (interchanges, landmarks, railway hubs)
2. `data/chunks/c_{cx}_{cz}.json` (40 x 40 = 1,600 chunks of 1km x 1km):
   - Full-resolution 3D roads with continuous bridge/tunnel/ramp elevations
   - Full-resolution 3D buildings + `building:part` + multipolygon courtyard holes
   - Railways, parks/landuse plazas, waterways, and 3D traffic facilities
     (`traffic_signals`, `crossing`, `motorway_junction`, `bus_stop`, `subway_entrance`)
"""

from collections import Counter, defaultdict
import json
import math
import os
from pathlib import Path
import re
import struct
import time
import zlib
from google.protobuf import descriptor_pb2, message_factory

CENTER_LAT = 39.9087
CENTER_LON = 116.3975
M_PER_DEG_LAT = 111033.0
M_PER_DEG_LON = 85387.0

HALF_SIZE_M = 20000.0
MARGIN_M = 800.0
CHUNK_SIZE_M = 1000.0
GRID_DIM = 40  # 40 x 40 = 1600 chunks covering [-20000, +20000] meters

MIN_LAT = CENTER_LAT - (HALF_SIZE_M + MARGIN_M) / M_PER_DEG_LAT
MAX_LAT = CENTER_LAT + (HALF_SIZE_M + MARGIN_M) / M_PER_DEG_LAT
MIN_LON = CENTER_LON - (HALF_SIZE_M + MARGIN_M) / M_PER_DEG_LON
MAX_LON = CENTER_LON + (HALF_SIZE_M + MARGIN_M) / M_PER_DEG_LON

HIGHWAY_SPECS = {
    'motorway':       ('motorway',       3, 12.5, 1),
    'motorway_link':  ('motorway_link',  1,  6.0, 1),
    'trunk':          ('trunk',          3, 11.5, 1),
    'trunk_link':     ('trunk_link',     1,  5.8, 1),
    'primary':        ('primary',        2,  9.5, 0),
    'primary_link':   ('primary_link',   1,  5.2, 1),
    'secondary':      ('secondary',      2,  8.0, 0),
    'secondary_link': ('secondary_link', 1,  4.8, 1),
    'tertiary':       ('tertiary',       2,  6.5, 0),
    'tertiary_link':  ('tertiary_link',  1,  4.5, 1),
    'residential':    ('residential',    1,  5.2, 0),
    'unclassified':   ('residential',    1,  5.0, 0),
    'living_street':  ('residential',    1,  4.5, 0),
    'service':        ('service',        1,  3.8, 0),
    'pedestrian':     ('pedestrian',     1,  4.5, 0),
    'footway':        ('footway',        1,  2.2, 0),
    'cycleway':       ('cycleway',       1,  2.5, 0),
    'steps':          ('footway',        1,  2.0, 0),
}

ARTERIAL_CLASSES = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'secondary'
}

DRIVABLE_CLASSES = {
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link',
    'tertiary', 'tertiary_link', 'residential', 'service'
}


def build_proto_classes():
  fproto = descriptor_pb2.FileDescriptorProto()
  fproto.name = 'osm_build.proto'
  fproto.package = 'osm_build'
  fproto.syntax = 'proto3'

  def add_msg(name, fields):
    m = fproto.message_type.add()
    m.name = name
    for fname, fnum, flabel, ftype, tname in fields:
      f = m.field.add()
      f.name, f.number, f.label, f.type = fname, fnum, flabel, ftype
      if tname:
        f.type_name = tname

  L_OPT = descriptor_pb2.FieldDescriptorProto.LABEL_OPTIONAL
  L_REP = descriptor_pb2.FieldDescriptorProto.LABEL_REPEATED
  T_INT32 = descriptor_pb2.FieldDescriptorProto.TYPE_INT32
  T_INT64 = descriptor_pb2.FieldDescriptorProto.TYPE_INT64
  T_SINT64 = descriptor_pb2.FieldDescriptorProto.TYPE_SINT64
  T_UINT32 = descriptor_pb2.FieldDescriptorProto.TYPE_UINT32
  T_BYTES = descriptor_pb2.FieldDescriptorProto.TYPE_BYTES
  T_STR = descriptor_pb2.FieldDescriptorProto.TYPE_STRING
  T_MSG = descriptor_pb2.FieldDescriptorProto.TYPE_MESSAGE

  add_msg('BlobHeader', [('type', 1, L_OPT, T_STR, None), ('datasize', 3, L_OPT, T_INT32, None)])
  add_msg('Blob', [('raw', 1, L_OPT, T_BYTES, None), ('raw_size', 2, L_OPT, T_INT32, None), ('zlib_data', 3, L_OPT, T_BYTES, None)])
  add_msg('StringTable', [('s', 1, L_REP, T_BYTES, None)])
  add_msg('DenseNodes', [('id', 1, L_REP, T_SINT64, None), ('lat', 8, L_REP, T_SINT64, None), ('lon', 9, L_REP, T_SINT64, None), ('keys_vals', 10, L_REP, T_INT32, None)])
  add_msg('Way', [('id', 1, L_OPT, T_INT64, None), ('keys', 2, L_REP, T_UINT32, None), ('vals', 3, L_REP, T_UINT32, None), ('refs', 8, L_REP, T_SINT64, None)])
  add_msg('Relation', [('id', 1, L_OPT, T_INT64, None), ('keys', 2, L_REP, T_UINT32, None), ('vals', 3, L_REP, T_UINT32, None), ('roles_sid', 8, L_REP, T_INT32, None), ('memids', 9, L_REP, T_SINT64, None), ('types', 10, L_REP, T_INT32, None)])
  add_msg('PrimitiveGroup', [('dense', 2, L_OPT, T_MSG, '.osm_build.DenseNodes'), ('ways', 3, L_REP, T_MSG, '.osm_build.Way'), ('relations', 4, L_REP, T_MSG, '.osm_build.Relation')])
  add_msg('PrimitiveBlock', [('stringtable', 1, L_OPT, T_MSG, '.osm_build.StringTable'), ('primitivegroup', 2, L_REP, T_MSG, '.osm_build.PrimitiveGroup'), ('granularity', 17, L_OPT, T_INT32, None), ('lat_offset', 19, L_OPT, T_INT64, None), ('lon_offset', 20, L_OPT, T_INT64, None)])

  msgs = message_factory.GetMessages([fproto])
  return msgs['osm_build.BlobHeader'], msgs['osm_build.Blob'], msgs['osm_build.PrimitiveBlock']


NUM_RE = re.compile(r'[-+]?\d+(?:\.\d+)?')


def parse_float(val, default=None):
  if not val:
    return default
  m = NUM_RE.search(str(val))
  if not m:
    return default
  try:
    return float(m.group(0))
  except ValueError:
    return default


def parse_layer(tags):
  has_bridge = 'bridge' in tags and tags['bridge'] not in ('no', 'false', '0')
  has_tunnel = 'tunnel' in tags and tags['tunnel'] not in ('no', 'false', '0')
  has_cutting = 'cutting' in tags and tags['cutting'] not in ('no', 'false', '0')
  has_covered = 'covered' in tags and tags['covered'] not in ('no', 'false', '0')
  raw = tags.get('layer')
  if raw is not None:
    v = parse_float(raw, 0.0)
    lv = max(-3, min(4, int(round(v))))
    if lv > 0 and not has_bridge:
      lv = 0
    elif lv < 0 and not (has_tunnel or has_cutting or has_covered):
      lv = 0
    if lv != 0:
      return lv
  if has_bridge:
    return 1
  if has_tunnel or has_cutting:
    return -1
  return 0


def polygon_area_and_centroid(ring):
  """Computes signed area (m^2) and centroid (cx, cz) for [(x, z), ...]."""
  n = len(ring)
  if n < 3:
    return 0.0, (ring[0][0] if ring else 0.0), (ring[0][1] if ring else 0.0)
  area2 = 0.0
  cx = 0.0
  cz = 0.0
  for i in range(n):
    x1, z1 = ring[i]
    x2, z2 = ring[(i + 1) % n]
    cross = x1 * z2 - x2 * z1
    area2 += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  if abs(area2) < 1e-5:
    avg_x = sum(p[0] for p in ring) / n
    avg_z = sum(p[1] for p in ring) / n
    return 0.0, avg_x, avg_z
  area = 0.5 * area2
  return abs(area), cx / (3.0 * area2), cz / (3.0 * area2)


def simplify_ring(coords, tol=0.35):
  """Removes near-collinear or duplicate points to keep chunk JSON compact."""
  if len(coords) <= 4:
    return coords
  out = [coords[0]]
  for i in range(1, len(coords) - 1):
    px, pz = out[-1]
    cx, cz = coords[i]
    nx, nz = coords[i + 1]
    if (cx - px) ** 2 + (cz - pz) ** 2 < tol * tol:
      continue
    # Check perpendicular distance from (cx, cz) to segment (px, pz)-(nx, nz)
    dx, dz = nx - px, nz - pz
    seg_len2 = dx * dx + dz * dz
    if seg_len2 > 1e-4:
      cross = abs((cx - px) * dz - (cz - pz) * dx)
      if cross * cross / seg_len2 < (tol * 0.4) ** 2:
        continue
    out.append(coords[i])
  if (coords[-1][0] - out[0][0]) ** 2 + (coords[-1][1] - out[0][1]) ** 2 > 0.04:
    out.append(coords[-1])
  return out


def simplify_polyline_3d(pts, tol=1.5):
  if len(pts) <= 2:
    return pts
  out = [pts[0]]
  for i in range(1, len(pts) - 1):
    px, py, pz = out[-1]
    cx, cy, cz = pts[i]
    nx, ny, nz = pts[i + 1]
    if abs(cy - py) > 0.02 or abs(ny - cy) > 0.02:
      out.append(pts[i])
      continue
    dx, dz = nx - px, nz - pz
    seg_len2 = dx * dx + dz * dz
    if seg_len2 > 1e-4:
      cross = abs((cx - px) * dz - (cz - pz) * dx)
      if cross * cross / seg_len2 < tol * tol and (cx - px) ** 2 + (cz - pz) ** 2 < (tol * 12) ** 2:
        continue
    out.append(pts[i])
  out.append(pts[-1])
  return out


def stitch_way_rings(way_id_list, way_nodes_map, nodes_xy):
  """Stitches a list of OSM way IDs into closed coordinate rings [(x, z), ...]."""
  segments = []
  for wid in way_id_list:
    nids = way_nodes_map.get(wid)
    if not nids or len(nids) < 2:
      continue
    pts = [nodes_xy[nid] for nid in nids if nid in nodes_xy]
    if len(pts) >= 2:
      segments.append((nids[0], nids[-1], pts))

  rings = []
  used = [False] * len(segments)
  for i in range(len(segments)):
    if used[i]:
      continue
    used[i] = True
    head_id, tail_id, curr_pts = segments[i][0], segments[i][1], list(segments[i][2])
    while head_id != tail_id:
      matched = False
      for j in range(len(segments)):
        if used[j]:
          continue
        h2, t2, pts2 = segments[j]
        if tail_id == h2:
          curr_pts.extend(pts2[1:])
          tail_id = t2
          used[j] = True
          matched = True
          break
        elif tail_id == t2:
          curr_pts.extend(reversed(pts2[:-1]))
          tail_id = h2
          used[j] = True
          matched = True
          break
        elif head_id == t2:
          curr_pts = list(pts2[:-1]) + curr_pts
          head_id = h2
          used[j] = True
          matched = True
          break
        elif head_id == h2:
          curr_pts = list(reversed(pts2[1:])) + curr_pts
          head_id = t2
          used[j] = True
          matched = True
          break
      if not matched:
        break
    if len(curr_pts) >= 3:
      if curr_pts[0] == curr_pts[-1] and len(curr_pts) > 3:
        curr_pts = curr_pts[:-1]
      if len(curr_pts) >= 3:
        rings.append(curr_pts)
  return rings


def estimate_building_height_and_style(tags, area, cx, cz, osm_id):
  """Computes accurate height, min_height, levels, and architectural style."""
  name = tags.get('name', tags.get('name:zh', ''))
  btype = tags.get('building') or tags.get('building:part') or 'yes'
  is_part = 'building:part' in tags

  raw_h = parse_float(tags.get('height'))
  raw_mh = parse_float(tags.get('min_height'), 0.0)
  raw_lvl = parse_float(tags.get('building:levels'))
  raw_mlvl = parse_float(tags.get('building:min_level'), 0.0)

  # Sanitize OSM mapper typos where sea-level elevation (e.g. 633m) was placed in height
  if raw_h is not None and raw_h > 340.0:
    if '中国尊' not in name and '中信大厦' not in name and '电视塔' not in name:
      if raw_lvl and 1 <= raw_lvl <= 100:
        raw_h = raw_lvl * 3.8
      else:
        raw_h = None

  min_h = raw_mh if raw_mh > 0 else (raw_mlvl * 3.4 if raw_mlvl > 0 else 0.0)

  if raw_h is not None and raw_h > 0:
    h = raw_h
    lvl = int(round(raw_lvl)) if raw_lvl else max(1, int(round(h / 3.5)))
  elif raw_lvl is not None and raw_lvl > 0:
    lvl = int(round(raw_lvl))
    floor_h = 3.9 if btype in ('office', 'commercial', 'hotel', 'public', 'retail') else 3.1
    h = lvl * floor_h
  else:
    # Deterministic spatial & semantic height estimation
    dist_center = math.hypot(cx, cz)
    # Check distance to major high-rise districts:
    # Guomao CBD (+5400, -300), Financial St (-3100, -700), Zhongguancun (-6800, -8200),
    # Wangjing (+6800, -9600), Lize (-6200, +4200), Sanlitun (+4600, -3000)
    d_cbd = min(
        math.hypot(cx - 5400, cz + 300),
        math.hypot(cx + 3100, cz + 700),
        math.hypot(cx + 6800, cz + 8200),
        math.hypot(cx - 6800, cz + 9600),
        math.hypot(cx + 6200, cz - 4200),
    )
    h_seed = ((osm_id * 1103515245 + 12345) >> 16) & 0xFFFF
    r01 = (h_seed % 1000) / 1000.0

    # Royal Palaces & Imperial Gardens (WGS-84 bounds: Forbidden City + Jingshan, Beihai, Summer Palace, Yuquan Hill, Fragrant Hills)
    in_royal_garden = (
        (-970 <= cx <= -170 and -2030 <= cz <= 220)  # Forbidden City + Jingshan
        or (-1900 <= cx <= -970 and -2100 <= cz <= 200)  # Beihai + Zhongnanhai
        or (-12200 <= cx <= -10400 and -10250 <= cz <= -8300)  # Summer Palace
        or (-13800 <= cx <= -12900 and -9850 <= cz <= -8900)  # Yuquan Hill
        or (-19650 <= cx <= -17750 and -9650 <= cz <= -8600)  # Fragrant Hills
    )
    if in_royal_garden:
      lvl = 2 if area > 450 else 1
      h = 11.5 if area > 1200 else (8.0 if area > 350 else 5.5)
    # Old Beijing Hutong Preservation Zones inside 2nd Ring (small footprints)
    elif dist_center < 3200 and area < 260 and btype in ('yes', 'residential', 'house', 'detached', 'hut', 'terrace'):
      lvl = 1 if r01 < 0.78 else 2
      h = 4.2 + r01 * 2.2
    elif btype in ('office', 'commercial'):
      if d_cbd < 1800:
        lvl = int(16 + r01 * 28)
      elif dist_center < 10000:
        lvl = int(8 + r01 * 16)
      else:
        lvl = int(5 + r01 * 8)
      h = lvl * 3.8
    elif btype in ('apartments', 'dormitory'):
      if dist_center < 3500:
        lvl = int(6 + r01 * 6)
      elif dist_center < 14000:
        lvl = int(12 + r01 * 16)
      else:
        lvl = int(6 + r01 * 12)
      h = lvl * 3.0
    elif btype in ('retail', 'supermarket', 'hotel', 'hospital', 'university', 'school', 'civic', 'public', 'government'):
      lvl = int(4 + r01 * 7)
      h = lvl * 3.8
    elif btype in ('train_station', 'transportation', 'stadium', 'grandstand'):
      lvl = 4
      h = 22.0 + r01 * 10.0
    elif btype in ('industrial', 'warehouse', 'manufacture', 'hangar', 'garages'):
      lvl = 2
      h = 8.5 + r01 * 5.0
    elif btype in ('roof', 'canopy'):
      lvl = 1
      min_h = 4.5
      h = 6.2
    else:
      # Generic 'building=yes'
      if d_cbd < 1400 and area > 450:
        lvl = int(14 + r01 * 22)
        h = lvl * 3.7
      elif area > 2200:
        lvl = int(7 + r01 * 10)
        h = lvl * 3.5
      elif area > 450:
        lvl = int(6 + r01 * 10)
        h = lvl * 3.1
      elif dist_center < 3500 and area < 300:
        lvl = 1 if r01 < 0.7 else 2
        h = 4.5 + r01 * 2.5
      else:
        lvl = int(4 + r01 * 6)
        h = lvl * 3.1

  if h <= min_h + 1.0:
    h = min_h + 3.2

  # Determine architectural visual style
  in_imperial = (
      (-970 <= cx <= -170 and -2030 <= cz <= 220)  # Forbidden City + Jingshan (WGS-84)
      or (-1900 <= cx <= -970 and -2100 <= cz <= 200)  # Beihai + Zhongnanhai (WGS-84)
      or (-150 <= cx <= 850 and 2900 <= cz <= 3900)  # Temple of Heaven (WGS-84)
      or (-12200 <= cx <= -10400 and -10250 <= cz <= -8300)  # Summer Palace (WGS-84)
      or (-13800 <= cx <= -12900 and -9850 <= cz <= -8900)  # Yuquan Hill (WGS-84)
      or (-19650 <= cx <= -17750 and -9650 <= cz <= -8600)  # Fragrant Hills (WGS-84)
      or ('故宫' in name or '殿' in name or '天安门' in name or '城楼' in name or '箭楼' in name or '角楼' in name or '祈年' in name or '鼓楼' in name or '钟楼' in name or '雍和宫' in name or '亭' in name or '阁' in name or '塔' in name)
  )
  if in_imperial and h < 48:
    style = 'imperial'
  elif h <= 7.5 and math.hypot(cx, cz) < 4200 and area < 420:
    style = 'hutong'
  elif h >= 55.0 or btype in ('office', 'commercial', 'hotel'):
    style = 'glass'
  elif btype in ('industrial', 'warehouse', 'hangar'):
    style = 'industrial'
  elif btype in ('apartments', 'residential', 'dormitory'):
    style = 'residential'
  else:
    style = 'modern'

  col = tags.get('building:colour', '')
  rcol = tags.get('roof:colour', '')
  rshape = tags.get('roof:shape', '')

  return round(h, 1), round(min_h, 1), int(lvl), style, is_part, col, rcol, rshape


def main():
  t_start = time.time()
  pbf_path = Path('/tmp/beijing.osm.pbf')
  out_dir = Path('./data')
  chunks_dir = out_dir / 'chunks'
  chunks_dir.mkdir(parents=True, exist_ok=True)

  BlobHeader, Blob, PrimitiveBlock = build_proto_classes()

  print('[1/5] Scanning nodes, ways, and relations from beijing.osm.pbf...')
  nodes_xy = {}  # nid -> (x_m, z_m) rounded to 0.1m
  facilities_raw = []  # (x, z, ftype, nid, name, ref, extra)
  ways_raw = {}  # wid -> (nids_tuple, tags_dict)
  relations_raw = []  # (rid, tags_dict, [(mtype, mid, role), ...])

  with open(pbf_path, 'rb') as f:
    while True:
      b = f.read(4)
      if not b:
        break
      bh = BlobHeader.FromString(f.read(struct.unpack('!I', b)[0]))
      blob = Blob.FromString(f.read(bh.datasize))
      if bh.type != 'OSMData':
        continue
      pb = PrimitiveBlock.FromString(zlib.decompress(blob.zlib_data) if blob.zlib_data else blob.raw)
      gran = pb.granularity or 100
      lat_off = pb.lat_offset or 0
      lon_off = pb.lon_offset or 0
      st = [s.decode('utf-8', 'ignore') for s in pb.stringtable.s]

      for pg in pb.primitivegroup:
        if pg.dense.id:
          nid = 0
          lat = 0
          lon = 0
          kv_idx = 0
          kvs = pg.dense.keys_vals
          n_kvs = len(kvs)
          for did, dlat, dlon in zip(pg.dense.id, pg.dense.lat, pg.dense.lon):
            nid += did
            lat += dlat
            lon += dlon
            fl = (lat_off + gran * lat) * 1e-9
            fn = (lon_off + gran * lon) * 1e-9
            in_box = (MIN_LAT <= fl <= MAX_LAT and MIN_LON <= fn <= MAX_LON)
            if in_box:
              xm = round((fn - CENTER_LON) * M_PER_DEG_LON, 1)
              zm = round((CENTER_LAT - fl) * M_PER_DEG_LAT, 1)
              nodes_xy[nid] = (xm, zm)

            if kv_idx < n_kvs:
              ntags = None
              while kv_idx < n_kvs and kvs[kv_idx] != 0:
                if in_box:
                  if ntags is None:
                    ntags = {}
                  ntags[st[kvs[kv_idx]]] = st[kvs[kv_idx + 1]]
                kv_idx += 2
              kv_idx += 1
              if in_box and ntags and abs(xm) <= HALF_SIZE_M and abs(zm) <= HALF_SIZE_M:
                hw = ntags.get('highway')
                rw = ntags.get('railway')
                nm = ntags.get('name', ntags.get('name:zh', ''))
                ref = ntags.get('ref', '')
                if hw == 'traffic_signals':
                  facilities_raw.append((xm, zm, 'tl', nid, nm, ref))
                elif hw == 'crossing':
                  facilities_raw.append((xm, zm, 'cr', nid, nm, ref))
                elif hw == 'motorway_junction':
                  facilities_raw.append((xm, zm, 'mj', nid, nm, ref))
                elif hw == 'bus_stop':
                  facilities_raw.append((xm, zm, 'bs', nid, nm, ref))
                elif rw == 'subway_entrance':
                  facilities_raw.append((xm, zm, 'se', nid, nm, ref))
                elif rw == 'station' or ntags.get('station') == 'subway':
                  facilities_raw.append((xm, zm, 'st', nid, nm, ref))

        if pg.ways:
          for w in pg.ways:
            nid = 0
            nids = []
            any_in = False
            for dref in w.refs:
              nid += dref
              nids.append(nid)
              if not any_in and nid in nodes_xy:
                any_in = True
            if any_in:
              tags = {st[k]: st[v] for k, v in zip(w.keys, w.vals)}
              ways_raw[w.id] = (nids, tags)

        if pg.relations:
          for r in pg.relations:
            tags = {st[k]: st[v] for k, v in zip(r.keys, r.vals)}
            rtype = tags.get('type', '')
            if rtype in ('multipolygon', 'building', 'route'):
              mid = 0
              members = []
              for r_sid, dmid, mtype in zip(r.roles_sid, r.memids, r.types):
                mid += dmid
                members.append((mtype, mid, st[r_sid]))
              relations_raw.append((r.id, tags, members))

  print(f'  -> Loaded {len(nodes_xy):,} nodes, {len(ways_raw):,} ways, {len(relations_raw):,} relations, {len(facilities_raw):,} facility nodes in {round(time.time() - t_start, 2)}s')

  # [2/5] Solve 3D Road & Railway Elevations with Topological Bridge/Tunnel Ramp Continuity
  print('[2/5] Solving 3D multi-level road & bridge/tunnel elevation profiles...')
  NON_VEHICULAR_HW = {'footway', 'cycleway', 'pedestrian', 'steps', 'path', 'corridor'}
  raw_hw_ways = []
  rw_ways = []
  sunken_bboxes = []  # (minx, minz, maxx, maxz, is_cutting)

  for wid, (nids, tags) in ways_raw.items():
    hw = tags.get('highway')
    rw = tags.get('railway')
    valid_nids = [n for n in nids if n in nodes_xy]
    if len(valid_nids) < 2:
      continue

    if hw in HIGHWAY_SPECS:
      layer = parse_layer(tags)
      has_bridge = 'bridge' in tags and tags['bridge'] not in ('no', 'false', '0')
      has_tunnel = 'tunnel' in tags and tags['tunnel'] not in ('no', 'false', '0')
      has_cutting = 'cutting' in tags and tags['cutting'] not in ('no', 'false', '0')
      is_bridge = 1 if has_bridge or layer > 0 else 0
      is_tunnel = 1 if has_tunnel or has_cutting or layer < 0 else 0
      target_y = layer * 6.0
      raw_hw_ways.append((wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y, has_cutting))
      if (is_tunnel or layer < 0) and hw not in NON_VEHICULAR_HW:
        xs = [nodes_xy[n][0] for n in valid_nids]
        zs = [nodes_xy[n][1] for n in valid_nids]
        sunken_bboxes.append((min(xs) - 18.0, min(zs) - 18.0, max(xs) + 18.0, max(zs) + 18.0, has_cutting))

    elif rw in ('rail', 'subway', 'light_rail', 'tram', 'monorail'):
      layer = parse_layer(tags)
      is_bridge = 1 if ('bridge' in tags and tags['bridge'] not in ('no', 'false', '0')) or layer > 0 else 0
      is_tunnel = 1 if ('tunnel' in tags and tags['tunnel'] not in ('no', 'false', '0')) or layer < 0 else 0
      # Subway without explicit bridge/layer is underground unless bridge=yes or layer>=0 on surface sections
      if rw == 'subway' and not is_bridge and 'layer' not in tags and tags.get('tunnel') != 'no':
        is_tunnel = 1
        layer = -1
      rw_ways.append((wid, valid_nids, tags, rw, layer, is_bridge, is_tunnel))

  # Pre-count ground vehicular degree so we can also identify short ground-level bridges spanning sunken trenches
  pre_ground_deg = Counter()
  ground_cont_deg = Counter()
  for wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y, _ in raw_hw_ways:
    if hw not in NON_VEHICULAR_HW and not is_bridge and not is_tunnel and layer == 0:
      for n in valid_nids:
        pre_ground_deg[n] += 1
      if not hw.endswith('_link'):
        for n in valid_nids[1:-1]:
          ground_cont_deg[n] += 2
        ground_cont_deg[valid_nids[0]] += 1
        ground_cont_deg[valid_nids[-1]] += 1

  hw_ways = []
  node_bridge_heights = defaultdict(list)
  node_bridge_cont_heights = defaultdict(list)
  node_ground_deg = Counter()
  major_ground_deg = Counter()
  hw_node_adj = defaultdict(list)  # nid -> [(nbr_nid, dist_m)]
  bridge_ways_info = []  # [(valid_nids, target_y)]

  for wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y, has_cutting in raw_hw_ways:
    # Detect ground-level bridges spanning across a sunken cutting/trench (e.g., 保福寺桥, 中关村一桥, 中关村二桥, 展春桥)
    if is_bridge and layer == 1:
      xs = [nodes_xy[n][0] for n in valid_nids]
      zs = [nodes_xy[n][1] for n in valid_nids]
      bx0, bz0, bx1, bz1 = min(xs), min(zs), max(xs), max(zs)
      span = math.hypot(bx1 - bx0, bz1 - bz0)
      if span <= 220.0:
        crosses_cutting = False
        crosses_sunken = False
        for sx0, sz0, sx1, sz1, s_cut in sunken_bboxes:
          if bx0 <= sx1 and bx1 >= sx0 and bz0 <= sz1 and bz1 >= sz0:
            crosses_sunken = True
            if s_cut:
              crosses_cutting = True
              break
        u0, u1 = valid_nids[0], valid_nids[-1]
        both_ends_ground_xroad = (pre_ground_deg[u0] >= 2 and pre_ground_deg[u1] >= 2)
        if crosses_cutting or (crosses_sunken and both_ends_ground_xroad and span <= 120.0):
          target_y = 0.0
          layer = 0

    hw_ways.append((wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y))

    # Only vehicular ways participate in 3D road elevation pinning & ramp propagation
    if hw in NON_VEHICULAR_HW:
      continue

    if target_y != 0.0:
      bridge_ways_info.append((valid_nids, target_y))
      for n in valid_nids:
        node_bridge_heights[n].append(target_y)
      for n in valid_nids[1:-1]:
        node_bridge_cont_heights[n].append(target_y)
        node_bridge_cont_heights[n].append(target_y)
      node_bridge_cont_heights[valid_nids[0]].append(target_y)
      node_bridge_cont_heights[valid_nids[-1]].append(target_y)
    else:
      is_link_or_service = hw.endswith('_link') or hw == 'service'
      for n in valid_nids:
        node_ground_deg[n] += 1
        if not is_link_or_service:
          major_ground_deg[n] += 1
      for i in range(len(valid_nids) - 1):
        u, v = valid_nids[i], valid_nids[i + 1]
        ux, uz = nodes_xy[u]
        vx, vz = nodes_xy[v]
        d = max(1.0, math.hypot(vx - ux, vz - uz))
        hw_node_adj[u].append((v, d))
        hw_node_adj[v].append((u, d))

  # Compute pinned node elevations for vehicular bridge/tunnel nodes
  pinned_y = {}
  for n, ys in node_bridge_heights.items():
    # If node is on a continuous through ground-level main road (ground_cont_deg >= 2 and major_ground_deg >= 2)
    # and not a pure bridge/tunnel continuation, keep the ground road at 0.0m
    if ground_cont_deg[n] >= 2 and major_ground_deg[n] >= 2:
      pinned_y[n] = 0.0
    else:
      # When multiple bridge levels meet (e.g., layer=2 ramp joining a continuous layer=1 bridge deck),
      # snap the shared junction node to the dominant/continuous deck elevation so the main bridge stays flat
      cont_ys = node_bridge_cont_heights.get(n, ys)
      counts = Counter(cont_ys)
      best_cnt = max(counts.values())
      candidates = [y_val for y_val, cnt in counts.items() if cnt == best_cnt]
      pinned_y[n] = min(candidates, key=abs)

  # Smoothly transition bridge/tunnel ways whose endpoint is pinned to a different deck height (e.g., layer=2 ramp -> layer=1 deck, or bridge -> 0.0m ground)
  BRIDGE_TRANSITION_M = 75.0
  for valid_nids, target_y in bridge_ways_info:
    if len(valid_nids) < 2:
      continue
    # Forward pass from start node if start node is pinned to a different height
    u0 = valid_nids[0]
    y0 = pinned_y.get(u0, target_y)
    if abs(y0 - target_y) > 0.2:
      acc_d = 0.0
      for i in range(1, len(valid_nids)):
        prev_n, cur_n = valid_nids[i - 1], valid_nids[i]
        px, pz = nodes_xy[prev_n]
        cx, cz = nodes_xy[cur_n]
        acc_d += max(1.0, math.hypot(cx - px, cz - pz))
        if acc_d >= BRIDGE_TRANSITION_M:
          break
        # Only adjust interior nodes that aren't themselves multi-layer junctions
        if len(set(node_bridge_heights[cur_n])) == 1 and ground_cont_deg[cur_n] < 2:
          t = acc_d / BRIDGE_TRANSITION_M
          interp_y = y0 + (target_y - y0) * 0.5 * (1.0 - math.cos(math.pi * t))
          if abs(interp_y) < abs(pinned_y.get(cur_n, target_y)):
            pinned_y[cur_n] = interp_y
    # Backward pass from end node if end node is pinned to a different height
    u1 = valid_nids[-1]
    y1 = pinned_y.get(u1, target_y)
    if abs(y1 - target_y) > 0.2:
      acc_d = 0.0
      for i in range(len(valid_nids) - 2, -1, -1):
        prev_n, cur_n = valid_nids[i + 1], valid_nids[i]
        px, pz = nodes_xy[prev_n]
        cx, cz = nodes_xy[cur_n]
        acc_d += max(1.0, math.hypot(cx - px, cz - pz))
        if acc_d >= BRIDGE_TRANSITION_M:
          break
        if len(set(node_bridge_heights[cur_n])) == 1 and ground_cont_deg[cur_n] < 2:
          t = acc_d / BRIDGE_TRANSITION_M
          interp_y = y1 + (target_y - y1) * 0.5 * (1.0 - math.cos(math.pi * t))
          if abs(interp_y) < abs(pinned_y.get(cur_n, target_y)):
            pinned_y[cur_n] = interp_y

  # Propagate ramp elevation along vehicular approach roads up to 110 meters from bridge/tunnel abutments
  # using multi-step distance decay so ramps and approach roads rise smoothly to meet bridge decks
  node_y = dict(pinned_y)
  frontier = [(n, y) for n, y in pinned_y.items() if abs(y) > 0.01]
  visited_dist = {n: 0.0 for n, _ in frontier}
  ramp_base_y = {n: y for n, y in frontier}
  RAMP_DECAY_M = 110.0

  # BFS propagation from bridge/tunnel abutment nodes along connected ground/link nodes
  idx = 0
  while idx < len(frontier):
    u, base_y = frontier[idx]
    idx += 1
    d_u = visited_dist[u]
    if d_u >= RAMP_DECAY_M:
      continue
    for v, edge_len in hw_node_adj.get(u, ()):
      if v in pinned_y:
        continue
      # Stop propagation only if v is a true major cross-street intersection (excluding *_link slip-ramp merges/diverges)
      if major_ground_deg[v] >= 3 or ground_cont_deg[v] >= 3:
        continue
      nd = d_u + edge_len
      if nd < RAMP_DECAY_M:
        t = nd / RAMP_DECAY_M
        # Smooth cosine taper from base_y down to 0
        interp_y = base_y * 0.5 * (1.0 + math.cos(math.pi * t))
        if v not in visited_dist or nd < visited_dist[v]:
          visited_dist[v] = nd
          ramp_base_y[v] = base_y
          node_y[v] = interp_y
          frontier.append((v, base_y))

  def build_3d_way_coords(nids, default_y, is_bridge_or_tunnel):
    """Produces [(x, y, z), ...] with unified global cosine ramp profiles and zero shared-node discrepancy."""
    raw_pts = []
    for n in nids:
      x, z = nodes_xy[n]
      y = node_y.get(n, default_y if is_bridge_or_tunnel else 0.0)
      raw_pts.append((n, x, round(y, 2), z))

    out = [(raw_pts[0][1], raw_pts[0][2], raw_pts[0][3])]
    for i in range(len(raw_pts) - 1):
      n1, x1, y1, z1 = raw_pts[i]
      n2, x2, y2, z2 = raw_pts[i + 1]
      dy = y2 - y1
      dist = math.hypot(x2 - x1, z2 - z1)
      if dist <= 1.0:
        out.append((x2, y2, z2))
        continue

      # Case 1: Both endpoints lie on the same bridge/tunnel approach ramp -> evaluate unified global cosine curve y(d(t))
      if (
          not is_bridge_or_tunnel
          and n1 in visited_dist
          and n2 in visited_dist
          and abs(y1) > 0.01
          and abs(y2) > 0.01
          and abs(ramp_base_y.get(n1, 0.0) - ramp_base_y.get(n2, 0.0)) < 0.1
      ):
        d1 = visited_dist[n1]
        d2 = visited_dist[n2]
        base_y = ramp_base_y[n1]
        steps = max(2, min(12, int(dist / 8.0)))
        for s in range(1, steps):
          t = s / steps
          d_t = d1 + (d2 - d1) * t
          yt = base_y * 0.5 * (1.0 + math.cos(math.pi * min(1.0, max(0.0, d_t / RAMP_DECAY_M))))
          out.append((
              round(x1 + (x2 - x1) * t, 1),
              round(yt, 2),
              round(z1 + (z2 - z1) * t, 1),
          ))
      # Case 2: n1 is on a ramp (d1 < RAMP_DECAY_M) and n2 is at ground (0.0m) -> finish cosine taper within remaining ramp distance
      elif not is_bridge_or_tunnel and n1 in visited_dist and abs(y1) > 0.01 and abs(y2) <= 0.01:
        d1 = visited_dist[n1]
        base_y = ramp_base_y[n1]
        rem_len = min(dist, max(1.0, RAMP_DECAY_M - d1))
        steps = max(2, min(12, int(rem_len / 8.0)))
        for s in range(1, steps + 1):
          u = s / steps
          seg_s = rem_len * u
          if seg_s >= dist - 0.2:
            break
          d_s = d1 + (RAMP_DECAY_M - d1) * u
          ys = base_y * 0.5 * (1.0 + math.cos(math.pi * min(1.0, max(0.0, d_s / RAMP_DECAY_M))))
          t = seg_s / dist
          out.append((
              round(x1 + (x2 - x1) * t, 1),
              round(ys, 2),
              round(z1 + (z2 - z1) * t, 1),
          ))
      # Case 3: n1 is at ground (0.0m) and n2 is on a ramp (d2 < RAMP_DECAY_M) -> start cosine taper at dist - rem_len
      elif not is_bridge_or_tunnel and n2 in visited_dist and abs(y2) > 0.01 and abs(y1) <= 0.01:
        d2 = visited_dist[n2]
        base_y = ramp_base_y[n2]
        rem_len = min(dist, max(1.0, RAMP_DECAY_M - d2))
        start_s = max(0.0, dist - rem_len)
        steps = max(2, min(12, int(rem_len / 8.0)))
        for s in range(0, steps):
          u = (steps - s) / steps  # u goes from 1.0 (at start_s) down to >0 (before n2)
          seg_s = dist - rem_len * u
          if seg_s <= 0.2 or seg_s >= dist - 0.2:
            continue
          d_s = d2 + (RAMP_DECAY_M - d2) * u
          ys = base_y * 0.5 * (1.0 + math.cos(math.pi * min(1.0, max(0.0, d_s / RAMP_DECAY_M))))
          t = seg_s / dist
          out.append((
              round(x1 + (x2 - x1) * t, 1),
              round(ys, 2),
              round(z1 + (z2 - z1) * t, 1),
          ))
      # Case 4: Bridge/tunnel deck transition or general elevation delta
      elif abs(dy) > 0.4 and dist > 6.0:
        steps = min(8, max(2, int(dist / 10.0)))
        for s in range(1, steps):
          t = s / steps
          st_y = 0.5 * (1.0 - math.cos(math.pi * t))
          out.append((
              round(x1 + (x2 - x1) * t, 1),
              round(y1 + dy * st_y, 2),
              round(z1 + (z2 - z1) * t, 1),
          ))
      out.append((x2, y2, z2))
    return out

  # [3/5] Process Multipolygon Relations (Buildings with Courtyards, Major Lakes, Parks, Subway Routes)
  print('[3/5] Reconstructing multipolygons, building:parts, and subway routes...')
  way_nodes_map = {wid: nids for wid, (nids, _) in ways_raw.items()}
  rel_outer_way_ids = set()
  buildings_list = []  # (osm_id, name, btype, is_part, h, min_h, lvl, style, col, rcol, rshape, outer_ring, hole_rings, bbox)
  water_polys = []     # (osm_id, name, outer_ring, hole_rings, area)
  park_polys = []      # (osm_id, name, ptype, outer_ring, area)
  subway_routes = {}   # way_id -> (line_name, colour)

  for rid, rtags, members in relations_raw:
    rtype = rtags.get('type', '')
    if rtype == 'route' and rtags.get('route') in ('subway', 'light_rail', 'monorail'):
      lname = rtags.get('name', rtags.get('ref', '地铁'))
      lcol = rtags.get('colour', '#0092d8')
      for mtype, mid, role in members:
        if mtype == 1:  # WAY
          subway_routes[mid] = (lname, lcol)
      continue

    if rtype not in ('multipolygon', 'building'):
      continue

    outer_wids = [mid for mtype, mid, role in members if mtype == 1 and role in ('outer', 'outline', '')]
    inner_wids = [mid for mtype, mid, role in members if mtype == 1 and role == 'inner']
    if not outer_wids:
      continue

    # Inherit tags from outer way if relation itself only has type=multipolygon
    merged_tags = dict(rtags)
    if 'building' not in merged_tags and 'building:part' not in merged_tags and 'natural' not in merged_tags and 'leisure' not in merged_tags and 'landuse' not in merged_tags:
      for owid in outer_wids:
        if owid in ways_raw:
          for k, v in ways_raw[owid][1].items():
            if k not in merged_tags:
              merged_tags[k] = v

    outer_rings = stitch_way_rings(outer_wids, way_nodes_map, nodes_xy)
    inner_rings = stitch_way_rings(inner_wids, way_nodes_map, nodes_xy) if inner_wids else []
    if not outer_rings:
      continue

    if 'building' in merged_tags or 'building:part' in merged_tags or rtype == 'building':
      for owid in outer_wids:
        rel_outer_way_ids.add(owid)
      for ir in inner_wids:
        rel_outer_way_ids.add(ir)
      for oring in outer_rings:
        oring_s = simplify_ring(oring, 0.35)
        if len(oring_s) < 3:
          continue
        area, cx, cz = polygon_area_and_centroid(oring_s)
        if abs(cx) > HALF_SIZE_M or abs(cz) > HALF_SIZE_M or area < 6.0 or area > 450000.0:
          continue
        h, min_h, lvl, style, is_part, col, rcol, rshape = estimate_building_height_and_style(
            merged_tags, area, cx, cz, rid
        )
        xs = [p[0] for p in oring_s]
        zs = [p[1] for p in oring_s]
        bbox = (min(xs), min(zs), max(xs), max(zs))
        valid_holes = []
        for hr in inner_rings:
          hrs = simplify_ring(hr, 0.35)
          if len(hrs) >= 3:
            hx, hz = hrs[0]
            if bbox[0] <= hx <= bbox[2] and bbox[1] <= hz <= bbox[3]:
              valid_holes.append(hrs)
        buildings_list.append((
            rid,
            merged_tags.get('name', merged_tags.get('name:zh', '')),
            merged_tags.get('building') or merged_tags.get('building:part') or 'yes',
            is_part, h, min_h, lvl, style, col, rcol, rshape, oring_s, valid_holes, bbox, cx, cz, area
        ))
    elif merged_tags.get('natural') == 'water' or merged_tags.get('waterway') in ('riverbank', 'dock') or merged_tags.get('landuse') in ('reservoir', 'basin'):
      for owid in outer_wids:
        rel_outer_way_ids.add(owid)
      for oring in outer_rings:
        oring_s = simplify_ring(oring, 1.2)
        if len(oring_s) < 3:
          continue
        area, cx, cz = polygon_area_and_centroid(oring_s)
        if abs(cx) > HALF_SIZE_M + 1000 or abs(cz) > HALF_SIZE_M + 1000 or area < 20.0:
          continue
        valid_holes = [simplify_ring(hr, 1.2) for hr in inner_rings if len(hr) >= 3]
        water_polys.append((rid, merged_tags.get('name', ''), oring_s, valid_holes, area, cx, cz))
    elif merged_tags.get('leisure') in ('park', 'garden', 'stadium', 'pitch', 'nature_reserve') or merged_tags.get('landuse') in ('grass', 'forest', 'recreation_ground', 'village_green', 'farmland', 'meadow', 'orchard', 'plant_nursery', 'allotments', 'greenfield'):
      for owid in outer_wids:
        rel_outer_way_ids.add(owid)
      for oring in outer_rings:
        oring_s = simplify_ring(oring, 1.5)
        if len(oring_s) < 3:
          continue
        area, cx, cz = polygon_area_and_centroid(oring_s)
        if abs(cx) > HALF_SIZE_M or abs(cz) > HALF_SIZE_M or area < 50.0 or area > 12000000.0:
          continue
        ptype = merged_tags.get('leisure') or merged_tags.get('landuse') or 'park'
        park_polys.append((rid, merged_tags.get('name', ''), ptype, oring_s, area, cx, cz))

  # Process standalone Ways for buildings, water, and parks
  water_lines = []  # (wid, name, wtype, width, coords_2d)
  for wid, (nids, tags) in ways_raw.items():
    if wid in rel_outer_way_ids:
      continue
    pts = [nodes_xy[n] for n in nids if n in nodes_xy]
    if len(pts) < 2:
      continue
    is_closed = (nids[0] == nids[-1]) and len(pts) >= 4

    if ('building' in tags or 'building:part' in tags) and is_closed:
      ring = simplify_ring(pts[:-1], 0.35)
      if len(ring) < 3:
        continue
      area, cx, cz = polygon_area_and_centroid(ring)
      if abs(cx) > HALF_SIZE_M or abs(cz) > HALF_SIZE_M or area < 6.0 or area > 400000.0:
        continue
      h, min_h, lvl, style, is_part, col, rcol, rshape = estimate_building_height_and_style(
          tags, area, cx, cz, wid
      )
      xs = [p[0] for p in ring]
      zs = [p[1] for p in ring]
      bbox = (min(xs), min(zs), max(xs), max(zs))
      buildings_list.append((
          wid,
          tags.get('name', tags.get('name:zh', '')),
          tags.get('building') or tags.get('building:part') or 'yes',
          is_part, h, min_h, lvl, style, col, rcol, rshape, ring, [], bbox, cx, cz, area
      ))
    elif is_closed and (tags.get('natural') == 'water' or tags.get('waterway') in ('riverbank', 'dock') or tags.get('landuse') in ('reservoir', 'basin')):
      ring = simplify_ring(pts[:-1], 1.0)
      if len(ring) >= 3:
        area, cx, cz = polygon_area_and_centroid(ring)
        if abs(cx) <= HALF_SIZE_M + 500 and abs(cz) <= HALF_SIZE_M + 500 and area >= 15.0:
          water_polys.append((wid, tags.get('name', ''), ring, [], area, cx, cz))
    elif tags.get('waterway') in ('river', 'canal', 'stream', 'moat', 'ditch') and not is_closed:
      if tags.get('tunnel') in ('yes', 'culvert'):
        continue
      wtype = tags['waterway']
      w_m = parse_float(tags.get('width'), 18.0 if wtype in ('river', 'canal', 'moat') else 5.0)
      water_lines.append((wid, tags.get('name', ''), wtype, max(2.5, min(80.0, w_m)), pts))
    elif is_closed and (tags.get('leisure') in ('park', 'garden', 'stadium', 'pitch', 'track', 'sports_centre') or tags.get('landuse') in ('grass', 'forest', 'recreation_ground', 'plaza', 'farmland', 'meadow', 'orchard', 'plant_nursery', 'allotments', 'greenfield', 'village_green') or tags.get('highway') == 'pedestrian' or tags.get('place') == 'square'):
      ring = simplify_ring(pts[:-1], 1.2)
      if len(ring) >= 3:
        area, cx, cz = polygon_area_and_centroid(ring)
        if abs(cx) <= HALF_SIZE_M and abs(cz) <= HALF_SIZE_M and 30.0 <= area <= 10000000.0:
          ptype = tags.get('leisure') or tags.get('landuse') or tags.get('place') or 'plaza'
          park_polys.append((wid, tags.get('name', ''), ptype, ring, area, cx, cz))

  print(f'  -> Extracted {len(buildings_list):,} buildings/parts, {len(water_polys):,} water polygons, {len(water_lines):,} rivers/canals, {len(park_polys):,} parks/plazas')

  # Handle S3DB parent outline vs building:part overlap:
  # Index building:part centroids by 500m grid cell so if a parent building outline contains
  # tall building:part children, we lower the parent outline into a podium or skip redundant box
  part_cells = defaultdict(list)
  for b in buildings_list:
    if b[3]:  # is_part
      gx, gz = int(b[14] // 250), int(b[15] // 250)
      part_cells[(gx, gz)].append((b[14], b[15], b[4]))  # cx, cz, h

  filtered_buildings = []
  for b in buildings_list:
    osm_id, name, btype, is_part, h, min_h, lvl, style, col, rcol, rshape, ring, holes, bbox, cx, cz, area = b
    if not is_part and area > 600.0:
      gx0, gz0 = int(bbox[0] // 250), int(bbox[1] // 250)
      gx1, gz1 = int(bbox[2] // 250), int(bbox[3] // 250)
      parts_inside = 0
      max_part_h = 0.0
      for gx in range(gx0, gx1 + 1):
        for gz in range(gz0, gz1 + 1):
          for px, pz, ph in part_cells.get((gx, gz), ()):
            if bbox[0] <= px <= bbox[2] and bbox[1] <= pz <= bbox[3]:
              parts_inside += 1
              if ph > max_part_h:
                max_part_h = ph
      if parts_inside >= 2 and max_part_h >= h * 0.7:
        # Keep only a low podium base (6m) for the parent outline so stepped building:parts stand out
        h = min(h, 6.5)
        lvl = min(lvl, 2)
    filtered_buildings.append((osm_id, name, btype, is_part, h, min_h, lvl, style, col, rcol, rshape, ring, holes, bbox, cx, cz, area))

  # [4/5] Partition Everything into 40 x 40 = 1,600 Spatial Chunks (1km x 1km)
  print('[4/5] Partitioning geometry into 1,600 (1km x 1km) spatial chunks...')
  chunks = [[{
      'roads': [],
      'railways': [],
      'buildings': [],
      'water_polys': [],
      'water_lines': [],
      'parks': [],
      'facilities': [],
  } for _ in range(GRID_DIM)] for _ in range(GRID_DIM)]

  def to_chunk_idx(x, z):
    cx = int((x + HALF_SIZE_M) // CHUNK_SIZE_M)
    cz = int((z + HALF_SIZE_M) // CHUNK_SIZE_M)
    return max(0, min(GRID_DIM - 1, cx)), max(0, min(GRID_DIM - 1, cz))

  def chunk_center(cx, cz):
    return -HALF_SIZE_M + cx * CHUNK_SIZE_M + 500.0, -HALF_SIZE_M + cz * CHUNK_SIZE_M + 500.0

  # Partition roads + build global arterial list & A* navigation graph
  global_arterials = []
  nav_nodes = {}       # nid -> [x, y, z]
  nav_adj = defaultdict(list)
  road_node_use = Counter()
  for wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y in hw_ways:
    cls_name, def_lanes, def_w, def_oneway = HIGHWAY_SPECS[hw]
    if cls_name in DRIVABLE_CLASSES:
      for n in valid_nids:
        road_node_use[n] += 1

  # Pre-resolve road lanes, width, oneway direction, and propagate explicit lane/width specs
  # across continuous connected segments sharing (cls_name, oneway, normalized road name)
  resolved_hw_ways = []
  endpoint_ways = defaultdict(list)  # nid -> [idx in resolved_hw_ways]
  for wid, valid_nids, tags, hw, layer, is_bridge, is_tunnel, target_y in hw_ways:
    cls_name, def_lanes, def_w, def_oneway = HIGHWAY_SPECS[hw]
    lanes = int(parse_float(tags.get('lanes'), def_lanes) or def_lanes)
    lanes = max(1, min(8, lanes))
    raw_ow = tags.get('oneway', '')
    if raw_ow in ('yes', '1', 'true'):
      oneway = 1
    elif raw_ow in ('-1', 'reverse'):
      oneway = -1
    elif raw_ow in ('no', '0', 'false'):
      oneway = 0
    else:
      oneway = def_oneway

    if oneway == -1:
      valid_nids = list(reversed(valid_nids))
      oneway = 1

    w_tag = parse_float(tags.get('width'))
    has_explicit_w = False
    if w_tag and 1.8 <= w_tag <= 45.0:
      width_m = round(w_tag, 1)
      has_explicit_w = True
    elif 'lanes' in tags and cls_name not in ('footway', 'cycleway', 'pedestrian'):
      width_m = round(lanes * (3.65 if cls_name in ('motorway', 'trunk', 'primary') else 3.25) + (1.5 if not oneway else 0.8), 1)
      has_explicit_w = True
    else:
      width_m = def_w

    name = tags.get('name', tags.get('name:zh', ''))
    norm_name = name.replace('辅路', '').strip()
    idx_w = len(resolved_hw_ways)
    resolved_hw_ways.append([
        wid, valid_nids, tags, hw, cls_name, name, norm_name,
        lanes, width_m, oneway, is_bridge, is_tunnel, layer, target_y, has_explicit_w
    ])
    if cls_name in DRIVABLE_CLASSES:
      endpoint_ways[valid_nids[0]].append(idx_w)
      endpoint_ways[valid_nids[-1]].append(idx_w)

  for _pass in range(6):
    changed = 0
    for idx_w, item in enumerate(resolved_hw_ways):
      if item[14]:  # already has explicit or propagated width
        continue
      valid_nids = item[1]
      cls_name = item[4]
      norm_name = item[6]
      oneway = item[9]
      if cls_name not in DRIVABLE_CLASSES or not norm_name:
        continue
      for end_nid in (valid_nids[0], valid_nids[-1]):
        matched = None
        for nbr_idx in endpoint_ways.get(end_nid, ()):
          if nbr_idx == idx_w:
            continue
          nbr = resolved_hw_ways[nbr_idx]
          if nbr[14] and nbr[4] == cls_name and nbr[9] == oneway and nbr[6] == norm_name:
            matched = (nbr[7], nbr[8])
            break
        if matched:
          item[7], item[8] = matched
          item[14] = True
          changed += 1
          break
    if not changed:
      break

  for item in resolved_hw_ways:
    wid, valid_nids, tags, hw, cls_name, name, norm_name, lanes, width_m, oneway, is_bridge, is_tunnel, layer, target_y, _ = item
    pts_3d = build_3d_way_coords(valid_nids, target_y, is_bridge or is_tunnel or layer != 0)
    ref = tags.get('ref', '')

    # Assign road way to every chunk its segments touch (plus 35m boundary margin for cross-chunk bridge/trench awareness)
    touched_chunks = set()
    for x, y, z in pts_3d:
      if abs(x) <= HALF_SIZE_M and abs(z) <= HALF_SIZE_M:
        for dx_m in (-35.0, 0.0, 35.0):
          for dz_m in (-35.0, 0.0, 35.0):
            touched_chunks.add(to_chunk_idx(x + dx_m, z + dz_m))

    for cx_i, cz_i in touched_chunks:
      ox, oz = chunk_center(cx_i, cz_i)
      # Flatten [lx, y, lz, ...]
      flat = []
      for x, y, z in pts_3d:
        flat.extend((round(x - ox, 1), round(y, 2), round(z - oz, 1)))
      chunks[cx_i][cz_i]['roads'].append([
          wid, cls_name, name, ref, lanes, width_m, oneway, is_bridge, is_tunnel, layer, flat
      ])

    # Add to global overview arterials if major road
    if cls_name in ARTERIAL_CLASSES:
      simp = simplify_polyline_3d(pts_3d, 6.0 if cls_name in ('motorway', 'trunk') else 10.0)
      if len(simp) >= 2 and any(abs(p[0]) <= HALF_SIZE_M and abs(p[2]) <= HALF_SIZE_M for p in simp):
        flat_g = []
        for x, y, z in simp:
          flat_g.extend((int(round(x)), round(y, 2), int(round(z))))
        global_arterials.append([wid, cls_name, name or ref, width_m, is_bridge, is_tunnel, layer, flat_g])

    # Build city-wide road navigation graph on arterial + tertiary streets
    if cls_name in ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary'):
      speed_mps = {
          'motorway': 26.0, 'trunk': 22.0, 'motorway_link': 15.0, 'trunk_link': 14.0,
          'primary': 16.5, 'primary_link': 12.0, 'secondary': 13.5, 'secondary_link': 10.5, 'tertiary': 10.0
      }.get(cls_name, 12.0)
      # Keep start, end, and intersection nodes
      chain = [0]
      for i in range(1, len(valid_nids) - 1):
        if road_node_use[valid_nids[i]] > 1:
          chain.append(i)
      chain.append(len(valid_nids) - 1)
      for k in range(len(chain) - 1):
        i0, i1 = chain[k], chain[k + 1]
        u, v = valid_nids[i0], valid_nids[i1]
        ux, uz = nodes_xy[u]
        vx, vz = nodes_xy[v]
        if abs(ux) > HALF_SIZE_M or abs(uz) > HALF_SIZE_M or abs(vx) > HALF_SIZE_M or abs(vz) > HALF_SIZE_M:
          continue
        uy = round(node_y.get(u, target_y if (is_bridge or is_tunnel or layer != 0) else 0.0), 1)
        vy = round(node_y.get(v, target_y if (is_bridge or is_tunnel or layer != 0) else 0.0), 1)
        nav_nodes[u] = [round(ux, 1), uy, round(uz, 1)]
        nav_nodes[v] = [round(vx, 1), vy, round(vz, 1)]
        dist = round(math.hypot(vx - ux, vz - uz), 1)
        if dist < 0.5:
          continue
        cost = round(dist / speed_mps, 2)
        nav_adj[u].append([v, dist, cost, name or ref or cls_name])
        if not oneway:
          nav_adj[v].append([u, dist, cost, name or ref or cls_name])

  # Partition railways + global subway map
  global_subways = []
  for wid, valid_nids, tags, rw, layer, is_bridge, is_tunnel in rw_ways:
    target_y = layer * 6.0
    pts_3d = build_3d_way_coords(valid_nids, target_y, True)
    name = tags.get('name', tags.get('name:zh', ''))
    lname, lcol = subway_routes.get(wid, (name, tags.get('colour', '#0092d8' if rw == 'subway' else '#8d99ae')))

    if not is_tunnel or rw != 'subway':
      touched_chunks = set()
      for x, y, z in pts_3d:
        if abs(x) <= HALF_SIZE_M and abs(z) <= HALF_SIZE_M:
          touched_chunks.add(to_chunk_idx(x, z))
      for cx_i, cz_i in touched_chunks:
        ox, oz = chunk_center(cx_i, cz_i)
        flat = []
        for x, y, z in pts_3d:
          flat.extend((round(x - ox, 1), round(y, 1), round(z - oz, 1)))
        chunks[cx_i][cz_i]['railways'].append([wid, rw, lname or name, lcol, is_bridge, is_tunnel, layer, flat])

    if rw in ('subway', 'light_rail') or wid in subway_routes:
      simp = simplify_polyline_3d(pts_3d, 12.0)
      if len(simp) >= 2 and any(abs(p[0]) <= HALF_SIZE_M and abs(p[2]) <= HALF_SIZE_M for p in simp):
        flat_s = []
        for x, _, z in simp:
          flat_s.extend((int(round(x)), int(round(z))))
        global_subways.append([wid, lname or name or '地铁', lcol, flat_s])

  # Partition buildings + collect global tall skyline (>= 52m or major landmarks)
  global_skyline = []
  for b in filtered_buildings:
    osm_id, name, btype, is_part, h, min_h, lvl, style, col, rcol, rshape, ring, holes, bbox, cx, cz, area = b
    cx_i, cz_i = to_chunk_idx(cx, cz)
    ox, oz = chunk_center(cx_i, cz_i)
    flat_outer = []
    for x, z in ring:
      flat_outer.extend((round(x - ox, 1), round(z - oz, 1)))
    flat_holes = []
    for hr in holes:
      fh = []
      for x, z in hr:
        fh.extend((round(x - ox, 1), round(z - oz, 1)))
      flat_holes.append(fh)
    chunks[cx_i][cz_i]['buildings'].append([
        osm_id, name, btype, 1 if is_part else 0, h, min_h, lvl, style, col, rcol, rshape, flat_outer, flat_holes
    ])

    if (h >= 58.0 and area >= 180.0) or (style == 'imperial' and area >= 800.0):
      w_est = round(min(120.0, max(14.0, bbox[2] - bbox[0])), 1)
      d_est = round(min(120.0, max(14.0, bbox[3] - bbox[1])), 1)
      global_skyline.append([int(round(cx)), int(round(cz)), w_est, d_est, h, min_h, style, name])

  # Partition water polygons & rivers
  global_water = []
  for osm_id, name, ring, holes, area, cx, cz in water_polys:
    cx0, cz0 = to_chunk_idx(min(p[0] for p in ring), min(p[1] for p in ring))
    cx1, cz1 = to_chunk_idx(max(p[0] for p in ring), max(p[1] for p in ring))
    for cxi in range(cx0, cx1 + 1):
      for czi in range(cz0, cz1 + 1):
        ox, oz = chunk_center(cxi, czi)
        fo = []
        for x, z in ring:
          fo.extend((round(x - ox, 1), round(z - oz, 1)))
        fh_list = []
        for hr in holes:
          fh = []
          for x, z in hr:
            fh.extend((round(x - ox, 1), round(z - oz, 1)))
          fh_list.append(fh)
        chunks[cxi][czi]['water_polys'].append([osm_id, name, fo, fh_list])

    if area >= 8000.0:
      simp_r = simplify_ring(ring, 6.0)
      if len(simp_r) >= 3:
        fg = []
        for x, z in simp_r:
          fg.extend((int(round(x)), int(round(z))))
        global_water.append([osm_id, name, 'poly', 0, fg])

  for wid, name, wtype, width_m, pts in water_lines:
    touched = set()
    for x, z in pts:
      if abs(x) <= HALF_SIZE_M and abs(z) <= HALF_SIZE_M:
        touched.add(to_chunk_idx(x, z))
    for cxi, czi in touched:
      ox, oz = chunk_center(cxi, czi)
      fl = []
      for x, z in pts:
        fl.extend((round(x - ox, 1), round(z - oz, 1)))
      chunks[cxi][czi]['water_lines'].append([wid, name, wtype, width_m, fl])
    if width_m >= 8.0 or wtype in ('river', 'canal'):
      simp_w = simplify_ring(pts, 10.0)
      if len(simp_w) >= 2:
        fg = []
        for x, z in simp_w:
          fg.extend((int(round(x)), int(round(z))))
        global_water.append([wid, name, 'line', width_m, fg])

  # Partition parks + collect major parks for global overview horizon layer
  global_parks = []
  for osm_id, name, ptype, ring, area, cx, cz in park_polys:
    cxi, czi = to_chunk_idx(cx, cz)
    ox, oz = chunk_center(cxi, czi)
    fo = []
    for x, z in ring:
      fo.extend((round(x - ox, 1), round(z - oz, 1)))
    chunks[cxi][czi]['parks'].append([osm_id, name, ptype, fo])
    if area >= 6000.0:
      simp_p = simplify_ring(ring, 5.0)
      if len(simp_p) >= 3:
        fg = []
        for x, z in simp_p:
          fg.extend((int(round(x)), int(round(z))))
        global_parks.append([osm_id, ptype, fg, name, f'{cxi},{czi}'])

  # Partition facility nodes & collect stations
  global_stations = []
  seen_stations = set()
  for xm, zm, ftype, nid, nm, ref in facilities_raw:
    cxi, czi = to_chunk_idx(xm, zm)
    ox, oz = chunk_center(cxi, czi)
    y_elev = round(node_y.get(nid, 0.0), 1)
    chunks[cxi][czi]['facilities'].append([
        ftype, round(xm - ox, 1), y_elev, round(zm - oz, 1), nid, nm, ref
    ])
    if ftype == 'st' and nm and nm not in seen_stations:
      seen_stations.add(nm)
      global_stations.append([nid, nm, int(round(xm)), int(round(zm))])

  # [5/5] Write 1,600 chunk files and global_overview.json (preserving Overture buildings b[0] >= 2_000_000_000)
  print('[5/5] Writing 1,600 chunk files and global_overview.json...')
  non_empty_chunks = 0
  preserved_overture_count = 0
  for cxi in range(GRID_DIM):
    for czi in range(GRID_DIM):
      cdata = chunks[cxi][czi]
      cpath = chunks_dir / f'c_{cxi}_{czi}.json'
      if cpath.exists():
        try:
          with open(cpath, 'r', encoding='utf-8') as rf:
            old_c = json.load(rf)
          ov_blds = [b for b in old_c.get('buildings', ()) if b and b[0] >= 2_000_000_000]
          if ov_blds:
            cdata['buildings'].extend(ov_blds)
            preserved_overture_count += len(ov_blds)
        except Exception:
          pass
      if any(cdata.values()):
        non_empty_chunks += 1
      with open(cpath, 'w', encoding='utf-8') as cf:
        json.dump(cdata, cf, ensure_ascii=False, separators=(',', ':'))
  if preserved_overture_count:
    print(f'  -> Preserved {preserved_overture_count:,} fused Overture buildings across chunks.')

  # Curated landmarks & interchanges across the 40km x 40km Beijing map (verified coordinates)
  bookmarks = [
      {'id': 'tiananmen', 'name': '天安门广场 · 长安街中轴线', 'cat': '核心地标', 'lat': 39.9087, 'lon': 116.3975, 'desc': '北京坐标原点 (0, 0) · 紫禁城午门/护城河/长安街双向十车道'},
      {'id': 'guomao', 'name': '国贸桥立交 · CBD 中国尊', 'cat': '立交与摩天楼', 'lat': 39.9095, 'lon': 116.4615, 'desc': '东三环与建国路多层互通立交 · 中国尊 (528m) / 国贸三期 / 央视总部大楼'},
      {'id': 'cctv', 'name': '中央广播电视总台 (大裤衩)', 'cat': '核心地标', 'lat': 39.9152, 'lon': 116.4648, 'desc': '东三环中路光华路交汇 · 真实 OSM building:part 悬挑体块与 CBD 建筑群'},
      {'id': 'xizhimen', 'name': '西直门立交桥 · 北京北站', 'cat': '立交与交通枢纽', 'lat': 39.9405, 'lon': 116.3496, 'desc': '西二环经典多层环形匝道立交 + 地铁2/4/13号线与京张高铁国铁股道'},
      {'id': 'sanyuanqiao', 'name': '三元桥立交 · 机场高速起点', 'cat': '立交与交通枢纽', 'lat': 39.9614, 'lon': 116.4568, 'desc': '北三环与京密路/首都机场高速 S12 互通跨线桥与三元西桥'},
      {'id': 'gugong', 'name': '故宫博物院 · 太和殿与筒子河', 'cat': '核心地标', 'lat': 39.9163, 'lon': 116.3972, 'desc': '紫禁城完整宫殿群、内廷院落 multipolygon 天井与护城河水系'},
      {'id': 'shichahai', 'name': '什刹海 · 钟鼓楼胡同四合院区', 'cat': '老北京胡同', 'lat': 39.9410, 'lon': 116.3895, 'desc': '前海/后海/西海连片水系 · 烟袋斜街、鼓楼东大街与低矮青砖四合院肌理'},
      {'id': 'tiantan', 'name': '天坛公园 · 祈年殿', 'cat': '核心地标', 'lat': 39.8822, 'lon': 116.4066, 'desc': '南二环天坛祈年殿 (38m)、丹陛桥中轴步道与古柏林公园'},
      {'id': 'olympic', 'name': '奥林匹克公园 · 鸟巢与水立方', 'cat': '核心地标', 'lat': 39.9929, 'lon': 116.3965, 'desc': '北四环中轴延长线 · 国家体育场中空看台、龙形水系与北四环地下隧道'},
      {'id': 'zhongguancun', 'name': '中关村大街 · 海淀黄庄/北四环', 'cat': '科技与高校', 'lat': 39.9840, 'lon': 116.3165, 'desc': '北四环西路一亩园/中关村立交、海淀大街科技园与周边北大/清华校园'},
      {'id': 'wudaokou', 'name': '五道口 · 地铁13号线高架与成府路', 'cat': '科技与高校', 'lat': 39.9928, 'lon': 116.3378, 'desc': '成府路/荷清路平交铁路道口与地铁13号线五道口站、清华东门'},
      {'id': 'sanlitun', 'name': '三里屯太古里 · 工人体育场', 'cat': '商圈与水岸', 'lat': 39.9345, 'lon': 116.4542, 'desc': '工人体育场北路、三里屯路开放式街区与亮马河国际风情水岸'},
      {'id': 'financial_st', 'name': '北京金融街 · 复兴门桥', 'cat': '立交与摩天楼', 'lat': 39.9155, 'lon': 116.3568, 'desc': '西二环复兴门立交桥、长安街西延线与金融街总部建筑群'},
      {'id': 'yiheyuan', 'name': '颐和园 · 昆明湖与万寿山', 'cat': '核心地标', 'lat': 39.9945, 'lon': 116.2725, 'desc': '西北五环内超大型天然湖泊水系、南湖岛 multipolygon 与西郊线有轨电车'},
      {'id': 'beijing_south', 'name': '北京南站 · 京津/京沪高铁场站', 'cat': '立交与交通枢纽', 'lat': 39.8650, 'lon': 116.3789, 'desc': '南二环至南三环超大型椭圆形高架候车厅与数十条密集国铁/高铁股道'},
      {'id': 'beijing_west', 'name': '北京西站 · 莲花池立交桥', 'cat': '立交与交通枢纽', 'lat': 39.8948, 'lon': 116.3216, 'desc': '西三环莲花桥互通立交、广安路高架与北京西站北广场门楼'},
      {'id': 'wangjing', 'name': '望京 SOHO · 广顺北大街', 'cat': '立交与摩天楼', 'lat': 40.0005, 'lon': 116.4805, 'desc': '东北四环至五环望京商务区 · 曲面流线建筑群与京承/机场高速联络网'},
      {'id': 'lize', 'name': '丽泽金融商务区 · 菜户营桥', 'cat': '立交与摩天楼', 'lat': 39.8685, 'lon': 116.3365, 'desc': '西南二环至三环丽泽路新摩天楼集群与护城河水系交汇'},
      {'id': 'shougang', 'name': '首钢工业遗址公园 · 新首钢大桥', 'cat': '核心地标', 'lat': 39.9102, 'lon': 116.1685, 'desc': '长安街西延线最西端 (-19.5km) · 高炉工业建筑群、群明湖与永定河跨河大桥'},
      {'id': 'wufangqiao', 'name': '东五环五方桥 · 京哈高速互通', 'cat': '立交与交通枢纽', 'lat': 39.8732, 'lon': 116.5485, 'desc': '东五环与京哈高速 G1 大型三层蝶形互通立交桥，检验五环边缘真实路网'},
  ]
  for bm in bookmarks:
    bm['x'] = round((bm['lon'] - CENTER_LON) * M_PER_DEG_LON, 1)
    bm['z'] = round((CENTER_LAT - bm['lat']) * M_PER_DEG_LAT, 1)

  overview = {
      'meta': {
          'centerLat': CENTER_LAT,
          'centerLon': CENTER_LON,
          'mPerDegLat': M_PER_DEG_LAT,
          'mPerDegLon': M_PER_DEG_LON,
          'worldSizeM': HALF_SIZE_M * 2,
          'halfSizeM': HALF_SIZE_M,
          'chunkSizeM': CHUNK_SIZE_M,
          'gridDim': GRID_DIM,
          'stats': {
              'nodes': len(nodes_xy),
              'roads': len(hw_ways),
              'buildings': len(filtered_buildings),
              'railways': len(rw_ways),
              'water': len(water_polys) + len(water_lines),
              'parks': len(park_polys),
              'facilities': len(facilities_raw),
              'nonEmptyChunks': non_empty_chunks,
          },
      },
      'bookmarks': bookmarks,
      'arterials': global_arterials,
      'water': global_water,
      'parks': global_parks,
      'subways': global_subways,
      'stations': global_stations,
      'skyline': global_skyline,
  }

  overview_path = out_dir / 'global_overview.json'
  with open(overview_path, 'w', encoding='utf-8') as of:
    json.dump(overview, of, ensure_ascii=False, separators=(',', ':'))

  nav_path = out_dir / 'nav_graph.json'
  with open(nav_path, 'w', encoding='utf-8') as nf:
    json.dump({
        'nodes': {str(k): v for k, v in nav_nodes.items()},
        'adj': {str(k): v for k, v in nav_adj.items()},
    }, nf, ensure_ascii=False, separators=(',', ':'))

  ov_mb = overview_path.stat().st_size / (1024 * 1024)
  print(f'Done in {round(time.time() - t_start, 2)}s! global_overview.json = {ov_mb:.2f} MB, non-empty chunks = {non_empty_chunks}/1600')


if __name__ == '__main__':
  main()
