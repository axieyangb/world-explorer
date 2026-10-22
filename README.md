# Beijing Explorer — 1:1 40km × 40km (1,600 km²) 3D Open-World Beijing

**`Beijing Explorer`** is a 1:1 physical metric scale ($40\text{ km} \times 40\text{ km} = 1,600\text{ km}^2$) real-time 3D Open-World web application built from real OpenStreetMap (`beijing-latest.osm.pbf`), Overture Maps (`2026-09-23.1`), and SRTM/Terrarium Digital Elevation Model (DEM) geographic data, rendered in WebGL2 with Three.js (`r161`).

---

## 1. Standalone a static host Deployments

All three standalone single-file HTML bundles inline their ES modules and gzipped binary/JSON datasets (`DecompressionStream('gzip')`) so they run with zero external network requests inside a static host's `Content-Security-Policy: sandbox allow-scripts`:

| Application | a static host URL | Local File Path |
| :--- | :--- | :--- |
| **Beijing Explorer (Main 3D World)** | `https://worldexplorer.jerxie.com/beijing_explorer.html` | `./beijing_explorer.html` (`28.08 MB`) |
| **3D Architectural WFC Lab (24 Styles)** | `https://worldexplorer.jerxie.com/beijing_explorer_wfc_demo.html` | `./beijing_explorer_wfc_demo.html` (`1.45 MB`) |
| **40 Landmarks 3-View + Isometric Workbench** | `https://worldexplorer.jerxie.com/landmark_workbench.html` | `./landmark_workbench.html` (`1.59 MB`) |

---

## 2. Project Directory Structure

```text
beijing_gta_mvp/
├── README.md                        # Project architecture & build documentation
├── index.html                       # Main 3D Open-World application entry HTML
├── styles.css                       # HUD, telemetry, map modal, and language chooser styles
├── wfc_demo.html                    # Standalone 24-style 3D Architectural WFC Lab entry HTML
├── landmark_workbench.html          # 4-viewport (Front / Side / Top / Isometric) landmark review workbench
├── server.py                        # Multithreaded local HTTP development server (default port 8098)
├── vendor/
│   └── three.module.js              # Local Three.js r161 ES module (zero CDN dependency)
├── src/
│   ├── main.js                      # Core engine loop, camera, physics, lighting, streaming, and HUD
│   ├── environment.js               # 401×401 SRTM DEM bilinear heightfield + 52 OSM mountain peaks + sky dome
│   ├── chunk_builder.js             # 1km×1km chunk geometry builder, bridges/trenches, WFC & ray-picking
│   ├── chunk_worker.js              # Web Worker off-thread chunk geometry & normal builder
│   ├── entities.js                  # 6 vehicles (Mach-1 Cyber Hypercar, etc.), pedestrian, 3D helicopter & AI traffic
│   ├── navigation.js                # Full-city road graph A* pathfinding & 3D route ribbon renderer
│   ├── map_modal.js                 # 40km×40km interactive vector map with arbitrary point click-to-teleport & A*
│   ├── i18n.js                      # Bilingual (zh / en) UI catalog + Unihan Pinyin & semantic road/building translator
│   ├── landmarks_core.js            # Procedural 3D architectural geometry kernel (LandmarkGeometryBuilder)
│   ├── landmarks_40.js              # 40 Beijing landmarks aggregator, spatial matcher & hillside foundation plinths
│   ├── landmarks/
│   │   ├── batch_01.js              # 01–04: 天安门, 正阳门城楼, 正阳门箭楼, 故宫午门
│   │   ├── batch_02.js              # 05–08: 故宫太和殿, 中和殿, 保和殿, 神武门
│   │   ├── batch_03.js              # 09–12: 景山万春亭, 钟楼, 鼓楼, 天坛祈年殿
│   │   ├── batch_04.js              # 13–16: 天坛皇穹宇, 北海白塔, 妙应寺白塔, 天宁寺塔
│   │   ├── batch_05.js              # 17–20: 玉泉山玉峰塔, 颐和园佛香阁, 德胜门箭楼, 永定门城楼
│   │   ├── batch_06.js              # 21–24: 明城墙东南角楼, 北京奥林匹克塔, 国家体育场(鸟巢), 国家游泳中心(水立方)
│   │   ├── batch_07.js              # 25–28: 国家速滑馆(冰丝带), 中国尊(528m), 央视总部大楼(大裤衩), 国贸三期A座
│   │   ├── batch_08.js              # 29–32: 国贸三期B座, 北京银泰中心, 财富金融中心(FFC), 望京SOHO
│   │   ├── batch_09.js              # 33–36: 银河SOHO, 丽泽SOHO, 国家大剧院(巨蛋), 人民大会堂
│   │   └── batch_10.js              # 37–40: 中国国家博物馆, 中央广播电视塔(405m), 军事博物馆, 北京南站
│   └── wfc/
│       ├── wfc_archetypes.js        # 24 authentic Beijing architectural style definitions (S01..S24)
│       ├── wfc_solver.js            # 1D vertical massing + 2D AC-3 facade tile grammar + 2D rooftop greeble solver
│       ├── wfc_mesh_builder.js      # Footprint-constrained 3D WFC geometry emitter with normal-length night emissive
│       ├── wfc_real_footprints.js   # Real Beijing OSM polygon footprints for interactive WFC testing
│       └── wfc_demo_app.js          # Interactive WFC Lab UI and 3D viewport controller
├── tools/
│   ├── build_beijing_world.py       # Offline compiler: parses beijing-latest.osm.pbf into 1,600 1km×1km chunks
│   ├── fuse_overture_buildings.py   # Fuses 434,148 Overture Maps 3D footprints with 94,802 OSM buildings (528,950 total)
│   ├── fix_mountain_viewpoints.py   # Calibrates Jingshan, Summer Palace Longevity Hill & Fragrant Hills viewpoints
│   ├── render_landmark_3view.py     # Headless Chrome batch renderer for 40 landmark 3-view + isometric sheets
│   ├── random_visual_audit.py       # Headless Chrome 3×3 contact-sheet visual auditor across random seeds
│   └── build_release.py      # Bundles single-file gzipped HTML releases for static-host deployment
└── data/
    ├── global_overview.json         # Macro arterial roads, water, parks, 365 subway/rail stations & 23 hubs
    ├── beijing_dem.json             # 401×401 (100m step) SRTM Terrarium bare-earth DEM + 52 OSM peaks (-43m..+575m)
    ├── nav_graph.json               # Full-city drivable road intersection & edge graph for A* navigation
    ├── city_buildings_lod.bin       # Binary SoA buffer of 517,225 oriented 3D building footprints (28 bytes/record)
    └── chunks/
        └── c_{0..39}_{0..39}.json   # 1,600 1km×1km high-detail spatial chunks (roads, bridges, buildings, trees, water)
```

---

## 3. Core Technical Highlights

1. **1:1 Metric Coordinate System & 1,600-Chunk Streaming Grid**:
   - Origin `(0, 0)` is centered at `(39.9087°N, 116.3975°E)` with `+X` = East (`mPerDegLon = 85,390m`), `+Z` = South (`mPerDegLat = 111,132m`), and `+Y` = Elevation in meters relative to the Tiananmen Square baseline (`30.6m` ASL).
   - The $40\text{ km} \times 40\text{ km}$ world (`[-20000m, +20000m]`) is partitioned into $40 \times 40 = 1,600$ spatial chunks (`1,000m × 1,000m` each). Active chunks within `LOAD_RADIUS = 3` (`7 × 7 = 49` chunks) stream dynamically via a background Web Worker (`src/chunk_worker.js`), while global horizon cutouts (`_updateHorizonCutoutsForLoadedChunks`) seamlessly hide horizon terrain, water, parks, arterials, and distant `InstancedMesh` buildings inside loaded chunks.

2. **528,950 Fused 3D Buildings & 24-Style Footprint-Constrained WFC**:
   - Combines `94,802` OpenStreetMap buildings (`building:part`, `multipolygon` inner courtyards) with `434,148` non-overlapping satellite-derived footprints from Overture Maps.
   - Inside active chunks, buildings are synthesized using a 3-orthogonal-dimension Wave Function Collapse pipeline (`src/wfc/`) across 24 Beijing architectural styles (`S01..S24`, from Forbidden City imperial halls and Shichahai Siheyuan courtyards to 1950s Soviet red-brick compounds, 1980s/90s residential slabs, and Guomao/Zhongguancun glass curtain towers) with $145\text{ m} \times 145\text{ m}$ urban block coherence.
   - Outside active chunks, all `517,225` city-wide buildings render in a single `THREE.InstancedMesh` draw call directly from a compact `28-byte/building` `DataView` (`city_buildings_lod.bin`).

3. **40 Bespoke 1:1 Beijing Landmarks (`446,719` Vertices)**:
   - Authored across 10 modular batch files (`src/landmarks/batch_01.js..batch_10.js`) using `LandmarkGeometryBuilder` (`src/landmarks_core.js`) and verified in the 4-viewport orthographic/isometric workbench (`landmark_workbench.html`).
   - Automatically samples 4-corner DEM slopes on hills (`万寿山`, `景山`, `琼华岛`, `玉泉山`) to generate battered stone retaining foundations so hillside palaces and pagodas never float on steep terrain.

4. **Zero-Attribute Normal-Length Nighttime Emissive & Urban Night Lighting**:
   - Encodes emissive window, lantern, and crown faces on WFC buildings and the 40 landmarks without allocating an extra vertex attribute by scaling vertex normal length to `||normal|| = 2.0` (`nScale = emissive ? 2.0 : 1.0`), decoded in `wfcBldgMat.onBeforeCompile` (`vEmissive = step(1.5, length(objectNormal)); objectNormal = normalize(objectNormal);`).
   - Distant `skylineInstanced` LOD buildings use a world-coordinate procedural window-grid shader (`uLodNightEmissive`) on vertical walls combined with scene-wide `AmbientLight` and `HemisphereLight` sky/ground presets so both near and distant cityscapes share cohesive nighttime illumination.

5. **Default 150m Turbine Helicopter, 6 Vehicles & Mach-1.0 Sonic Boom VFX**:
   - Starts by default in **Turbine Helicopter (`helicopter`)** mode at `150m` altitude above Chang'an Avenue at Tiananmen Square (`C` to toggle Helicopter, `F` to toggle Drive/Walk, `G` to cycle 6 vehicles, `V` to cycle Chase/Top-Down/Street cameras, `Shift` for mode-specific Nitro Boost including the `1,225 km/h` Mach-1.0 Prandtl-Glauert vapor cone on `cyber_mach1`).

---

## 4. Full `data/` & 1,600-Chunk Generation Pipeline (From Scratch)

Note that the source archive excludes the generated `data/` directory (`data/chunks/c_{0..39}_{0..39}.json`, `data/global_overview.json`, `data/nav_graph.json`, `data/beijing_dem.json`, and `data/city_buildings_lod.bin`). To generate the entire `data/` directory from scratch before starting `server.py`, run the following 4 automated stages:

### Stage 1: Download Geofabrik `beijing-latest.osm.pbf` & Compile 1,600 OSM Chunks
`tools/build_beijing_world.py` reads OpenStreetMap's `beijing.osm.pbf` (`~36 MB`) via raw Protobuf wire decoding and generates `data/chunks/c_{0..39}_{0..39}.json`, `data/global_overview.json`, and `data/nav_graph.json`:

```bash
mkdir -p data/chunks
curl -L https://download.geofabrik.de/asia/china/beijing-latest.osm.pbf -o /tmp/beijing.osm.pbf

# Update pbf_path / out_dir in tools/build_beijing_world.py if running outside the default path, then run:
python3 tools/build_beijing_world.py
```

### Stage 2: Build Real SRTM/Terrarium 401×401 DEM (`data/beijing_dem.json`) & Extract OSM Peaks / Trees
Downloads the 56 Zoom-12 Mapzen/AWS Open Data Terrarium elevation tiles (`x=3369..3375, y=1548..1555`) covering $40\text{ km} \times 40\text{ km}$ Beijing, applies morphological minimum erosion + 2-pass Gaussian smoothing to strip urban skyscraper radar reflections, and extracts OSM `natural=peak` (`ele=*`) summits and `natural=tree` nodes from `beijing.osm.pbf`:

```bash
python3 -c '
import urllib.request, math, json, zlib, struct, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "tools")
import build_beijing_world as bbw

CENTER_LAT, CENTER_LON = 39.9087, 116.3975
M_PER_DEG_LAT = 111132.92
M_PER_DEG_LON = 111412.84 * math.cos(math.radians(CENTER_LAT))

def deg2num_float(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    return (lon_deg + 180.0) / 360.0 * n, (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n

def decode_png_rgb(data):
    pos, width, height, color_type, idat = 8, 0, 0, 2, bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        cdata = data[pos+8:pos+8+length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, _, color_type = struct.unpack(">IIBB", cdata[:10])
        elif ctype == b"IDAT":
            idat.extend(cdata)
        elif ctype == b"IEND":
            break
    raw = zlib.decompress(bytes(idat))
    bpp = 3 if color_type == 2 else 4
    stride = width * bpp
    recon = bytearray(height * stride)
    i = 0
    for y in range(height):
        ftype = raw[i]; i += 1
        rs, ps = y * stride, (y - 1) * stride
        for x in range(stride):
            val = raw[i]; i += 1
            a = recon[rs + x - bpp] if x >= bpp else 0
            b = recon[ps + x] if y > 0 else 0
            c = recon[ps + x - bpp] if (x >= bpp and y > 0) else 0
            if ftype == 0: recon[rs + x] = val
            elif ftype == 1: recon[rs + x] = (val + a) & 0xff
            elif ftype == 2: recon[rs + x] = (val + b) & 0xff
            elif ftype == 3: recon[rs + x] = (val + ((a + b) >> 1)) & 0xff
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                recon[rs + x] = (val + pr) & 0xff
    elev = [0.0] * (width * height)
    for y in range(height):
        rs = y * stride
        for x in range(width):
            px = rs + x * bpp
            elev[y * width + x] = (recon[px] * 256.0 + recon[px+1] + recon[px+2] / 256.0) - 32768.0
    return elev

z = 12
tx_min, ty_min = int(math.floor(deg2num_float(40.12, 116.12, z)[0])), int(math.floor(deg2num_float(40.12, 116.12, z)[1]))
tx_max, ty_max = int(math.floor(deg2num_float(39.70, 116.68, z)[0])), int(math.floor(deg2num_float(39.70, 116.68, z)[1]))
coords = [(tx, ty) for tx in range(tx_min, tx_max + 1) for ty in range(ty_min, ty_max + 1)]
tiles = {}
def fetch_one(xy):
    tx, ty = xy
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"
    with urllib.request.urlopen(url, timeout=15) as r:
        return xy, decode_png_rgb(r.read())
with ThreadPoolExecutor(max_workers=12) as ex:
    for xy, arr in ex.map(fetch_one, coords):
        tiles[xy] = arr

def sample_asl(wx, wz):
    lat = CENTER_LAT - wz / M_PER_DEG_LAT
    lon = CENTER_LON + wx / M_PER_DEG_LON
    fx, fy = deg2num_float(lat, lon, z)
    tx, ty = int(math.floor(fx)), int(math.floor(fy))
    px, py = min(255, max(0, int((fx - tx) * 256))), min(255, max(0, int((fy - ty) * 256)))
    arr = tiles.get((tx, ty))
    return arr[py * 256 + px] if arr else 44.0

base_asl = sample_asl(-530, 265)
n = 401
raw = [round(sample_asl(-20000.0 + ix * 100.0, -20000.0 + iz * 100.0) - base_asl, 1) for iz in range(n) for ix in range(n)]

# Morphological minimum erosion + 2-pass Gaussian smoothing (bare-earth DTM)
eroded = [0.0] * (n * n)
for iz in range(n):
    for ix in range(n):
        wx, wz = -20000.0 + ix * 100.0, -20000.0 + iz * 100.0
        r = 1 if (wx < -8500 or wz < -11500) else 2
        eroded[iz * n + ix] = min(raw[min(n-1, max(0, iz+dz)) * n + min(n-1, max(0, ix+dx))] for dz in range(-r, r+1) for dx in range(-r, r+1))
smoothed = eroded[:]
for _ in range(2):
    nxt = [0.0] * (n * n)
    for iz in range(n):
        for ix in range(n):
            acc = cnt = 0.0
            for dz in range(-1, 2):
                jz = min(n - 1, max(0, iz + dz))
                for dx in range(-1, 2):
                    jx = min(n - 1, max(0, ix + dx))
                    w = 4.0 if (dx == 0 and dz == 0) else (2.0 if (dx == 0 or dz == 0) else 1.0)
                    acc += smoothed[jz * n + jx] * w; cnt += w
            nxt[iz * n + ix] = acc / cnt
    smoothed = nxt
t_zero = smoothed[203 * n + 195]
final_grid = [round(v - t_zero, 2) for v in smoothed]

# Extract OSM natural=peak and natural=tree from /tmp/beijing.osm.pbf
BlobHeader, Blob, PrimitiveBlock = bbw.build_proto_classes()
peaks, chunk_trees = [], defaultdict(list)
with open("/tmp/beijing.osm.pbf", "rb") as f:
    while True:
        b = f.read(4)
        if not b: break
        bh = BlobHeader.FromString(f.read(struct.unpack("!I", b)[0]))
        blob = Blob.FromString(f.read(bh.datasize))
        if bh.type != "OSMData": continue
        pb = PrimitiveBlock.FromString(zlib.decompress(blob.zlib_data) if blob.zlib_data else blob.raw)
        gran, lat_off, lon_off = pb.granularity or 100, pb.lat_offset or 0, pb.lon_offset or 0
        st = [s.decode("utf-8", "ignore") for s in pb.stringtable.s]
        for pg in pb.primitivegroup:
            if pg.dense.id:
                nid = lat = lon = kv_idx = 0
                kvs, n_kvs = pg.dense.keys_vals, len(pg.dense.keys_vals)
                for did, dlat, dlon in zip(pg.dense.id, pg.dense.lat, pg.dense.lon):
                    nid += did; lat += dlat; lon += dlon
                    fl, fn = (lat_off + gran * lat) * 1e-9, (lon_off + gran * lon) * 1e-9
                    in_box = (bbw.MIN_LAT <= fl <= bbw.MAX_LAT and bbw.MIN_LON <= fn <= bbw.MAX_LON)
                    ntags = None
                    if kv_idx < n_kvs:
                        while kv_idx < n_kvs and kvs[kv_idx] != 0:
                            if in_box:
                                if ntags is None: ntags = {}
                                ntags[st[kvs[kv_idx]]] = st[kvs[kv_idx + 1]]
                            kv_idx += 2
                        kv_idx += 1
                    if in_box and ntags:
                        xm, zm = round((fn - bbw.CENTER_LON) * bbw.M_PER_DEG_LON, 1), round((bbw.CENTER_LAT - fl) * bbw.M_PER_DEG_LAT, 1)
                        if abs(xm) <= bbw.HALF_SIZE_M and abs(zm) <= bbw.HALF_SIZE_M:
                            nat = ntags.get("natural")
                            if nat == "peak" or "ele" in ntags:
                                ele = bbw.parse_float(ntags.get("ele"))
                                if ele is not None and 40 <= ele <= 1200 and ntags.get("name"):
                                    peaks.append([ntags.get("name"), xm, zm, round(ele - base_asl, 1)])
                            if nat == "tree":
                                cx, cz = max(0, min(39, int((xm + 20000) // 1000))), max(0, min(39, int((zm + 20000) // 1000)))
                                ox, oz = -20000 + cx * 1000 + 500, -20000 + cz * 1000 + 500
                                chunk_trees[(cx, cz)].append([round(xm - ox, 1), round(zm - oz, 1), 1 if ntags.get("leaf_type") == "needleleaved" else 0])

for (cx, cz), tlist in chunk_trees.items():
    cpath = f"data/chunks/c_{cx}_{cz}.json"
    with open(cpath, "r", encoding="utf-8") as cf: cdata = json.load(cf)
    cdata["osm_trees"] = tlist[:500]
    with open(cpath, "w", encoding="utf-8") as cf: json.dump(cdata, cf, ensure_ascii=False, separators=(",", ":"))

peaks.extend([["景山万春亭", -508.0, -1180.0, 43.0], ["北海琼华岛", -1030.0, -960.0, 28.0]])
with open("data/beijing_dem.json", "w", encoding="utf-8") as df:
    json.dump({"gridSize": n, "stepM": 100, "minWorld": -20000, "maxWorld": 20000, "baseAslM": round(base_asl, 1), "minRelM": min(final_grid), "maxRelM": max(final_grid), "elevations": final_grid, "osmPeaks": peaks}, df, ensure_ascii=False, separators=(",", ":"))
'
```

### Stage 3: Fuse Overture Maps 3D Building Footprints (`528,950` Total Buildings)
`tools/fuse_overture_buildings.py` streams Beijing RowGroups via HTTP Range requests from Overture Maps `2026-09-23.1` Parquet files on AWS S3, merges `434,148` non-overlapping footprints into `data/chunks/c_{0..39}_{0..39}.json`, and builds `data/city_buildings_lod.bin`:

```bash
python3 tools/fuse_overture_buildings.py
```

### Stage 4: Calibrate Royal Gardens, Mountain Viewpoints & Kunming Lake Bridges
`tools/fix_mountain_viewpoints.py` cleans satellite false-positives inside the 5 imperial garden/palace zones (`ForbiddenCity_Jingshan`, `Beihai_Zhongnanhai`, `SummerPalace`, `YuquanHill`, `FragrantHills`), calibrates historical palace/pagoda heights and Kunming Lake marble arch bridges (`十七孔桥`, `玉带桥`), and writes the final `data/city_buildings_lod.bin`:

```bash
python3 tools/fix_mountain_viewpoints.py
```

---

## 5. Local Development & Release Bundle Commands

```bash
# 1. Start local multithreaded HTTP server on http://127.0.0.1:8098/
python3 server.py

# 2. Render all 40 landmark 3-view + isometric verification sheets via headless Chrome WebGL
python3 tools/render_landmark_3view.py

# 3. Rebuild standalone single-file HTML bundles and deploy to ./
python3 tools/build_release.py
```
