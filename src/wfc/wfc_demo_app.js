import * as THREE from '../../vendor/three.module.js';
import {
  BEIJING_STYLES_24,
  STYLE_24_KEYS,
  BEIJING_ARCHETYPES,
  FACADE_TILES,
} from './wfc_archetypes.js';
import {
  solveBuildingWFC,
  classifyBeijingArchetype,
  resolveBeijingStyle24,
} from './wfc_solver.js';
import {
  buildWFCBuildingMesh,
  buildLegacyBoxBuildingMesh,
  buildStepByStepInspectionMesh,
} from './wfc_mesh_builder.js';
import {
  REAL_BEIJING_BUILDINGS,
  ZHICHUNLU_MINI_BLOCK,
} from './wfc_real_footprints.js';

export class WFCDemoApp {
  constructor() {
    this.canvas = document.getElementById('wfc-canvas');
    this.matrixCanvas = document.getElementById('wfc-matrix-canvas');
    this.matrixCtx = this.matrixCanvas ? this.matrixCanvas.getContext('2d') : null;

    this.currentDemo = 1;
    this.currentBldgKey = 'zhichunli_slab';
    this.currentArchetype = 'auto';
    this.currentSeed = 2026;
    this.currentStepIdx = 999;
    this.explodeGap = 0.0;
    this.blockMode = 'wfc'; // 'wfc' | 'legacy' | 'split'
    this.isPlayingSteps = false;
    this.stepTimer = 0;

    // Camera spherical orbit state
    this.camTarget = new THREE.Vector3(0, 12, 0);
    this.camDist = 68;
    this.camYaw = 0.55;
    this.camPitch = 0.36;
    this.isDragging = false;
    this.dragMode = 'orbit';
    this.lastMouse = { x: 0, y: 0 };

    this._initThree();
    this._initInputs();
    this._initUI();

    const params = new URLSearchParams(window.location.search);
    const initDemo = parseInt(params.get('demo') || '1', 10);
    if (params.get('bldg') && REAL_BEIJING_BUILDINGS[params.get('bldg')]) {
      this.currentBldgKey = params.get('bldg');
    }
    if (params.get('seed')) {
      this.currentSeed = parseInt(params.get('seed'), 10) || 2026;
    }
    if (params.get('blockMode')) {
      this.blockMode = params.get('blockMode');
    }
    this.selectDemo(initDemo >= 1 && initDemo <= 5 ? initDemo : 1);

    this.lastFrameTime = performance.now();
    this._animate();
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161d26);
    this.scene.fog = new THREE.FogExp2(0x161d26, 0.0012);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1.0, 2500);

    this.hemiLight = new THREE.HemisphereLight(0xdbeeff, 0x3b424c, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.75);
    this.sunLight.position.set(140, 220, 160);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 750;
    const d = 240;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0x90b4d4, 0.45);
    this.fillLight.position.set(-120, 90, -140);
    this.scene.add(this.fillLight);

    // Ground plaza & metric grid
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x202731,
      roughness: 0.88,
      metalness: 0.05,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.gridHelper = new THREE.GridHelper(500, 50, 0x3b526b, 0x283442);
    this.gridHelper.position.y = 0.05;
    this.scene.add(this.gridHelper);

    this.demoRoot = new THREE.Group();
    this.scene.add(this.demoRoot);

    this.sharedWfcMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.14,
    });
    this.sharedLegacyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.04,
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initInputs() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragMode = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };

      if (this.dragMode === 'orbit') {
        this.camYaw -= dx * 0.007;
        this.camPitch = Math.max(0.08, Math.min(1.45, this.camPitch + dy * 0.006));
      } else {
        const panScale = this.camDist * 0.0015;
        const rightX = Math.cos(this.camYaw);
        const rightZ = -Math.sin(this.camYaw);
        const fwdX = -Math.sin(this.camYaw);
        const fwdZ = -Math.cos(this.camYaw);
        this.camTarget.x -= (dx * rightX - dy * fwdX) * panScale;
        this.camTarget.z -= (dx * rightZ - dy * fwdZ) * panScale;
      }
      this._updateCameraTransform();
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camDist = Math.max(18, Math.min(680, this.camDist * (1 + e.deltaY * 0.001)));
        this._updateCameraTransform();
      },
      { passive: false }
    );
  }

  _updateCameraTransform() {
    const x = this.camTarget.x + this.camDist * Math.cos(this.camPitch) * Math.sin(this.camYaw);
    const y = this.camTarget.y + this.camDist * Math.sin(this.camPitch);
    const z = this.camTarget.z + this.camDist * Math.cos(this.camPitch) * Math.cos(this.camYaw);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.camTarget);
  }

  _initUI() {
    // Demo tab buttons
    document.querySelectorAll('.demo-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.demo, 10);
        this.selectDemo(d);
      });
    });

    // Building footprint selector
    const bldgSel = document.getElementById('sel-bldg');
    if (bldgSel) {
      bldgSel.innerHTML = '';
      for (const [k, b] of Object.entries(REAL_BEIJING_BUILDINGS)) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = `${b.name} (${b.levels}F · ${b.bbox[0]}×${b.bbox[1]}m)`;
        bldgSel.appendChild(opt);
      }
      bldgSel.value = this.currentBldgKey;
      bldgSel.addEventListener('change', () => {
        this.currentBldgKey = bldgSel.value;
        this.currentStepIdx = 999;
        this.rebuildCurrentDemo();
      });
    }

    // Archetype override selector (populated with all 24 Beijing Architectural Styles S01..S24)
    const archSel = document.getElementById('sel-archetype');
    if (archSel) {
      archSel.innerHTML = '<option value="auto">自动按语义与街区哈希匹配 (Auto 24-Style)</option>';
      for (const styleKey of STYLE_24_KEYS) {
        const st = BEIJING_STYLES_24[styleKey];
        const opt = document.createElement('option');
        opt.value = styleKey;
        opt.textContent = `${st.shortName} · ${st.category}`;
        archSel.appendChild(opt);
      }
      archSel.value = this.currentArchetype;
      archSel.addEventListener('change', () => {
        this.currentArchetype = archSel.value;
        this.currentStepIdx = 999;
        this.rebuildCurrentDemo();
      });
    }

    // Seed controls
    const seedInput = document.getElementById('inp-seed');
    const btnRandSeed = document.getElementById('btn-rand-seed');
    if (seedInput) {
      seedInput.value = this.currentSeed;
      seedInput.addEventListener('change', () => {
        this.currentSeed = parseInt(seedInput.value, 10) || 1;
        this.rebuildCurrentDemo();
      });
    }
    if (btnRandSeed) {
      btnRandSeed.addEventListener('click', () => {
        this.currentSeed = Math.floor(Math.random() * 89999) + 10000;
        if (seedInput) seedInput.value = this.currentSeed;
        this.rebuildCurrentDemo();
      });
    }

    // Step-by-step slider & play button (Demo 1)
    const stepSlider = document.getElementById('inp-step');
    if (stepSlider) {
      stepSlider.addEventListener('input', () => {
        this.isPlayingSteps = false;
        this._updatePlayBtnText();
        this.currentStepIdx = parseInt(stepSlider.value, 10);
        this.rebuildCurrentDemo(false);
      });
    }

    const btnPlaySteps = document.getElementById('btn-play-steps');
    if (btnPlaySteps) {
      btnPlaySteps.addEventListener('click', () => {
        this.isPlayingSteps = !this.isPlayingSteps;
        if (this.isPlayingSteps && this.currentStepIdx >= (this.totalHistorySteps || 1) - 1) {
          this.currentStepIdx = 0;
        }
        this._updatePlayBtnText();
      });
    }

    // Explode slider (Demo 4)
    const explodeSlider = document.getElementById('inp-explode');
    if (explodeSlider) {
      explodeSlider.addEventListener('input', () => {
        this.explodeGap = parseFloat(explodeSlider.value);
        const lbl = document.getElementById('lbl-explode-val');
        if (lbl) lbl.textContent = `${this.explodeGap.toFixed(1)}m`;
        this.rebuildCurrentDemo(false);
      });
    }

    // Block comparison mode buttons (Demo 5)
    document.querySelectorAll('.block-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.blockMode = btn.dataset.mode;
        document.querySelectorAll('.block-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
        this.rebuildCurrentDemo(false);
      });
    });
  }

  _updatePlayBtnText() {
    const btn = document.getElementById('btn-play-steps');
    if (btn) {
      btn.textContent = this.isPlayingSteps ? '⏸ 暂停坍缩动画' : '▶ 自动播放波函数坍缩';
    }
  }

  selectDemo(demoNum, resetCamera = true) {
    this.currentDemo = demoNum;
    this.isPlayingSteps = false;
    this._updatePlayBtnText();

    document.querySelectorAll('.demo-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.demo, 10) === demoNum);
    });

    // Toggle contextual control panels
    const panelStep = document.getElementById('panel-step-controls');
    const panelExplode = document.getElementById('panel-explode-controls');
    const panelBlock = document.getElementById('panel-block-controls');
    const matrixBox = document.getElementById('matrix-inspector-box');

    if (panelStep) panelStep.style.display = demoNum === 1 ? 'block' : 'none';
    if (matrixBox) matrixBox.style.display = demoNum === 1 ? 'block' : 'none';
    if (panelExplode) panelExplode.style.display = demoNum === 4 ? 'block' : 'none';
    if (panelBlock) panelBlock.style.display = demoNum === 5 ? 'block' : 'none';

    if (resetCamera) {
      if (demoNum === 1) {
        this.camTarget.set(-4, 9.5, 0);
        this.camDist = 56;
        this.camYaw = 0.18;
        this.camPitch = 0.24;
      } else if (demoNum === 2) {
        this.camTarget.set(-15, 16, 15);
        this.camDist = 345;
        this.camYaw = 0.22;
        this.camPitch = 0.50;
      } else if (demoNum === 3) {
        this.camTarget.set(-22, 14, 5);
        this.camDist = 215;
        this.camYaw = 0.36;
        this.camPitch = 0.46;
      } else if (demoNum === 4) {
        this.currentBldgKey = 'jd_tech';
        const bSel = document.getElementById('sel-bldg');
        if (bSel) bSel.value = 'jd_tech';
        this.explodeGap = 16.0;
        const exSlider = document.getElementById('inp-explode');
        if (exSlider) exSlider.value = '16';
        const lbl = document.getElementById('lbl-explode-val');
        if (lbl) lbl.textContent = '16.0m';
        this.camTarget.set(-20, 34, 0);
        this.camDist = 225;
        this.camYaw = 0.26;
        this.camPitch = 0.34;
      } else if (demoNum === 5) {
        this.camTarget.set(-35, 20, 15);
        this.camDist = 255;
        this.camYaw = 0.38;
        this.camPitch = 0.44;
      }
      this._updateCameraTransform();
    }

    this.rebuildCurrentDemo(true);
  }

  _clearDemoRoot() {
    while (this.demoRoot.children.length > 0) {
      const ch = this.demoRoot.children.pop();
      ch.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
  }

  rebuildCurrentDemo(resetStepToEnd = false) {
    this._clearDemoRoot();

    if (this.currentDemo === 1) {
      this._buildDemo1StepInspector(resetStepToEnd);
    } else if (this.currentDemo === 2) {
      this._buildDemo2SixArchetypesGallery();
    } else if (this.currentDemo === 3) {
      this._buildDemo3NineSeedsGrid();
    } else if (this.currentDemo === 4) {
      this._buildDemo4ExplodedMassingAndRoof();
    } else if (this.currentDemo === 5) {
      this._buildDemo5ZhichunluStreetBlock();
    }
  }

  /**
   * DEMO 1: 2D Facade Grammar Step-by-Step Entropy & Socket Propagation Lab
   */
  _buildDemo1StepInspector(resetStepToEnd) {
    const bldg = REAL_BEIJING_BUILDINGS[this.currentBldgKey] || REAL_BEIJING_BUILDINGS.zhichunli_slab;
    const archOverride = this.currentArchetype === 'auto' ? bldg.archetype : this.currentArchetype;

    // Find the longest front/south-facing wall edge to inspect
    const outer = bldg.flatOuter;
    let bestEdge = 0;
    let bestScore = -Infinity;
    const nPts = outer.length / 2;
    for (let k = 0; k < nPts; k++) {
      const x1 = outer[k * 2], z1 = outer[k * 2 + 1];
      const x2 = outer[((k + 1) % nPts) * 2], z2 = outer[((k + 1) % nPts) * 2 + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const nz = -(x2 - x1) / (len || 1);
      const score = len * (nz > 0 ? 1.5 : 1.0);
      if (score > bestScore) {
        bestScore = score;
        bestEdge = k;
      }
    }

    const sol = solveBuildingWFC(bldg, {
      seed: this.currentSeed,
      archetype: archOverride,
      recordHistory: true,
      inspectWallIdx: bestEdge,
    });

    const wall = sol.tiers[0].wallFacades[bestEdge] || sol.tiers[0].wallFacades[0];
    const history = wall.wfc.history || [];
    this.totalHistorySteps = history.length;

    if (resetStepToEnd || this.currentStepIdx >= history.length) {
      this.currentStepIdx = Math.max(0, history.length - 1);
    }

    const stepSlider = document.getElementById('inp-step');
    if (stepSlider) {
      stepSlider.max = String(Math.max(0, history.length - 1));
      stepSlider.value = String(this.currentStepIdx);
    }

    const { group, snap } = buildStepByStepInspectionMesh(sol, this.currentStepIdx, bestEdge);
    this.demoRoot.add(group);

    // Draw footprint outline plinth on ground
    this._addFootprintOutline(bldg.flatOuter, 0, 0, 0x4fc3f7);

    // Render 2D Facade WFC Entropy & Tile Matrix on the HUD canvas
    this._drawFacadeMatrixHUD(wall, snap, this.currentStepIdx, history.length);

    this._updateTelemetryHUD({
      title: `Demo 1 · 2D 立面语法波函数坍缩实验室`,
      subtitle: `${bldg.name} — 原型: ${sol.archetype.shortName} (${sol.palette.name})`,
      solveMs: sol.stats.solveMs.toFixed(2),
      cells: `${wall.nBays}列 × ${wall.nFloors}层 = ${wall.nBays * wall.nFloors} 格 (总 ${sol.stats.totalWfcCells} 格)`,
      stepInfo: snap ? `[Step ${this.currentStepIdx + 1}/${history.length}] ${snap.label}` : '坍缩完成',
      desc: bldg.desc,
    });
  }

  _drawFacadeMatrixHUD(wall, snap, stepIdx, totalSteps) {
    if (!this.matrixCtx || !snap) return;
    const ctx = this.matrixCtx;
    const W = this.matrixCanvas.width;
    const H = this.matrixCanvas.height;
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, W, H);

    const nx = wall.nBays;
    const ny = wall.nFloors;
    const pad = 24;
    const cw = Math.min(48, (W - pad * 2) / nx);
    const ch = Math.min(34, (H - pad * 2 - 22) / ny);
    const ox = (W - cw * nx) * 0.5;
    const oy = pad + 18;

    ctx.fillStyle = '#90caf9';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      `受检立面网格 (${nx}列开间 × ${ny}层) · Step ${stepIdx + 1}/${totalSteps}`,
      12,
      18
    );

    for (let y = 0; y < ny; y++) {
      // Draw top floor at top of canvas (row = ny - 1 - y)
      const drawRow = ny - 1 - y;
      const py = oy + drawRow * ch;

      for (let x = 0; x < nx; x++) {
        const px = ox + x * cw;
        const dom = snap.domains[y][x];
        const isFocus = snap.focusX === x && snap.focusY === y;

        if (dom.length === 1) {
          const tile = FACADE_TILES[dom[0]];
          ctx.fillStyle = tile ? tile.vizColor : '#546e7a';
          ctx.fillRect(px + 1, py + 1, cw - 2, ch - 2);

          if (cw >= 22 && ch >= 14) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px monospace';
            const shortCode = dom[0].replace(/^[GMT]_/, '').slice(0, 5);
            ctx.fillText(shortCode, px + 3, py + ch * 0.64);
          }
        } else {
          // Uncollapsed superposition state
          ctx.fillStyle = dom.length >= 4 ? '#16324a' : dom.length === 3 ? '#1a4742' : '#4d3816';
          ctx.fillRect(px + 1, py + 1, cw - 2, ch - 2);
          ctx.fillStyle = '#ffca28';
          ctx.font = '10px monospace';
          ctx.fillText(`?(${dom.length})`, px + 4, py + ch * 0.65);
        }

        if (isFocus) {
          ctx.strokeStyle = '#ffeb3b';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(px + 1, py + 1, cw - 2, ch - 2);
        }
      }
    }
  }

  /**
   * DEMO 2: All 24 Authentic Beijing Architectural Styles Turntable Gallery (6 x 4 Matrix Plaza)
   */
  _buildDemo2SixArchetypesGallery() {
    let totalMs = 0;
    let totalTris = 0;
    let totalCells = 0;

    const cols = 6;
    const spacingX = 64;
    const spacingZ = 66;

    for (let i = 0; i < STYLE_24_KEYS.length; i++) {
      const styleKey = STYLE_24_KEYS[i];
      const st = BEIJING_STYLES_24[styleKey];
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);
      const gx = (colIdx - 2.5) * spacingX;
      const gz = (rowIdx - 1.5) * spacingZ;

      // Pick representative real footprint & height for each style category
      let fpKey = 'zhichunli_slab';
      let h = 20.0;
      let lvls = 6;
      if (st.category === '现代玻璃/商务') {
        fpKey = i % 2 === 0 ? 'jd_tech' : 'oriental_media_mall';
        lvls = 11 + (i % 4) * 2;
        h = lvls * st.floorHeight;
      } else if (st.category === '多层板楼/大院') {
        fpKey = i % 2 === 0 ? 'zhichunli_slab' : 'beihang_dorm_u';
        lvls = 6;
        h = 19.2;
      } else if (st.category === '高层商品房/塔楼') {
        fpKey = 'zgc_919_tower';
        lvls = 14 + (i % 3) * 2;
        h = lvls * st.floorHeight;
      } else if (st.category === '政教/高校/工业') {
        fpKey = 'cas_math_ministry';
        lvls = 6 + (i % 2);
        h = lvls * st.floorHeight;
      } else if (st.category === '商业/百货/酒店') {
        fpKey = 'oriental_media_mall';
        lvls = 8 + (i % 3) * 2;
        h = lvls * st.floorHeight;
      } else {
        fpKey = 'shichahai_siheyuan';
        lvls = styleKey === 'S24_imperial_palace' ? 2 : 1;
        h = styleKey === 'S24_imperial_palace' ? 11.5 : 5.6;
      }

      const baseBldg = REAL_BEIJING_BUILDINGS[fpKey];
      const scale = Math.min(1.0, 42.0 / Math.max(baseBldg.bbox[0], baseBldg.bbox[1]));
      const scaledOuter = baseBldg.flatOuter.map((v) => v * scale);
      const bldg = {
        ...baseBldg,
        height: h,
        levels: lvls,
        flatOuter: scaledOuter,
        flatHoles: [],
      };

      const sol = solveBuildingWFC(bldg, {
        seed: this.currentSeed + i * 173,
        archetype: styleKey,
        disableMicroTint: true,
      });
      const mesh = buildWFCBuildingMesh(sol, this.sharedWfcMat);
      mesh.position.set(gx, 0, gz);
      this.demoRoot.add(mesh);

      this._addPodiumPlinth(gx, gz, 52, 52, st.shortName);
      this._addLabelSprite(
        st.shortName,
        `${st.category} · ${lvls}F`,
        gx,
        h + 9.0,
        gz,
        '#4fc3f7'
      );
      totalMs += sol.stats.solveMs;
      totalTris += mesh.userData.triangleCount;
      totalCells += sol.stats.totalWfcCells;
    }

    this._updateTelemetryHUD({
      title: `Demo 2 · 北京 24 大典型建筑样式 WFC 图鉴矩阵 (6 × 4 展台)`,
      subtitle: `涵盖: 5种商务幕墙 (S01-S05) · 5种年代板楼 (S06-S10) · 5种商品房塔楼 (S11-S15) · 4种政教高校工业 (S16-S19) · 3种商业酒店 (S20-S22) · 2种古建四合院 (S23-S24)`,
      solveMs: totalMs.toFixed(2),
      cells: `24 栋不同样式合计 ${totalCells.toLocaleString()} 个 WFC 晶格 · ${totalTris.toLocaleString()} 三角面`,
      stepInfo: `当前种子 Seed #${this.currentSeed}（彻底解决楼面颜色单一问题，24 套色板与立面构件语法同屏展示）`,
      desc: `从 50年代苏式红砖、80年代知春里红白板楼、黄庄米黄喷涂、方庄红白马赛克、老旧小区绿白改造，到亚运村蓝白塔楼、海淀赭石飘窗、望京卡其灰、新古典石材、第四代极简大平层，以及中关村牌楼幕墙、CBD蓝宝石、翡翠横窗带、798红砖厂房、四合院与故宫重檐，24 种北京代表性建筑样式一目了然。`,
    });
  }

  /**
   * DEMO 3: 1 Real Footprint x 9 Deterministic WFC Styles & Seeds Diversity Matrix (3x3 Grid)
   */
  _buildDemo3NineSeedsGrid() {
    const baseBldg = REAL_BEIJING_BUILDINGS[this.currentBldgKey] || REAL_BEIJING_BUILDINGS.zhichunli_slab;
    const scale = Math.min(1.0, 48.0 / Math.max(baseBldg.bbox[0], baseBldg.bbox[1]));
    const bldg = {
      ...baseBldg,
      height: Math.min(48, baseBldg.height),
      levels: Math.min(14, baseBldg.levels),
      flatOuter: baseBldg.flatOuter.map((v) => v * scale),
      flatHoles: (baseBldg.flatHoles || []).map((h) => h.map((v) => v * scale)),
    };

    // Showcase 9 diverse styles across the 3x3 grid when in 'auto' mode
    const nineStyleShowcase = [
      'S07_80s_zhichunli_brick_stucco',
      'S08_80s_huangzhuang_ochre',
      'S09_90s_fangzhuang_redtile',
      'S10_renovated_pastel_slab',
      'S06_50s_soviet_redbrick',
      'S11_90s_yayuncun_bluewhite',
      'S12_05s_haidian_sienna_bay',
      'S13_10s_wangjing_khaki_modern',
      'S14_15s_neoclassical_stone',
    ];

    let totalMs = 0;
    let totalTris = 0;
    const spacing = 68;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c;
        const gx = (c - 1) * spacing;
        const gz = (r - 1) * spacing;
        const itemSeed = this.currentSeed + idx * 997;
        const styleKey =
          this.currentArchetype === 'auto' ? nineStyleShowcase[idx] : this.currentArchetype;

        const sol = solveBuildingWFC(bldg, {
          seed: itemSeed,
          archetype: styleKey,
        });
        const mesh = buildWFCBuildingMesh(sol, this.sharedWfcMat);
        mesh.position.set(gx, 0, gz);
        this.demoRoot.add(mesh);

        this._addPodiumPlinth(gx, gz, 56, 56, `Seed #${itemSeed}`);
        this._addLabelSprite(
          `${sol.archetype.shortName}`,
          `Seed ${itemSeed} · ${sol.tiers.length}级退台`,
          gx,
          bldg.height + 8.5,
          gz,
          '#ffca28'
        );
        totalMs += sol.stats.solveMs;
        totalTris += mesh.userData.triangleCount;
      }
    }

    this._updateTelemetryHUD({
      title: `Demo 3 · 同一真实多边形轮廓 × 9 种建筑样式与种子多样性矩阵 (3 × 3)`,
      subtitle: `基底轮廓: ${baseBldg.name} — 9 种不同北京年代样式与随机种子变体`,
      solveMs: totalMs.toFixed(2),
      cells: `9 栋变体总计 ${totalTris.toLocaleString()} 三角面 · 平均单栋坍缩 ${(totalMs / 9).toFixed(2)} ms`,
      stepInfo: `彻底解决同一小区/园区内相同多边形轮廓“克隆同色火柴盒”问题`,
      desc: `9 栋建筑共享完全相同的 2D 占地轮廓，但通过 24 样式 WFC 坍缩出各自独立的年代外墙配色、裙房退台层数、包阳台/楼梯间/飘窗列位置、首层底商/门厅排布与屋顶设备群。`,
    });
  }

  /**
   * DEMO 4: 1D Vertical Massing Setback + 2D Rooftop Greeble WFC Exploded Inspector
   */
  _buildDemo4ExplodedMassingAndRoof() {
    const bldg = REAL_BEIJING_BUILDINGS[this.currentBldgKey] || REAL_BEIJING_BUILDINGS.jd_tech;
    const archOverride = this.currentArchetype === 'auto' ? bldg.archetype : this.currentArchetype;

    // Left (-68m): Assembled full WFC building
    const sol = solveBuildingWFC(bldg, {
      seed: this.currentSeed,
      archetype: archOverride,
    });
    const assembledMesh = buildWFCBuildingMesh(sol, this.sharedWfcMat);
    assembledMesh.position.set(-72, 0, 0);
    this.demoRoot.add(assembledMesh);
    this._addFootprintOutline(bldg.flatOuter, -72, 0, 0x4fc3f7);
    this._addLabelSprite(
      `完整组合体块 (${bldg.levels}F)`,
      `${sol.tiers.length} 级垂向退台 + ${sol.roofWfc.cells.length} 组屋顶构件`,
      -72,
      bldg.height + 12,
      0,
      '#4fc3f7'
    );

    // Right (+72m): Vertically exploded tiers so user can inspect each tier's inset footprint & rooftop greebles
    for (let tIdx = 0; tIdx < sol.tiers.length; tIdx++) {
      const singleTierSol = {
        ...sol,
        tiers: [sol.tiers[tIdx]],
      };
      const tierMesh = buildWFCBuildingMesh(singleTierSol, this.sharedWfcMat);
      const yLift = tIdx * this.explodeGap;
      tierMesh.position.set(72, yLift, 0);
      this.demoRoot.add(tierMesh);
      this._addFootprintOutline(
        sol.tiers[tIdx].flatOuter,
        72,
        sol.tiers[tIdx].y0 + yLift,
        tIdx === 0 ? 0x66bb6a : tIdx === 1 ? 0xffca28 : 0xef5350
      );
      this._addLabelSprite(
        `Tier ${tIdx + 1}: ${sol.tiers[tIdx].label}`,
        tIdx === sol.tiers.length - 1 ? `含屋顶 WFC 构件 (${sol.roofWfc.cells.length} 组)` : `1D 垂向退台坍缩层`,
        72,
        sol.tiers[tIdx].y1 + yLift + 5.5,
        0,
        tIdx === 0 ? '#66bb6a' : tIdx === 1 ? '#ffca28' : '#ef5350'
      );
    }

    const tierLabels = sol.tiers.map((t) => t.label).join('  →  ');
    this._updateTelemetryHUD({
      title: `Demo 4 · 1D 垂向体块分级退台 + 2D 屋顶设备构件 WFC 解剖视图`,
      subtitle: `左: 组合完整建筑体块 | 右: 垂向分解展开视图 (层间展开间距 ${this.explodeGap.toFixed(1)}m)`,
      solveMs: sol.stats.solveMs.toFixed(2),
      cells: `退台分级: ${sol.tiers.length} 级 (${tierLabels}) · 屋顶构件: ${sol.roofWfc.cells.length} 组`,
      stepInfo: `支持对无 building:part 细分的单一轮廓自动坍缩出「裙房满铺 → 内缩塔楼 → 二次退台冠顶 + 屋顶冷却塔/天窗/光伏」`,
      desc: bldg.desc,
    });
  }

  /**
   * DEMO 5: Real Zhichun Road & JD Tech Building 54-Building Street Block Comparison
   */
  _buildDemo5ZhichunluStreetBlock() {
    const t0 = performance.now();
    const { buildings, roads } = ZHICHUNLU_MINI_BLOCK;

    // 1. Render street road ribbons (Zhichun Road main road, auxiliary roads, residential lanes)
    const roadGroup = new THREE.Group();
    const rPos = [], rCol = [];
    for (const r of roads) {
      const f = r.flat;
      const hw = Math.max(2.0, r.width * 0.5);
      const isMain = r.cls === 'primary' || r.cls === 'trunk' || r.cls === 'secondary';
      const rgb = isMain ? [0.24, 0.27, 0.32] : [0.32, 0.35, 0.40];
      const y = isMain ? 0.22 : 0.14;
      for (let i = 0; i < f.length - 3; i += 3) {
        const x1 = f[i], z1 = f[i + 2];
        const x2 = f[i + 3], z2 = f[i + 5];
        const dx = x2 - x1, dz = z2 - z1;
        const l = Math.hypot(dx, dz);
        if (l < 0.2) continue;
        const nx = (-dz / l) * hw, nz = (dx / l) * hw;
        rPos.push(
          x1 + nx, y, z1 + nz, x2 + nx, y, z2 + nz, x2 - nx, y, z2 - nz,
          x1 + nx, y, z1 + nz, x2 - nx, y, z2 - nz, x1 - nx, y, z1 - nz
        );
        for (let m = 0; m < 6; m++) rCol.push(...rgb);
      }
    }
    if (rPos.length > 0) {
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
      rGeo.setAttribute('color', new THREE.Float32BufferAttribute(rCol, 3));
      rGeo.computeVertexNormals();
      const rMesh = new THREE.Mesh(
        rGeo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
      );
      rMesh.receiveShadow = true;
      roadGroup.add(rMesh);
    }
    this.demoRoot.add(roadGroup);

    // 2. Build all 54 real buildings in the Zhichunlu / JD Tech Building block
    let totalSolveMs = 0;
    let totalTriangles = 0;
    let wfcCount = 0;
    let legacyCount = 0;
    const distinctStyles = new Set();

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const xs = b.flatOuter.filter((_, idx) => idx % 2 === 0);
      const zs = b.flatOuter.filter((_, idx) => idx % 2 === 1);
      const cx = xs.reduce((a, v) => a + v, 0) / xs.length;
      const cz = zs.reduce((a, v) => a + v, 0) / zs.length;

      const useLegacy =
        this.blockMode === 'legacy' ||
        (this.blockMode === 'split' && cx < -25.0);

      if (useLegacy) {
        const mesh = buildLegacyBoxBuildingMesh(b, this.sharedLegacyMat);
        this.demoRoot.add(mesh);
        legacyCount++;
      } else {
        const sol = solveBuildingWFC(b, {
          seed: (this.currentSeed ^ (b.id * 2654435761)) >>> 0,
          wx: -4217.5 + cx,
          wz: -8171.7 + cz,
        });
        distinctStyles.add(sol.archetypeId);
        const mesh = buildWFCBuildingMesh(sol, this.sharedWfcMat);
        this.demoRoot.add(mesh);
        totalSolveMs += sol.stats.solveMs;
        totalTriangles += mesh.userData.triangleCount;
        wfcCount++;
      }
    }

    if (this.blockMode === 'split') {
      // Draw glowing cyan split line at x = -25m
      const linePts = [
        new THREE.Vector3(-25, 0.6, -170),
        new THREE.Vector3(-25, 0.6, 170),
      ];
      const lGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      this.demoRoot.add(new THREE.Line(lGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff })));
      this._addLabelSprite(
        '◀ 西侧: 旧版直挤出火柴盒 (Legacy Box)',
        '无立面凹凸 / 无退台 / 无屋顶设备',
        -105,
        88,
        20,
        '#90a4ae'
      );
      this._addLabelSprite(
        '▶ 东侧: 三维建筑波函数坍缩 (3D WFC)',
        '京东科技大厦 + 知春里板楼/塔楼立体构件',
        45,
        92,
        10,
        '#00e676'
      );
    } else {
      this._addLabelSprite(
        '京东科技大厦 (OSM #167654402)',
        '知春路 76 号 · 3级退台 + 牌楼冠顶 + 屋顶冷却塔',
        0,
        78,
        0,
        '#4fc3f7'
      );
    }

    const totalBuildMs = performance.now() - t0;
    const modeLabel =
      this.blockMode === 'wfc'
        ? '全街区 3D 波函数坍缩 (All 54 Buildings WFC)'
        : this.blockMode === 'split'
          ? '同屏分界对比 (西侧旧版火柴盒 vs 东侧京东科技大厦 & 知春里 WFC)'
          : '旧版直挤出火柴盒对比基线 (Legacy Flat Extrusion)';

    this._updateTelemetryHUD({
      title: `Demo 5 · 知春路 · 京东科技大厦与知春里 54 栋真实建筑 24 样式街区对比`,
      subtitle: `模式: ${modeLabel}`,
      solveMs: `${totalSolveMs.toFixed(1)} ms (总构建 ${totalBuildMs.toFixed(1)} ms, 单栋均值 ${(totalSolveMs / Math.max(1, wfcCount)).toFixed(2)} ms)`,
      cells: `街区建筑: ${buildings.length} 栋 · 覆盖 ${distinctStyles.size} 种不同北京建筑样式 · WFC 三角面: ${totalTriangles.toLocaleString()}`,
      stepInfo: `包含知春路主辅路、京东科技大厦 (#167654402) 及知春里片区 ${distinctStyles.size} 种年代配色与立面构件`,
      desc: `在独立轻量沙盒中直接加载知春路真实 OSM + Overture 街区切片：54 栋建筑通过空间街区哈希 + 建筑语义分配到 ${distinctStyles.size} 种不同北京建筑样式，彻底告别同色火柴盒。`,
    });
  }

  _addFootprintOutline(flatOuter, ox, y, colorHex) {
    const pts = [];
    for (let i = 0; i < flatOuter.length; i += 2) {
      pts.push(new THREE.Vector3(flatOuter[i] + ox, y + 0.15, flatOuter[i + 1]));
    }
    if (pts.length > 0) pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colorHex }));
    this.demoRoot.add(line);
  }

  _addPodiumPlinth(gx, gz, w, d, labelText) {
    const geo = new THREE.BoxGeometry(w, 0.35, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      roughness: 0.8,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(gx, 0.175, gz);
    mesh.receiveShadow = true;
    this.demoRoot.add(mesh);
  }

  _addLabelSprite(title, subtitle, x, y, z, accentColor = '#4fc3f7') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(13, 19, 28, 0.88)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(6, 6, 500, 100, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 48);

    ctx.fillStyle = accentColor;
    ctx.font = '20px "PingFang SC", "Microsoft YaHei", monospace';
    ctx.fillText(subtitle, 256, 84);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(38, 8.3, 1);
    sprite.renderOrder = 999;
    this.demoRoot.add(sprite);
  }

  _updateTelemetryHUD(info) {
    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setTxt('hud-title', info.title);
    setTxt('hud-subtitle', info.subtitle);
    setTxt('hud-solve-ms', info.solveMs);
    setTxt('hud-cells', info.cells);
    setTxt('hud-step-info', info.stepInfo);
    setTxt('hud-desc', info.desc);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000.0;
    this.lastFrameTime = now;

    if (this.currentDemo === 1 && this.isPlayingSteps) {
      this.stepTimer += dt;
      if (this.stepTimer >= 0.14) {
        this.stepTimer = 0;
        if (this.currentStepIdx < (this.totalHistorySteps || 1) - 1) {
          this.currentStepIdx++;
          this.rebuildCurrentDemo(false);
        } else {
          this.isPlayingSteps = false;
          this._updatePlayBtnText();
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.wfcDemoApp = new WFCDemoApp();
});
