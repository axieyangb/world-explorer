import * as THREE from '../../vendor/three.module.js';
import { koppenAt, floraContext } from './flora_climate.js';
import { getBeijingTerrainElevation, getChunkTerrainMeshElevation } from '../environment.js';
import { INST_STRIDE } from './vegetation_worker.js';
import { QUALITY } from './quality.js';

/**
 * 100% Global, Real-Data-Driven Wildlife & Birds System.
 * - Fetches live local biodiversity from keyless iNaturalist species_counts API (cached per 0.25 deg cell).
 * - Falls back instantaneously on frame 1 to global Koeppen climate + coastal biome weights.
 * - Renders 8 articulated low-poly animated wildlife archetypes with shared geometries/materials.
 * - Enforces strict anti-clipping against water, buildings, roofs, and active car lanes.
 */

export const WILDLIFE_KINDS = [
  'sparrow',
  'pigeon',
  'seagull',
  'raptor',
  'duck',
  'squirrel',
  'deer',
  'fox',
];

const INAT_URL = 'https://api.inaturalist.org/v1/observations/species_counts';
const REFETCH_DIST_M = 20000;
const SPAWN_MIN_R = 12;
const SPAWN_MAX_R = 205;
const RECYCLE_R = 240;
const NON_CAR_CLS = new Set(['footway', 'steps', 'cycleway', 'path', 'pedestrian', 'track', 'bridleway']);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const randRange = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// --------------------------------------------------------------------------- Species Classification

const RE_SEAGULL = /\b(gull|tern|pelican|cormorant|gannet|booby|albatross|petrel|shearwater|puffin|skua|kittiwake|guillemot|murre|razorbill|frigatebird|tropicbird|oystercatcher|sandpiper|plover|curlew|godwit|turnstone|auk)\b|^(larus|chroicocephalus|leucophaeus|thalasseus|sterna|pelecanus|phalacrocorax|nannopterum|morus|diomedea)\b/i;
const RE_DUCK = /\b(duck|mallard|goose|geese|swan|coot|heron|egret|moorhen|grebe|loon|merganser|teal|wigeon|pintail|shoveler|pochard|gadwall|scoter|eider|bufflehead|goldeneye|canvasback|crane|stork|ibis|flamingo|spoonbill|bittern|kingfisher|dipper)\b|^(anas|mareca|spatula|aythya|branta|anser|cygnus|alopochen|fulica|gallinula|ardea|egretta|nycticorax|butorides|podiceps|tachybaptus)\b/i;
const RE_RAPTOR = /\b(hawk|eagle|kite|falcon|osprey|vulture|condor|harrier|kestrel|buzzard|sparrowhawk|goshawk|merlin|caracara|owl|raven|crow|rook|jackdaw|chough)\b|^(buteo|accipiter|haliaeetus|aquila|falco|pandion|cathartes|coragyps|circus|milvus|corvus)\b/i;
const RE_PIGEON = /\b(pigeon|dove|turtledove)\b|^(columba|streptopelia|zenaida|patagioenas|geopelia)\b/i;
const RE_SPARROW = /\b(sparrow|finch|robin|warbler|swallow|martin|swift|starling|blackbird|thrush|tit|chickadee|nuthatch|wren|jay|magpie|towhee|junco|phoebe|flycatcher|hummingbird|parakeet|parrot|oriole|cardinal|bunting|grosbeak|tanager|vireo|waxwing|kinglet|creeper|bulbul|myna|weaver|sunbird|wagtail|pipit|lark|shrike|woodpecker|flicker|sapsucker|mockingbird|catbird|thrasher|bluebird|goldfinch|siskin|redpoll|crossbill|linnet|chaffinch|greenfinch|bullfinch|dunnock)\b|^(zonotrichia|passer|haemorhous|spinus|turdus|erithacus|parus|cyanistes|poecile|sturnus|pica|aphelocoma|cyanocitta|junco|melospiza|pipilo|melozone|sayornis|calypte|psittacula)\b/i;
const RE_SQUIRREL = /\b(squirrel|chipmunk|marmot|woodchuck|groundhog|gopher|prairie dog)\b|^(sciurus|tamiasciurus|tamias|neotamias|otospermophilus|marmota|cynomys)\b/i;
const RE_DEER = /\b(deer|elk|wapiti|moose|caribou|reindeer|stag|hart|hind|chamois|ibex|antelope|gazelle|impala|springbok|kudu|oryx|kangaroo|wallaby|wallaroo|muntjac)\b|^(odocoileus|cervus|capreolus|dama|alces|rangifer|rupicapra|capra|antilope|gazella|macropus|ospranther|notamacropus)\b/i;
const RE_FOX = /\b(fox|coyote|raccoon|badger|jackal|wolf|lynx|bobcat|coati|ringtail|skunk|opossum|mongoose|meerkat|hedgehog)\b|^(vulpes|urocyon|canis|procyon|meles|taxidea|lynx|nasua)\b/i;

export function classifyTaxon(taxon) {
  if (!taxon) return null;
  const common = String(taxon.preferred_common_name || '');
  const sci = String(taxon.name || '');
  const text = `${common} ${sci}`;
  if (RE_SEAGULL.test(text) || RE_SEAGULL.test(sci)) return 'seagull';
  if (RE_DUCK.test(text) || RE_DUCK.test(sci)) return 'duck';
  if (RE_RAPTOR.test(text) || RE_RAPTOR.test(sci)) return 'raptor';
  if (RE_PIGEON.test(text) || RE_PIGEON.test(sci)) return 'pigeon';
  if (RE_SPARROW.test(text) || RE_SPARROW.test(sci)) return 'sparrow';
  if (RE_SQUIRREL.test(text) || RE_SQUIRREL.test(sci)) return 'squirrel';
  if (RE_DEER.test(text) || RE_DEER.test(sci)) return 'deer';
  if (RE_FOX.test(text) || RE_FOX.test(sci)) return 'fox';
  if (taxon.iconic_taxon_name === 'Aves') return 'sparrow';
  return null;
}

function normalizeWeights(w) {
  const out = {};
  let sum = 0;
  for (const k of WILDLIFE_KINDS) {
    const v = Math.max(0, Number(w[k]) || 0);
    out[k] = v;
    sum += v;
  }
  if (sum <= 1e-9) {
    for (const k of WILDLIFE_KINDS) out[k] = 1 / WILDLIFE_KINDS.length;
    return out;
  }
  for (const k of WILDLIFE_KINDS) out[k] /= sum;
  return out;
}

function computeBiomeWeights(lat, lon, seaCoastal) {
  const k = koppenAt(lat, lon);
  const fc = floraContext(lat, lon);
  const coastal = Boolean(seaCoastal || k.coastal);
  const z = fc.zone || 'ocean';
  let base;
  if (z === 'trop' || z === 'sav') {
    base = { sparrow: 0.28, pigeon: 0.13, seagull: coastal ? 0.20 : 0.02, raptor: 0.12, duck: 0.15, squirrel: 0.08, deer: 0.08, fox: 0.04 };
  } else if (z === 'hdes' || z === 'cdes' || z === 'hstep' || z === 'cstep') {
    base = { sparrow: 0.22, pigeon: 0.12, seagull: coastal ? 0.18 : 0.01, raptor: 0.24, duck: 0.04, squirrel: 0.05, deer: 0.10, fox: 0.14 };
  } else if (z === 'boreal' || z === 'tundra' || z === 'ice') {
    base = { sparrow: 0.16, pigeon: 0.04, seagull: coastal ? 0.26 : 0.04, raptor: 0.17, duck: 0.15, squirrel: 0.08, deer: 0.17, fox: 0.13 };
  } else {
    base = { sparrow: 0.23, pigeon: 0.17, seagull: coastal ? 0.22 : 0.03, raptor: 0.09, duck: 0.13, squirrel: 0.13, deer: 0.06, fox: 0.07 };
  }
  return { weights: normalizeWeights(base), zone: z, coastal, koppen: k.cls || 'ocean' };
}

// --------------------------------------------------------------------------- Shared 3D Assets

let _assets = null;

function makeMat(color, roughness = 0.78, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function getAssets() {
  if (_assets) return _assets;
  const g = {
    sphere: new THREE.SphereGeometry(1, 10, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  };
  const m = {
    sparrowBack: makeMat(0x7c5338),
    sparrowBelly: makeMat(0xe8dcc8),
    sparrowWing: makeMat(0x5e3e29),
    pigeonBody: makeMat(0x7d8794),
    pigeonNeck: makeMat(0x3a6d59, 0.45, 0.18),
    pigeonWingBar: makeMat(0x2c323b),
    gullWhite: makeMat(0xf4f6f9, 0.7),
    gullGrey: makeMat(0x8e99a6, 0.72),
    gullBlack: makeMat(0x1e2229, 0.75),
    raptorBrown: makeMat(0x593d27),
    raptorLight: makeMat(0x8d6840),
    raptorDark: makeMat(0x231d19),
    duckGreen: makeMat(0x1f6b43, 0.48, 0.12),
    duckChest: makeMat(0x6b3a24),
    duckBody: makeMat(0x8c877e),
    duckHen: makeMat(0x7a5c42),
    duckHenWing: makeMat(0x543e2b),
    squirrelRusset: makeMat(0xa6582a),
    squirrelGrey: makeMat(0x797571),
    squirrelCream: makeMat(0xe6dbc8),
    deerTan: makeMat(0x9e7147),
    deerAntler: makeMat(0xd6c7ac),
    foxOrange: makeMat(0xc95522),
    foxDark: makeMat(0x231f1d),
    white: makeMat(0xf4f1ea),
    beakYellow: makeMat(0xf2be22, 0.6),
    beakDark: makeMat(0x262628, 0.6),
    legOrange: makeMat(0xd97245, 0.7),
    eye: makeMat(0x111214, 0.3),
  };
  _assets = { g, m };
  return _assets;
}

function addPart(parent, geom, mat, sx, sy, sz, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(px, py, pz);
  if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function buildBirdModel(kind, variant = 0) {
  const { g, m } = getAssets();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  let wingL = null;
  let wingR = null;
  let headPivot = null;

  if (kind === 'sparrow') {
    addPart(body, g.sphere, m.sparrowBack, 0.085, 0.08, 0.145, 0, 0.12, 0);
    addPart(body, g.sphere, m.sparrowBelly, 0.072, 0.065, 0.12, 0, 0.102, 0.015);
    addPart(body, g.box, m.sparrowWing, 0.07, 0.014, 0.14, 0, 0.13, -0.15, 0.25, 0, 0);
    addPart(body, g.cyl, m.beakDark, 0.012, 0.075, 0.012, -0.025, 0.04, 0);
    addPart(body, g.cyl, m.beakDark, 0.012, 0.075, 0.012, 0.025, 0.04, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.175, 0.105);
    addPart(headPivot, g.sphere, m.sparrowBack, 0.06, 0.056, 0.062, 0, 0, 0);
    addPart(headPivot, g.cone, m.beakYellow, 0.028, 0.05, 0.028, 0, -0.005, 0.068, Math.PI * 0.5, 0, 0);
    addPart(headPivot, g.sphere, m.eye, 0.011, 0.011, 0.011, 0.045, 0.012, 0.032);
    addPart(headPivot, g.sphere, m.eye, 0.011, 0.011, 0.011, -0.045, 0.012, 0.032);
    body.add(headPivot);

    wingL = new THREE.Group();
    wingL.position.set(0.065, 0.135, 0.02);
    addPart(wingL, g.box, m.sparrowWing, 0.21, 0.014, 0.105, 0.105, 0, -0.01, 0, -0.18, 0);
    body.add(wingL);

    wingR = new THREE.Group();
    wingR.position.set(-0.065, 0.135, 0.02);
    addPart(wingR, g.box, m.sparrowWing, 0.21, 0.014, 0.105, -0.105, 0, -0.01, 0, 0.18, 0);
    body.add(wingR);
  } else if (kind === 'pigeon') {
    addPart(body, g.sphere, m.pigeonBody, 0.125, 0.115, 0.205, 0, 0.16, 0);
    addPart(body, g.box, m.pigeonWingBar, 0.11, 0.016, 0.18, 0, 0.165, -0.21, 0.18, 0, 0);
    addPart(body, g.cyl, m.legOrange, 0.016, 0.09, 0.016, -0.038, 0.045, 0.01);
    addPart(body, g.cyl, m.legOrange, 0.016, 0.09, 0.016, 0.038, 0.045, 0.01);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.23, 0.14);
    addPart(headPivot, g.cyl, m.pigeonNeck, 0.105, 0.09, 0.105, 0, 0.01, 0, 0.25, 0, 0);
    addPart(headPivot, g.sphere, m.pigeonBody, 0.065, 0.062, 0.072, 0, 0.072, 0.025);
    addPart(headPivot, g.cone, m.beakDark, 0.026, 0.055, 0.026, 0, 0.062, 0.095, Math.PI * 0.52, 0, 0);
    addPart(headPivot, g.sphere, m.eye, 0.012, 0.012, 0.012, 0.05, 0.082, 0.052);
    addPart(headPivot, g.sphere, m.eye, 0.012, 0.012, 0.012, -0.05, 0.082, 0.052);
    body.add(headPivot);

    wingL = new THREE.Group();
    wingL.position.set(0.095, 0.18, 0.02);
    addPart(wingL, g.box, m.pigeonBody, 0.28, 0.016, 0.15, 0.14, 0, -0.015, 0, -0.18, 0);
    addPart(wingL, g.box, m.pigeonWingBar, 0.24, 0.018, 0.038, 0.13, 0.004, -0.05, 0, -0.18, 0);
    body.add(wingL);

    wingR = new THREE.Group();
    wingR.position.set(-0.095, 0.18, 0.02);
    addPart(wingR, g.box, m.pigeonBody, 0.28, 0.016, 0.15, -0.14, 0, -0.015, 0, 0.18, 0);
    addPart(wingR, g.box, m.pigeonWingBar, 0.24, 0.018, 0.038, -0.13, 0.004, -0.05, 0, 0.18, 0);
    body.add(wingR);
  } else if (kind === 'seagull') {
    addPart(body, g.sphere, m.gullWhite, 0.13, 0.12, 0.29, 0, 0, 0);
    addPart(body, g.box, m.gullWhite, 0.16, 0.018, 0.2, 0, 0.01, -0.28, 0.08, 0, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.05, 0.24);
    addPart(headPivot, g.sphere, m.gullWhite, 0.08, 0.075, 0.095, 0, 0.02, 0.02);
    addPart(headPivot, g.cone, m.beakYellow, 0.034, 0.11, 0.032, 0, 0.005, 0.12, Math.PI * 0.5, 0, 0);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, 0.06, 0.032, 0.055);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, -0.06, 0.032, 0.055);
    body.add(headPivot);

    wingL = new THREE.Group();
    wingL.position.set(0.10, 0.03, 0.03);
    addPart(wingL, g.box, m.gullGrey, 0.36, 0.02, 0.18, 0.18, 0.02, -0.01, 0, -0.12, 0.08);
    addPart(wingL, g.box, m.gullBlack, 0.26, 0.016, 0.12, 0.46, 0.02, -0.06, 0, -0.28, -0.05);
    body.add(wingL);

    wingR = new THREE.Group();
    wingR.position.set(-0.10, 0.03, 0.03);
    addPart(wingR, g.box, m.gullGrey, 0.36, 0.02, 0.18, -0.18, 0.02, -0.01, 0, 0.12, -0.08);
    addPart(wingR, g.box, m.gullBlack, 0.26, 0.016, 0.12, -0.46, 0.02, -0.06, 0, 0.28, 0.05);
    body.add(wingR);
  } else if (kind === 'raptor') {
    const isRaven = variant % 3 === 2;
    const bodyMat = isRaven ? m.raptorDark : m.raptorBrown;
    const headMat = isRaven ? m.raptorDark : m.raptorLight;
    addPart(body, g.sphere, bodyMat, 0.18, 0.16, 0.38, 0, 0, 0);
    addPart(body, g.box, bodyMat, 0.28, 0.022, 0.32, 0, 0.02, -0.42, 0.05, 0, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.06, 0.32);
    addPart(headPivot, g.sphere, headMat, 0.105, 0.095, 0.125, 0, 0.02, 0.02);
    addPart(headPivot, g.cone, isRaven ? m.beakDark : m.beakYellow, 0.045, 0.11, 0.045, 0, 0, 0.14, Math.PI * 0.54, 0, 0);
    body.add(headPivot);

    wingL = new THREE.Group();
    wingL.position.set(0.14, 0.04, 0.05);
    addPart(wingL, g.box, bodyMat, 0.55, 0.026, 0.30, 0.27, 0.02, -0.02, 0, -0.08, 0.05);
    addPart(wingL, g.box, m.raptorDark, 0.36, 0.02, 0.21, 0.68, 0.035, -0.08, 0, -0.22, 0.08);
    body.add(wingL);

    wingR = new THREE.Group();
    wingR.position.set(-0.14, 0.04, 0.05);
    addPart(wingR, g.box, bodyMat, 0.55, 0.026, 0.30, -0.27, 0.02, -0.02, 0, 0.08, -0.05);
    addPart(wingR, g.box, m.raptorDark, 0.36, 0.02, 0.21, -0.68, 0.035, -0.08, 0, 0.22, -0.08);
    body.add(wingR);
  } else if (kind === 'duck') {
    const isDrake = variant % 2 === 0;
    const bodyMat = isDrake ? m.duckBody : m.duckHen;
    const wingMat = isDrake ? m.duckChest : m.duckHenWing;
    addPart(body, g.sphere, bodyMat, 0.17, 0.14, 0.28, 0, 0.08, 0);
    addPart(body, g.sphere, wingMat, 0.145, 0.12, 0.16, 0, 0.095, 0.12);
    addPart(body, g.box, bodyMat, 0.12, 0.03, 0.13, 0, 0.13, -0.26, 0.32, 0, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.17, 0.20);
    addPart(headPivot, g.cyl, isDrake ? m.duckGreen : m.duckHen, 0.10, 0.13, 0.10, 0, 0.04, 0.01, 0.22, 0, 0);
    if (isDrake) addPart(headPivot, g.cyl, m.white, 0.108, 0.024, 0.108, 0, -0.005, 0.002, 0.22, 0, 0);
    addPart(headPivot, g.sphere, isDrake ? m.duckGreen : m.duckHen, 0.075, 0.072, 0.085, 0, 0.12, 0.03);
    addPart(headPivot, g.box, isDrake ? m.beakYellow : m.legOrange, 0.05, 0.024, 0.095, 0, 0.105, 0.12);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, 0.058, 0.135, 0.06);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, -0.058, 0.135, 0.06);
    body.add(headPivot);
  }

  return { root, body, wingL, wingR, headPivot };
}

function buildMammalModel(kind, variant = 0) {
  const { g, m } = getAssets();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  let headPivot = null;
  let tailPivot = null;
  const legs = [];

  if (kind === 'squirrel') {
    const coat = variant % 2 === 0 ? m.squirrelRusset : m.squirrelGrey;
    addPart(body, g.sphere, coat, 0.09, 0.085, 0.165, 0, 0.10, 0);
    addPart(body, g.sphere, m.squirrelCream, 0.068, 0.06, 0.12, 0, 0.08, 0.01);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.15, 0.13);
    addPart(headPivot, g.sphere, coat, 0.065, 0.06, 0.075, 0, 0, 0.01);
    addPart(headPivot, g.cone, coat, 0.026, 0.05, 0.022, 0.038, 0.06, -0.01, -0.1, 0, -0.2);
    addPart(headPivot, g.cone, coat, 0.026, 0.05, 0.022, -0.038, 0.06, -0.01, -0.1, 0, 0.2);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, 0.05, 0.015, 0.045);
    addPart(headPivot, g.sphere, m.eye, 0.013, 0.013, 0.013, -0.05, 0.015, 0.045);
    body.add(headPivot);

    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.12, -0.13);
    addPart(tailPivot, g.sphere, coat, 0.065, 0.13, 0.075, 0, 0.09, -0.04, -0.45, 0, 0);
    addPart(tailPivot, g.sphere, coat, 0.075, 0.13, 0.085, 0, 0.22, -0.02, 0.35, 0, 0);
    body.add(tailPivot);

    const offsets = [[0.055, 0.07, 0.09], [-0.055, 0.07, 0.09], [0.06, 0.07, -0.09], [-0.06, 0.07, -0.09]];
    for (const [lx, ly, lz] of offsets) {
      const lp = new THREE.Group();
      lp.position.set(lx, ly, lz);
      addPart(lp, g.cyl, coat, 0.032, 0.075, 0.032, 0, -0.035, 0);
      body.add(lp);
      legs.push(lp);
    }
  } else if (kind === 'deer') {
    addPart(body, g.sphere, m.deerTan, 0.25, 0.28, 0.56, 0, 0.78, 0);
    addPart(body, g.sphere, m.white, 0.20, 0.20, 0.42, 0, 0.70, 0);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.90, 0.40);
    addPart(headPivot, g.cyl, m.deerTan, 0.17, 0.42, 0.17, 0, 0.18, 0.08, 0.42, 0, 0);
    addPart(headPivot, g.sphere, m.deerTan, 0.12, 0.11, 0.19, 0, 0.37, 0.22);
    addPart(headPivot, g.sphere, m.foxDark, 0.045, 0.04, 0.045, 0, 0.34, 0.39);
    addPart(headPivot, g.cone, m.deerTan, 0.055, 0.14, 0.035, 0.10, 0.47, 0.14, -0.25, 0, -0.55);
    addPart(headPivot, g.cone, m.deerTan, 0.055, 0.14, 0.035, -0.10, 0.47, 0.14, -0.25, 0, 0.55);
    if (variant % 2 === 0) {
      addPart(headPivot, g.cyl, m.deerAntler, 0.025, 0.34, 0.025, 0.08, 0.56, 0.14, -0.15, 0, -0.35);
      addPart(headPivot, g.cyl, m.deerAntler, 0.020, 0.18, 0.020, 0.17, 0.62, 0.18, 0.4, 0, -0.65);
      addPart(headPivot, g.cyl, m.deerAntler, 0.025, 0.34, 0.025, -0.08, 0.56, 0.14, -0.15, 0, 0.35);
      addPart(headPivot, g.cyl, m.deerAntler, 0.020, 0.18, 0.020, -0.17, 0.62, 0.18, 0.4, 0, 0.65);
    }
    body.add(headPivot);

    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.85, -0.50);
    addPart(tailPivot, g.sphere, m.white, 0.06, 0.12, 0.06, 0, -0.04, -0.04, 0.5, 0, 0);
    body.add(tailPivot);

    const offsets = [[0.14, 0.68, 0.34], [-0.14, 0.68, 0.34], [0.15, 0.68, -0.34], [-0.15, 0.68, -0.34]];
    for (const [lx, ly, lz] of offsets) {
      const lp = new THREE.Group();
      lp.position.set(lx, ly, lz);
      addPart(lp, g.cyl, m.deerTan, 0.068, 0.68, 0.068, 0, -0.34, 0);
      addPart(lp, g.cyl, m.foxDark, 0.062, 0.07, 0.062, 0, -0.65, 0);
      body.add(lp);
      legs.push(lp);
    }
  } else if (kind === 'fox') {
    addPart(body, g.sphere, m.foxOrange, 0.15, 0.15, 0.35, 0, 0.37, 0);
    addPart(body, g.sphere, m.white, 0.11, 0.11, 0.14, 0, 0.34, 0.24);

    headPivot = new THREE.Group();
    headPivot.position.set(0, 0.44, 0.29);
    addPart(headPivot, g.sphere, m.foxOrange, 0.10, 0.095, 0.13, 0, 0.02, 0.03);
    addPart(headPivot, g.cone, m.foxOrange, 0.085, 0.14, 0.085, 0, 0.0, 0.15, Math.PI * 0.52, 0, 0);
    addPart(headPivot, g.sphere, m.foxDark, 0.026, 0.024, 0.026, 0, -0.005, 0.22);
    addPart(headPivot, g.cone, m.foxDark, 0.045, 0.11, 0.035, 0.065, 0.11, 0.01, 0.05, 0, -0.2);
    addPart(headPivot, g.cone, m.foxDark, 0.045, 0.11, 0.035, -0.065, 0.11, 0.01, 0.05, 0, 0.2);
    body.add(headPivot);

    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.39, -0.30);
    addPart(tailPivot, g.sphere, m.foxOrange, 0.075, 0.08, 0.22, 0, -0.04, -0.16, -0.28, 0, 0);
    addPart(tailPivot, g.sphere, m.white, 0.065, 0.068, 0.11, 0, -0.09, -0.34, -0.28, 0, 0);
    body.add(tailPivot);

    const offsets = [[0.09, 0.33, 0.21], [-0.09, 0.33, 0.21], [0.095, 0.33, -0.21], [-0.095, 0.33, -0.21]];
    for (const [lx, ly, lz] of offsets) {
      const lp = new THREE.Group();
      lp.position.set(lx, ly, lz);
      addPart(lp, g.cyl, m.foxOrange, 0.048, 0.19, 0.048, 0, -0.09, 0);
      addPart(lp, g.cyl, m.foxDark, 0.044, 0.16, 0.044, 0, -0.25, 0);
      body.add(lp);
      legs.push(lp);
    }
  }

  return { root, body, headPivot, tailPivot, legs };
}

// --------------------------------------------------------------------------- WildlifeSystem

export class WildlifeSystem {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = 'WildlifeSystem';
    this.app.scene.add(this.group);

    this.targetCount = QUALITY.tier === 'low' ? 44 : 66;
    this.animals = [];
    this.cache = new Map(); // 0.25 deg cellKey -> { weights, observedSpecies, source }
    this.observedSpecies = [];
    this.source = 'koppen';
    this.biome = { zone: 'ocean', coastal: false, koppen: 'Cfb' };
    this.weights = normalizeWeights({ sparrow: 0.23, pigeon: 0.17, seagull: 0.12, raptor: 0.10, duck: 0.12, squirrel: 0.13, deer: 0.06, fox: 0.07 });

    this._gen = app.teleportGeneration || 0;
    this._fetchLat = NaN;
    this._fetchLon = NaN;
    this._activeCellKey = '';
    this._inFlightKey = '';
    this._frameTick = 0;
    this._time = 0;
    this._waterSpots = [];
    this._treeSpots = [];
    this._parkTreeSpots = [];
    this._greenSpots = [];
    this._raycaster = new THREE.Raycaster();
    this._rayOrigin = new THREE.Vector3();
    this._rayDown = new THREE.Vector3(0, -1, 0);
    this._spotsRefreshT = 0;
    this._lastChunkCount = 0;
    this._byKind = {};
    for (const k of WILDLIFE_KINDS) this._byKind[k] = 0;

    this._state = {
      activeCount: 0,
      byKind: this._byKind,
      observedSpecies: this.observedSpecies,
      source: this.source,
    };
    window.__WILDLIFE__ = this._state;
  }

  resetForTeleport() {
    for (const a of this.animals) {
      this.group.remove(a.model.root);
    }
    this.animals.length = 0;
    this._waterSpots.length = 0;
    this._treeSpots.length = 0;
    this._parkTreeSpots.length = 0;
    this._greenSpots.length = 0;
    this._spotsRefreshT = 0;
    this._lastChunkCount = 0;
    this._fetchLat = NaN;
    this._fetchLon = NaN;
    this._activeCellKey = '';
    this._inFlightKey = '';
    this._gen = this.app.teleportGeneration || 0;
    this.observedSpecies = [];
    this.source = 'koppen';
    this._updateBiomeOnly();
    this._syncGlobal();
  }

  _latLon() {
    const o = this.app.worldOrigin;
    if (!o || !o.mPerDegLat) return null;
    const p = this.app.pos;
    return [o.centerLat - p.z / o.mPerDegLat, o.centerLon + p.x / o.mPerDegLon];
  }

  _updateBiomeOnly() {
    const ll = this._latLon();
    if (!ll) return;
    const [lat, lon] = ll;
    const seaCoastal = Boolean(this.app.seaState && this.app.seaState.isCoastal);
    const bio = computeBiomeWeights(lat, lon, seaCoastal);
    this.biome = bio;
    this.weights = bio.weights;
  }

  _syncGlobal() {
    for (const k of WILDLIFE_KINDS) this._byKind[k] = 0;
    for (let i = 0; i < this.animals.length; i++) {
      this._byKind[this.animals[i].kind] = (this._byKind[this.animals[i].kind] || 0) + 1;
    }
    this._state.activeCount = this.animals.length;
    this._state.byKind = this._byKind;
    this._state.observedSpecies = this.observedSpecies;
    this._state.source = this.source;
  }

  _checkBiodiversityRefresh() {
    const ll = this._latLon();
    if (!ll) return;
    const [lat, lon] = ll;
    const cellKey = `${(Math.round(lat * 4) / 4).toFixed(2)},${(Math.round(lon * 4) / 4).toFixed(2)}`;
    const gen = this.app.teleportGeneration || 0;

    let distM = Infinity;
    if (Number.isFinite(this._fetchLat) && Number.isFinite(this._fetchLon)) {
      const dLat = (lat - this._fetchLat) * 111000;
      const dLon = (lon - this._fetchLon) * 111000 * Math.cos((lat * Math.PI) / 180);
      distM = Math.hypot(dLat, dLon);
    }

    if (gen === this._gen && distM < REFETCH_DIST_M && this._activeCellKey === cellKey) {
      return;
    }

    this._gen = gen;
    this._fetchLat = lat;
    this._fetchLon = lon;
    this._activeCellKey = cellKey;

    const cached = this.cache.get(cellKey);
    if (cached) {
      this.weights = cached.weights;
      this.observedSpecies = cached.observedSpecies;
      this.source = 'inaturalist';
      this._syncGlobal();
      return;
    }

    this._updateBiomeOnly();
    this.observedSpecies = [];
    this.source = 'koppen';
    this._syncGlobal();

    if (this._inFlightKey === cellKey) return;
    this._inFlightKey = cellKey;
    this._fetchINaturalist(lat, lon, cellKey, gen);
  }

  async _fetchINaturalist(lat, lon, cellKey, reqGen) {
    try {
      const url = `${INAT_URL}?lat=${lat.toFixed(4)}&lng=${lon.toFixed(4)}&radius=25&iconic_taxa=Aves,Mammalia&per_page=24`;
      const opts = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? { signal: AbortSignal.timeout(6000) }
        : {};
      const res = await fetch(url, opts);
      if (!res.ok) return;
      const data = await res.json();
      const results = Array.isArray(data && data.results) ? data.results : [];
      if (results.length === 0) return;

      const rawCounts = {};
      for (const k of WILDLIFE_KINDS) rawCounts[k] = 0;
      const observed = [];

      for (const item of results) {
        const taxon = item && item.taxon;
        if (!taxon) continue;
        const kind = classifyTaxon(taxon);
        const count = Math.max(1, Number(item.count) || 1);
        if (kind) {
          rawCounts[kind] += Math.sqrt(count);
        }
        observed.push({
          commonName: taxon.preferred_common_name || taxon.name || '',
          name: taxon.name || '',
          count,
          kind: kind || 'other',
        });
      }

      const inatNorm = normalizeWeights(rawCounts);
      const seaCoastal = Boolean(this.app.seaState && this.app.seaState.isCoastal);
      const bio = computeBiomeWeights(lat, lon, seaCoastal);
      const blended = {};
      for (const k of WILDLIFE_KINDS) {
        blended[k] = 0.80 * inatNorm[k] + 0.20 * bio.weights[k];
      }
      const entry = {
        weights: normalizeWeights(blended),
        observedSpecies: observed,
        source: 'inaturalist',
      };
      this.cache.set(cellKey, entry);

      if (this._gen === reqGen && this._activeCellKey === cellKey) {
        this.weights = entry.weights;
        this.observedSpecies = entry.observedSpecies;
        this.source = 'inaturalist';
        this._syncGlobal();
      }
    } catch (_) {
      // Offline / timeout fallback already active via Koeppen biome weights.
    } finally {
      if (this._inFlightKey === cellKey) this._inFlightKey = '';
    }
  }

  // --------------------------------------------------------------------------- Spatial Queries

  _groundY(x, z) {
    const minTerr = Math.max(
      getBeijingTerrainElevation(x, z) + 0.16,
      getChunkTerrainMeshElevation(x, z) + 0.08
    );
    const surf = this.app.sampleRoadSurface ? this.app.sampleRoadSurface(x, minTerr + 0.5, z) : null;
    return surf ? Math.max(surf.y, minTerr) : minTerr;
  }

  _isWater(x, z) {
    const w = this.app.water;
    if (!w || typeof w.isPointInWater !== 'function') return false;
    return Boolean(w.isPointInWater(x, z));
  }

  _isSupportedWater(x, z) {
    const w = this.app.water;
    if (!w || !w.isPointInWater(x, z)) return false;
    if (typeof w._roadSupports === 'function' && w._roadSupports(x, z)) return false;
    return true;
  }

  _waterY(x, z) {
    const w = this.app.water;
    if (w && typeof w.getWaterSurfaceY === 'function') return w.getWaterSurfaceY(x, z);
    return getBeijingTerrainElevation(x, z) + 0.18;
  }

  _isCarLane(x, z, gy) {
    const surf = this.app.sampleRoadSurface ? this.app.sampleRoadSurface(x, gy + 0.5, z) : null;
    if (!surf || !surf.seg) return false;
    const s = surf.seg;
    if (NON_CAR_CLS.has(s.cls)) return false;
    const vx = s.x2 - s.x1;
    const vz = s.z2 - s.z1;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 1e-6 ? ((x - s.x1) * vx + (z - s.z1) * vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.x1 + vx * t), z - (s.z1 + vz * t));
    return d < (s.width || 6) * 0.5 + 0.9;
  }

  _isBuilding(x, z, gy, margin = 0.8) {
    if (this.app.collision && typeof this.app.collision.insideAny === 'function') {
      if (this.app.collision.insideAny(x, z, gy)) return true;
    }
    if (typeof this.app.getBuildingCeilingAt === 'function') {
      if (this.app.getBuildingCeilingAt(x, gy, z, margin) != null) return true;
    }
    return false;
  }

  _buildingCeil(x, z, gy, margin = 2.0) {
    if (typeof this.app.getBuildingCeilingAt === 'function') {
      return this.app.getBuildingCeilingAt(x, gy, z, margin);
    }
    return null;
  }

  _isAnyRoad(x, z, gy, pad = 1.1) {
    const surf = this.app.sampleRoadSurface ? this.app.sampleRoadSurface(x, gy + 0.5, z) : null;
    if (!surf) return false;
    const s = surf.seg;
    if (!s) return true; // deck / pier
    const vx = s.x2 - s.x1;
    const vz = s.z2 - s.z1;
    const len2 = vx * vx + vz * vz;
    let t = len2 > 1e-6 ? ((x - s.x1) * vx + (z - s.z1) * vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.x1 + vx * t), z - (s.z1 + vz * t));
    return d < (s.width || 5) * 0.5 + pad;
  }

  _sampleGroundSurfaceKind(x, z, gy) {
    const chunks = this.app.loadedChunks;
    if (!chunks || chunks.size === 0) return 'unknown';
    let targetChunk = null;
    for (const ch of chunks.values()) {
      if (Math.abs(x - ch.position.x) <= 500 && Math.abs(z - ch.position.z) <= 500) {
        targetChunk = ch;
        break;
      }
    }
    const tg = targetChunk && targetChunk.userData && targetChunk.userData.subGroups && targetChunk.userData.subGroups.terrain;
    if (!tg || !tg.children || tg.children.length === 0) return 'unknown';
    const meshes = [];
    for (let i = 0; i < tg.children.length; i++) {
      const m = tg.children[i];
      if (m.isMesh && m.material && m.material.vertexColors && m.geometry && m.geometry.attributes && m.geometry.attributes.position) {
        meshes.push(m);
      }
    }
    if (meshes.length === 0) return 'unknown';
    this._rayOrigin.set(x, gy + 30, z);
    this._raycaster.set(this._rayOrigin, this._rayDown);
    this._raycaster.far = 80;
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (!hits || hits.length === 0) return 'unknown';
    const hit = hits[0];
    const mat = hit.object.material;
    if (mat.polygonOffsetFactor === 2) return 'park';
    const face = hit.face;
    const col = hit.object.geometry.attributes.color;
    const r = col && face ? col.getX(face.a) : 0;
    const g = col && face ? col.getY(face.a) : 0;
    const b = col && face ? col.getZ(face.a) : 0;
    if (mat.name === 'landcoverMat') {
      return (g > r * 1.10 && g > b * 1.18) ? 'green' : 'urban';
    }
    if (mat.polygonOffsetFactor === 4) {
      const uv = hit.object.geometry.attributes.uv;
      const built = uv && face ? uv.getX(face.a) : 1;
      if (built > 0.22) return 'urban';
      return (g > r * 1.04 && g > b * 1.10) ? 'green' : 'urban';
    }
    return 'unknown';
  }

  _isGreenGroundAt(x, z, gy) {
    if (this._isWater(x, z)) return false;
    if (this._isBuilding(x, z, gy, 1.2)) return false;
    if (this._isAnyRoad(x, z, gy, 1.2)) return false;
    const k = this._sampleGroundSurfaceKind(x, z, gy);
    return k === 'park' || k === 'green';
  }

  _isNearTree(x, z, maxDist = 12) {
    const maxD2 = maxDist * maxDist;
    for (let i = 0; i < this._treeSpots.length; i += 2) {
      const dx = x - this._treeSpots[i];
      const dz = z - this._treeSpots[i + 1];
      if (dx * dx + dz * dz <= maxD2) return true;
    }
    return false;
  }

  _isValidGroundSpot(x, z, margin = 0.85) {
    if (this._isWater(x, z)) return false;
    const gy = this._groundY(x, z);
    if (this._isBuilding(x, z, gy, margin)) return false;
    if (this._isCarLane(x, z, gy)) return false;
    return gy;
  }

  _refreshLocalSpots() {
    const p = this.app.pos;
    const chunks = this.app.loadedChunks;
    if (!chunks || chunks.size === 0) return;

    this._treeSpots.length = 0;
    this._parkTreeSpots.length = 0;
    const maxR2 = SPAWN_MAX_R * SPAWN_MAX_R;
    for (const chunk of chunks.values()) {
      const v = chunk.userData && chunk.userData.vegInstances;
      if (!v || !v.count || !v.inst) continue;
      const streetCount = v.streetCount || 0;
      const spArr = v.species;
      const step = Math.max(1, Math.floor(v.count / 70));
      for (let i = 0; i < v.count && this._treeSpots.length < 260; i += step) {
        if (spArr && spArr[i] === 4) continue; // skip low bushes for tree spots
        const o = i * INST_STRIDE;
        const tx = v.inst[o];
        const tz = v.inst[o + 2];
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 64 && d2 < maxR2) {
          this._treeSpots.push(tx, tz);
        }
      }
      if (v.count > streetCount) {
        const pStep = Math.max(1, Math.floor((v.count - streetCount) / 48));
        for (let i = streetCount; i < v.count && this._parkTreeSpots.length < 180; i += pStep) {
          const o = i * INST_STRIDE;
          const tx = v.inst[o];
          const tz = v.inst[o + 2];
          const dx = tx - p.x;
          const dz = tz - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 64 && d2 < maxR2) {
            this._parkTreeSpots.push(tx, tz);
          }
        }
      }
    }

    // Build validated park/forest/meadow spots (never downtown concrete or roadways)
    this._greenSpots.length = 0;
    for (let i = 0; i < 40 && this._greenSpots.length < 48 && this._parkTreeSpots.length >= 2; i++) {
      const idx = Math.floor(Math.random() * (this._parkTreeSpots.length >> 1)) * 2;
      const gx = this._parkTreeSpots[idx] + randRange(-9, 9);
      const gz = this._parkTreeSpots[idx + 1] + randRange(-9, 9);
      const d = Math.hypot(gx - p.x, gz - p.z);
      if (d < SPAWN_MIN_R || d > SPAWN_MAX_R) continue;
      const gy = this._isValidGroundSpot(gx, gz, 1.15);
      if (gy !== false && this._isGreenGroundAt(gx, gz, gy)) {
        this._greenSpots.push(gx, gz);
      }
    }
    for (let i = 0; i < 42 && this._greenSpots.length < 48; i++) {
      const r = randRange(SPAWN_MIN_R, SPAWN_MAX_R);
      const a = Math.random() * Math.PI * 2;
      const gx = p.x + Math.cos(a) * r;
      const gz = p.z + Math.sin(a) * r;
      const gy = this._isValidGroundSpot(gx, gz, 1.15);
      if (gy !== false && this._isGreenGroundAt(gx, gz, gy)) {
        this._greenSpots.push(gx, gz);
      }
    }

    this._waterSpots.length = 0;
    for (let i = 0; i < 96 && this._waterSpots.length < 56; i++) {
      const r = randRange(14, SPAWN_MAX_R + 15);
      const a = Math.random() * Math.PI * 2;
      const wx = p.x + Math.cos(a) * r;
      const wz = p.z + Math.sin(a) * r;
      if (this._isSupportedWater(wx, wz)) {
        const wy = this._waterY(wx, wz);
        if (!this._isBuilding(wx, wz, wy, 1.0)) {
          this._waterSpots.push(wx, wz);
        }
      }
    }
  }

  // --------------------------------------------------------------------------- Spawning & Recycling

  _pickKind(hasWater, hasGreen, hasTrees) {
    let total = 0;
    for (const k of WILDLIFE_KINDS) {
      if (k === 'duck' && !hasWater) continue;
      if ((k === 'fox' || k === 'deer') && !hasGreen) continue;
      if (k === 'squirrel' && !hasGreen && !hasTrees) continue;
      total += this.weights[k] || 0;
    }
    if (total <= 1e-9) return Math.random() < 0.55 ? 'pigeon' : 'sparrow';
    let r = Math.random() * total;
    for (const k of WILDLIFE_KINDS) {
      if (k === 'duck' && !hasWater) continue;
      if ((k === 'fox' || k === 'deer') && !hasGreen) continue;
      if (k === 'squirrel' && !hasGreen && !hasTrees) continue;
      r -= this.weights[k] || 0;
      if (r <= 0) return k;
    }
    return 'sparrow';
  }

  _findGroundSpawn(preferTree, minR = SPAWN_MIN_R, maxR = SPAWN_MAX_R) {
    const p = this.app.pos;
    if (preferTree && this._treeSpots.length >= 2) {
      for (let t = 0; t < 6; t++) {
        const idx = Math.floor(Math.random() * (this._treeSpots.length >> 1)) * 2;
        const tx = this._treeSpots[idx] + randRange(-10, 10);
        const tz = this._treeSpots[idx + 1] + randRange(-10, 10);
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d < minR || d > maxR) continue;
        const gy = this._isValidGroundSpot(tx, tz, 0.9);
        if (gy !== false) return { x: tx, y: gy, z: tz };
      }
    }
    for (let t = 0; t < 10; t++) {
      const r = randRange(minR, maxR);
      const a = Math.random() * Math.PI * 2;
      const gx = p.x + Math.cos(a) * r;
      const gz = p.z + Math.sin(a) * r;
      const gy = this._isValidGroundSpot(gx, gz, 0.9);
      if (gy !== false) return { x: gx, y: gy, z: gz };
    }
    return null;
  }

  _findWaterSpawn() {
    if (this._waterSpots.length >= 2) {
      const idx = Math.floor(Math.random() * (this._waterSpots.length >> 1)) * 2;
      const wx = this._waterSpots[idx] + randRange(-8, 8);
      const wz = this._waterSpots[idx + 1] + randRange(-8, 8);
      if (this._isSupportedWater(wx, wz)) {
        const wy = this._waterY(wx, wz);
        if (!this._isBuilding(wx, wz, wy, 1.0)) return { x: wx, y: wy, z: wz };
      }
    }
    const p = this.app.pos;
    for (let t = 0; t < 14; t++) {
      const r = randRange(16, SPAWN_MAX_R);
      const a = Math.random() * Math.PI * 2;
      const wx = p.x + Math.cos(a) * r;
      const wz = p.z + Math.sin(a) * r;
      if (this._isSupportedWater(wx, wz)) {
        const wy = this._waterY(wx, wz);
        if (!this._isBuilding(wx, wz, wy, 1.0)) return { x: wx, y: wy, z: wz };
      }
    }
    return null;
  }

  _addAnimalInstance(kind, pos, state, alt) {
    const variant = Math.floor(Math.random() * 6);
    const model = (kind === 'squirrel' || kind === 'deer' || kind === 'fox')
      ? buildMammalModel(kind, variant)
      : buildBirdModel(kind, variant);

    const animal = {
      kind,
      variant,
      model,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      anchorX: pos.x,
      anchorZ: pos.z,
      heading: Math.random() * Math.PI * 2,
      speed: 0,
      targetAlt: alt,
      orbitR: kind === 'raptor' ? randRange(42, 95) : randRange(28, 72),
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      state,
      timer: randRange(1.0, 5.0),
      phase: Math.random() * Math.PI * 2,
      flapTimer: randRange(0, 4.0),
      startledT: 0,
    };

    const visScale = kind === 'sparrow' ? 1.2 : kind === 'pigeon' ? 1.15 : kind === 'squirrel' ? 1.22 : kind === 'seagull' ? 1.1 : 1.0;
    if (visScale !== 1.0) model.root.scale.setScalar(visScale);
    model.root.position.set(animal.x, animal.y, animal.z);
    model.root.rotation.y = animal.heading;
    this.group.add(model.root);
    this.animals.push(animal);
    return animal;
  }

  _findGreenSpawn(minR = SPAWN_MIN_R, maxR = SPAWN_MAX_R) {
    const p = this.app.pos;
    if (this._greenSpots.length >= 2) {
      for (let t = 0; t < 10; t++) {
        const idx = Math.floor(Math.random() * (this._greenSpots.length >> 1)) * 2;
        const gx = this._greenSpots[idx] + randRange(-5, 5);
        const gz = this._greenSpots[idx + 1] + randRange(-5, 5);
        const d = Math.hypot(gx - p.x, gz - p.z);
        if (d < minR || d > maxR) continue;
        const gy = this._isValidGroundSpot(gx, gz, 1.15);
        if (gy !== false && this._isGreenGroundAt(gx, gz, gy)) return { x: gx, y: gy, z: gz };
      }
      // Fallback: pick any validated cached green spot without radius tightening
      const idx = Math.floor(Math.random() * (this._greenSpots.length >> 1)) * 2;
      const gx = this._greenSpots[idx];
      const gz = this._greenSpots[idx + 1];
      const gy = this._isValidGroundSpot(gx, gz, 1.15);
      if (gy !== false && this._isGreenGroundAt(gx, gz, gy)) return { x: gx, y: gy, z: gz };
    }
    return null;
  }

  _findSquirrelSpawn(minR = SPAWN_MIN_R, maxR = SPAWN_MAX_R) {
    const green = this._findGreenSpawn(minR, maxR);
    if (green) return green;
    const p = this.app.pos;
    if (this._treeSpots.length >= 2) {
      for (let t = 0; t < 10; t++) {
        const idx = Math.floor(Math.random() * (this._treeSpots.length >> 1)) * 2;
        const tx = this._treeSpots[idx] + randRange(-8, 8);
        const tz = this._treeSpots[idx + 1] + randRange(-8, 8);
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d < minR || d > maxR) continue;
        const gy = this._isValidGroundSpot(tx, tz, 0.9);
        if (gy === false || this._isAnyRoad(tx, tz, gy, 1.2)) continue;
        const surfKind = this._sampleGroundSurfaceKind(tx, tz, gy);
        if (surfKind === 'park' || surfKind === 'green' || (surfKind !== 'urban' && this._isNearTree(tx, tz, 12))) {
          return { x: tx, y: gy, z: tz };
        }
      }
    }
    return null;
  }

  _spawnOne(preferClose = false) {
    const hasWater = this._waterSpots.length >= 2;
    const hasGreen = this._greenSpots.length >= 2;
    const hasTrees = this._treeSpots.length >= 2;
    let kind = this._pickKind(hasWater, hasGreen, hasTrees);
    const p = this.app.pos;
    const minR = preferClose ? 12 : 28;
    const maxR = preferClose ? 95 : SPAWN_MAX_R;

    let pos = null;
    let state = 'ground';
    let alt = 0;

    if (kind === 'duck') {
      pos = this._findWaterSpawn();
      if (!pos) kind = 'sparrow';
      else state = 'water';
    }

    if (kind === 'fox' || kind === 'deer') {
      pos = this._findGreenSpawn(minR, maxR);
      if (!pos) kind = Math.random() < 0.5 ? 'pigeon' : 'sparrow';
    } else if (kind === 'squirrel') {
      pos = this._findSquirrelSpawn(minR, maxR);
      if (!pos) kind = Math.random() < 0.5 ? 'pigeon' : 'sparrow';
    }

    if (kind === 'seagull') {
      let cx = p.x;
      let cz = p.z;
      if (hasWater && Math.random() < 0.72) {
        const idx = Math.floor(Math.random() * (this._waterSpots.length >> 1)) * 2;
        cx = this._waterSpots[idx];
        cz = this._waterSpots[idx + 1];
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = randRange(minR, maxR * 0.75);
        cx = p.x + Math.cos(a) * r;
        cz = p.z + Math.sin(a) * r;
      }
      const gy = this._groundY(cx, cz);
      const ceil = this._buildingCeil(cx, cz, gy, 2.5);
      alt = randRange(14, 48);
      const y = Math.max(gy + alt, ceil != null ? ceil + 6.5 : -Infinity);
      pos = { x: cx, y, z: cz };
      state = 'air';
    } else if (kind === 'raptor') {
      const a = Math.random() * Math.PI * 2;
      const r = randRange(25, maxR);
      const cx = p.x + Math.cos(a) * r;
      const cz = p.z + Math.sin(a) * r;
      const gy = this._groundY(cx, cz);
      const ceil = this._buildingCeil(cx, cz, gy, 3.0);
      alt = randRange(35, 95);
      const y = Math.max(gy + alt, ceil != null ? ceil + 10 : -Infinity);
      pos = { x: cx, y, z: cz };
      state = 'air';
    } else if (kind !== 'duck' && !pos) {
      const preferTree = kind === 'sparrow';
      pos = this._findGroundSpawn(preferTree, minR, maxR);
      if (!pos && (kind === 'sparrow' || kind === 'pigeon')) {
        const a = Math.random() * Math.PI * 2;
        const r = randRange(minR, maxR);
        const ax = p.x + Math.cos(a) * r;
        const az = p.z + Math.sin(a) * r;
        const gy = this._groundY(ax, az);
        const ceil = this._buildingCeil(ax, az, gy, 2.0);
        alt = randRange(8, 20);
        pos = { x: ax, y: Math.max(gy + alt, ceil != null ? ceil + 6 : -Infinity), z: az };
        state = 'air';
      }
      if (!pos) return null;
      if (kind === 'sparrow' && Math.random() < 0.35) {
        state = 'air';
        alt = randRange(5, 16);
        const ceil = this._buildingCeil(pos.x, pos.z, pos.y, 2.0);
        pos.y = Math.max(pos.y + alt, ceil != null ? ceil + 6 : -Infinity);
      }
    }

    const first = this._addAnimalInstance(kind, pos, state, alt);

    // Small flock clustering for sparrows & pigeons
    if ((kind === 'sparrow' || kind === 'pigeon') && this.animals.length < this.targetCount - 2 && Math.random() < 0.45) {
      const extra = kind === 'sparrow' ? 2 : 1;
      for (let f = 0; f < extra && this.animals.length < this.targetCount; f++) {
        const fx = pos.x + randRange(-4.5, 4.5);
        const fz = pos.z + randRange(-4.5, 4.5);
        if (state === 'ground') {
          const gy = this._isValidGroundSpot(fx, fz, 0.85);
          if (gy !== false) this._addAnimalInstance(kind, { x: fx, y: gy, z: fz }, 'ground', 0);
        } else {
          const gy = this._groundY(fx, fz);
          const ceil = this._buildingCeil(fx, fz, gy, 2.0);
          const fy = Math.max(gy + alt + randRange(-1.5, 1.5), ceil != null ? ceil + 6 : -Infinity);
          this._addAnimalInstance(kind, { x: fx, y: fy, z: fz }, 'air', alt);
        }
      }
    }

    return first;
  }

  // --------------------------------------------------------------------------- Frame Update

  update(dt) {
    if (!this.app.loadedChunks || this.app.loadedChunks.size === 0) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt || 0.016));
    this._time += clampedDt;
    this._frameTick++;

    this._checkBiodiversityRefresh();

    const chunksChanged = this.app.loadedChunks.size !== this._lastChunkCount;
    this._spotsRefreshT -= clampedDt;
    if (this._spotsRefreshT <= 0 || chunksChanged) {
      this._spotsRefreshT = 2.5;
      this._lastChunkCount = this.app.loadedChunks.size;
      this._refreshLocalSpots();
      if (chunksChanged) this._revalidateAllGroundAndWater();
    }

    const p = this.app.pos;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d > RECYCLE_R) {
        this.group.remove(a.model.root);
        this.animals.splice(i, 1);
      }
    }

    if (this.animals.length < this.targetCount) {
      const budget = this.animals.length < 16 ? 8 : 3;
      const preferClose = this.animals.length < 24;
      for (let s = 0; s < budget && this.animals.length < this.targetCount; s++) {
        this._spawnOne(preferClose);
      }
      this._syncGlobal();
    }

    const waveAmp = this.app.seaState ? clamp(this.app.seaState.waveHeight || 0.4, 0.1, 2.0) : 0.4;
    for (let i = 0; i < this.animals.length; i++) {
      this._stepAnimal(this.animals[i], clampedDt, p, waveAmp, (i + this._frameTick) % 3 === 0);
    }

    if (this._frameTick % 15 === 0) {
      this._syncGlobal();
    }
  }

  _revalidateAllGroundAndWater() {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.state === 'ground') {
        const margin = a.kind === 'deer' ? 1.15 : 0.9;
        const validBase = this._isValidGroundSpot(a.x, a.z, margin);
        const validHabitat = validBase !== false && (
          (a.kind !== 'fox' && a.kind !== 'deer') || this._isGreenGroundAt(a.x, a.z, validBase)
        );
        if (!validHabitat) {
          if (a.kind === 'sparrow' || a.kind === 'pigeon') {
            a.state = 'air';
            a.timer = randRange(3.5, 6.5);
            a.speed = a.kind === 'pigeon' ? 9.0 : 7.8;
            a.targetAlt = randRange(8, 18);
          } else {
            const safe = (a.kind === 'fox' || a.kind === 'deer')
              ? this._findGreenSpawn(12, 180)
              : a.kind === 'squirrel'
                ? this._findSquirrelSpawn(12, 160)
                : this._findGroundSpawn(true, 12, 160);
            if (safe) {
              a.x = safe.x;
              a.y = safe.y;
              a.z = safe.z;
              a.anchorX = safe.x;
              a.anchorZ = safe.z;
              a._groundY = safe.y;
              a.model.root.position.set(a.x, a.y, a.z);
            } else {
              this.group.remove(a.model.root);
              this.animals.splice(i, 1);
            }
          }
        }
      } else if (a.kind === 'duck') {
        if (!this._isSupportedWater(a.x, a.z) || this._isBuilding(a.x, a.z, a.y, 1.0)) {
          const safeW = this._findWaterSpawn();
          if (safeW) {
            a.x = safeW.x;
            a.y = safeW.y;
            a.z = safeW.z;
            a.model.root.position.set(a.x, a.y, a.z);
          } else {
            this.group.remove(a.model.root);
            this.animals.splice(i, 1);
          }
        }
      }
    }
  }

  _stepAnimal(a, dt, playerPos, waveAmp, doGridCheck) {
    const dxP = a.x - playerPos.x;
    const dyP = a.y - playerPos.y;
    const dzP = a.z - playerPos.z;
    const distPlayer = Math.hypot(dxP, dyP, dzP);
    if (a.startledT > 0) a.startledT = Math.max(0, a.startledT - dt);

    const k = a.kind;
    if (k === 'seagull' || k === 'raptor') {
      this._stepSoaringBird(a, dt, doGridCheck);
    } else if (k === 'duck') {
      this._stepDuck(a, dt, waveAmp, doGridCheck);
    } else if (k === 'sparrow' || k === 'pigeon') {
      this._stepUrbanBird(a, dt, distPlayer, dxP, dzP, doGridCheck);
    } else {
      this._stepMammal(a, dt, distPlayer, dxP, dzP, doGridCheck);
    }

    a.model.root.position.set(a.x, a.y, a.z);
    a.model.root.rotation.y = a.heading;
  }

  _stepSoaringBird(a, dt, doGridCheck) {
    const isRaptor = a.kind === 'raptor';
    const spd = isRaptor ? 13.5 : 10.5;
    const angularV = (spd / a.orbitR) * a.orbitDir;
    const prevH = a.heading;
    a.phase += Math.abs(angularV) * dt;

    const targetX = a.anchorX + Math.cos(a.phase) * a.orbitR;
    const targetZ = a.anchorZ + Math.sin(a.phase) * a.orbitR;
    const desiredH = Math.atan2(targetX - a.x, targetZ - a.z);
    const diff = wrapAngle(desiredH - a.heading);
    a.heading = wrapAngle(a.heading + clamp(diff, -2.2 * dt, 2.2 * dt));
    a.x += Math.sin(a.heading) * spd * dt;
    a.z += Math.cos(a.heading) * spd * dt;

    const turnRate = wrapAngle(a.heading - prevH) / dt;
    const targetRoll = clamp(-turnRate * 0.45, -0.45, 0.45);
    a.model.body.rotation.z = lerp(a.model.body.rotation.z, targetRoll, Math.min(1, dt * 4));

    const gy = this._groundY(a.x, a.z);
    const ceil = this._buildingCeil(a.x, a.z, gy, 2.5);
    const minClear = Math.max(gy + (isRaptor ? 34 : 14), ceil != null ? ceil + (isRaptor ? 9 : 6.5) : -Infinity);
    a._minClearY = minClear;
    const baseTargetY = minClear + Math.sin(this._time * 0.55 + a.phase) * (isRaptor ? 3.5 : 2.2);
    a.y = Math.max(minClear, lerp(a.y, Math.max(minClear, baseTargetY), Math.min(1, dt * 2.5)));

    a.flapTimer -= dt;
    if (a.flapTimer < -5.5) a.flapTimer = randRange(1.6, 2.8);
    const flapping = a.flapTimer > 0;
    const flapAngle = flapping
      ? Math.sin(this._time * (isRaptor ? 7.5 : 10.5) + a.phase) * 0.48
      : 0.06 + Math.sin(this._time * 1.4 + a.phase) * 0.03;
    a.model.wingL.rotation.z = flapAngle;
    a.model.wingR.rotation.z = -flapAngle;
  }

  _stepDuck(a, dt, waveAmp, doGridCheck) {
    a.timer -= dt;
    if (a.timer <= 0) {
      a.timer = randRange(2.5, 6.0);
      a.heading = wrapAngle(a.heading + randRange(-1.1, 1.1));
      a.speed = Math.random() < 0.25 ? 0.2 : randRange(0.7, 1.35);
    }

    const nx = a.x + Math.sin(a.heading) * a.speed * dt;
    const nz = a.z + Math.cos(a.heading) * a.speed * dt;
    if (doGridCheck || a.speed > 0.5) {
      if (this._isSupportedWater(nx, nz) && !this._isBuilding(nx, nz, a.y, 1.0)) {
        a.x = nx;
        a.z = nz;
      } else {
        a.heading = wrapAngle(a.heading + Math.PI * 0.72 + randRange(-0.4, 0.4));
      }
    } else {
      a.x = nx;
      a.z = nz;
    }

    const wy = this._waterY(a.x, a.z);
    const bob = Math.sin(this._time * 2.4 + a.phase) * 0.025 * Math.min(1.5, waveAmp + 0.5);
    a.y = wy - 0.03 + bob;
    a.model.body.rotation.x = Math.sin(this._time * 1.9 + a.phase) * 0.04;
    a.model.body.rotation.z = Math.cos(this._time * 2.1 + a.phase) * 0.04;
    if (a.model.headPivot) {
      a.model.headPivot.rotation.x = Math.sin(this._time * 1.3 + a.phase) > 0.75 ? 0.42 : Math.sin(this._time * 2.0 + a.phase) * 0.06;
    }
  }

  _stepUrbanBird(a, dt, distPlayer, dxP, dzP, doGridCheck) {
    const isPigeon = a.kind === 'pigeon';
    const scareR = isPigeon ? 10.0 : 7.5;

    if (a.state === 'ground' && distPlayer < scareR) {
      a.state = 'air';
      a.startledT = 5.5;
      a.timer = randRange(4.5, 8.0);
      a.heading = wrapAngle(Math.atan2(dxP, dzP) + randRange(-0.5, 0.5));
      a.speed = isPigeon ? 9.5 : 8.0;
      a.targetAlt = randRange(9, 22);
    }

    if (a.state === 'air') {
      a.timer -= dt;
      a.heading = wrapAngle(a.heading + Math.sin(this._time * 0.9 + a.phase) * 0.85 * dt);
      const spd = a.speed || (isPigeon ? 9.5 : 8.0);
      a.x += Math.sin(a.heading) * spd * dt;
      a.z += Math.cos(a.heading) * spd * dt;

      const gy = this._groundY(a.x, a.z);
      const ceil = this._buildingCeil(a.x, a.z, gy, 2.0);
      a._groundY = gy;
      const minClear = Math.max(gy + 5.0, ceil != null ? ceil + 6.0 : -Infinity);
      a._minClearY = Math.max(gy + (a.targetAlt || 10), minClear);
      const targetY = a._minClearY + Math.sin(this._time * 1.6 + a.phase) * 1.5;
      a.y = Math.max(minClear, lerp(a.y, targetY, Math.min(1, dt * 3.5)));

      const flap = Math.sin(this._time * (isPigeon ? 18 : 22) + a.phase) * 0.72;
      a.model.wingL.rotation.z = flap;
      a.model.wingR.rotation.z = -flap;
      a.model.body.rotation.x = -0.12;
      a.model.body.rotation.z = lerp(a.model.body.rotation.z, 0, Math.min(1, dt * 4));
      if (a.model.headPivot) a.model.headPivot.rotation.x = 0;

      if (a.timer <= 0 && distPlayer > scareR + 4) {
        const landY = this._isValidGroundSpot(a.x, a.z, 0.9);
        if (landY !== false) {
          a.state = 'ground';
          a.y = landY;
          a.timer = randRange(3.0, 7.0);
          a.speed = 0;
        } else {
          a.timer = 1.5;
        }
      }
      return;
    }

    a.timer -= dt;
    if (a.timer <= 0) {
      if (!isPigeon && Math.random() < 0.28) {
        a.state = 'air';
        a.timer = randRange(4.0, 7.5);
        a.speed = 7.8;
        a.targetAlt = randRange(5, 16);
        return;
      }
      a.timer = randRange(1.5, 4.5);
      a.heading = wrapAngle(a.heading + randRange(-1.8, 1.8));
      a.speed = Math.random() < 0.35 ? 0 : (isPigeon ? randRange(0.65, 1.15) : randRange(0.9, 1.5));
    }

    if (a.speed > 0.05) {
      const nx = a.x + Math.sin(a.heading) * a.speed * dt;
      const nz = a.z + Math.cos(a.heading) * a.speed * dt;
      const landY = this._isValidGroundSpot(nx, nz, 0.9);
      if (landY !== false) {
        a.x = nx;
        a.z = nz;
        a._groundY = landY;
      } else {
        a.heading = wrapAngle(a.heading + Math.PI * 0.75 + randRange(-0.4, 0.4));
      }
    } else if (doGridCheck) {
      const curY = this._isValidGroundSpot(a.x, a.z, 0.9);
      if (curY === false) {
        a.state = 'air';
        a.timer = randRange(3.5, 6.5);
        a.speed = isPigeon ? 9.0 : 7.8;
        a.targetAlt = randRange(8, 18);
        return;
      }
      a._groundY = curY;
    }

    const baseG = Number.isFinite(a._groundY) ? a._groundY : this._groundY(a.x, a.z);
    const hop = (!isPigeon && a.speed > 0.1) ? Math.abs(Math.sin(this._time * 12 + a.phase)) * 0.08 : 0;
    a.y = baseG + hop;
    a.model.wingL.rotation.z = -0.35;
    a.model.wingR.rotation.z = 0.35;
    a.model.body.rotation.x = (!isPigeon && a.speed < 0.1 && Math.sin(this._time * 3 + a.phase) > 0.65) ? 0.35 : 0;
    if (a.model.headPivot) {
      if (isPigeon) {
        a.model.headPivot.rotation.x = a.speed > 0.1
          ? Math.sin(this._time * 10 + a.phase) * 0.25
          : (Math.sin(this._time * 3.5 + a.phase) > 0.5 ? 0.55 : 0.05);
      } else {
        a.model.headPivot.rotation.x = a.speed < 0.1 && Math.sin(this._time * 4 + a.phase) > 0.6 ? 0.45 : 0;
      }
    }
  }

  _stepMammal(a, dt, distPlayer, dxP, dzP, doGridCheck) {
    const k = a.kind;
    const scareR = k === 'deer' ? 14.0 : k === 'fox' ? 12.0 : 10.0;
    if (distPlayer < scareR && a.startledT <= 0.5) {
      a.startledT = 3.5;
      a.heading = wrapAngle(Math.atan2(dxP, dzP) + randRange(-0.45, 0.45));
      a.speed = k === 'deer' ? 5.6 : k === 'fox' ? 5.2 : 4.8;
      a.timer = 2.5;
    }

    a.timer -= dt;
    if (a.timer <= 0 && a.startledT <= 0) {
      if (k === 'squirrel') {
        a.timer = randRange(0.9, 2.4);
        a.heading = wrapAngle(a.heading + randRange(-2.1, 2.1));
        a.speed = Math.random() < 0.35 ? 0 : randRange(3.0, 4.8);
      } else if (k === 'deer') {
        a.timer = randRange(2.5, 6.0);
        a.heading = wrapAngle(a.heading + randRange(-1.4, 1.4));
        a.speed = Math.random() < 0.52 ? 0 : randRange(1.2, 2.1);
      } else {
        a.timer = randRange(2.0, 4.5);
        a.heading = wrapAngle(a.heading + randRange(-1.5, 1.5));
        a.speed = Math.random() < 0.22 ? 0 : randRange(2.2, 3.3);
      }
    }

    const margin = k === 'deer' ? 1.15 : 0.9;
    const isWild = k === 'fox' || k === 'deer';
    if (a.speed > 0.05) {
      const nx = a.x + Math.sin(a.heading) * a.speed * dt;
      const nz = a.z + Math.cos(a.heading) * a.speed * dt;
      const gy = this._isValidGroundSpot(nx, nz, margin);
      let ok = gy !== false;
      if (ok && isWild) {
        if (this._isAnyRoad(nx, nz, gy, 1.4)) ok = false;
        else if (doGridCheck && !this._isGreenGroundAt(nx, nz, gy)) ok = false;
      } else if (ok && k === 'squirrel' && this._isAnyRoad(nx, nz, gy, 1.0)) {
        ok = false;
      }
      if (ok) {
        a.x = nx;
        a.z = nz;
        a._groundY = gy;
      } else {
        const homeAngle = Math.atan2(a.anchorX - a.x, a.anchorZ - a.z);
        const distHome = Math.hypot(a.anchorX - a.x, a.anchorZ - a.z);
        a.heading = distHome > 2.5
          ? wrapAngle(homeAngle + randRange(-0.45, 0.45))
          : wrapAngle(a.heading + Math.PI * 0.72 + randRange(-0.5, 0.5));
      }
    } else if (doGridCheck) {
      const curY = this._isValidGroundSpot(a.x, a.z, margin);
      const ok = curY !== false && (!isWild || this._isGreenGroundAt(a.x, a.z, curY));
      if (ok) {
        a._groundY = curY;
      } else {
        const safe = isWild ? this._findGreenSpawn(12, 180) : this._findSquirrelSpawn(12, 160);
        if (safe) {
          a.x = safe.x;
          a.y = safe.y;
          a.z = safe.z;
          a.anchorX = safe.x;
          a.anchorZ = safe.z;
          a._groundY = safe.y;
        }
      }
    }

    const baseG = Number.isFinite(a._groundY) ? a._groundY : this._groundY(a.x, a.z);
    const moving = a.speed > 0.1;
    const strideFreq = k === 'squirrel' ? 18 : k === 'fox' ? 11 : 8;
    const stride = moving ? Math.sin(this._time * strideFreq + a.phase) : 0;
    const bound = (k === 'squirrel' && moving) ? Math.abs(Math.sin(this._time * 14 + a.phase)) * 0.06 : 0;
    a.y = baseG + bound;

    const legs = a.model.legs;
    if (legs && legs.length === 4) {
      const amp = moving ? (k === 'deer' ? 0.55 : 0.65) : 0;
      legs[0].rotation.x = stride * amp;
      legs[1].rotation.x = -stride * amp;
      legs[2].rotation.x = -stride * amp;
      legs[3].rotation.x = stride * amp;
    }

    if (a.model.tailPivot) {
      if (k === 'squirrel') {
        a.model.tailPivot.rotation.x = 0.25 + Math.sin(this._time * 9 + a.phase) * 0.22;
      } else if (k === 'deer') {
        a.model.tailPivot.rotation.x = a.startledT > 0 ? -0.9 : 0.05;
      } else {
        a.model.tailPivot.rotation.y = Math.sin(this._time * 4.5 + a.phase) * 0.24;
      }
    }

    if (a.model.headPivot) {
      if (k === 'deer' && !moving) {
        const graze = Math.sin(this._time * 0.7 + a.phase) > -0.2 ? 0.68 : 0.05;
        a.model.headPivot.rotation.x = lerp(a.model.headPivot.rotation.x, graze, Math.min(1, dt * 3));
      } else if (k === 'fox' && !moving) {
        a.model.headPivot.rotation.y = Math.sin(this._time * 1.8 + a.phase) * 0.35;
        a.model.headPivot.rotation.x = 0;
      } else {
        a.model.headPivot.rotation.x = lerp(a.model.headPivot.rotation.x, 0, Math.min(1, dt * 5));
        a.model.headPivot.rotation.y = lerp(a.model.headPivot.rotation.y, 0, Math.min(1, dt * 5));
      }
    }
  }
}
