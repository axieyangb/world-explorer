import * as THREE from "../vendor/three.module.js";
import {
  createSharedMaterials,
  loadFacadeArrayTexture,
  buildChunkMeshGroup,
  createChunkBuildTask,
  pointInRing2D,
  subdivideTriangles2D,
  finalizeAndReleaseGeometry,
  assembleChunkFromWorkerPayload,
} from "./chunk_builder.js";
import {
  initBeijingDem,
  initGlobalDem,
  getBeijingDemState,
  getBeijingTerrainElevation,
  getChunkTerrainMeshElevation,
  buildGlobalHorizonTerrain,
  updateGlobalHorizonTerrainCutout,
  createAtmosphericSkyDome,
} from "./environment.js";
import {
  LANDMARKS_40,
  buildAllLandmarksGeometryArrays,
} from "./landmarks_40.js";
import {
  VEHICLE_SPECS,
  createVehicleModel,
  createPlayerAvatarModel,
  createHelicopterModel,
  updateEntityNitroVfx,
  TrafficManager,
} from "./entities.js";
import { RoadNavigator } from "./navigation.js";
import { CityTraffic } from "./features/city_traffic.js"; // [feature/traffic]
import { VegetationSystem } from "./features/vegetation.js"; // [feature/vegetation]
import { MapSystem } from "./map_modal.js";
import { StreetFeatures } from "./features/street_furniture.js"; // [feature/street]
import { PlacesSystem } from "./features/places.js"; // feature/places
import { HeliFlight } from "./features/heli_flight.js"; // feature/heli-gta
import { KaijuMode } from "./features/kaiju/kaiju_mode.js"; // [kaiju]
import {
  getLang,
  setLang,
  onLanguageChange,
  t,
  getVehicleName,
  getBookmarkText,
  translateRoadName,
  applyDomTranslations,
} from "./i18n.js";
import {
  createWorldOrigin,
  BEIJING_DEFAULT_ORIGIN,
  QUICK_WORLD_DESTINATIONS,
  fetchGlobalChunkData,
  buildGlobalOverviewFromTiles,
  searchAddress,
} from "./global_tiles.js";

// Smooth directional shadow frustum edge fade
if (THREE.ShaderChunk && THREE.ShaderChunk.shadowmap_pars_fragment) {
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    "\t\t}\n\t\treturn shadow;\n\t}",
    "\t\t\tvec2 edgeDist = abs( shadowCoord.xy - vec2( 0.5 ) );\n\t\t\tfloat edgeFade = smoothstep( 0.495, 0.33, max( edgeDist.x, edgeDist.y ) );\n\t\t\tshadow = mix( 1.0, shadow, edgeFade );\n\t\t}\n\t\treturn shadow;\n\t}"
  );
}

import { initAtmosphere } from "./features/atmosphere.js"; // feature/atmosphere
import { WaterPhysics } from "./features/water_physics.js"; // fix/water
import { BuildingCollision } from "./features/building_collision.js"; // fix/water
const CHUNK_SIZE = 1000;
const HALF_WORLD = 20000;
const GRID_DIM = 40;
const LOAD_RADIUS = 2;   // 5x5 chunks = 25 km^2 active streaming zone
const UNLOAD_RADIUS = 3; // Hysteresis gap
const TIME_PRESET_ORDER = ["noon", "sunset", "night", "overcast"];

// [integration perf] Beijing skyline LOD as one InstancedMesh per ~5 km tile (frustum culling), behind the
// single-InstancedMesh API the horizon code uses (setMatrixAt / setColorAt / instanceMatrix.needsUpdate).
class SkylineTiles extends THREE.Group {
  constructor(geom, material, ranges, total) {
    super();
    this._geom = geom;
    this.material = material;
    this.tiles = [];
    this.tileOf = new Uint16Array(total);
    ranges.forEach(([s, e], ti) => {
      const m = new THREE.InstancedMesh(geom, material, e - s);
      m.castShadow = false;
      m.receiveShadow = false;
      m.userData.start = s;
      this.tiles.push(m);
      this.add(m);
      this.tileOf.fill(ti, s, e);
    });
    const tiles = this.tiles;
    this.instanceMatrix = {
      set needsUpdate(v) {
        if (!v) return;
        for (const m of tiles) if (m.userData.dirty) { m.instanceMatrix.needsUpdate = true; m.userData.dirty = false; }
      },
    };
    this.instanceColor = {
      set needsUpdate(v) {
        if (v) for (const m of tiles) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      },
    };
  }
  get geometry() { return this._geom; }
  setMatrixAt(i, mat) {
    const m = this.tiles[this.tileOf[i]];
    m.setMatrixAt(i - m.userData.start, mat);
    m.userData.dirty = true;
  }
  setColorAt(i, c) {
    const m = this.tiles[this.tileOf[i]];
    m.setColorAt(i - m.userData.start, c);
  }
  // Call once after the initial fill (hidden instances later move to y=-5000 and must not grow the bounds).
  computeTileBounds() { for (const m of this.tiles) m.computeBoundingSphere(); }
}

class WorldExplorerApp {
  constructor() {
    this.canvas = document.getElementById("webgl-canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      logarithmicDepthBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // [integration perf] cap 1.5
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ec5e5);
    this.scene.fog = new THREE.FogExp2(0xbfd8ec, 0.00010);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      1.5,
      18000
    );

    this.skyDome = createAtmosphericSkyDome();
    this.scene.add(this.skyDome.mesh);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xe2f1ff, 0x687064, 0.95);
    this.scene.add(this.hemiLight);

    this.sunOffset = new THREE.Vector3(380, 680, 340);
    this.sunDir = this.sunOffset.clone().normalize();
    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 1.55);
    this.sunLight.position.copy(this.sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 50;
    this.sunLight.shadow.camera.far = 5500;
    this.currentShadowBounds = 550;
    this._lastShadowFocusX = 1e9;
    this._lastShadowFocusZ = 1e9;
    this.sunLight.shadow.camera.left = -this.currentShadowBounds;
    this.sunLight.shadow.camera.right = this.currentShadowBounds;
    this.sunLight.shadow.camera.top = this.currentShadowBounds;
    this.sunLight.shadow.camera.bottom = -this.currentShadowBounds;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.85;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.playerLight = new THREE.PointLight(0xffe9c4, 0.0, 42, 1.35);
    this.scene.add(this.playerLight);

    this.mats = createSharedMaterials();
    this.streetFeatures = new StreetFeatures(this.scene, this.mats); // [feature/street]
    this.vegetation = new VegetationSystem(this.scene, this.mats); // [feature/vegetation] instanced trees + landcoverMat
    this.chunksRoot = new THREE.Group();
    this.scene.add(this.chunksRoot);

    this.horizonRoot = new THREE.Group();
    this.scene.add(this.horizonRoot);

    this.worldOrigin = {
      ...BEIJING_DEFAULT_ORIGIN,
      isBeijing: true,
      name: "Beijing, CN",
    };
    this.currentCityName = "Beijing, CN";
    this.currentRoadName = "Chang'an Ave";
    this.currentLayer = 0;
    this.timePresetIdx = 0;
    this.atmosphere = initAtmosphere(this); // feature/atmosphere: day/night cycle + weather + water
    this.teleportGeneration = 0;

    this.loadedChunks = new Map();
    this.pendingChunks = new Set();
    this.buildQueue = new Map();
    this.readyWorkerPayloads = [];
    this.workerCallbacks = new Map();
    this.chunkWorker = null;
    this._initChunkWorker();
    this.horizonCutoutDirty = false;
    this.layerVisibility = {
      buildings: true,
      markings: true,
      bridges: true,
      facilities: true,
      railways: true,
    };

    // Player & Vehicle state — start on the street in Drive Mode (GT Coupe) with sleek low chase camera
    this.mode = "drive";      // 'drive' | 'walk' | 'helicopter'
    this.camMode = "chase";   // 'chase' | 'topdown' | 'street'
    this.vehicleIdx = 2;      // GT Coupe ('supercar')

    this.pos = new THREE.Vector3(-260, 0.35, 265);
    this.yaw = Math.PI * 0.5;
    this.speed = 0;
    this.steerAngle = 0;

    this.camYaw = this.yaw;
    this.camYawOffset = 0;
    this.camPitch = 0.20;
    this.camPivot = this.pos.clone();
    this.walkVelY = 0;
    this.heliVelY = 0;
    this.isGrounded = true;
    this.lastMouseOrbitTime = 0;
    this.topDownHeight = 145;
    this.camZoom = 0.88;
    this.freeCamPos = new THREE.Vector3(-260, 150, 360);
    this.freeCamYaw = Math.PI;
    this.freeCamPitch = -0.35;
    this.nitroLocked = false;
    this.nitroActive = false;
    this.vfxTime = 0;

    this.vehicleMesh = createVehicleModel(VEHICLE_SPECS[this.vehicleIdx].id);
    this.vehicleMesh.visible = true;
    this.vehicleMesh.position.copy(this.pos);
    this.vehicleMesh.rotation.y = this.yaw;
    this.scene.add(this.vehicleMesh);

    this.avatarMesh = createPlayerAvatarModel();
    this.avatarMesh.visible = false;
    this.scene.add(this.avatarMesh);

    this.heliMesh = createHelicopterModel();
    this.heli = null; // feature/heli-gta: created once scene/camera exist (see _ensureHeli)
    this.heliMesh.visible = false;
    this.heliMesh.position.copy(this.pos);
    this.heliMesh.rotation.y = this.yaw;
    this.scene.add(this.heliMesh);

    this.water = new WaterPhysics(this); // fix/water
    this.collision = new BuildingCollision(this); // fix/water

    this.traffic = new CityTraffic(this); // [feature/traffic] replaces TrafficManager (any city, pedestrians, signals)
    this.kaiju = new KaijuMode(this); // [kaiju]
    this.navigator = new RoadNavigator(this.scene);

    this.keys = new Set();
    this.clock = new THREE.Clock();
    this.walkAnimTime = 0;

    this._bindInputs();
    this._bindHudControls();

    applyDomTranslations();
    this._updateModeAndCamBadges();
    onLanguageChange(() => {
      this._refreshLocalizedUi();
    });
  }

  _initChunkWorker() {
    this.workerReady = false;
    try {
      const isHttp = window.location.protocol === "http:" || window.location.protocol === "https:";
      const workerUrl = window.__CHUNK_WORKER_BLOB_URL__ || (isHttp ? "/src/chunk_worker.js" : null);
      if (!workerUrl) {
        this.chunkWorker = null;
        return;
      }
      const opts = window.__CHUNK_WORKER_BLOB_URL__ ? undefined : { type: "module" };
      this.chunkWorker = new Worker(workerUrl, opts);
      this.chunkWorker.onmessage = (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === "demReady") {
          this.workerReady = true;
          if (this._onWorkerDemReady) {
            this._onWorkerDemReady();
            this._onWorkerDemReady = null;
          }
          return;
        }
        if (msg.type === "chunkBuilt") {
          const cb = this.workerCallbacks.get(msg.key);
          if (cb) {
            this.workerCallbacks.delete(msg.key);
            cb(msg.payload);
          }
          return;
        }
        if (msg.type === "chunkError") {
          const cb = this.workerCallbacks.get(msg.key);
          if (cb) {
            this.workerCallbacks.delete(msg.key);
            cb(null);
          }
        }
      };
      this.chunkWorker.onerror = () => {
        this.workerReady = false;
        this.chunkWorker = null;
        if (this._onWorkerDemReady) {
          this._onWorkerDemReady();
          this._onWorkerDemReady = null;
        }
      };
    } catch {
      this.workerReady = false;
      this.chunkWorker = null;
    }
  }

  async _syncWorkerDem() {
    if (!this.chunkWorker) return;
    const demState = getBeijingDemState();
    if (!demState || !demState.elevations) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 600);
      this._onWorkerDemReady = () => {
        clearTimeout(timer);
        resolve();
      };
      this.chunkWorker.postMessage({ type: "initDem", demState });
    });
  }

  async start() {
    const api = {
      app: this,
      getLang: () => getLang(),
      setLang: (lang) => setLang(lang),
      teleportToLocation: (lat, lon, displayName, streetName) =>
        this.teleportToLocation(lat, lon, displayName, streetName),
      searchAddress: (q) => searchAddress(q),
      teleportToBookmark: (id) => {
        const bm = (this.overview?.bookmarks || []).find((b) => b.id === id);
        if (bm) {
          const bt = getBookmarkText(bm);
          this.teleportToWorld(bm.x, bm.z, bt.name);
          return bm;
        }
        return null;
      },
      getState: () => ({
        lang: getLang(),
        city: this.currentCityName,
        worldOrigin: this.worldOrigin,
        mode: this.mode,
        camMode: this.camMode,
        camZoom: Number((this.camZoom || 1.0).toFixed(2)),
        camNear: Number(this.camera.near.toFixed(2)),
        vehicleId: VEHICLE_SPECS[this.vehicleIdx] ? VEHICLE_SPECS[this.vehicleIdx].id : "",
        vehicleName: VEHICLE_SPECS[this.vehicleIdx] ? VEHICLE_SPECS[this.vehicleIdx].name : "",
        speedMps: Number(this.speed.toFixed(1)),
        speedKmh: Math.round(Math.abs(this.speed) * 3.6),
        mach: Number((Math.abs(this.speed) / 340.3).toFixed(2)),
        nitroActive: Boolean(this.nitroActive),
        x: Math.round(this.pos.x),
        y: Number(this.pos.y.toFixed(2)),
        groundY: Number(getBeijingTerrainElevation(this.pos.x, this.pos.z).toFixed(2)), // [integration] test probe
        z: Math.round(this.pos.z),
        road: getLang() === "en" ? translateRoadName(this.currentRoadName) : this.currentRoadName,
        layer: this.currentLayer,
        loadedChunks: this.loadedChunks.size,
        pendingChunks: this.pendingChunks.size,
        cityLodCount: this.skylineCount || 0,
        landmarksCount: LANDMARKS_40.length,
        workerActive: Boolean(this.chunkWorker),
        shadowBounds: Math.round(this.currentShadowBounds),
      }),
    };
    window.__BEIJING_WORLD__ = api;
    window.__WORLD_EXPLORER__ = api;

    const [resp, , lodResp] = await Promise.all([
      fetch("/data/global_overview.json?v=overture4").catch(() => null),
      initBeijingDem(),
      fetch("/data/city_buildings_lod.bin?v=overture4").catch(() => null),
      loadFacadeArrayTexture(this.mats),
    ]);
    this.beijingOverview = resp && resp.ok ? await resp.json() : await buildGlobalOverviewFromTiles(this.worldOrigin);
    this.overview = this.beijingOverview;
    this.beijingLodBuffer = lodResp && lodResp.ok ? await lodResp.arrayBuffer() : null;

    await this._syncWorkerDem();

    this.horizonTerrainMesh = buildGlobalHorizonTerrain(this.mats.terrainMat);
    this.horizonRoot.add(this.horizonTerrainMesh);

    this._buildGlobalHorizonLayer(this.beijingLodBuffer);

    this.mapSystem = new MapSystem(
      this.overview,
      this.navigator,
      (wx, wz, label, snapToRoad = false) => {
        this.teleportToWorld(wx, wz, label, snapToRoad);
      },
      this // [worldmap] app handle: worldOrigin, speed, teleportToLocation, sampleRoadSurface
    );

    this.navigator.init();

    // Load initial 3x3 chunks around starting location
    await this._updateStreamingChunks(true);
    const initSurf = this.sampleRoadSurface(this.pos.x, this.pos.y, this.pos.z);
    if (initSurf && this.mode !== "helicopter") {
      this.pos.y = initSurf.y;
      this.currentRoadName = initSurf.seg.name || this.currentRoadName;
      this.vehicleMesh.position.copy(this.pos);
      this.camPivot.copy(this.pos);
    }

    this.places = new PlacesSystem(this.scene); // feature/places
    this._animate();
  }

  /**
   * Teleports anywhere on Earth by latitude & longitude, streaming real AWS Terrarium DEM
   * and OpenFreeMap Zoom-14 vector tiles for the new 40km x 40km region.
   */
  async teleportToLocation(lat, lon, displayName = "", streetName = "") {
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return null;

    this.teleportGeneration = (this.teleportGeneration || 0) + 1;
    this.isTeleporting = true;
    this.water.reset(); // fix/water
    const isBj =
      Math.abs(numLat - BEIJING_DEFAULT_ORIGIN.centerLat) < 0.06 &&
      Math.abs(numLon - BEIJING_DEFAULT_ORIGIN.centerLon) < 0.06;

    if (isBj) {
      this.worldOrigin = {
        ...BEIJING_DEFAULT_ORIGIN,
        isBeijing: true,
        name: displayName || "Beijing, CN",
      };
    } else {
      this.worldOrigin = createWorldOrigin(numLat, numLon, displayName || "World");
    }

    this.currentCityName = displayName || this.worldOrigin.name || "World";
    this.currentRoadName = streetName || displayName || "Central Avenue";
    this.currentLayer = 0;

    // Cancel pending chunk callbacks & clear loaded chunks
    for (const cb of this.workerCallbacks.values()) {
      cb(null);
    }
    this.workerCallbacks.clear();
    this.pendingChunks.clear();
    this.readyWorkerPayloads = [];

    for (const task of this.buildQueue.values()) {
      this._disposeChunkGroup(task.root);
    }
    this.buildQueue.clear();

    for (const group of this.loadedChunks.values()) {
      this._disposeChunkGroup(group);
      this.chunksRoot.remove(group);
    }
    this.loadedChunks.clear();

    // Clear horizon meshes
    while (this.horizonRoot.children.length > 0) {
      const child = this.horizonRoot.children[0];
      this.horizonRoot.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    this.horizonCutoutMeshes = [];
    this.skylineInstanced = null;
    this.chunkToSkylineIndices = null;
    this.hiddenSkylineChunks = new Set();
    this.landmarksMesh = null;

    // Initialize DEM for target location and sync to Worker BEFORE allowing any new chunk builds
    if (isBj) {
      await initBeijingDem();
    } else {
      await initGlobalDem(numLat, numLon);
    }
    await this._syncWorkerDem();
    for (const cb of this.workerCallbacks.values()) {
      cb(null);
    }
    this.workerCallbacks.clear();
    this.pendingChunks.clear();
    this.readyWorkerPayloads = [];
    this.isTeleporting = false;

    // Rebuild 40km horizon terrain
    this.horizonTerrainMesh = buildGlobalHorizonTerrain(this.mats.terrainMat);
    this.horizonRoot.add(this.horizonTerrainMesh);

    if (isBj && this.beijingOverview) {
      this.overview = this.beijingOverview;
      this._buildGlobalHorizonLayer(this.beijingLodBuffer);
    } else {
      this.overview = await buildGlobalOverviewFromTiles(this.worldOrigin);
      this._buildGlobalHorizonLayer(null);
    }

    if (this.mapSystem) {
      this.mapSystem.setOverview(this.overview);
    }

    let targetX = 0;
    let targetZ = 0;
    if (isBj) {
      targetX = (numLon - BEIJING_DEFAULT_ORIGIN.centerLon) * BEIJING_DEFAULT_ORIGIN.mPerDegLon;
      targetZ = (BEIJING_DEFAULT_ORIGIN.centerLat - numLat) * BEIJING_DEFAULT_ORIGIN.mPerDegLat;
    }

    const initTerrY = getBeijingTerrainElevation(targetX, targetZ);
    const startY = this.mode === "helicopter" ? initTerrY + 150.0 : initTerrY + 0.25;
    this.pos.set(targetX, startY, targetZ);
    this.speed = 0;
    this.yaw = Math.PI * 0.5;
    this.camYaw = this.yaw;
    this.camYawOffset = 0;
    this.camPivot.copy(this.pos);

    this.vehicleMesh.position.copy(this.pos);
    this.vehicleMesh.rotation.set(0, this.yaw, 0);
    this.avatarMesh.position.copy(this.pos);
    this.avatarMesh.rotation.set(0, this.yaw, 0);
    this.heliMesh.position.copy(this.pos);
    this.heliMesh.rotation.set(0, this.yaw, 0);

    // Load immediate 3x3 chunks synchronously and queue outer ring
    await this._updateStreamingChunks(true);

    // Resolve nearest street name (and road surface height if driving/walking)
    const [cx, cz] = this.worldToChunk(this.pos.x, this.pos.z);
    let bestS = null;
    let bestScore = 300;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.loadedChunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk || !chunk.userData.roadSegments) continue;
        for (const s of chunk.userData.roadSegments) {
          if (s.cls === "footway" || s.cls === "steps" || s.cls === "cycleway") continue;
          const mx = (s.x1 + s.x2) * 0.5;
          const mz = (s.z1 + s.z2) * 0.5;
          const d = Math.hypot(mx - targetX, mz - targetZ);
          if (d < bestScore) {
            bestScore = d;
            bestS = s;
          }
        }
      }
    }
    if (bestS) {
      this.currentRoadName = streetName || bestS.name || this.currentRoadName;
      if (this.mode !== "helicopter") {
        this.pos.set(
          (bestS.x1 + bestS.x2) * 0.5,
          (bestS.y1 + bestS.y2) * 0.5 + 0.2,
          (bestS.z1 + bestS.z2) * 0.5
        );
        this.yaw = Math.atan2(bestS.x2 - bestS.x1, bestS.z2 - bestS.z1);
        this.camYaw = this.yaw;
        this.camPivot.copy(this.pos);
        this.vehicleMesh.position.copy(this.pos);
        this.avatarMesh.position.copy(this.pos);
      }
    }

    this._updateCamera(0.016);
    this._updateHud();
    this._updateActiveQuickChip(numLat, numLon);
    return this.worldOrigin;
  }

  _createBuildingLodBoxGeometry() {
    const pos = [
      -0.5, 0,  0.5,   0.5, 0,  0.5,   0.5, 1,  0.5,
      -0.5, 0,  0.5,   0.5, 1,  0.5,  -0.5, 1,  0.5,
       0.5, 0, -0.5,  -0.5, 0, -0.5,  -0.5, 1, -0.5,
       0.5, 0, -0.5,  -0.5, 1, -0.5,   0.5, 1, -0.5,
      -0.5, 0, -0.5,  -0.5, 0,  0.5,  -0.5, 1,  0.5,
      -0.5, 0, -0.5,  -0.5, 1,  0.5,  -0.5, 1, -0.5,
       0.5, 0,  0.5,   0.5, 0, -0.5,   0.5, 1, -0.5,
       0.5, 0,  0.5,   0.5, 1, -0.5,   0.5, 1,  0.5,
      -0.5, 1,  0.5,   0.5, 1,  0.5,   0.5, 1, -0.5,
      -0.5, 1,  0.5,   0.5, 1, -0.5,  -0.5, 1, -0.5,
    ];
    const col = [];
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1];
      const isRoof = i >= 72;
      const shade = isRoof ? 0.88 : y < 0.5 ? 0.78 : 1.0;
      col.push(shade, shade, shade);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geom.computeVertexNormals();
    return geom;
  }

  _buildGlobalHorizonLayer(lodBuffer) {
    this.horizonCutoutMeshes = [];
    this.hiddenSkylineChunks = new Set();
    if (!this.overview) return;

    // 1. Parks & Forests: [id, kind, flatXZ, name]
    const parkVerts = [];
    const parkChunkKeys = [];
    for (const p of this.overview.parks || []) {
      const pts = Array.isArray(p[2]) ? p[2] : Array.isArray(p[1]) ? p[1] : null;
      if (!pts || pts.length < 6) continue;
      let cxSum = 0, czSum = 0;
      const nPts = pts.length / 2;
      for (let i = 0; i < pts.length; i += 2) {
        cxSum += pts[i];
        czSum += pts[i + 1];
      }
      const [pcx, pcz] = this.worldToChunk(cxSum / nPts, czSum / nPts);
      const pKey = `${pcx},${pcz}`;
      const shapePts = [];
      for (let i = 0; i < pts.length; i += 2) {
        shapePts.push(new THREE.Vector2(pts[i], pts[i + 1]));
      }
      const tris = THREE.ShapeUtils.triangulateShape(shapePts, []);
      const subTris = subdivideTriangles2D(shapePts, [], tris, 220.0);
      for (let tIdx = 0; tIdx < subTris.length; tIdx += 3) {
        const ax = subTris[tIdx][0], az = subTris[tIdx][1];
        const bx = subTris[tIdx + 1][0], bz = subTris[tIdx + 1][1];
        const cx = subTris[tIdx + 2][0], cz = subTris[tIdx + 2][1];
        const ay = getBeijingTerrainElevation(ax, az) + 0.015;
        const by = getBeijingTerrainElevation(bx, bz) + 0.015;
        const cy = getBeijingTerrainElevation(cx, cz) + 0.015;
        parkVerts.push(ax, ay, az, cx, cy, cz, bx, by, bz);
        parkChunkKeys.push(pKey);
      }
    }
    if (parkVerts.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(parkVerts, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.parkMat);
      m.receiveShadow = true;
      this._registerHorizonCutoutMesh(m, parkChunkKeys);
      this.horizonRoot.add(m);
    }

    // 2. Water polygons & lines: [id, name, "poly"|"line", width, flatXZ]
    const waterVerts = [];
    const waterChunkKeys = [];
    for (const w of this.overview.water || []) {
      const kind = w[2];
      const width = Math.max(w[3] || 12, 10);
      const pts = w[4];
      if (!Array.isArray(pts)) continue;
      if (kind === "poly" && pts.length >= 6) {
        let cxSum = 0, czSum = 0;
        const nPts = pts.length / 2;
        for (let i = 0; i < pts.length; i += 2) {
          cxSum += pts[i];
          czSum += pts[i + 1];
        }
        const [wcx, wcz] = this.worldToChunk(cxSum / nPts, czSum / nPts);
        const wKey = `${wcx},${wcz}`;
        const shapePts = [];
        for (let i = 0; i < pts.length; i += 2) {
          shapePts.push(new THREE.Vector2(pts[i], pts[i + 1]));
        }
        const tris = THREE.ShapeUtils.triangulateShape(shapePts, []);
        const subTris = subdivideTriangles2D(shapePts, [], tris, 220.0);
        for (let tIdx = 0; tIdx < subTris.length; tIdx += 3) {
          const ax = subTris[tIdx][0], az = subTris[tIdx][1];
          const bx = subTris[tIdx + 1][0], bz = subTris[tIdx + 1][1];
          const cx = subTris[tIdx + 2][0], cz = subTris[tIdx + 2][1];
          const ay = getBeijingTerrainElevation(ax, az) + 0.03;
          const by = getBeijingTerrainElevation(bx, bz) + 0.03;
          const cy = getBeijingTerrainElevation(cx, cz) + 0.03;
          waterVerts.push(ax, ay, az, cx, cy, cz, bx, by, bz);
          waterChunkKeys.push(wKey);
        }
      } else if (pts.length >= 4) {
        const halfW = width * 0.5;
        for (let i = 0; i < pts.length - 2; i += 2) {
          const x1 = pts[i], z1 = pts[i + 1];
          const x2 = pts[i + 2], z2 = pts[i + 3];
          const dx = x2 - x1, dz = z2 - z1;
          const len = Math.hypot(dx, dz);
          if (len < 0.5) continue;
          const [wcx, wcz] = this.worldToChunk((x1 + x2) * 0.5, (z1 + z2) * 0.5);
          const wKey = `${wcx},${wcz}`;
          const nx = (-dz / len) * halfW;
          const nz = (dx / len) * halfW;
          const y1 = getBeijingTerrainElevation(x1, z1) + 0.03;
          const y2 = getBeijingTerrainElevation(x2, z2) + 0.03;
          waterVerts.push(
            x1 + nx, y1, z1 + nz,
            x2 + nx, y2, z2 + nz,
            x2 - nx, y2, z2 - nz,
            x1 + nx, y1, z1 + nz,
            x2 - nx, y2, z2 - nz,
            x1 - nx, y1, z1 - nz
          );
          waterChunkKeys.push(wKey, wKey);
        }
      }
    }
    if (waterVerts.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(waterVerts, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.waterMat);
      this._registerHorizonCutoutMesh(m, waterChunkKeys);
      this.horizonRoot.add(m);
    }

    // 3. Macro arterial road ribbons: [id, cls, name, widthM, isBridge, isTunnel, layer, flatXYZ]
    const roadVerts = [];
    const roadChunkKeys = [];
    for (const r of this.overview.arterials || []) {
      const cls = r[1];
      const pts = r[7];
      if (!Array.isArray(pts) || pts.length < 6) continue;
      const halfW = cls === "motorway" ? 13 : cls === "trunk" ? 11 : cls === "primary" ? 9 : 6.5;
      for (let i = 0; i < pts.length - 3; i += 3) {
        const x1 = pts[i], z1 = pts[i + 2];
        const x2 = pts[i + 3], z2 = pts[i + 5];
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 1.0) continue;
        const [rcx, rcz] = this.worldToChunk((x1 + x2) * 0.5, (z1 + z2) * 0.5);
        const rKey = `${rcx},${rcz}`;
        const nx = (-dz / len) * halfW;
        const nz = (dx / len) * halfW;
        const y1 = getBeijingTerrainElevation(x1, z1) + 0.06;
        const y2 = getBeijingTerrainElevation(x2, z2) + 0.06;
        roadVerts.push(
          x1 + nx, y1, z1 + nz,
          x2 + nx, y2, z2 + nz,
          x2 - nx, y2, z2 - nz,
          x1 + nx, y1, z1 + nz,
          x2 - nx, y2, z2 - nz,
          x1 - nx, y1, z1 - nz
        );
        roadChunkKeys.push(rKey, rKey);
      }
    }
    if (roadVerts.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(roadVerts, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.roadMat);
      m.receiveShadow = true;
      this._registerHorizonCutoutMesh(m, roadChunkKeys);
      this.horizonRoot.add(m);
    }

    // 4. Beijing-only LOD buildings & 40 landmarks (filtered to mid/high-rise >= 16m for 60 FPS)
    if (this.worldOrigin?.isBeijing && lodBuffer && lodBuffer.byteLength >= 4) {
      const dv = new DataView(lodBuffer);
      const totalRecords = dv.getUint32(0, true);
      const keptRecordIndices = [];
      for (let rIdx = 0; rIdx < totalRecords; rIdx++) {
        const off = 4 + rIdx * 28;
        const w = dv.getFloat32(off + 8, true);
        const depth = dv.getFloat32(off + 12, true);
        const rawH = dv.getUint16(off + 16, true) * 0.1;
        if (rawH >= 16.0 && w * depth >= 90.0) {
          keptRecordIndices.push(rIdx);
        }
      }
      // [integration perf] group instances by ~5 km tile so each tile is its own frustum-culled draw
      const SKY_TILE = 5000;
      const tileOfRec = (r) => {
        const o = 4 + r * 28;
        return Math.floor(dv.getFloat32(o, true) / SKY_TILE) * 1000 + Math.floor(dv.getFloat32(o + 4, true) / SKY_TILE);
      };
      const recTile = new Map();
      for (const r of keptRecordIndices) recTile.set(r, tileOfRec(r));
      keptRecordIndices.sort((a, b) => recTile.get(a) - recTile.get(b) || a - b);
      const tileRanges = [];
      for (let i = 0; i < keptRecordIndices.length; i++) {
        if (i === 0 || recTile.get(keptRecordIndices[i]) !== recTile.get(keptRecordIndices[i - 1])) tileRanges.push([i, i + 1]);
        else tileRanges[tileRanges.length - 1][1] = i + 1;
      }
      const count = keptRecordIndices.length;
      this.skylineCount = count;
      this.skylineDataView = dv;
      this.skylineKeptIndices = new Uint32Array(keptRecordIndices);
      const boxGeom = this._createBuildingLodBoxGeometry();
      const lodNightUniforms = { uLodNightEmissive: { value: 0.0 } };
      const lodMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.58,
        metalness: 0.22,
        vertexColors: true,
      });
      lodMat.userData.lodNightUniforms = lodNightUniforms;
      lodMat.onBeforeCompile = (shader) => {
        shader.uniforms.uLodNightEmissive = lodNightUniforms.uLodNightEmissive;
        shader.vertexShader =
          'varying vec3 vLodWorldPos;\nvarying vec3 vLodNorm;\n' +
          shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            // [integration] own world position: three only declares worldPosition when shadows/envmap are on
            '#include <worldpos_vertex>\nvec4 lodWp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nlodWp = instanceMatrix * lodWp;\n#endif\nvLodWorldPos = (modelMatrix * lodWp).xyz;\nvLodNorm = normalize(objectNormal);'
          );
        shader.fragmentShader =
          'uniform float uLodNightEmissive;\nvarying vec3 vLodWorldPos;\nvarying vec3 vLodNorm;\n' +
          shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            if (abs(vLodNorm.y) < 0.45) {
              float uCoord = abs(vLodNorm.x) > 0.5 ? vLodWorldPos.z : vLodWorldPos.x;
              float gx = uCoord / 3.2;
              float gy = max(0.0, vLodWorldPos.y) / 3.6;
              vec2 fuv = fract(vec2(gx, gy));
              vec2 dg = max(fwidth(vec2(gx, gy)), vec2(0.002));
              float fade = 1.0 - smoothstep(0.20, 0.75, max(dg.x, dg.y));
              float win = smoothstep(0.18, 0.24, fuv.x) * (1.0 - smoothstep(0.76, 0.82, fuv.x)) *
                          smoothstep(0.22, 0.28, fuv.y) * (1.0 - smoothstep(0.76, 0.82, fuv.y)) * fade;
              vec3 glassCol = mix(vec3(0.14, 0.22, 0.31), vec3(0.26, 0.40, 0.54), clamp(vLodWorldPos.y / 85.0, 0.0, 1.0));
              diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, win * 0.78);
              roughnessFactor = mix(0.68, 0.20, win);
              float rHash = fract(sin(dot(floor(vec2(gx, gy)), vec2(127.1, 311.7))) * 43758.5453);
              totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * win * step(0.62, rHash) * uLodNightEmissive * 0.65;
            }`
          );
      };
      this.skylineInstanced = new SkylineTiles(boxGeom, lodMat, tileRanges, count);
      this.skylineInstanced.castShadow = false;
      this.skylineInstanced.receiveShadow = false;
      this.skylineInstanced.frustumCulled = false;

      this.chunkToSkylineIndices = new Map();
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      const archTones = [
        [0.76, 0.79, 0.83],
        [0.83, 0.79, 0.72],
        [0.64, 0.68, 0.73],
        [0.79, 0.72, 0.64],
        [0.86, 0.87, 0.89],
      ];
      for (let i = 0; i < count; i++) {
        const recIdx = this.skylineKeptIndices[i];
        const off = 4 + recIdx * 28;
        const wx = dv.getFloat32(off, true);
        const wz = dv.getFloat32(off + 4, true);
        const w = dv.getFloat32(off + 8, true);
        const depth = dv.getFloat32(off + 12, true);
        const rawH = dv.getUint16(off + 16, true) * 0.1;
        const rawMinH = dv.getUint16(off + 18, true) * 0.1;
        const yaw = dv.getInt16(off + 20, true) * 0.0001;
        const [cx, cz] = this.worldToChunk(wx, wz);

        const tY = getBeijingTerrainElevation(wx, wz);
        const baseH = rawMinH > 0 ? tY + rawMinH : tY - (tY > 1.5 ? 2.0 : 0.05);
        const topH = tY + rawH + ((i % 31) * 0.01);
        const cKey = `${cx},${cz}`;
        let bucket = this.chunkToSkylineIndices.get(cKey);
        if (!bucket) {
          bucket = [];
          this.chunkToSkylineIndices.set(cKey, bucket);
        }
        bucket.push(i);

        dummy.position.set(wx, baseH, wz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(w, Math.max(2.0, topH - baseH), depth);
        dummy.updateMatrix();
        this.skylineInstanced.setMatrixAt(i, dummy.matrix);
        const tone = archTones[recIdx % archTones.length];
        col.setRGB(tone[0], tone[1], tone[2]);
        this.skylineInstanced.setColorAt(i, col);
      }
      for (const [k, arr] of this.chunkToSkylineIndices.entries()) {
        this.chunkToSkylineIndices.set(k, new Uint32Array(arr));
      }
      this.skylineInstanced.instanceMatrix.needsUpdate = true;
      if (this.skylineInstanced.instanceColor) {
        this.skylineInstanced.instanceColor.needsUpdate = true;
      }
      this.skylineInstanced.computeTileBounds();
      this.horizonRoot.add(this.skylineInstanced);
    } else {
      this.skylineCount = 0;
    }

    if (this.worldOrigin?.isBeijing) {
      const lmArrays = buildAllLandmarksGeometryArrays(getBeijingTerrainElevation);
      if (lmArrays.positions.length > 0) {
        const lmGeom = new THREE.BufferGeometry();
        lmGeom.setAttribute("position", new THREE.Float32BufferAttribute(lmArrays.positions, 3));
        lmGeom.setAttribute("normal", new THREE.Float32BufferAttribute(lmArrays.normals, 3));
        lmGeom.setAttribute("color", new THREE.Float32BufferAttribute(lmArrays.colors, 3));
        lmGeom.setAttribute("uv", new THREE.Float32BufferAttribute(lmArrays.uvs, 2));
        finalizeAndReleaseGeometry(lmGeom);
        this.landmarksMesh = new THREE.Mesh(lmGeom, this.mats.wfcBldgMat);
        this.landmarksMesh.castShadow = true;
        this.landmarksMesh.receiveShadow = true;
        this.landmarksMesh.frustumCulled = false;
        this.horizonRoot.add(this.landmarksMesh);
      }
    }
  }

  _registerHorizonCutoutMesh(mesh, triChunkKeys) {
    const byChunk = new Map();
    for (let t = 0; t < triChunkKeys.length; t++) {
      const cKey = triChunkKeys[t];
      let arr = byChunk.get(cKey);
      if (!arr) {
        arr = [];
        byChunk.set(cKey, arr);
      }
      const v = t * 3;
      arr.push(v, v + 1, v + 2);
    }
    const chunkSlices = [];
    for (const [key, arr] of byChunk.entries()) {
      chunkSlices.push({ key, slice: new Uint32Array(arr) });
    }
    const indexBuf = new Uint32Array(triChunkKeys.length * 3);
    const indexAttr = new THREE.BufferAttribute(indexBuf, 1);
    mesh.geometry.setIndex(indexAttr);
    mesh.geometry.computeBoundingSphere();
    for (const k of Object.keys(mesh.geometry.attributes)) {
      const attr = mesh.geometry.attributes[k];
      if (attr) {
        attr.onUploadCallback = function () {
          this.array = null;
        };
      }
    }
    mesh.userData.chunkSlices = chunkSlices;
    mesh.userData.indexAttr = indexAttr;
    this.horizonCutoutMeshes.push(mesh);
  }

  _updateHorizonCutoutsForLoadedChunks() {
    this.horizonCutoutDirty = false;
    if (this.horizonTerrainMesh) {
      updateGlobalHorizonTerrainCutout(this.horizonTerrainMesh, this.loadedChunks);
    }
    if (this.horizonCutoutMeshes) {
      for (const mesh of this.horizonCutoutMeshes) {
        const { chunkSlices, indexAttr } = mesh.userData;
        if (!chunkSlices || !indexAttr) continue;
        const dst = indexAttr.array;
        if (!dst) continue;
        let writePos = 0;
        for (let i = 0; i < chunkSlices.length; i++) {
          const item = chunkSlices[i];
          if (this.loadedChunks.has(item.key)) continue;
          dst.set(item.slice, writePos);
          writePos += item.slice.length;
        }
        indexAttr.needsUpdate = true;
        mesh.geometry.setDrawRange(0, writePos);
      }
    }
    if (!this.skylineInstanced || !this.chunkToSkylineIndices || !this.skylineDataView) return;
    const dummy = new THREE.Object3D();
    const dv = this.skylineDataView;
    let matrixDirty = false;
    for (const cKey of this.loadedChunks.keys()) {
      if (!this.hiddenSkylineChunks.has(cKey)) {
        this.hiddenSkylineChunks.add(cKey);
        const idxs = this.chunkToSkylineIndices.get(cKey);
        if (idxs) {
          dummy.position.set(0, -5000, 0);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          for (let k = 0; k < idxs.length; k++) {
            this.skylineInstanced.setMatrixAt(idxs[k], dummy.matrix);
          }
          matrixDirty = true;
        }
      }
    }
    for (const cKey of Array.from(this.hiddenSkylineChunks)) {
      if (!this.loadedChunks.has(cKey)) {
        this.hiddenSkylineChunks.delete(cKey);
        const idxs = this.chunkToSkylineIndices.get(cKey);
        if (idxs) {
          for (let k = 0; k < idxs.length; k++) {
            const idx = idxs[k];
            const recIdx = this.skylineKeptIndices ? this.skylineKeptIndices[idx] : idx;
            const off = 4 + recIdx * 28;
            const wx = dv.getFloat32(off, true);
            const wz = dv.getFloat32(off + 4, true);
            const w = dv.getFloat32(off + 8, true);
            const depth = dv.getFloat32(off + 12, true);
            const rawH = dv.getUint16(off + 16, true) * 0.1;
            const rawMinH = dv.getUint16(off + 18, true) * 0.1;
            const yaw = dv.getInt16(off + 20, true) * 0.0001;
            const tY = getBeijingTerrainElevation(wx, wz);
            const baseH = rawMinH > 0 ? tY + rawMinH : tY - (tY > 1.5 ? 2.0 : 0.05);
            const topH = tY + rawH + ((idx % 31) * 0.01);
            dummy.position.set(wx, baseH, wz);
            dummy.rotation.set(0, yaw, 0);
            dummy.scale.set(w, Math.max(2.0, topH - baseH), depth);
            dummy.updateMatrix();
            this.skylineInstanced.setMatrixAt(idx, dummy.matrix);
          }
          matrixDirty = true;
        }
      }
    }
    if (matrixDirty) {
      this.skylineInstanced.instanceMatrix.needsUpdate = true;
    }
  }

  worldToChunk(x, z) {
    const cx = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((x + HALF_WORLD) / CHUNK_SIZE)));
    const cz = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((z + HALF_WORLD) / CHUNK_SIZE)));
    return [cx, cz];
  }

  async _updateStreamingChunks(waitAll = false) {
    if (this.isTeleporting && !waitAll) return;
    const focusPos = this.pos;
    const [pcx, pcz] = this.worldToChunk(focusPos.x, focusPos.z);

    for (const [key, group] of this.loadedChunks.entries()) {
      const { cx, cz } = group.userData;
      if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
        this._disposeChunkGroup(group);
        this.chunksRoot.remove(group);
        this.loadedChunks.delete(key);
        this.horizonCutoutDirty = true;
      }
    }
    for (const [key, task] of this.buildQueue.entries()) {
      const { cx, cz } = task.root.userData;
      if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
        this._disposeChunkGroup(task.root);
        this.buildQueue.delete(key);
      }
    }

    const needed = [];
    const activeRadius = waitAll ? 1 : LOAD_RADIUS;
    for (let dx = -activeRadius; dx <= activeRadius; dx++) {
      for (let dz = -activeRadius; dz <= activeRadius; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (cx < 0 || cx >= GRID_DIM || cz < 0 || cz >= GRID_DIM) continue;
        const key = `${cx},${cz}`;
        if (!this.loadedChunks.has(key) && !this.pendingChunks.has(key) && !this.buildQueue.has(key)) {
          needed.push({ cx, cz, key, d2: dx * dx + dz * dz });
        }
      }
    }
    needed.sort((a, b) => a.d2 - b.d2);

    if (waitAll) {
      for (const [key, task] of this.buildQueue.entries()) {
        task.step(Infinity);
        this.chunksRoot.add(task.root);
        this.loadedChunks.set(key, task.root);
        this.buildQueue.delete(key);
        this.horizonCutoutDirty = true;
      }
      const promises = [];
      for (const item of needed) {
        this.pendingChunks.add(item.key);
        promises.push(this._loadSingleChunk(item.cx, item.cz, item.key, true));
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      this._updateHorizonCutoutsForLoadedChunks();
      return;
    }

    if (this.pendingChunks.size + this.buildQueue.size < 6 && needed.length > 0) {
      const batch = needed.slice(0, Math.max(1, 4 - this.pendingChunks.size));
      for (const item of batch) {
        this.pendingChunks.add(item.key);
        this._loadSingleChunk(item.cx, item.cz, item.key, false);
      }
    }
  }

  async _loadSingleChunk(cx, cz, key, immediate = false) {
    const genId = this.teleportGeneration || 0;
    try {
      const ox = -HALF_WORLD + cx * CHUNK_SIZE + 500;
      const oz = -HALF_WORLD + cz * CHUNK_SIZE + 500;
      if (this.chunkWorker) {
        const payload = await new Promise((resolve) => {
          this.workerCallbacks.set(key, resolve);
          this.chunkWorker.postMessage({
            type: "buildChunk",
            key,
            cx,
            cz,
            ox,
            oz,
            worldOrigin: this.worldOrigin,
          });
        });
        if (!payload || (this.teleportGeneration || 0) !== genId) return;
        const [pcx, pcz] = this.worldToChunk(this.pos.x, this.pos.z);
        if (!immediate && (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS)) {
          return;
        }
        if (immediate) {
          const group = assembleChunkFromWorkerPayload(payload, this.mats, this.layerVisibility);
          this.chunksRoot.add(group);
          this.loadedChunks.set(key, group);
          this.horizonCutoutDirty = true;
        } else {
          this.readyWorkerPayloads.push({ key, cx, cz, payload, genId });
        }
        return;
      }

      const data = await fetchGlobalChunkData(cx, cz, this.worldOrigin);
      if (!data || (this.teleportGeneration || 0) !== genId) return;
      if (immediate) {
        const group = buildChunkMeshGroup(cx, cz, ox, oz, data, this.mats, this.layerVisibility, this.worldOrigin);
        this.chunksRoot.add(group);
        this.loadedChunks.set(key, group);
        this.horizonCutoutDirty = true;
      } else {
        const task = createChunkBuildTask(cx, cz, ox, oz, data, this.mats, this.layerVisibility, this.worldOrigin);
        this.buildQueue.set(key, task);
      }
    } catch {
      // Ignore individual chunk network timeouts
    } finally {
      this.pendingChunks.delete(key);
    }
  }

  _processChunkBuildQueue(budgetMs = 4.0) {
    const t0 = performance.now();
    while (this.readyWorkerPayloads && this.readyWorkerPayloads.length > 0) {
      const item = this.readyWorkerPayloads.shift();
      if ((this.teleportGeneration || 0) !== item.genId || this.loadedChunks.has(item.key)) continue;
      const [pcx, pcz] = this.worldToChunk(this.pos.x, this.pos.z);
      if (Math.abs(item.cx - pcx) > UNLOAD_RADIUS || Math.abs(item.cz - pcz) > UNLOAD_RADIUS) continue;
      const group = assembleChunkFromWorkerPayload(item.payload, this.mats, this.layerVisibility);
      this.chunksRoot.add(group);
      this.loadedChunks.set(item.key, group);
      this.horizonCutoutDirty = true;
      break; // Upload at most 1 completed worker chunk per frame for 60 FPS smoothness
    }
    if (this.horizonCutoutDirty) {
      this._updateHorizonCutoutsForLoadedChunks();
      if (performance.now() - t0 >= budgetMs) return;
    }
    for (const [key, task] of this.buildQueue.entries()) {
      const rem = budgetMs - (performance.now() - t0);
      if (rem <= 0.4) break;
      const finished = task.step(rem);
      if (finished) {
        this.buildQueue.delete(key);
        this.chunksRoot.add(task.root);
        this.loadedChunks.set(key, task.root);
        this.horizonCutoutDirty = true;
        break;
      } else {
        break;
      }
    }
  }

  _disposeChunkGroup(group) {
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        obj.geometry.dispose();
      }
    });
  }

  sampleRoadSurface(wx, wy, wz) {
    const [cx, cz] = this.worldToChunk(wx, wz);
    let bestSeg = null;
    let bestScore = Infinity;
    let bestY = 0;
    const candidates = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.loadedChunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk || !chunk.userData.roadSegments) continue;
        const segs = chunk.userData.roadSegments;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (s.tunnel) continue;
          const vx = s.x2 - s.x1;
          const vz = s.z2 - s.z1;
          const len2 = vx * vx + vz * vz;
          if (len2 < 0.05) continue;
          let tParam = ((wx - s.x1) * vx + (wz - s.z1) * vz) / len2;
          tParam = Math.max(0, Math.min(1, tParam));
          const px = s.x1 + vx * tParam;
          const pz = s.z1 + vz * tParam;
          const distH = Math.hypot(wx - px, wz - pz);
          const halfW = s.width * 0.75 + 3.4;
          if (distH > halfW) continue;

          const segY = s.y1 + (s.y2 - s.y1) * tParam;
          const dy = Math.abs(segY - wy);
          if (dy > 3.6) continue;

          candidates.push(segY);
          const score = distH + dy * 2.5;
          if (score < bestScore) {
            bestScore = score;
            bestSeg = s;
            bestY = segY;
          }
        }
      }
    }
    if (!bestSeg) return null;
    // At intersections where two roads with different yBias overlap, ride on top of the highest overlapping surface (+0.05m clears sidewalks/markings)
    let surfaceY = bestY;
    for (let i = 0; i < candidates.length; i++) {
      if (Math.abs(candidates[i] - bestY) <= 1.2 && candidates[i] > surfaceY) {
        surfaceY = candidates[i];
      }
    }
    return { y: surfaceY + 0.07, seg: bestSeg };
  }

  getBuildingCeilingAt(wx, wy, wz, margin = 0.0) {
    const [cx, cz] = this.worldToChunk(wx, wz);
    const chunk = this.loadedChunks.get(`${cx},${cz}`);
    if (!chunk || !chunk.userData.buildingColliders) return null;

    const boxes = chunk.userData.buildingColliders;
    let maxH = null;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (wy > b.h + 1.0) continue;
      if (
        wx >= b.minX - margin &&
        wx <= b.maxX + margin &&
        wz >= b.minZ - margin &&
        wz <= b.maxZ + margin
      ) {
        if (margin <= 0.1 && b.flatOuter && b.flatOuter.length >= 6) {
          if (!pointInRing2D(wx - b.ox, wz - b.oz, b.flatOuter)) continue;
        }
        if (maxH === null || b.h > maxH) maxH = b.h;
      }
    }
    return maxH;
  }

  resolveBuildingCollisions(wx, wy, wz, radius = 1.6) {
    const [cx, cz] = this.worldToChunk(wx, wz);
    const chunk = this.loadedChunks.get(`${cx},${cz}`);
    if (!chunk) return { x: wx, z: wz, hit: false };

    let rx = wx, rz = wz;
    let hit = false;
    const boxes = chunk.userData.buildingColliders;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (wy > b.h + 0.5) continue;
      if (
        rx + radius > b.minX &&
        rx - radius < b.maxX &&
        rz + radius > b.minZ &&
        rz - radius < b.maxZ
      ) {
        if (b.flatOuter && b.flatOuter.length >= 6 && !pointInRing2D(rx - b.ox, rz - b.oz, b.flatOuter)) {
          continue;
        }
        const penLeft = rx + radius - b.minX;
        const penRight = b.maxX - (rx - radius);
        const penTop = rz + radius - b.minZ;
        const penBot = b.maxZ - (rz - radius);
        const minPen = Math.min(penLeft, penRight, penTop, penBot);
        if (minPen === penLeft) rx = b.minX - radius;
        else if (minPen === penRight) rx = b.maxX + radius;
        else if (minPen === penTop) rz = b.minZ - radius;
        else rz = b.maxZ + radius;
        hit = true;
      }
    }
    return { x: rx, z: rz, hit };
  }

  async teleportToWorld(wx, wz, label = "", snapToRoad = true) {
    this.water.reset(); // fix/water
    const clampedX = Math.max(-HALF_WORLD + 50, Math.min(HALF_WORLD - 50, wx));
    const clampedZ = Math.max(-HALF_WORLD + 50, Math.min(HALF_WORLD - 50, wz));
    const initTerrY = getBeijingTerrainElevation(clampedX, clampedZ);
    this.pos.set(clampedX, initTerrY + 0.22, clampedZ);
    this.freeCamPos.set(clampedX, initTerrY + 95, clampedZ + 120);
    this.freeCamYaw = Math.PI;
    this.speed = 0;
    if (label) {
      this.currentRoadName = label;
    }

    await this._updateStreamingChunks(true);

    if (snapToRoad) {
      const [cx, cz] = this.worldToChunk(clampedX, clampedZ);
      let bestS = null;
      let bestScore = 240;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const chunk = this.loadedChunks.get(`${cx + dx},${cz + dz}`);
          if (!chunk || !chunk.userData.roadSegments) continue;
          for (const s of chunk.userData.roadSegments) {
            const mx = (s.x1 + s.x2) * 0.5;
            const my = (s.y1 + s.y2) * 0.5;
            const mz = (s.z1 + s.z2) * 0.5;
            const segLen = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
            const d = Math.hypot(mx - clampedX, mz - clampedZ);
            if (d > 220) continue;
            if (this.getBuildingCeilingAt(mx, my, mz, 1.5) !== null) continue;
            const penalty =
              (s.cls === "footway" || s.cls === "service" ? 45 : 0) +
              (segLen < 10.0 ? 35 : 0);
            const score = d + penalty;
            if (score < bestScore) {
              bestScore = score;
              bestS = s;
            }
          }
        }
      }
      if (bestS) {
        this.pos.set(
          (bestS.x1 + bestS.x2) * 0.5,
          (bestS.y1 + bestS.y2) * 0.5,
          (bestS.z1 + bestS.z2) * 0.5
        );
        this.yaw = Math.atan2(bestS.x2 - bestS.x1, bestS.z2 - bestS.z1);
        this.camYaw = this.yaw;
        this.camYawOffset = 0;
        this.camPivot.copy(this.pos);
        this.currentRoadName = label || bestS.name;
        this.currentLayer = bestS.layer;
      }
    } else {
      const surf = this.sampleRoadSurface(clampedX, initTerrY + 0.5, clampedZ);
      const bldgCeil = this.getBuildingCeilingAt(clampedX, initTerrY - 1.0, clampedZ, 1.2);
      let exactY = initTerrY + 0.22;
      if (surf) {
        exactY = surf.y;
        this.currentRoadName = surf.seg.name || label || t("map_teleport_label");
        this.currentLayer = surf.seg.layer;
      } else if (bldgCeil !== null) {
        exactY = Math.max(exactY, bldgCeil + 0.22);
        this.currentRoadName = label || t("map_teleport_label");
        this.currentLayer = 0;
      } else {
        this.currentRoadName = label || t("map_teleport_label");
        this.currentLayer = 0;
      }
      this.pos.set(clampedX, exactY, clampedZ);
      this.camYawOffset = 0;
      this.camPivot.copy(this.pos);
    }

    this.vehicleMesh.position.copy(this.pos);
    this.vehicleMesh.rotation.set(0, this.yaw, 0);
    this.avatarMesh.position.copy(this.pos);
    this.avatarMesh.rotation.set(0, this.yaw, 0);
    if (this.mode === "helicopter") {
      this.pos.y = Math.max(this.pos.y + 150.0, initTerrY + 150.0);
      this.camPivot.copy(this.pos);
    }
    this.heliMesh.position.copy(this.pos);
    this.heliMesh.rotation.set(0, this.yaw, 0);
    this._updateCamera(0.016);
  }

  _angleDiff(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  _ensureHeli() {
    if (!this.heli) this.heli = new HeliFlight(this, { halfWorld: HALF_WORLD });
    return this.heli;
  }

  _updatePhysics(dt) {
    this.vfxTime += dt;
    const wrapA = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
    this.yaw = wrapA(this.yaw);
    this.camYaw = wrapA(this.camYaw);
    // Typing in the search box (or any field) must not leave movement keys held.
    const ae = document.activeElement;
    if (this.keys.size && ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) this.keys.clear();
    this.water.tick(dt); // fix/water: splash particles
    if (this.camYawOffset !== 0) {
      this.camYaw += this.camYawOffset;
      this.camYawOffset = 0;
    }

    const shiftPressed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.nitroLocked;

    if (this.mode === "helicopter") {
      this._ensureHeli().update(dt, { boost: shiftPressed }); // feature/heli-gta: GTA-style flight model
      updateEntityNitroVfx(this.heliMesh, this.nitroActive, this.speed, this.vfxTime);
      updateEntityNitroVfx(this.vehicleMesh, false, 0, this.vfxTime);
      updateEntityNitroVfx(this.avatarMesh, false, 0, this.vfxTime);
      return;
    }

    if (this.mode === "walk") {
      const fwd =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
      const strafe =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
      const isNitro = shiftPressed;
      this.nitroActive = isNitro;

      const moveLen = Math.hypot(fwd, strafe);
      const targetSpd = moveLen > 0 ? (isNitro ? 22.0 : 6.2) : 0;
      this.speed = THREE.MathUtils.lerp(this.speed, targetSpd, Math.min(1, 12 * dt));

      if (moveLen > 0) {
        const moveYaw = this.camYaw + Math.atan2(-strafe, fwd); // D = camera-right (yaw grows toward screen-left)
        const diff = this._angleDiff(this.yaw, moveYaw);
        this.yaw += diff * Math.min(1, 12 * dt);
        const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
        const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
        const col = this.collision.resolve(nx, this.pos.y, nz, this.yaw, 0.45, [0], null, this.pos.x, this.pos.z); // fix/water
        const wk = this.water.resolveWalk(this.pos.x, this.pos.z, col.x, col.z, this.pos.y); // fix/water: stop at the shore
        this.pos.x = Math.max(-HALF_WORLD + 20, Math.min(HALF_WORLD - 20, wk.x));
        this.pos.z = Math.max(-HALF_WORLD + 20, Math.min(HALF_WORLD - 20, wk.z));
      }

      if (this.keys.has("Space") && this.isGrounded) {
        this.walkVelY = isNitro ? 14.5 : 8.2;
        this.isGrounded = false;
      }

      this.walkVelY -= 22.0 * dt;
      this.pos.y += this.walkVelY * dt;

      const surf = this.sampleRoadSurface(this.pos.x, this.pos.y, this.pos.z);
      const minTerrY = Math.max(
        getBeijingTerrainElevation(this.pos.x, this.pos.z) + 0.16,
        getChunkTerrainMeshElevation(this.pos.x, this.pos.z) + 0.08
      );
      const groundY = surf ? Math.max(surf.y, minTerrY) : minTerrY;
      if (surf) {
        this.currentRoadName = surf.seg.name;
        this.currentLayer = surf.seg.layer;
      }
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.walkVelY = 0;
        this.isGrounded = true;
      }

      this.avatarMesh.position.copy(this.pos);
      this.avatarMesh.rotation.y = this.yaw;

      const { leftLeg, rightLeg, leftArm, rightArm } = this.avatarMesh.userData;
      if (this.speed > 0.3) {
        this.walkAnimTime += dt * (isNitro ? 16 : 9);
        const swing = Math.sin(this.walkAnimTime) * 0.65;
        if (leftLeg) leftLeg.rotation.x = swing;
        if (rightLeg) rightLeg.rotation.x = -swing;
        if (leftArm) leftArm.rotation.x = -swing * 0.8;
        if (rightArm) rightArm.rotation.x = swing * 0.8;
      } else {
        if (leftLeg) leftLeg.rotation.x = 0;
        if (rightLeg) rightLeg.rotation.x = 0;
        if (leftArm) leftArm.rotation.x = 0;
        if (rightArm) rightArm.rotation.x = 0;
      }

      updateEntityNitroVfx(this.avatarMesh, isNitro && this.speed > 2.0, this.speed, this.vfxTime);
      updateEntityNitroVfx(this.vehicleMesh, false, 0, this.vfxTime);
      updateEntityNitroVfx(this.heliMesh, false, 0, this.vfxTime);
      return;
    }

    // DRIVE MODE
    if (this.water.updateDrive(dt)) { // fix/water: sinking + respawn sequence, engine input disabled
      this.nitroActive = false;
      updateEntityNitroVfx(this.vehicleMesh, false, 0, this.vfxTime);
      return;
    }
    const spec = VEHICLE_SPECS[this.vehicleIdx];
    const throttle =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const steerInput =
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) -
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0);
    const handbrake = this.keys.has("Space");
    const isNitro = shiftPressed && throttle > 0;
    this.nitroActive = isNitro;

    const mouseIdleSec = (performance.now() - this.lastMouseOrbitTime) * 0.001;
    const nitro = spec.nitroBoost || 1.45;
    const maxSpd = isNitro ? Math.max(spec.maxSpeed * nitro, 340.3) : spec.maxSpeed;
    const speedRatio = Math.min(1, Math.abs(this.speed) / maxSpd);

    if (handbrake) {
      const decel = spec.brake * 1.45 * dt;
      if (Math.abs(this.speed) <= decel) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * decel;
    } else if (throttle > 0) {
      const curveFloor = isNitro ? 0.55 : 0.35;
      const torque = (1.0 - speedRatio * (1.0 - curveFloor)) * spec.accel * (isNitro ? nitro * 1.15 : 1.0);
      this.speed = Math.min(maxSpd, this.speed + torque * dt);
    } else if (throttle < 0) {
      if (this.speed > 1.0) {
        this.speed = Math.max(0, this.speed - spec.brake * dt);
      } else {
        this.speed = Math.max(-maxSpd * 0.35, this.speed - spec.accel * 0.7 * dt);
      }
    } else {
      const drag = (2.8 + speedRatio * 4.5) * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }

    const maxSteer = THREE.MathUtils.lerp(spec.steerLow, spec.steerHigh, speedRatio);
    const targetSteer = steerInput * maxSteer * (handbrake ? 1.35 : 1.0);
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, 10.0 * dt));

    if (Math.abs(this.speed) > 0.15) {
      const turnRate = (this.speed / spec.length) * Math.tan(this.steerAngle);
      this.yaw += turnRate * dt;
      if (mouseIdleSec > 0.9) {
        if (
          this.keys.has("KeyA") ||
          this.keys.has("ArrowLeft") ||
          this.keys.has("KeyD") ||
          this.keys.has("ArrowRight")
        ) {
          this.camYaw += turnRate * dt * 0.85;
        }
        // Stay behind the car even when reversing (GTA): a reverse-facing camera mirrors A/D on screen.
        this.camYaw += this._angleDiff(this.camYaw, this.yaw) * Math.min(1, 2.6 * dt);
      }
    }

    const evalSupportAt = (x, z, refY) => {
      const meshY = getChunkTerrainMeshElevation(x, z);
      const demY = getBeijingTerrainElevation(x, z);
      const baseTerr = Math.max(meshY + 0.08, demY + 0.16);
      const rSurf = this.sampleRoadSurface(x, refY, z);
      return {
        y: rSurf ? Math.max(rSurf.y, baseTerr) : baseTerr,
        surf: rSurf,
      };
    };

    // fix/water: swept collision in <= 0.75 m sub-steps (no tunnelling at 230 km/h+); road/terrain support
    // is sampled every ~4 m as before, and the water check runs before the terrain floor clamp.
    const totalMove = this.speed * dt;
    const steps = Math.max(1, Math.min(32, Math.ceil(Math.abs(totalMove) / 0.75)));
    const supportSteps = Math.max(1, Math.min(6, Math.ceil(Math.abs(totalMove) / 4.0)));
    const supportEvery = Math.max(1, Math.floor(steps / supportSteps));
    const stepDt = dt / steps;
    for (let s = 0; s < steps; s++) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * stepDt;
      const nz = this.pos.z + Math.cos(this.yaw) * this.speed * stepDt;
      const col = this.collision.resolveCar(nx, this.pos.y, nz, this.yaw, spec, this.pos.x, this.pos.z);
      this.pos.x = Math.max(-HALF_WORLD + 20, Math.min(HALF_WORLD - 20, col.x));
      this.pos.z = Math.max(-HALF_WORLD + 20, Math.min(HALF_WORLD - 20, col.z));
      if (col.hit) this.collision.applyImpact(col.nx, col.nz);
      if ((s + 1) % supportEvery !== 0 && s !== steps - 1) continue;
      const stepCenter = evalSupportAt(this.pos.x, this.pos.z, this.pos.y);
      if (this.water.tryEnterWater(stepCenter.surf)) return;
      if (this.pos.y < stepCenter.y) {
        this.pos.y = stepCenter.y;
      }
    }

    const axleHalfSpan = Math.max(1.6, (spec.length || 4.6) * 0.38);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const centerSup = evalSupportAt(this.pos.x, this.pos.z, this.pos.y);
    const frontSup = evalSupportAt(this.pos.x + sinY * axleHalfSpan, this.pos.z + cosY * axleHalfSpan, this.pos.y);
    const rearSup = evalSupportAt(this.pos.x - sinY * axleHalfSpan, this.pos.z - cosY * axleHalfSpan, this.pos.y);

    // Ensure vehicle center sits on or above the bridge of front/center/rear axles so neither wheels nor bumpers clip into hills
    const minSupportY = Math.max(centerSup.y, (frontSup.y + rearSup.y) * 0.5);
    if (this.pos.y <= minSupportY) {
      this.pos.y = minSupportY;
    } else {
      this.pos.y = Math.max(minSupportY, THREE.MathUtils.lerp(this.pos.y, minSupportY, Math.min(1, 20 * dt)));
    }

    this.water.recordSafe(dt, centerSup.surf); // fix/water: respawn pose
    if (centerSup.surf) {
      this.currentRoadName = centerSup.surf.seg.name;
      this.currentLayer = centerSup.surf.seg.layer;
    } else {
      this.currentLayer = 0;
    }

    this.vehicleMesh.position.copy(this.pos);
    this.vehicleMesh.rotation.y = this.yaw;
    const trueSlopePitch = Math.atan2(frontSup.y - rearSup.y, axleHalfSpan * 2.0);
    this.vehicleMesh.rotation.x = THREE.MathUtils.lerp(
      this.vehicleMesh.rotation.x,
      -THREE.MathUtils.clamp(trueSlopePitch, -0.24, 0.24),
      Math.min(1, 14 * dt)
    );

    const { chassis, wheels, frontSteerPivots } = this.vehicleMesh.userData;
    const targetRoll = -this.steerAngle * speedRatio * 0.18;
    chassis.rotation.z = THREE.MathUtils.lerp(chassis.rotation.z, targetRoll, Math.min(1, 12 * dt));

    for (const piv of frontSteerPivots) {
      piv.rotation.y = this.steerAngle;
    }
    for (const w of wheels) {
      w.rotation.x += (this.speed * dt) / 0.36;
    }

    updateEntityNitroVfx(this.vehicleMesh, isNitro && Math.abs(this.speed) > 1.5, this.speed, this.vfxTime);
    updateEntityNitroVfx(this.avatarMesh, false, 0, this.vfxTime);
    updateEntityNitroVfx(this.heliMesh, false, 0, this.vfxTime);
  }

  _updateCamera(dt) {
    let activeOrbitDist = this.topDownHeight;
    if (this.camMode === "topdown") {
      // Heading-up: screen-up follows camYaw, so camera-relative and vehicle-relative input agree with the screen.
      const viewYaw = this.camYaw + this.camYawOffset;
      const back = this.topDownHeight * 0.24;
      const targetX = this.pos.x - Math.sin(viewYaw) * back;
      const targetY = this.pos.y + this.topDownHeight;
      const targetZ = this.pos.z - Math.cos(viewYaw) * back;
      this.camera.position.set(targetX, targetY, targetZ);
      this.camera.lookAt(this.pos.x, this.pos.y, this.pos.z);
    } else {
      this.camPivot.copy(this.pos);
      const isWalk = this.mode === "walk";
      const isHeli = this.mode === "helicopter";
      if (isHeli && this.heli) this.heli.cameraPivot(this.camPivot, dt); // feature/heli-gta: lagged chase pivot
      const spec = VEHICLE_SPECS[this.vehicleIdx];
      const isBus = !isWalk && !isHeli && spec && spec.id === "bus";
      const rawBaseDist = isHeli
        ? this.camMode === "street" ? 12.5 : 18.5
        : isWalk
          ? this.camMode === "street" ? 3.8 : 6.4
          : isBus
            ? this.camMode === "street" ? 13.5 : 19.5
            : this.camMode === "street" ? 6.8 : 13.5;
      const baseDist = rawBaseDist * (this.camZoom || 1.0);
      const pivotH = isHeli
        ? 2.45
        : isWalk
          ? 1.55
          : isBus
            ? this.camMode === "street" ? 3.85 : 4.25
            : this.camMode === "street" ? 1.65 : 1.95;
      const pitch = THREE.MathUtils.clamp(this.camPitch, 0.05, 1.18);
      const viewYaw = this.camYaw + this.camYawOffset;

      let armScale = 1.0;
      for (const s of [1.0, 0.78, 0.58, 0.42, 0.28]) {
        const hd = baseDist * s * Math.cos(pitch);
        const tx = this.camPivot.x - Math.sin(viewYaw) * hd;
        const tz = this.camPivot.z - Math.cos(viewYaw) * hd;
        const ty = Math.max(
          getBeijingTerrainElevation(tx, tz) + 0.85,
          this.camPivot.y + pivotH + baseDist * s * Math.sin(pitch)
        );
        if (this.getBuildingCeilingAt(tx, ty, tz, 0.6) === null) {
          armScale = s;
          break;
        }
      }

      activeOrbitDist = baseDist * armScale;
      const horizDist = activeOrbitDist * Math.cos(pitch);
      const camX = this.camPivot.x - Math.sin(viewYaw) * horizDist;
      const camZ = this.camPivot.z - Math.cos(viewYaw) * horizDist;
      const rawCamY = this.camPivot.y + pivotH + activeOrbitDist * Math.sin(pitch);
      const minCamY = getBeijingTerrainElevation(camX, camZ) + 0.85;
      const camY = Math.max(minCamY, rawCamY);

      this.camera.position.set(camX, camY, camZ);
      const lookAhead = isHeli ? 10.5 : isWalk ? 4.5 : isBus ? 9.0 : 6.5;
      this.camera.lookAt(
        this.camPivot.x + Math.sin(viewYaw) * lookAhead,
        this.camPivot.y + pivotH,
        this.camPivot.z + Math.cos(viewYaw) * lookAhead
      );
      if (isHeli && this.heli) this.heli.cameraShake(this.camera, dt);
    }

    const absSpd = Math.abs(this.speed);
    const boostFovAdd = this.nitroActive
      ? Math.min(20.0, 6.0 + (absSpd / 340.3) * 14.0)
      : Math.min(6.0, (absSpd / 145.0) * 6.0);
    const heliFov = this.mode === "helicopter" && this.heli && this.camMode !== "topdown";
    const targetFov = 58.0 + (heliFov ? this.heli.fovAdd() : boostFovAdd);

    const camTerrY = getBeijingTerrainElevation(this.camera.position.x, this.camera.position.z);
    const camAlt = Math.max(1.0, this.camera.position.y - camTerrY);
    const maxSafeNear =
      this.camMode === "topdown"
        ? 42.0
        : Math.max(1.2, Math.min(4.0, activeOrbitDist * 0.22));
    const targetNear = THREE.MathUtils.clamp(camAlt * 0.045, 1.5, maxSafeNear);
    if (Math.abs(this.camera.near - targetNear) > 0.10 || Math.abs(this.camera.fov - targetFov) > 0.15) {
      this.camera.near = targetNear;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, 8.0 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  _updateHud() {
    const roadRaw = this.currentRoadName || t("urban_road_fallback");
    const streetText = getLang() === "en" ? translateRoadName(roadRaw) : roadRaw;
    const cityText = this.currentCityName || "Beijing, CN";

    const pillTextEl = document.getElementById("location-pill-text");
    if (pillTextEl) {
      pillTextEl.textContent = `${streetText} · ${cityText}`;
    }

    const streetEl = document.getElementById("radar-street");
    if (streetEl) streetEl.textContent = streetText;

    const cityEl = document.getElementById("radar-city");
    if (cityEl) cityEl.textContent = cityText;

    const absSpd = Math.abs(this.speed);
    const kmh = Math.round(absSpd * 3.6);
    const speedValEl = document.getElementById("speed-value");
    if (speedValEl) speedValEl.textContent = String(kmh);

    const gearBadgeEl = document.getElementById("speed-gear-badge");
    if (gearBadgeEl) {
      const mach = absSpd / 340.3;
      gearBadgeEl.classList.toggle("boost", Boolean(this.nitroActive));
      if (this.nitroActive && mach >= 0.85) {
        gearBadgeEl.textContent = `MACH ${mach.toFixed(2)}`;
      } else if (this.nitroActive) {
        gearBadgeEl.textContent = "BOOST";
      } else if (this.mode === "helicopter") {
        gearBadgeEl.textContent = `ALT ${Math.round(this.pos.y)}m`;
      } else if (this.mode === "walk") {
        gearBadgeEl.textContent = getLang() === "zh" ? "步行" : "WALK";
      } else {
        const gear = kmh < 2 ? "N" : `D${Math.min(7, Math.max(1, Math.ceil(kmh / 42)))}`;
        gearBadgeEl.textContent = gear;
      }
    }

    const barFillEl = document.getElementById("speed-bar-fill");
    if (barFillEl) {
      const maxRefKmh = this.nitroActive ? 1225 : this.mode === "helicopter" ? 330 : 320;
      const pct = Math.min(100, Math.round((kmh / maxRefKmh) * 100));
      barFillEl.style.width = `${pct}%`;
      barFillEl.classList.toggle("boost", Boolean(this.nitroActive));
    }
  }

  _bindInputs() {
    const fadeControlsHint = () => {
      const hint = document.getElementById("hud-controls-hint");
      if (hint && !hint.classList.contains("faded") && performance.now() - (this._hintShownAt || 0) > 2500) {
        hint.classList.add("faded");
      }
    };
    setTimeout(fadeControlsHint, 8000);

    window.addEventListener("keydown", (e) => {
      if (document.activeElement && document.activeElement.tagName === "INPUT") {
        if (e.code === "Escape") {
          document.activeElement.blur();
          const panel = document.getElementById("location-search-panel");
          if (panel) panel.classList.add("hidden");
        }
        return;
      }

      if (e.code === "Slash") {
        e.preventDefault();
        const panel = document.getElementById("location-search-panel");
        const input = document.getElementById("location-input");
        if (panel) {
          panel.classList.remove("hidden");
          if (input) input.focus();
        }
        return;
      }

      this.keys.add(e.code);

      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
        fadeControlsHint();
      }

      if (e.code === "KeyF") {
        this.setMode(this.mode === "drive" ? "walk" : "drive");
      } else if (e.code === "KeyC") {
        this.setMode(this.mode === "helicopter" ? "drive" : "helicopter");
      } else if (e.code === "KeyV") {
        this.cycleCameraMode();
      } else if (e.code === "KeyG") {
        if (this.mode !== "drive") this.setMode("drive");
        this.cycleVehicle();
      } else if (e.code === "KeyM") {
        if (this.mapSystem) this.mapSystem.toggleModal();
      } else if (e.code === "Escape") {
        if (this.mapSystem && this.mapSystem.isOpen) {
          this.mapSystem.toggleModal(false);
        }
        const pop = document.getElementById("mode-vehicle-menu");
        if (pop) pop.classList.add("hidden");
        const panel = document.getElementById("location-search-panel");
        if (panel) panel.classList.add("hidden");
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    // A key released while the page/canvas lost focus never sends keyup; drop all held keys instead.
    const releaseAll = () => this.keys.clear();
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });


    let pointerDownX = 0, pointerDownY = 0;
    let isDragging = false;

    this.canvas.addEventListener("pointerdown", (e) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
      isDragging = e.button === 0 || e.button === 2;
      const pop = document.getElementById("mode-vehicle-menu");
      if (pop) pop.classList.add("hidden");
      const panel = document.getElementById("location-search-panel");
      if (panel) panel.classList.add("hidden");
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!isDragging || (e.buttons & 3) === 0) return;
      const dx = e.clientX - pointerDownX;
      const dy = e.clientY - pointerDownY;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;

      this.camYaw -= dx * 0.005;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0042, 0.05, 1.18);
      this.lastMouseOrbitTime = performance.now();
    });

    window.addEventListener("pointerup", () => {
      isDragging = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.camMode === "topdown") {
          this.topDownHeight = THREE.MathUtils.clamp(this.topDownHeight + e.deltaY * 0.15, 40, 650);
        } else {
          this.camZoom = THREE.MathUtils.clamp((this.camZoom || 1.0) + e.deltaY * 0.0012, 0.45, 3.8);
        }
      },
      { passive: true }
    );

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _showControlsHint() {
    const hint = document.getElementById("hud-controls-hint");
    if (!hint) return;
    const zh = getLang() === "zh";
    const text =
      this.mode === "helicopter"
        ? zh
          ? "W/S 升降 · A/D 转向 · ↑↓ 俯仰 · ←→ 侧倾 · 拖动看 · C 退出"
          : "W/S Up/Down · A/D Yaw · ↑↓ Pitch · ←→ Roll · Drag Look · C Exit"
        : zh
          ? "WASD 移动 · Shift 加速 · 空格 刹车 · F 步行/驾驶 · C 直升机 · G 换车 · / 搜索"
          : "WASD Move · Shift Boost · Space Brake · F Walk/Drive · C Helicopter · G Switch Car · / Search";
    if (hint.textContent !== text) hint.textContent = text;
    hint.classList.remove("faded");
    this._hintShownAt = performance.now();
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => hint.classList.add("faded"), 6000);
  }

  _updateModeAndCamBadges() {
    const modeLabelEl = document.getElementById("mode-vehicle-label");
    if (modeLabelEl) {
      if (this.mode === "drive") {
        const spec = VEHICLE_SPECS[this.vehicleIdx];
        const vName = spec ? getVehicleName(spec.id, spec.name) : "Drive";
        const prefix = getLang() === "zh" ? "驾驶" : "DRIVE";
        modeLabelEl.textContent = `${prefix} · ${vName.toUpperCase()}`;
      } else if (this.mode === "walk") {
        modeLabelEl.textContent = getLang() === "zh" ? "步行模式" : "WALK";
      } else {
        modeLabelEl.textContent = getLang() === "zh" ? "直升机巡航" : "HELICOPTER";
      }
      if (this.kaiju && this.kaiju.active) modeLabelEl.textContent = t("kaiju_badge"); // [kaiju]
    }

    document.querySelectorAll(".popover-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", this.kaiju && this.kaiju.active ? btn.dataset.mode === "kaiju" : btn.dataset.mode === this.mode); // [kaiju]
    });

    this._renderVehiclePopoverList();

    const camLabels = {
      chase: getLang() === "zh" ? "追尾视角" : "CHASE",
      topdown: getLang() === "zh" ? "俯视视角" : "TOP-DOWN",
      street: getLang() === "zh" ? "低角街景" : "COCKPIT",
    };
    const camLabelEl = document.getElementById("camera-btn-label");
    if (camLabelEl) {
      camLabelEl.textContent = camLabels[this.camMode] || "CHASE";
    }

    const langLabelEl = document.getElementById("lang-btn-label");
    if (langLabelEl) {
      langLabelEl.textContent = getLang().toUpperCase();
    }
  }

  _renderVehiclePopoverList() {
    const listEl = document.getElementById("vehicle-menu-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    VEHICLE_SPECS.forEach((spec, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `vehicle-option-btn${this.mode === "drive" && this.vehicleIdx === idx ? " active" : ""}`;
      const vName = getVehicleName(spec.id, spec.name);
      const topKmh = Math.round(spec.maxSpeed * 3.6);
      btn.innerHTML = `<span>${vName}</span><span class="vehicle-option-meta">${topKmh} km/h</span>`;
      btn.addEventListener("click", () => {
        this.selectVehicle(idx);
        const pop = document.getElementById("mode-vehicle-menu");
        if (pop) pop.classList.add("hidden");
      });
      listEl.appendChild(btn);
    });
  }

  _refreshLocalizedUi() {
    this._updateModeAndCamBadges();
    this._renderQuickDestinationChips();
    const searchInput = document.getElementById("location-input");
    if (searchInput) {
      searchInput.placeholder =
        getLang() === "zh"
          ? "输入全球任意城市、街道或地标..."
          : "Type any address, street, or city...";
    }
    if (this.mapSystem) {
      this.mapSystem.renderWorldMap();
    }
  }

  setMode(rawMode) {
    if (rawMode === "kaiju") { if (this.kaiju && !this.kaiju.active) this.kaiju.enter(); return; } // [kaiju]
    if (this.kaiju && this.kaiju.active) this.kaiju.exit(); // [kaiju] any other mode leaves Kaiju Defense
    const newMode = rawMode === "freecam" ? "helicopter" : rawMode;
    if (this.water) this.water.reset(); // fix/water
    const prevMode = this.mode;
    this.mode = newMode;
    this.camYaw += this.camYawOffset;
    this.camYawOffset = 0;
    // Vehicle controls are vehicle-relative: put the camera behind it so A/D match screen left/right.
    if (newMode !== prevMode && newMode !== "walk") this.camYaw = this.yaw;

    this._updateModeAndCamBadges();

    if (newMode === "drive") {
      this.avatarMesh.visible = false;
      this.heliMesh.visible = false;
      this.vehicleMesh.visible = true;
      const surf = this.sampleRoadSurface(this.pos.x, this.pos.y, this.pos.z);
      if (surf) this.pos.y = surf.y;
      else this.pos.y = getBeijingTerrainElevation(this.pos.x, this.pos.z) + 0.22;
      this.vehicleMesh.position.copy(this.pos);
      this.vehicleMesh.rotation.y = this.yaw;
      this.camPivot.copy(this.pos);
    } else if (newMode === "walk") {
      this.avatarMesh.visible = true;
      this.vehicleMesh.visible = false;
      this.heliMesh.visible = false;
      const surf = this.sampleRoadSurface(this.pos.x, this.pos.y, this.pos.z);
      if (surf) this.pos.y = surf.y;
      else this.pos.y = getBeijingTerrainElevation(this.pos.x, this.pos.z) + 0.12;
      this.walkVelY = 0;
      this.isGrounded = true;
      this.avatarMesh.position.copy(this.pos);
      this.avatarMesh.rotation.y = this.yaw;
      this.camPivot.copy(this.pos);
    } else {
      this.avatarMesh.visible = false;
      this.vehicleMesh.visible = false;
      this.heliMesh.visible = true;
      if (prevMode !== "helicopter") {
        const minHeliY = getBeijingTerrainElevation(this.pos.x, this.pos.z) + 150.0;
        this.pos.y = Math.max(this.pos.y + 150.0, minHeliY);
        this.heliVelY = 0;
        this._ensureHeli().onEnter(); // feature/heli-gta
      }
      this.heliMesh.position.copy(this.pos);
      this.heliMesh.rotation.y = this.yaw;
      this.camPivot.copy(this.pos);
    }
    if (prevMode === "helicopter" && newMode !== "helicopter" && this.heli) this.heli.onExit();
    this._showControlsHint();
  }

  cycleCameraMode() {
    const order = ["chase", "topdown", "street"];
    const idx = (order.indexOf(this.camMode) + 1) % order.length;
    this.camMode = order[idx];
    this._updateModeAndCamBadges();
  }

  selectVehicle(idx) {
    this.vehicleIdx = ((idx % VEHICLE_SPECS.length) + VEHICLE_SPECS.length) % VEHICLE_SPECS.length;
    this.scene.remove(this.vehicleMesh);
    const spec = VEHICLE_SPECS[this.vehicleIdx];
    this.vehicleMesh = createVehicleModel(spec.id);
    this.vehicleMesh.position.copy(this.pos);
    this.vehicleMesh.rotation.y = this.yaw;
    if (this.mode !== "drive") {
      this.setMode("drive");
    } else {
      this.vehicleMesh.visible = true;
    }
    this.scene.add(this.vehicleMesh);
    this._updateModeAndCamBadges();
  }

  cycleVehicle() {
    this.selectVehicle(this.vehicleIdx + 1);
  }

  setTimeOfDay(preset) {
    const presets = {
      noon: {
        labelEn: "DAY",
        labelZh: "正午",
        zenith: 0x2b6cb0,
        horizon: 0xbfd8ec,
        ground: 0x636e72,
        fog: 0.00011,
        sunCol: 0xfff4dc,
        sunInt: 1.55,
        hemiSky: 0xe2f1ff,
        hemiGround: 0x687064,
        hemiInt: 0.95,
        ambCol: 0xffffff,
        ambInt: 0.35,
        sunOffset: [380, 680, 340],
      },
      sunset: {
        labelEn: "SUNSET",
        labelZh: "日落",
        zenith: 0x3b4d7a,
        horizon: 0xf08c5b,
        ground: 0x4a3b36,
        fog: 0.00016,
        sunCol: 0xff9a52,
        sunInt: 1.75,
        hemiSky: 0xffb284,
        hemiGround: 0x584858,
        hemiInt: 0.92,
        ambCol: 0xd89078,
        ambInt: 0.45,
        sunOffset: [-620, 260, 420],
      },
      night: {
        labelEn: "NIGHT",
        labelZh: "夜景",
        zenith: 0x091326,
        horizon: 0x1c2f4f,
        ground: 0x182234,
        fog: 0.00013,
        sunCol: 0x9cb8ff,
        sunInt: 1.08,
        hemiSky: 0x7498dc,
        hemiGround: 0x445372,
        hemiInt: 1.25,
        ambCol: 0x6882b8,
        ambInt: 0.92,
        sunOffset: [260, 520, -360],
      },
      overcast: {
        labelEn: "OVERCAST",
        labelZh: "阴天",
        zenith: 0x7c8b99,
        horizon: 0xb8c4cf,
        ground: 0x5c646b,
        fog: 0.00028,
        sunCol: 0xe2e8f0,
        sunInt: 0.85,
        hemiSky: 0xc8d4e0,
        hemiGround: 0x666e75,
        hemiInt: 0.95,
        ambCol: 0xd8e0e8,
        ambInt: 0.45,
        sunOffset: [200, 720, 200],
      },
    };
    const p = presets[preset] || presets.noon;
    this.scene.background.setHex(p.horizon);
    this.scene.fog.color.setHex(p.horizon);
    this.scene.fog.density = p.fog;
    this.sunLight.color.setHex(p.sunCol);
    this.sunLight.intensity = p.sunInt;
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiInt;
    if (this.ambientLight) {
      this.ambientLight.color.setHex(p.ambCol);
      this.ambientLight.intensity = p.ambInt;
    }
    this.sunOffset.set(p.sunOffset[0], p.sunOffset[1], p.sunOffset[2]);
    this.sunDir.copy(this.sunOffset).normalize();

    const timeLabelEl = document.getElementById("time-btn-label");
    if (timeLabelEl) timeLabelEl.textContent = getLang() === "zh" ? p.labelZh : p.labelEn;

    const emInt = preset === "night" ? 1.25 : preset === "sunset" ? 0.52 : 0.06;
    if (this.mats && this.mats.buildingMats) {
      for (const m of Object.values(this.mats.buildingMats)) {
        m.emissiveIntensity = emInt;
      }
    }
    const wfcNightEm = preset === "night" ? 1.85 : preset === "sunset" ? 0.72 : 0.04;
    if (this.mats && this.mats.wfcBldgMat && this.mats.wfcBldgMat.userData.nightUniforms) {
      this.mats.wfcBldgMat.userData.nightUniforms.uNightEmissive.value = wfcNightEm;
    }
    if (
      this.skylineInstanced &&
      this.skylineInstanced.material &&
      this.skylineInstanced.material.userData.lodNightUniforms
    ) {
      this.skylineInstanced.material.userData.lodNightUniforms.uLodNightEmissive.value =
        preset === "night" ? 1.25 : preset === "sunset" ? 0.36 : 0.0;
    }
    if (this.playerLight) {
      this.playerLight.intensity = preset === "night" ? 14.0 : preset === "sunset" ? 4.5 : 0.0;
      this.playerLight.distance = 65;
    }

    if (this.skyDome && this.skyDome.uniforms) {
      this.skyDome.uniforms.uZenithColor.value.setHex(p.zenith);
      this.skyDome.uniforms.uHorizonColor.value.setHex(p.horizon);
      this.skyDome.uniforms.uGroundColor.value.setHex(p.ground);
      this.skyDome.uniforms.uSunColor.value.setHex(p.sunCol);
      this.skyDome.uniforms.uSunIntensity.value = preset === "night" ? 0.15 : 1.0;
      this.skyDome.uniforms.uSunDir.value.copy(this.sunDir);
    }
  }

  _renderQuickDestinationChips() {
    const chipsContainer = document.getElementById("location-chips");
    if (!chipsContainer) return;
    chipsContainer.innerHTML = "";
    const panel = document.getElementById("location-search-panel");
    for (const dest of QUICK_WORLD_DESTINATIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "loc-chip";
      btn.dataset.id = dest.id;
      btn.dataset.lat = String(dest.lat);
      btn.dataset.lon = String(dest.lon);
      btn.textContent = getLang() === "zh" ? dest.nameZh || dest.name : dest.name;
      btn.addEventListener("click", () => {
        if (panel) panel.classList.add("hidden");
        this.teleportToLocation(
          dest.lat,
          dest.lon,
          getLang() === "zh" ? dest.cityZh || dest.city : dest.city,
          dest.street
        );
      });
      chipsContainer.appendChild(btn);
    }
    this._updateActiveQuickChip(this.worldOrigin.centerLat, this.worldOrigin.centerLon);
  }

  _updateActiveQuickChip(lat, lon) {
    document.querySelectorAll(".loc-chip").forEach((chip) => {
      const cLat = Number(chip.dataset.lat);
      const cLon = Number(chip.dataset.lon);
      const isMatch = Math.hypot(cLat - lat, cLon - lon) < 0.08;
      chip.classList.toggle("active", isMatch);
    });
  }

  _bindHudControls() {
    // Zone 1: Spotlight Location Pill & Address Search
    this._renderQuickDestinationChips();

    const locPill = document.getElementById("location-pill");
    const locPanel = document.getElementById("location-search-panel");
    const locInput = document.getElementById("location-input");
    const locEsc = document.getElementById("location-esc-badge");
    const resultsSec = document.getElementById("location-results-section");
    const resultsEl = document.getElementById("location-results");
    let debounceTimer = null;
    let lastResults = [];

    if (locPill && locPanel) {
      locPill.addEventListener("click", (e) => {
        e.stopPropagation();
        locPanel.classList.toggle("hidden");
        if (!locPanel.classList.contains("hidden") && locInput) {
          locInput.focus();
          locInput.select();
        }
      });
    }

    if (locEsc && locPanel) {
      locEsc.addEventListener("click", () => {
        locPanel.classList.add("hidden");
      });
    }

    const renderSearchResults = (items) => {
      lastResults = items || [];
      if (!resultsSec || !resultsEl) return;
      if (!items || items.length === 0) {
        resultsSec.classList.add("hidden");
        resultsEl.innerHTML = "";
        return;
      }
      resultsEl.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "loc-result-item";
        btn.innerHTML = `
          <div class="loc-result-main">${item.name}</div>
          <div class="loc-result-sub">${item.sub || `${item.lat.toFixed(4)}°, ${item.lon.toFixed(4)}°`}</div>
        `;
        btn.addEventListener("click", () => {
          if (locPanel) locPanel.classList.add("hidden");
          if (locInput) locInput.value = item.name;
          this.teleportToLocation(item.lat, item.lon, item.sub || item.name, item.name);
        });
        resultsEl.appendChild(btn);
      });
      resultsSec.classList.remove("hidden");
    };

    if (locInput) {
      locInput.addEventListener("input", () => {
        const q = locInput.value.trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (q.length < 2) {
          renderSearchResults([]);
          return;
        }
        debounceTimer = setTimeout(async () => {
          const results = await searchAddress(q);
          renderSearchResults(results);
        }, 200);
      });

      locInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const q = locInput.value.trim();
          if (!q) return;
          const results = lastResults.length > 0 ? lastResults : await searchAddress(q);
          if (results && results.length > 0) {
            const top = results[0];
            if (locPanel) locPanel.classList.add("hidden");
            locInput.blur();
            await this.teleportToLocation(top.lat, top.lon, top.sub || top.name, top.name);
          }
        }
      });
    }

    // Zone 2: Top-Right Progressive Disclosure Action Dock
    const modeBtn = document.getElementById("mode-vehicle-btn");
    const popover = document.getElementById("mode-vehicle-menu");
    if (modeBtn && popover) {
      modeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        popover.classList.toggle("hidden");
      });
    }

    document.querySelectorAll(".popover-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setMode(btn.dataset.mode);
        if (btn.dataset.mode !== "drive" && popover) {
          popover.classList.add("hidden");
        }
      });
    });

    const timeBtn = document.getElementById("time-btn");
    if (timeBtn) {
      timeBtn.addEventListener("click", () => {
        if (this.atmosphere) return; // feature/atmosphere owns the time & weather pill
        this.timePresetIdx = (this.timePresetIdx + 1) % TIME_PRESET_ORDER.length;
        this.setTimeOfDay(TIME_PRESET_ORDER[this.timePresetIdx]);
      });
    }

    const camBtn = document.getElementById("camera-btn");
    if (camBtn) {
      camBtn.addEventListener("click", () => this.cycleCameraMode());
    }

    const langBtn = document.getElementById("lang-btn");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        setLang(getLang() === "en" ? "zh" : "en");
      });
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const rawDt = Math.min(0.05, this.clock.getDelta());
    const dt = this.kaiju ? this.kaiju.scaleDt(rawDt) : rawDt; // [kaiju] pause / death slow-mo
    this._updatePhysics(dt);
    if (this.kaiju) this.kaiju.update(dt, rawDt); // [kaiju]
    this._updateCamera(dt);
    this.collision.applyCameraShake(this.camera, dt); // fix/water: impact shake
    if (this.kaiju) this.kaiju.postCamera(dt, rawDt); // [kaiju]
    // [integration] atmosphere first: daylight/sun/weather are then current for traffic, street, places and shadows
    if (this.atmosphere) this.atmosphere.update(dt); // feature/atmosphere
    this._updateStreamingChunks(false);
    this._processChunkBuildQueue(5.5);
    this.traffic.update(dt, this.pos, this.loadedChunks);
    this.streetFeatures.update(dt, this.camera.position, this.loadedChunks, this.layerVisibility, this.worldOrigin); // [feature/street]
    this.vegetation.update(this.camera, this.loadedChunks, dt); // [feature/vegetation]
    if (this.places) this.places.update(dt, this.camera, this.pos, this.loadedChunks); // feature/places
    this._updateHud();

    if (this.skyDome && this.skyDome.mesh) {
      this.skyDome.mesh.position.copy(this.camera.position);
    }
    if (this.playerLight) {
      this.playerLight.position.set(this.pos.x, this.pos.y + 5.5, this.pos.z);
    }

    const camTerrY = getBeijingTerrainElevation(this.camera.position.x, this.camera.position.z);
    const camAlt = Math.max(2.0, this.camera.position.y - camTerrY);
    const targetShadowBounds = THREE.MathUtils.clamp(550 + camAlt * 1.25, 550, 1800);
    if (Math.abs(this.currentShadowBounds - targetShadowBounds) > 35) {
      this.currentShadowBounds = targetShadowBounds;
      const sc = this.sunLight.shadow.camera;
      sc.left = -targetShadowBounds;
      sc.right = targetShadowBounds;
      sc.top = targetShadowBounds;
      sc.bottom = -targetShadowBounds;
      sc.updateProjectionMatrix();
    }

    const activeYaw = this.mode === "freecam" ? this.freeCamYaw : this.camYaw + this.camYawOffset;
    const activePitch =
      this.mode === "freecam" ? this.freeCamPitch : this.camMode === "topdown" ? -1.35 : -this.camPitch;
    const horizFactor = Math.max(0.0, Math.cos(activePitch));
    const fwdShift = horizFactor * Math.min(360, this.currentShadowBounds * 0.34);

    const rawFocusX = this.camera.position.x + Math.sin(activeYaw) * fwdShift;
    const rawFocusZ = this.camera.position.z + Math.cos(activeYaw) * fwdShift;
    const snapStep = Math.max(4.0, (this.currentShadowBounds * 2.0) / 1024.0);
    const focusX = Math.round(rawFocusX / snapStep) * snapStep;
    const focusZ = Math.round(rawFocusZ / snapStep) * snapStep;
    if (Math.hypot(focusX - this._lastShadowFocusX, focusZ - this._lastShadowFocusZ) >= 8.0) {
      this._lastShadowFocusX = focusX;
      this._lastShadowFocusZ = focusZ;
      const focusY = getBeijingTerrainElevation(focusX, focusZ);
      this.sunLight.target.position.set(focusX, focusY, focusZ);
      const sunDist = 2600;
      this.sunLight.position.set(
        focusX + this.sunDir.x * sunDist,
        focusY + this.sunDir.y * sunDist,
        focusZ + this.sunDir.z * sunDist
      );
    }

    if (this.mapSystem) {
      const minimapYaw = this.mode === "freecam" ? this.freeCamYaw : this.yaw;
      this.mapSystem.updateMinimap(this.pos, minimapYaw, this.loadedChunks);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const app = new WorldExplorerApp();
app.start();
