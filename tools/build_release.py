#!/usr/bin/env python3
"""Builds a self-contained single-file HTML release of World Explorer (world_explorer.html).

Usage: python3 tools/build_release.py [out_file]   (default: <repo>/world_explorer.html)
"""

import base64
import gzip
from pathlib import Path
import re
import struct
import sys
import time

ROOT = Path(__file__).resolve().parent.parent  # repo (or worktree) containing this script
OUT_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'world_explorer.html'

MOD_ID_MAP = {
    'vendor/three.module.js': '__MOD_three',
    'vendor/satellite.module.js': '__MOD_satellite',  # [satellites] satellite.js (MIT)
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
    'src/features/ground_cover.js': '__MOD_ground_cover',  # [ground]
    'src/features/infill_buildings.js': '__MOD_infill_buildings',  # [ground]
    'src/features/roofs.js': '__MOD_roofs',  # [roofs]
    'src/features/roofs_chunk.js': '__MOD_roofs_chunk',  # [roofs]
    'src/features/facade_styles.js': '__MOD_facade_styles',  # [roofs]
    'src/features/places_extract.js': '__MOD_places_extract',
    'src/features/signals.js': '__MOD_signals',
    'src/features/traffic_graph.js': '__MOD_traffic_graph',
    'src/features/water_shore.js': '__MOD_water_shore',
    'src/features/street_worker.js': '__MOD_street_worker',
    'src/features/koppen_grid.js': '__MOD_koppen_grid',  # [feature/climate-flora]
    'src/features/flora_climate.js': '__MOD_flora_climate',  # [feature/climate-flora]
    'src/features/vegetation_worker.js': '__MOD_vegetation_worker',
    'src/features/places_worker.js': '__MOD_places_worker',
    'src/features/water_physics.js': '__MOD_water_physics',
    'src/features/road_grid.js': '__MOD_road_grid',
    'src/features/bridge_deck.js': '__MOD_bridge_deck',
    'src/features/building_collision.js': '__MOD_building_collision',
    'src/chunk_builder.js': '__MOD_chunk_builder',
    'src/chunk_worker.js': '__MOD_chunk_worker',
    'src/features/vehicles.js': '__MOD_vehicles',
    'src/entities.js': '__MOD_entities',
    # Main-thread feature modules.
    'src/features/daylight.js': '__MOD_daylight',
    'src/features/person_model.js': '__MOD_person_model',
    'src/features/traffic_models.js': '__MOD_traffic_models',
    'src/features/heli_flight.js': '__MOD_heli_flight',
    'src/features/fullscreen.js': '__MOD_fullscreen',
    'src/features/touch_controls.js': '__MOD_touch_controls',
    'src/features/quality.js': '__MOD_quality',  # [ui-mobile]
    'src/features/hud_layout.js': '__MOD_hud_layout',  # [ui-mobile]
    'src/features/people_agents.js': '__MOD_people_agents',  # [people-agents]
    'src/features/city_traffic.js': '__MOD_city_traffic',
    'src/features/vehicle_damage.js': '__MOD_vehicle_damage',  # [car-explosions]
    'src/features/parked_cars.js': '__MOD_parked_cars',  # [parked-cars]
    'src/features/walker_weapons.js': '__MOD_walker_weapons',  # [walker-weapons]
    'src/features/weapon_models.js': '__MOD_weapon_models',  # [weapon-pickups]
    'src/features/weapon_pickups.js': '__MOD_weapon_pickups',  # [weapon-pickups]
    'src/features/map_tiles.js': '__MOD_map_tiles',
    'src/features/route_graph.js': '__MOD_route_graph',
    'src/features/street_furniture.js': '__MOD_street_furniture',
    'src/features/tree_models.js': '__MOD_tree_models',  # [tree-detail]
    'src/features/tree_damage.js': '__MOD_tree_damage',  # [tree-damage]
    'src/features/tree_impostors.js': '__MOD_tree_impostors',  # [tree-impostor]
    'src/features/street_props.js': '__MOD_street_props',  # [street-props]
    'src/features/vegetation.js': '__MOD_vegetation',
    'src/features/places.js': '__MOD_places',
    'src/features/sky.js': '__MOD_sky',
    'src/features/night_lights.js': '__MOD_night_lights',  # [night]
    'src/features/rain.js': '__MOD_rain',
    'src/features/surfaces.js': '__MOD_surfaces',
    'src/features/atmosphere.js': '__MOD_atmosphere',
    'src/features/live_sky.js': '__MOD_live_sky',  # [live-sky-weather]
    'src/features/live_weather.js': '__MOD_live_weather',  # [live-sky-weather]
    'src/features/live_traffic.js': '__MOD_live_traffic',  # [live-traffic]
    'src/features/aurora.js': '__MOD_aurora',  # [aurora]
    'src/features/hero_vehicles.js': '__MOD_hero_vehicles',  # [hero-vehicles]
    'src/features/reflection_probe.js': '__MOD_reflection_probe',  # [hero-vehicles]
    'src/features/hero_heavy.js': '__MOD_hero_heavy',  # [hero-vehicles]
    'src/features/hero_avatar.js': '__MOD_hero_avatar',  # [hero-vehicles]
    'src/features/occupants.js': '__MOD_occupants',  # [drivers]
    'src/features/drivers.js': '__MOD_drivers',  # [drivers]
    'src/features/ped_ragdoll.js': '__MOD_ped_ragdoll',  # [drivers]
    'src/features/carjack.js': '__MOD_carjack',  # [polish]
    'src/features/hero_heli.js': '__MOD_hero_heli',  # [hero-vehicles]
    'src/features/nitro_fx.js': '__MOD_nitro_fx',  # [nitro-fx]
    'src/features/sea_state.js': '__MOD_sea_state',  # [sea-state]
    'src/features/satellites.js': '__MOD_satellites',  # [satellites]
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
    'src/features/kaiju/kaiju_supply.js': '__MOD_kaiju_supply',
    'src/features/kaiju/kaiju_super.js': '__MOD_kaiju_super',
    'src/features/kaiju/kaiju_hud.js': '__MOD_kaiju_hud',
    'src/features/kaiju/kaiju_mode.js': '__MOD_kaiju_mode',
    'src/features/waterways.js': '__MOD_waterways',  # [release-6]
    'src/features/rail_extract.js': '__MOD_rail_extract',  # [release-6]
    'src/features/venues.js': '__MOD_venues',  # [release-6]
    'src/features/bridge_profile.js': '__MOD_bridge_profile',  # [release-6]
    'src/features/places_info/pi_worker.js': '__MOD_places_info_pi_worker',  # [release-6]
    'src/features/rail_build.js': '__MOD_rail_build',  # [release-6]
    'src/features/places_info/pi_map.js': '__MOD_places_info_pi_map',  # [release-6]
    'src/features/street_detail.js': '__MOD_street_detail',  # [release-6]
    'src/features/venue_rides.js': '__MOD_venue_rides',  # [release-6]
    'src/features/poi_venues_extract.js': '__MOD_poi_venues_extract',  # [venues-poi]
    'src/features/poi_venues.js': '__MOD_poi_venues',  # [venues-poi]
    'src/features/poi_venue_models.js': '__MOD_poi_venue_models',  # [venues-poi]
    'src/features/poi_venue_system.js': '__MOD_poi_venue_system',  # [venues-poi]
    'src/features/places_info/index.js': '__MOD_places_info_index',  # [release-6]
    'src/features/places_info/pi_system.js': '__MOD_places_info_pi_system',  # [release-6]
    'src/features/places_info/pi_models.js': '__MOD_places_info_pi_models',  # [release-6]
    'src/features/places_info/pi_borders.js': '__MOD_places_info_pi_borders',  # [release-6]
    'src/features/places_info/pi_cards.js': '__MOD_places_info_pi_cards',  # [release-6]
    'src/features/weapon_sfx.js': '__MOD_weapon_sfx',  # [release-6]
    'src/features/rail_transit.js': '__MOD_rail_transit',  # [release-6]
    'src/features/rail_models.js': '__MOD_rail_models',  # [release-6]
    'src/features/maritime/maritime.js': '__MOD_maritime_maritime',  # [release-6]
    'src/features/maritime/region.js': '__MOD_maritime_region',  # [release-6]
    'src/features/maritime/geo.js': '__MOD_maritime_geo',  # [release-6]
    'src/features/maritime/piers.js': '__MOD_maritime_piers',  # [release-6]
    'src/features/maritime/vessel_models.js': '__MOD_maritime_vessel_models',  # [release-6]
    'src/features/maritime/ais.js': '__MOD_maritime_ais',  # [release-6]
    'src/features/landmarks/registry.js': '__MOD_landmarks_registry',  # [release-6]
    'src/features/bridge_deck_buildings.js': '__MOD_bridge_deck_buildings',  # [release-6]
    'src/features/landmarks/landmark_system.js': '__MOD_landmarks_landmark_system',  # [release-6]
    'src/features/landmarks/landmark_damage.js': '__MOD_landmarks_landmark_damage',  # [landmark-damage]
    'src/features/landmarks/models/index.js': '__MOD_landmarks_models_index',  # [release-6]
    'src/features/landmarks/models/liberty.js': '__MOD_landmarks_models_liberty',  # [release-6]
    'src/features/landmarks/kit.js': '__MOD_landmarks_kit',  # [release-6]
    'src/features/landmarks/materials.js': '__MOD_landmarks_materials',  # [lm-materials]
    'src/features/landmarks/material_map.js': '__MOD_landmarks_material_map',  # [lm-materials]
    'src/features/landmarks/cn_arch.js': '__MOD_landmarks_cn_arch',  # [beijing-landmarks]
    'src/features/landmarks/models/empire.js': '__MOD_landmarks_models_empire',  # [release-6]
    'src/features/landmarks/models/chrysler.js': '__MOD_landmarks_models_chrysler',  # [release-6]
    'src/features/landmarks/models/onewtc.js': '__MOD_landmarks_models_onewtc',  # [release-6]
    'src/features/landmarks/models/eiffel.js': '__MOD_landmarks_models_eiffel',  # [release-6]
    'src/features/landmarks/models/arcdetriomphe.js': '__MOD_landmarks_models_arcdetriomphe',  # [release-6]
    'src/features/landmarks/models/westminster.js': '__MOD_landmarks_models_westminster',  # [release-6]
    'src/features/landmarks/models/londoneye.js': '__MOD_landmarks_models_londoneye',  # [release-6]
    'src/features/landmarks/models/towerbridge.js': '__MOD_landmarks_models_towerbridge',  # [release-6]
    'src/features/landmarks/models/brandenburg.js': '__MOD_landmarks_models_brandenburg',  # [release-6]
    'src/features/landmarks/models/colosseum.js': '__MOD_landmarks_models_colosseum',  # [release-6]
    'src/features/landmarks/models/pisa.js': '__MOD_landmarks_models_pisa',  # [release-6]
    'src/features/landmarks/models/stbasil.js': '__MOD_landmarks_models_stbasil',  # [release-6]
    'src/features/landmarks/models/coit.js': '__MOD_landmarks_models_coit',  # [release-6]
    'src/features/landmarks/models/transamerica.js': '__MOD_landmarks_models_transamerica',  # [release-6]
    'src/features/landmarks/models/salesforce.js': '__MOD_landmarks_models_salesforce',  # [release-6]
    'src/features/landmarks/models/palacefinearts.js': '__MOD_landmarks_models_palacefinearts',  # [release-6]
    'src/features/landmarks/models/ferrybuilding.js': '__MOD_landmarks_models_ferrybuilding',  # [release-6]
    'src/features/landmarks/models/spaceneedle.js': '__MOD_landmarks_models_spaceneedle',  # [release-6]
    'src/features/landmarks/models/gatewayarch.js': '__MOD_landmarks_models_gatewayarch',  # [release-6]
    'src/features/landmarks/models/cntower.js': '__MOD_landmarks_models_cntower',  # [release-6]
    'src/features/landmarks/models/christ.js': '__MOD_landmarks_models_christ',  # [release-6]
    'src/features/landmarks/models/operahouse.js': '__MOD_landmarks_models_operahouse',  # [release-6]
    'src/features/landmarks/models/harbourbridge.js': '__MOD_landmarks_models_harbourbridge',  # [release-6]
    'src/features/landmarks/models/taj.js': '__MOD_landmarks_models_taj',  # [release-6]
    'src/features/landmarks/models/burj.js': '__MOD_landmarks_models_burj',  # [release-6]
    'src/features/landmarks/models/tokyotower.js': '__MOD_landmarks_models_tokyotower',  # [release-6]
    'src/features/landmarks/models/skytree.js': '__MOD_landmarks_models_skytree',  # [release-6]
    'src/features/landmarks/models/pearl.js': '__MOD_landmarks_models_pearl',  # [release-6]
    'src/features/landmarks/models/petronas.js': '__MOD_landmarks_models_petronas',  # [release-6]
    'src/features/landmarks/models/marinabaysands.js': '__MOD_landmarks_models_marinabaysands',  # [release-6]
    'src/features/landmarks/models/khufu.js': '__MOD_landmarks_models_khufu',  # [release-6]
    'src/features/landmarks/models/khafre.js': '__MOD_landmarks_models_khafre',  # [release-6]
    'src/features/landmarks/models/menkaure.js': '__MOD_landmarks_models_menkaure',  # [release-6]
    'src/features/landmarks/models/sphinx.js': '__MOD_landmarks_models_sphinx',  # [release-6]
    # [beijing-landmarks] Hand-built Beijing landmark ensemble models
    'src/features/landmarks/models/tiananmen.js': '__MOD_landmarks_models_tiananmen',
    'src/features/landmarks/models/taflagpole.js': '__MOD_landmarks_models_taflagpole',
    'src/features/landmarks/models/heroesmonument.js': '__MOD_landmarks_models_heroesmonument',
    'src/features/landmarks/models/maomausoleum.js': '__MOD_landmarks_models_maomausoleum',
    'src/features/landmarks/models/greathall.js': '__MOD_landmarks_models_greathall',
    'src/features/landmarks/models/natmuseum.js': '__MOD_landmarks_models_natmuseum',
    'src/features/landmarks/models/zhengyangmen.js': '__MOD_landmarks_models_zhengyangmen',
    'src/features/landmarks/models/qianmenarrow.js': '__MOD_landmarks_models_qianmenarrow',
    'src/features/landmarks/models/forbiddencity.js': '__MOD_landmarks_models_forbiddencity',
    'src/features/landmarks/models/jingshan.js': '__MOD_landmarks_models_jingshan',
    'src/features/landmarks/models/beihaidagoba.js': '__MOD_landmarks_models_beihaidagoba',
    'src/features/landmarks/models/qiniandian.js': '__MOD_landmarks_models_qiniandian',
    'src/features/landmarks/models/birdsnest.js': '__MOD_landmarks_models_birdsnest',
    'src/features/landmarks/models/watercube.js': '__MOD_landmarks_models_watercube',
    'src/features/landmarks/models/chinazun.js': '__MOD_landmarks_models_chinazun',
    'src/features/landmarks/models/cctv.js': '__MOD_landmarks_models_cctv',
    'src/features/landmarks/models/skytower.js': '__MOD_landmarks_models_skytower',  # [lm-east]
    'src/features/landmarks/models/gatewayofindia.js': '__MOD_landmarks_models_gatewayofindia',  # [lm-east]
    'src/features/landmarks/models/watarun.js': '__MOD_landmarks_models_watarun',  # [lm-east]
    'src/features/landmarks/models/shwedagon.js': '__MOD_landmarks_models_shwedagon',  # [lm-east]
    'src/features/landmarks/models/angkorwat.js': '__MOD_landmarks_models_angkorwat',  # [lm-east]
    'src/features/landmarks/models/sheikhzayed.js': '__MOD_landmarks_models_sheikhzayed',  # [lm-east]
    'src/features/landmarks/models/hagiasophia.js': '__MOD_landmarks_models_hagiasophia',  # [lm-east]
    'src/features/landmarks/models/burjalarab.js': '__MOD_landmarks_models_burjalarab',  # [lm-east]
    'src/features/landmarks/models/lotustemple.js': '__MOD_landmarks_models_lotustemple',  # [lm-east]
    'src/features/landmarks/models/taipei101.js': '__MOD_landmarks_models_taipei101',  # [lm-east]
    # [lm-west] Europe & Americas landmark models
    'src/features/landmarks/models/washmonument.js': '__MOD_landmarks_models_washmonument',
    'src/features/landmarks/models/lincoln.js': '__MOD_landmarks_models_lincoln',
    'src/features/landmarks/models/goldengate.js': '__MOD_landmarks_models_goldengate',
    'src/features/landmarks/models/capitol.js': '__MOD_landmarks_models_capitol',
    'src/features/landmarks/models/sagrada.js': '__MOD_landmarks_models_sagrada',
    'src/features/landmarks/models/notredame.js': '__MOD_landmarks_models_notredame',
    'src/features/landmarks/models/stpeters.js': '__MOD_landmarks_models_stpeters',
    'src/features/landmarks/models/parthenon.js': '__MOD_landmarks_models_parthenon',
    'src/features/landmarks/models/atomium.js': '__MOD_landmarks_models_atomium',
    'src/features/landmarks/models/shard.js': '__MOD_landmarks_models_shard',
    'src/features/landmarks/models/cologne.js': '__MOD_landmarks_models_cologne',
    'src/features/landmarks/models/elcastillo.js': '__MOD_landmarks_models_elcastillo',
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
    inner = re.sub(r'//.*', '', m.group(1))
    inner = re.sub(r'/\*.*?\*/', '', inner, flags=re.S)
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
  sd_path = ROOT / 'data/street_detail_sf.json'  # [street-detail] precomputed OSM street nodes for the SF start
  b64_sd = gz_b64(sd_path.read_bytes()) if sd_path.exists() else ''
  b64_fstrip = base64.b64encode((ROOT / 'assets/facades/facade_strip.jpg').read_bytes()).decode('ascii')
  b64_fmask = base64.b64encode((ROOT / 'assets/facades/facade_mask_strip.png').read_bytes()).decode('ascii')
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
    if (url.includes('street_detail_sf.json')) {
      const el = document.getElementById('b64-street-detail');
      if (!el || !el.textContent.trim()) return new Response('', { status: 404 });
      const sdBytes = await gunzipBase64ToBytes('b64-street-detail');
      return new Response(sdBytes, { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  <script type="application/octet-stream" id="b64-street-detail">{b64_sd}</script>
  <script>
  window.__EMBEDDED_FACADE_STRIP__ = "data:image/jpeg;base64,{b64_fstrip}";
  window.__EMBEDDED_FACADE_MASK_STRIP__ = "data:image/png;base64,{b64_fmask}";
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
  html, n_main = re.subn(r'<script type="module" src="src/main\.js"[^>]*></script>', lambda _m: embedded_payload, html)
  assert n_main == 1, 'main.js script tag not found in index.html'

  OUT_FILE.write_text(html, encoding='utf-8')
  print(
      f'  -> Wrote {OUT_FILE} ({OUT_FILE.stat().st_size / (1024*1024):.2f} MB) in {round(time.time() - t0, 2)}s',
      flush=True,
  )


if __name__ == '__main__':
  build_world_explorer_html()
