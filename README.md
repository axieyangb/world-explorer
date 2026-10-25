# World Explorer

A real-time 3D open world of the whole Earth in the browser. Fly a helicopter, drive or walk anywhere on the
planet: terrain, roads, buildings, rail, water and street detail are streamed from open map data around
wherever you are, at 1:1 metric scale. Built on WebGL2 with Three.js r161, no build step, no API keys.

Live: **https://worldexplorer.jerxie.com**

## Features

- **Anywhere on Earth.** Search a place (`/` or the location pill), pick a quick destination, click the world
  map (`M`), or open with `?lat=..&lon=..[&name=..]`. Each jump builds a 40 km × 40 km region around the point
  from OpenFreeMap Z14 vector tiles and AWS Terrarium elevation tiles, streamed in 1 km chunks by a Web Worker.
  The default start is the San Francisco Embarcadero, in the helicopter.
- **Ways to move.** Helicopter with arcade flight model, auto-land and rooftop landing; a garage of cars
  (supercar, Mach-1 hypercar, Formula car, Cybertruck, Tesla, taxi, bus, police, ambulance, tow truck, tank);
  and on foot. Chase, top-down and street cameras.
- **A living city.** AI traffic and pedestrians on the real lane graph, driving on the correct side per region,
  with shared traffic-signal timing; street furniture, signs, highway shields and gantries; real OSM trees,
  lamps and signals for the streets around you (Overpass); rail lines with animated trains (live BART
  positions in the Bay Area); ferries and ships (live AIS in Finnish waters); airports, stadiums and animated
  theme-park rides.
- **Live sky and weather.** Real aircraft overhead from OpenSky / adsb.fi / adsb.lol (through the server's
  `/api/sky` proxy), current local weather from Open-Meteo, a sun/moon day-night cycle at local solar time,
  rain, fog and clouds, and climate-aware vegetation from a Köppen–Geiger grid.
- **Landmarks.** 51 hand-built 1:1 landmark models placed at their real coordinates (Eiffel Tower, Burj Khalifa,
  Empire State, Tower Bridge, Statue of Liberty, Giza pyramids, Taj Mahal, Sydney Opera House, Tokyo Skytree,
  Transamerica Pyramid, Forbidden City…), plus a separate 40-model Beijing set (Temple of Heaven, Olympic
  venues, CBD towers, city gates).
- **Places info.** Storefront and civic signs, a "Welcome to …" toast when you cross a border, and a quiet
  Wikipedia card for the landmark you're looking at.
- **Combat.** Helicopter cannon and rockets, on-foot weapons, a drivable tank, vehicle damage and explosions,
  and **Kaiju Defense** (`4`): a giant creature rises from the nearest water and you defend the city as a
  gunship, tank or soldier.
- **Bilingual UI** (English / 简体中文), with native road names and English labels.

## Controls

| Key | Action |
| :-- | :-- |
| `1` / `2` / `3` / `4` | Drive / Walk / Helicopter / Kaiju Defense (in Kaiju: choose gunship / tank / soldier) |
| `C` | Toggle helicopter |
| `F` | Drive ⇄ walk; in the air: rockets; landed: get out |
| `E` | Enter / leave a vehicle, board a parked helicopter |
| `G` | Cycle vehicle (switches to driving) |
| `V` | Cycle camera; while driving it cycles the vehicle and `Shift+V` cycles the camera |
| `W A S D`, arrows | Move / steer; helicopter: `Q`/`E` altitude, `←`/`→` strafe, `L` auto-land |
| `Space` / `X` / `R` | Fire / heavy weapon (RPG, tank cannon, rockets) / cycle weapon on foot |
| `Shift` | Boost |
| `H` | Horn / siren |
| `M` | World map (click anywhere to teleport) |
| `/` | Search for a place |
| `Shift+F` | Full screen |

URL options: `?lat=&lon=&name=` start location, `?time=<hour 0-24>` fixed time of day,
`?weather=clear|cloudy|rain|fog` fixed weather.

## Run locally

```bash
python3 server.py            # http://localhost:8098  (PORT env var to change)
```

`server.py` serves the files and the `/api/sky` live-aircraft proxy (ADS-B feeds don't allow cross-origin
browser calls). Any static server also works; the live-aircraft layer then simply stays empty.

Or with Docker:

```bash
docker build -t world-explorer .
docker run -p 8098:8098 world-explorer
```

### Single-file build

`world_explorer.html` is the whole app in one file: every ES module and the bundled datasets are inlined
(gzipped, decoded with `DecompressionStream`), so it runs from any static host or sandboxed page. Rebuild it
after changing the source:

```bash
python3 tools/build_release.py [out_file]     # default: ./world_explorer.html
```

New modules must be registered in `MOD_ID_MAP` in that script.

## Project layout

```text
index.html, styles.css     App shell and HUD
server.py                  Static server + /api/sky aircraft proxy
Dockerfile                 Container image (python:3.12-slim, port 8098)
world_explorer.html        Single-file build (generated)
wfc_demo.html              Wave Function Collapse building lab (24 Beijing architectural styles)
landmark_workbench.html    Front / side / top / isometric review of the Beijing landmark models
vendor/three.module.js     Three.js r161 (local, no CDN)
src/
  main.js                  Engine loop, modes, camera, input, chunk streaming, HUD
  global_tiles.js          World origin, OpenFreeMap vector-tile + Terrarium DEM fetch/decode, geocoding
  chunk_builder.js         Chunk geometry: roads, bridges, buildings, water, terrain
  chunk_worker.js          Web Worker running the chunk build off the main thread
  environment.js           Terrain/heightfield, sky dome, Beijing DEM
  entities.js              Player vehicles, pedestrian, helicopter models
  navigation.js            Road-graph A* routing and route ribbon
  map_modal.js             Interactive world map and teleport
  i18n.js                  English / Chinese UI and road-name translation
  landmarks_core.js, landmarks_40.js, landmarks/   Beijing landmark ensemble (10 batches)
  wfc/                     Footprint-constrained WFC building generator
  features/                One module per feature: traffic, vehicles, heli_flight, rail_*, maritime/,
                           places*, places_info/, street_*, vegetation*, flora_climate, atmosphere, sky,
                           live_sky, live_weather, water_*, venues, bridge_*, walker_weapons,
                           vehicle_damage, landmarks/ (world landmarks), kaiju/ (see kaiju/DESIGN.md) …
data/
  beijing_dem.json         Beijing elevation grid (SRTM / Terrarium) + peaks
  global_overview.json     Beijing macro roads, water, parks, stations
  nav_graph.json           Beijing drivable road graph for A*
  city_buildings_lod.bin   Beijing distant-skyline buildings, 28 bytes each
  street_detail_sf.json    Pre-fetched street detail for the San Francisco start
assets/                    Facade and door texture atlases (+ *_src photos they're built from)
tools/                     Offline builders (Python)
```

## Data sources and services

Everything is open data, fetched directly from the browser without keys unless noted.

| What | Source |
| :-- | :-- |
| Roads, buildings, water, land use, POIs (worldwide) | [OpenFreeMap](https://openfreemap.org) vector tiles (OpenMapTiles schema, © OpenStreetMap contributors) |
| Elevation | AWS Open Data Terrarium tiles (Mapzen) |
| Street-level trees / lamps / signals | OpenStreetMap via Overpass API mirrors |
| Search / reverse geocoding | Photon (Komoot), Nominatim, BigDataCloud |
| Weather | Open-Meteo |
| Aircraft | OpenSky Network, adsb.fi, adsb.lol (via `server.py`) |
| Ships | Fintraffic Digitraffic AIS (CC BY 4.0) |
| Bay Area trains | BART API (public key) |
| Climate zones | Köppen–Geiger 0.5° grid (Kottek et al. 2006) |
| Beijing detail data | OSM Geofabrik extract, Overture Maps buildings, SRTM |

## Rebuilding the Beijing data

The files in `data/` (except `street_detail_sf.json`) are only used for the detailed Beijing region and are
checked in. To regenerate them:

```bash
curl -L https://download.geofabrik.de/asia/china/beijing-latest.osm.pbf -o /tmp/beijing.osm.pbf
python3 tools/build_beijing_world.py /tmp/beijing.osm.pbf   # chunks, overview, nav graph -> data/
python3 tools/fuse_overture_buildings.py                    # merge Overture Maps buildings
python3 tools/fix_mountain_viewpoints.py                    # hill viewpoint calibration
```

Other tools: `build_facade_atlas.py` / `build_door_atlas.py` (texture atlases from `assets/*_src`),
`build_koppen_grid.py` (climate grid module), `build_street_detail_seed.py` (SF street seed),
`render_landmark_3view.py` and `random_visual_audit.py` (headless-Chrome screenshot checks, output in `out/`).
