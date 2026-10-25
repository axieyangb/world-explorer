#!/usr/bin/env python3
"""Calibrates Beijing royal garden / mountain viewpoint landmarks, bridges, DEM peaks,

and rebuilds `data/city_buildings_lod.bin` so 3D views from Jingshan Wanchun Pavilion,
Summer Palace Foxiangge, and Fragrant Hills Xianglufeng match real-world photographs.
"""

import json
import math
from pathlib import Path
import struct
import time

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'
CHUNKS_DIR = DATA_DIR / 'chunks'
OVERTURE_ID_BASE = 2_000_000_000

# 5 Royal Garden / Palace bounding boxes in WGS-84 world coordinates (wx, wz):
ROYAL_GARDEN_ZONES = [
    ('ForbiddenCity_Jingshan', -970.0, -170.0, -2030.0, 220.0),
    ('Beihai_Zhongnanhai', -1900.0, -970.0, -2100.0, 200.0),
    ('SummerPalace', -12200.0, -10400.0, -10250.0, -8300.0),
    ('YuquanHill', -13800.0, -12900.0, -9850.0, -8900.0),
    ('FragrantHills', -19650.0, -17750.0, -9650.0, -8600.0),
]

# Explicit historical heights (h, min_h, lvl, style) keyed by OSM building/part ID:
LANDMARK_OVERRIDES = {
    # Forbidden City Outer & Inner Court Halls (is_part=0 terrace bases & standalone halls)
    8854043: (5.5, 0.0, 1, 'imperial'),   # 太和殿 (base terrace; 3D tiers are is_part=1 up to 35m)
    8854349: (5.0, 0.0, 1, 'imperial'),   # 中和殿 (base terrace; 3D tiers up to 27m)
    8854507: (5.5, 0.0, 1, 'imperial'),   # 保和殿 (base terrace; 3D tiers up to 30m)
    8851737: (4.8, 0.0, 1, 'imperial'),   # 太和门 (base terrace; 3D tiers up to 23.8m)
    8850205: (12.0, 0.0, 2, 'imperial'),  # 午门 (base fortress; 3D tiers up to 37.9m)
    8850223: (12.0, 0.0, 2, 'imperial'),  # 午门 west wing
    8850241: (12.0, 0.0, 2, 'imperial'),  # 午门 east wing
    8848564: (24.0, 0.0, 3, 'imperial'),  # 端门
    8847697: (10.5, 0.0, 2, 'imperial'),  # 天安门 (base platform; 3D tiers up to 34.7m)
    8858781: (11.0, 0.0, 2, 'imperial'),  # 神武门 (base fortress; 3D tiers up to 31.0m)
    8860937: (12.5, 0.0, 2, 'imperial'),  # 乾清门
    8860938: (3.2, 0.0, 1, 'imperial'),   # 乾清宫-交泰殿-坤宁宫 汉白玉丹陛台基
    8860936: (5.0, 0.0, 1, 'imperial'),   # 乾清宫 outer footprint
    641122026: (24.0, 3.2, 2, 'imperial'),  # 乾清宫 main hall body
    641122027: (15.5, 3.2, 1, 'imperial'),  # 乾清宫 lower eave
    641122029: (16.5, 3.2, 2, 'imperial'),  # 交泰殿
    8861202: (4.8, 0.0, 1, 'imperial'),   # 坤宁宫 outer footprint
    641122028: (20.5, 3.2, 2, 'imperial'),  # 坤宁宫 main hall body
    8864161: (19.5, 0.0, 2, 'imperial'),  # 皇极殿
    8864207: (16.5, 0.0, 2, 'imperial'),  # 宁寿宫
    8862598: (18.5, 0.0, 2, 'imperial'),  # 奉先殿
    8861753: (13.0, 0.0, 2, 'imperial'),  # 斋宫
    8855794: (17.5, 0.0, 2, 'imperial'),  # 慈宁宫
    8856542: (14.5, 0.0, 2, 'imperial'),  # 寿康宫
    8859212: (13.5, 0.0, 2, 'imperial'),  # 养心殿
    8853540: (14.5, 0.0, 2, 'imperial'),  # 体仁阁
    8853194: (14.5, 0.0, 2, 'imperial'),  # 弘义阁
    8852668: (15.5, 0.0, 2, 'imperial'),  # 文华殿
    8852069: (15.5, 0.0, 2, 'imperial'),  # 武英殿
    8858094: (14.0, 0.0, 2, 'imperial'),  # 英华殿
    8859705: (15.0, 0.0, 2, 'imperial'),  # 钦安殿
    8862231: (7.8, 0.0, 1, 'imperial'),   # 左侧墙 (West Palace Wall)
    8862230: (7.8, 0.0, 1, 'imperial'),   # 右侧墙 (East Palace Wall)
    # Jingshan Five Pavilions & Shouhuang Hall
    26390235: (17.5, 0.0, 3, 'imperial'),   # 万春亭 (central summit triple-eave golden pavilion)
    189309374: (14.2, 0.0, 2, 'imperial'),  # 辑芳亭
    189309372: (14.2, 0.0, 2, 'imperial'),  # 观妙亭
    189309369: (11.5, 0.0, 2, 'imperial'),  # 周赏亭
    189309373: (11.5, 0.0, 2, 'imperial'),  # 富览亭
    26390236: (12.0, 0.0, 2, 'imperial'),   # 绮望楼
    26390117: (22.0, 0.0, 3, 'imperial'),   # 寿皇殿
    26390116: (11.0, 0.0, 2, 'imperial'),   # 寿皇门
    # Beihai White Dagoba & Drum/Bell Towers
    561193504: (35.9, 0.0, 6, 'imperial'),  # 北海白塔
    25667458: (46.7, 0.0, 4, 'imperial'),   # 鼓楼
    25667397: (47.9, 0.0, 4, 'imperial'),   # 钟楼
    # Summer Palace (颐和园万寿山 & 昆明湖)
    43977851: (41.0, 0.0, 4, 'imperial'),   # 佛香阁 (41m octagonal 3-story 4-eave tower on 20m stone platform)
    43977820: (18.5, 0.0, 2, 'imperial'),   # 排云殿
    43977845: (11.5, 0.0, 2, 'imperial'),   # 排云门
    43977853: (14.0, 0.0, 2, 'imperial'),   # 德晖殿
    43977852: (16.5, 0.0, 2, 'imperial'),   # 智慧海
    43977790: (16.5, 0.0, 2, 'imperial'),   # 香岩宗印之阁
    43977752: (8.5, 0.0, 2, 'imperial'),    # 宝云阁（铜亭）
    43977832: (12.5, 0.0, 2, 'imperial'),   # 转轮藏
    43977843: (11.0, 0.0, 2, 'imperial'),   # 画中游
    43977807: (9.0, 0.0, 1, 'imperial'),    # 听鹂馆
    43977798: (9.5, 0.0, 1, 'imperial'),    # 乐寿堂
    43977856: (9.5, 0.0, 1, 'imperial'),    # 玉澜堂
    43977777: (13.5, 0.0, 2, 'imperial'),   # 仁寿殿
    43977834: (21.0, 0.0, 3, 'imperial'),   # 德和园大戏楼
    43977847: (10.5, 0.0, 1, 'imperial'),   # 景福阁
    579104637: (16.0, 0.0, 3, 'imperial'),  # 文昌阁
    43977862: (8.5, 0.0, 1, 'imperial'),    # 知春亭
    43977788: (11.5, 0.0, 1, 'imperial'),   # 廓如亭 (八方亭)
    43977863: (11.5, 0.0, 2, 'imperial'),   # 涵虚堂 (南湖岛)
    # Yuquan Hill (玉泉山)
    942237399: (47.7, 0.0, 7, 'imperial'),  # 玉峰塔 (定光塔, 47.7m 7-story octagonal pagoda)
    1219129451: (22.0, 0.0, 5, 'imperial'), # 妙高塔
    942237401: (12.0, 0.0, 2, 'imperial'),  # 圣缘寺
    # Fragrant Hills (香山)
    225735362: (13.5, 0.0, 2, 'imperial'),  # 鬼见愁 重阳阁
    1021068644: (29.5, 0.0, 7, 'imperial'), # 琉璃万寿塔
    944732993: (10.5, 0.0, 1, 'imperial'),  # 致远斋
    490377581: (12.5, 0.0, 2, 'imperial'),  # 勤政殿
    774636765: (14.5, 0.0, 2, 'imperial'),  # 香山寺
    # Beijing Olympic Tower (北京奥林匹克塔)
    962658730: (246.8, 0.0, 70, 'glass'),   # 北京奥林匹克塔 main shaft
}

# Explicit LOD heights for multi-part landmarks whose outer `is_part=0` footprint is a low terrace base:
LOD_HEIGHT_OVERRIDES = {
    8854043: 35.0,   # 太和殿
    8854349: 27.0,   # 中和殿
    8854507: 30.0,   # 保和殿
    8851737: 23.8,   # 太和门
    8850205: 37.9,   # 午门
    8847697: 34.7,   # 天安门
    8858781: 31.0,   # 神武门
    8860936: 24.0,   # 乾清宫
    8861202: 20.5,   # 坤宁宫
    962658730: 246.8,  # 北京奥林匹克塔
}

# Kunming Lake scenic bridges to subdivide & arch:
# wid -> (width_m, base_y, arch_peak_delta_y, num_sub_segments)
SCENIC_BRIDGES = {
    187196435: (8.5, 1.8, 3.0, 18),  # 十七孔桥 (150m 17-arch white marble bridge)
    43976657: (5.5, 1.4, 4.8, 12),   # 玉带桥 (north span)
    43978815: (5.5, 1.4, 4.8, 12),   # 玉带桥 (high camelback arch)
    43978816: (5.5, 1.5, 2.6, 10),   # 豳风桥
    43978818: (5.5, 1.5, 2.6, 10),   # 镜桥
    43978813: (5.5, 1.5, 2.6, 10),   # 练桥
    43978814: (5.5, 1.5, 2.4, 10),   # 柳桥
    187196426: (5.5, 1.4, 3.5, 10),  # 绣漪桥
}


def in_royal_zone(wx, wz):
  for zname, x0, x1, z0, z1 in ROYAL_GARDEN_ZONES:
    if x0 <= wx <= x1 and z0 <= wz <= z1:
      return zname
  return None


def compute_oriented_bbox(flat):
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


def subdivide_arch_flat(flat, base_y, peak_dy, target_pts=16):
  pts = [(flat[i], flat[i + 2]) for i in range(0, len(flat), 3)]
  if len(pts) < 2:
    return flat
  seg_lens = []
  total_len = 0.0
  for i in range(len(pts) - 1):
    d = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    seg_lens.append(d)
    total_len += d
  if total_len < 1.0:
    return flat

  out = []
  for k in range(target_pts + 1):
    u = k / target_pts
    target_d = u * total_len
    acc = 0.0
    px, pz = pts[-1]
    for i, sl in enumerate(seg_lens):
      if acc + sl >= target_d or i == len(seg_lens) - 1:
        t = (target_d - acc) / max(1e-6, sl)
        t = max(0.0, min(1.0, t))
        px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t
        pz = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
        break
      acc += sl
    arch_y = round(base_y + peak_dy * math.sin(math.pi * u), 2)
    out.extend([round(px, 1), arch_y, round(pz, 1)])
  return out


def main():
  t0 = time.time()

  # 1. Update data/beijing_dem.json with Qionghua Island (北海琼华岛, +32.0m above Beihai Lake)
  dem_path = DATA_DIR / 'beijing_dem.json'
  dem = json.loads(dem_path.read_text(encoding='utf-8'))
  has_qionghua = any(p[0] == '琼华岛' for p in dem.get('osmPeaks', []))
  if not has_qionghua:
    dem['osmPeaks'].append(['琼华岛', -1236.2, -1745.7, 32.0, 62.6])
    dem_path.write_text(json.dumps(dem, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('[1/4] Added 琼华岛 (+32.0m) to data/beijing_dem.json osmPeaks.')
  else:
    print('[1/4] 琼华岛 already present in data/beijing_dem.json.')

  # 2. Scan all 1,600 chunks, clean royal garden zones, calibrate landmarks & bridges, and build LOD records
  removed_overture = 0
  calibrated_blds = 0
  calibrated_bridges = 0
  lod_records = []

  for cxi in range(40):
    for czi in range(40):
      cpath = CHUNKS_DIR / f'c_{cxi}_{czi}.json'
      cdata = json.loads(cpath.read_text(encoding='utf-8'))
      ox = -20000.0 + cxi * 1000.0 + 500.0
      oz = -20000.0 + czi * 1000.0 + 500.0
      dirty = False

      # Collect `is_part=1` bounding boxes inside this chunk so we know which `is_part=0` footprints enclose 3D parts
      part_boxes = []
      for b in cdata.get('buildings', []):
        if b[3] == 1 and len(b[11]) >= 6:
          xs = b[11][0::2]
          zs = b[11][1::2]
          part_boxes.append((min(xs), min(zs), max(xs), max(zs), b[4]))

      new_blds = []
      for b in cdata.get('buildings', []):
        osm_id, name, btype, is_part, raw_h, raw_min_h, lvl, style, col, rcol, rshape, fo, fh = b
        if len(fo) < 6:
          continue
        xs = fo[0::2]
        zs = fo[1::2]
        bx0, bz0, bx1, bz1 = min(xs), min(zs), max(xs), max(zs)
        cx = ox + (bx0 + bx1) * 0.5
        cz = oz + (bz0 + bz1) * 0.5
        zone = in_royal_zone(cx, cz)

        # Remove false Overture satellite boxes inside the 5 royal garden/palace zones
        if zone and osm_id >= OVERTURE_ID_BASE:
          removed_overture += 1
          dirty = True
          continue

        if osm_id in LANDMARK_OVERRIDES:
          nh, nminh, nlvl, nstyle = LANDMARK_OVERRIDES[osm_id]
          if (raw_h, raw_min_h, lvl, style) != (nh, nminh, nlvl, nstyle):
            raw_h, raw_min_h, lvl, style = nh, nminh, nlvl, nstyle
            calibrated_blds += 1
            dirty = True
        elif zone:
          # Inside a royal garden/palace zone:
          # Check if this `is_part=0` building encloses any `is_part=1` 3D palace tiers
          max_part_h = 0.0
          if is_part == 0:
            for px0, pz0, px1, pz1, ph in part_boxes:
              pmx = (px0 + px1) * 0.5
              pmz = (pz0 + pz1) * 0.5
              if bx0 - 2.0 <= pmx <= bx1 + 2.0 and bz0 - 2.0 <= pmz <= bz1 + 2.0:
                if ph > max_part_h:
                  max_part_h = ph

          if is_part == 1:
            # All 3D building parts inside Forbidden City / Royal Gardens are imperial style
            if style != 'imperial':
              style = 'imperial'
              calibrated_blds += 1
              dirty = True
          else:
            # `is_part=0` building inside Royal Garden / Forbidden City
            if max_part_h > 0.0:
              # Encloses 3D `building:part` tiers: keep outer footprint as a low 3.6m podium/terrace base
              target_h = min(raw_h, 3.8)
              if raw_h != target_h or style != 'imperial':
                raw_h = target_h
                lvl = 1
                style = 'imperial'
                calibrated_blds += 1
                dirty = True
            elif btype == 'wall' or '墙' in name:
              if raw_h > 8.5 or style != 'imperial':
                raw_h = 7.8
                lvl = 1
                style = 'imperial'
                calibrated_blds += 1
                dirty = True
            else:
              # Untagged or generic palace/garden courtyard hall
              area_approx = (bx1 - bx0) * (bz1 - bz0)
              max_allowed_h = 12.5 if ('殿' in name or '阁' in name or '楼' in name) else (9.5 if area_approx > 350 else 6.8)
              new_style = 'imperial'
              new_h = min(raw_h, max_allowed_h)
              new_lvl = 2 if new_h >= 8.5 else 1
              if raw_h != new_h or style != new_style or lvl != new_lvl:
                raw_h = round(new_h, 1)
                lvl = new_lvl
                style = new_style
                calibrated_blds += 1
                dirty = True

        new_blds.append([osm_id, name, btype, is_part, raw_h, raw_min_h, lvl, style, col, rcol, rshape, fo, fh])

      # Check roads for Kunming Lake scenic bridges
      for r in cdata.get('roads', []):
        wid = r[0]
        if wid in SCENIC_BRIDGES:
          w_m, base_y, peak_dy, n_sub = SCENIC_BRIDGES[wid]
          r[5] = w_m
          r[7] = 1  # is_bridge = 1
          r[9] = 1  # layer = 1
          r[10] = subdivide_arch_flat(r[10], base_y, peak_dy, n_sub)
          calibrated_bridges += 1
          dirty = True

      if dirty:
        cdata['buildings'] = new_blds
        cpath.write_text(json.dumps(cdata, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

      # Build LOD records for `city_buildings_lod.bin`
      for b in new_blds:
        osm_id, name, btype, is_part, raw_h, raw_min_h, lvl, style, _, _, _, fo, _ = b
        if is_part or len(fo) < 6:
          continue
        bcx, bcz, bw, bd, byaw = compute_oriented_bbox(fo)
        if bw * bd < 20.0:
          continue
        wx = ox + bcx
        wz = oz + bcz

        lod_h = LOD_HEIGHT_OVERRIDES.get(osm_id, raw_h)
        if osm_id not in LOD_HEIGHT_OVERRIDES and part_boxes:
          xs = fo[0::2]
          zs = fo[1::2]
          bx0, bz0, bx1, bz1 = min(xs), min(zs), max(xs), max(zs)
          for px0, pz0, px1, pz1, ph in part_boxes:
            pmx = (px0 + px1) * 0.5
            pmz = (pz0 + pz1) * 0.5
            if bx0 - 2.0 <= pmx <= bx1 + 2.0 and bz0 - 2.0 <= pmz <= bz1 + 2.0:
              if ph > lod_h:
                lod_h = ph

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
                min(65535, max(20, int(round(lod_h * 10)))),
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
      f'[2/4] Removed {removed_overture} false Overture boxes in royal parks, calibrated'
      f' {calibrated_blds} buildings/walls & {calibrated_bridges} scenic bridge entries.'
  )

  # 3. Update data/global_overview.json with 3 mountain peak bookmarks + Kunming Lake bridges
  ov_path = DATA_DIR / 'global_overview.json'
  ov = json.loads(ov_path.read_text(encoding='utf-8'))
  bm_ids = {b['id'] for b in ov.get('bookmarks', [])}
  mountain_bookmarks = [
      {
          'id': 'jingshan_peak',
          'name': '景山万春亭 (中轴线制高点)',
          'cat': 'landmark',
          'x': -598.2,
          'z': -1645.8,
          'desc': '北京内城中轴线最高点 · 南瞰故宫太和殿金瓦宫阙、西望北海琼华岛白塔、北眺鼓楼与奥林匹克塔',
      },
      {
          'id': 'foxiangge_peak',
          'name': '颐和园万寿山 (佛香阁揽胜)',
          'cat': 'landmark',
          'x': -11059.1,
          'z': -9896.0,
          'desc': '万寿山前山八面三层四重檐佛香阁 · 南眺昆明湖、南湖岛、十七孔桥与西堤玉带桥，西望玉泉山玉峰塔',
      },
      {
          'id': 'fragrant_hills_peak',
          'name': '香山香炉峰 (鬼见愁巅峰)',
          'cat': 'landmark',
          'x': -19228.9,
          'z': -9145.7,
          'desc': '西山香山公园最高峰 (海拔 557m) · 东瞰颐和园昆明湖、玉泉山与北京城全景天际线',
      },
  ]
  for mbm in mountain_bookmarks:
    if mbm['id'] not in bm_ids:
      ov['bookmarks'].append(mbm)

  # Add 十七孔桥 and 西堤 causeway to global_overview arterials if not already present
  art_names = {a[2] for a in ov.get('arterials', [])}
  if '十七孔桥' not in art_names:
    ov['arterials'].append([
        'secondary',
        8.5,
        '十七孔桥',
        1,
        [-10695.0, 2.5, -8953.5, -10760.0, 4.8, -8995.0, -10824.3, 2.5, -9037.0],
    ])
  if '西堤·玉带桥' not in art_names:
    ov['arterials'].append([
        'secondary',
        5.5,
        '西堤·玉带桥',
        1,
        [-11521.4, 2.0, -9535.4, -11583.0, 6.2, -9359.0, -11484.0, 2.5, -9203.0, -11440.0, 2.5, -8852.0, -11262.0, 2.0, -8568.0],
    ])
  ov_path.write_text(json.dumps(ov, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
  print('[3/4] Updated data/global_overview.json bookmarks and Kunming Lake bridge arterials.')

  # 4. Write data/city_buildings_lod.bin
  lod_path = DATA_DIR / 'city_buildings_lod.bin'
  with open(lod_path, 'wb') as lf:
    lf.write(struct.pack('<I', len(lod_records)))
    for rec in lod_records:
      lf.write(rec)
  print(
      f'[4/4] Rebuilt data/city_buildings_lod.bin with {len(lod_records):,} records'
      f' ({lod_path.stat().st_size / (1024*1024):.2f} MB) in {round(time.time() - t0, 2)}s.'
  )


if __name__ == '__main__':
  main()
