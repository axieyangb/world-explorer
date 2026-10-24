// Kaiju Defense HUD (game): bars, reticle, status, radar overlay, cards, screen effects. See DESIGN.md.
import { CFG } from "./kaiju_config.js";
import { t, onLanguageChange } from "../../i18n.js";
import { lonToMx, latToMy } from "../map_tiles.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const RADAR_SIZE = 168;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

export class KaijuHud {
  constructor(K) {
    this.K = K;
    this.visible = false;
    this._alertT = 0;
    this._hintT = 0;
    this._pulse = 0;
    this._radarT = 0;
    this._last = {};
    this._i18n = []; // [element, key]
    this._build();
    onLanguageChange(() => this._applyText());
  }

  // ---------------------------------------------------------------- DOM
  _txt(e, key) {
    this._i18n.push([e, key]);
    e.textContent = t(key);
    return e;
  }

  _build() {
    const root = (this.root = el("div", "kj-hud", document.body));
    root.style.display = "none";

    // Screen effects (bottom of stack).
    this.edge = el("div", "kj-edge", root);
    this.vignette = el("div", "kj-vignette", root);
    this.flash = el("div", "kj-flash", root);

    // Top center: kaiju HP + city damage.
    const top = el("div", "kj-top", root);
    const nameRow = el("div", "kj-row", top);
    this.nameLabel = this._txt(el("span", "kj-label", nameRow), "kaiju_name");
    this.hpBar = el("div", "kj-bar kj-bar-hp", top);
    this.hpFill = el("i", "", this.hpBar);
    const cityRow = el("div", "kj-row kj-row-city", top);
    this._txt(el("span", "kj-label kj-label-dim", cityRow), "kaiju_city");
    this.cityVal = el("span", "kj-num", cityRow, "0%");
    this.cityBar = el("div", "kj-bar kj-bar-city", top);
    this.cityFill = el("i", "", this.cityBar);

    this.alert = this._txt(el("div", "kj-alert", root), "kaiju_alert");
    this.warnPill = el("div", "kj-warn-pill", root);
    this.toast = el("div", "kj-toast", root);
    this.msg = el("div", "kj-msg", root);
    this.hint = this._txt(el("div", "kj-hint on", root), "kaiju_hint_heli");
    this.hint.id = "kaiju-hint";

    // Playable Unit Selector Bar
    const unitPicker = (this.unitPicker = el("div", "kj-unit-picker", root));
    unitPicker.id = "kaiju-unit-picker";

    const unitSpecs = [
      { id: "heli", num: "1", icon: "🚁", labelKey: "kaiju_unit_heli" },
      { id: "tank", num: "2", icon: "🛡️", labelKey: "kaiju_unit_tank" },
      { id: "soldier", num: "3", icon: "🪖", labelKey: "kaiju_unit_soldier" },
    ];

    this.unitBtns = {};
    for (const spec of unitSpecs) {
      const btn = el("button", `kj-unit-btn ${spec.id === "heli" ? "active" : ""}`, unitPicker);
      btn.id = `kaiju-unit-${spec.id}`;
      btn.type = "button";
      btn.dataset.unit = spec.id;

      el("span", "kj-unit-key", btn, spec.num);
      el("span", "kj-unit-icon", btn, ` ${spec.icon} `);
      const txtSpan = el("span", "kj-unit-txt", btn);
      this._txt(txtSpan, spec.labelKey);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.blur();
        this.K.setPlayableUnit?.(spec.id);
      });

      this.unitBtns[spec.id] = btn;
    }

    // Center crosshair + missile cooldown ring.
    const cross = (this.cross = document.createElementNS(SVG_NS, "svg"));
    cross.id = "kaiju-crosshair";
    cross.setAttribute("class", "kj-cross");
    cross.setAttribute("viewBox", "-20 -20 40 40");
    cross.innerHTML =
      '<path class="kj-cross-lines" d="M-9 0h-5M9 0h5M0 -9v-5M0 9v5"/><circle class="kj-cross-dot" r="1.2"/>' +
      `<circle class="kj-ring-bg" r="${RING_R}"/><circle class="kj-ring" r="${RING_R}" transform="rotate(-90)" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/>`;
    root.appendChild(cross);
    this.ring = cross.querySelector(".kj-ring");

    // Lock reticle: four brackets that close and stop rotating as lock rises.
    const lock = (this.lock = document.createElementNS(SVG_NS, "svg"));
    lock.setAttribute("class", "kj-lock");
    lock.setAttribute("viewBox", "-40 -40 80 80");
    lock.innerHTML =
      '<g class="kj-lock-g">' +
      [0, 90, 180, 270].map((a) => `<g transform="rotate(${a})"><path class="kj-brk" d="M-8 -20 L-20 -20 L-20 -8"/></g>`).join("") +
      "</g>";
    root.appendChild(lock);
    this.lockG = lock.querySelector(".kj-lock-g");
    this.brk = Array.from(lock.querySelectorAll(".kj-brk"));

    // Bottom right status.
    const st = el("div", "kj-status", root);
    const hullRow = el("div", "kj-srow", st);
    this.hullLabel = this._txt(el("span", "kj-label kj-label-dim", hullRow), "kaiju_hp_heli");
    this.hullLabel.id = "kaiju-hull-label";
    const segs = el("div", "kj-segs", hullRow);
    segs.id = "kaiju-heli-hp-fill";
    this.segs = [];
    for (let i = 0; i < CFG.HELI_SEGMENTS; i++) this.segs.push(el("i", "", segs));

    const heatRow = el("div", "kj-srow", st);
    this.heatLabel = this._txt(el("span", "kj-label kj-label-dim", heatRow), "kaiju_heat");
    this.heatBar = el("div", "kj-bar kj-bar-heat", heatRow);
    this.heatFill = el("i", "", this.heatBar);

    const misRow = el("div", "kj-srow", st);
    this._txt(el("span", "kj-label kj-label-dim", misRow), "kaiju_missile");
    this.misBar = el("div", "kj-bar kj-bar-mis", misRow);
    this.misFill = el("i", "", this.misBar);

    const dodgeRow = el("div", "kj-srow", st);
    this._txt(el("span", "kj-label kj-label-dim", dodgeRow), "kaiju_dodge");
    this.dodgeBar = el("div", "kj-bar kj-bar-mis kj-ready", dodgeRow);
    this.dodgeFill = el("i", "", this.dodgeBar);
    this.dodgeFill.style.transform = "scaleX(1)";

    this.superRow = el("div", "kj-srow kj-srow-super", st);
    this.superRow.style.display = "none";
    this.superLabel = el("span", "kj-label kj-label-cyan", this.superRow, "SUPER [R]");
    this.superBar = el("div", "kj-bar kj-bar-super", this.superRow);
    this.superFill = el("i", "", this.superBar);

    const livesRow = el("div", "kj-srow kj-lives", st);
    this.pips = [];
    for (let i = 0; i < CFG.LIVES; i++) this.pips.push(el("i", "", livesRow));

    // Cards.
    this.results = el("div", "kj-card", root);
    this.results.style.display = "none";
    this.resTitle = el("div", "kj-card-title", this.results);
    this.resRows = el("div", "kj-card-rows", this.results);
    const resBtns = el("div", "kj-card-btns", this.results);
    this._txt(el("button", "kj-btn kj-btn-primary", resBtns), "kaiju_again").addEventListener("click", () => this.K.restart());
    this._txt(el("button", "kj-btn", resBtns), "kaiju_exit").addEventListener("click", () => this.K.exit());
    for (const b of resBtns.children) b.type = "button";

    this.pause = el("div", "kj-card kj-card-pause", root);
    this.pause.style.display = "none";
    this._txt(el("div", "kj-card-title", this.pause), "kaiju_paused");
    const pb = el("div", "kj-card-col", this.pause);
    this._txt(el("button", "kj-btn kj-btn-primary", pb), "kaiju_resume").addEventListener("click", () => this.K.togglePause(false));
    this._txt(el("button", "kj-btn", pb), "kaiju_restart").addEventListener("click", () => this.K.restart());
    this.muteBtn = el("button", "kj-btn", pb);
    this.muteBtn.addEventListener("click", () => {
      this.K.toggleMute();
      this._applyMute();
    });
    this._txt(el("button", "kj-btn", pb), "kaiju_exit").addEventListener("click", () => this.K.exit());
    for (const b of pb.children) b.type = "button";
    this._applyMute();

    // Radar overlay on the minimap.
    const mm = document.getElementById("minimap-container");
    if (mm) {
      const c = (this.radar = document.createElement("canvas"));
      c.className = "kj-radar";
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = RADAR_SIZE * this.dpr;
      c.height = RADAR_SIZE * this.dpr;
      c.style.display = "none";
      mm.appendChild(c);
      this.rctx = c.getContext("2d");
    }
  }

  setUnit(unit) {
    this.activeUnit = unit;
    if (this.unitBtns) {
      for (const [id, btn] of Object.entries(this.unitBtns)) {
        btn.classList.toggle("active", id === unit);
      }
    }
    if (this.hullLabel) {
      const key = unit === "tank" ? "kaiju_hp_tank" : unit === "soldier" ? "kaiju_hp_soldier" : "kaiju_hp_heli";
      this.hullLabel.textContent = t(key) || (unit === "tank" ? "TANK HP" : unit === "soldier" ? "SOLDIER HP" : "HELI HP");
    }
    if (this.hint) {
      const hintKey = unit === "tank" ? "kaiju_hint_tank" : unit === "soldier" ? "kaiju_hint_soldier" : "kaiju_hint_heli";
      this.hint.textContent = t(hintKey);
    }
    if (this.cross) {
      this.cross.style.display = unit === "heli" ? "block" : "none";
    }
    if (this.lock) {
      this.lock.style.display = unit === "heli" ? "block" : "none";
    }
    const wr = document.getElementById("walker-reticle");
    if (wr) wr.style.display = unit !== "heli" ? "block" : "none";
  }

  _applyText() {
    for (const [e, key] of this._i18n) e.textContent = t(key);
    this.setUnit(this.activeUnit || "heli");
    this._applyMute();
    if (this._lastResults) this.showResults(this._lastResults);
  }

  _applyMute() {
    if (this.muteBtn) this.muteBtn.textContent = t(this.K.audio && this.K.audio.muted ? "kaiju_unmute" : "kaiju_mute");
  }

  // ---------------------------------------------------------------- API
  show() {
    this.visible = true;
    this._last = {};
    this.root.style.display = "";
    if (this.radar) this.radar.style.display = "";
    this.results.style.display = "none";
    this.pause.style.display = "none";
    this._lastResults = null;
    this._hintT = 7;
    this.hint.classList.add("on");
  }

  hide() {
    this.visible = false;
    this.root.style.display = "none";
    if (this.radar) {
      this.radar.style.display = "none";
      this.rctx && this.rctx.clearRect(0, 0, this.radar.width, this.radar.height);
    }
    this.results.style.display = "none";
    this.pause.style.display = "none";
    this.alert.classList.remove("on");
    this._lastResults = null;
  }

  showAlert() {
    this._alertT = CFG.ALERT_SECONDS;
    this.alert.classList.add("on");
    this.results.style.display = "none";
    this._lastResults = null;
    this._hintT = Math.max(this._hintT, CFG.ALERT_SECONDS + 5);
    this.hint.classList.add("on");
  }

  showResults(r) {
    this._lastResults = r;
    this.resTitle.textContent = t(r.win ? "kaiju_saved" : "kaiju_fallen");
    this.results.classList.toggle("kj-win", !!r.win);
    const rows = [
      ["kaiju_time", fmtTime(r.time)],
      ["kaiju_city", `${Math.round((r.cityDamage || 0) * 100)}%`],
      ["kaiju_accuracy", `${Math.round((r.accuracy || 0) * 100)}%`],
      ["kaiju_missile_hits", String(r.missileHits || 0)],
      ["kaiju_cannon_hits", String(r.cannonHits || 0)],
    ];
    this.resRows.textContent = "";
    for (const [k, v] of rows) {
      const row = el("div", "kj-card-row", this.resRows);
      el("span", "", row, t(k));
      el("span", "kj-num", row, v);
    }
    this.pause.style.display = "none";
    this.results.style.display = "";
    this.alert.classList.remove("on");
    this.msg.classList.remove("on");
  }

  showPause() {
    this._applyMute();
    this.pause.style.display = "";
  }

  hidePause() {
    this.pause.style.display = "none";
  }

  updateAim(aim) {
    if (!this.cross || !aim) return;
    const xq = Math.round(aim.xPct * 20), yq = Math.round(aim.yPct * 20);
    if (this._chg("cx", xq) | this._chg("cy", yq)) {
      this.cross.style.left = `${(xq / 20).toFixed(2)}%`;
      this.cross.style.top = `${(yq / 20).toFixed(2)}%`;
    }
  }

  flashHit() {
    if (!this.visible) return;
    this.flash.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 380, easing: "ease-out" });
  }

  damageFrom(fx, fz) {
    if (!this.visible) return;
    this._dmgFromX = fx;
    this._dmgFromZ = fz;
    this._dmgT = CFG.DMG_INDICATOR_SECONDS || 1.0;
  }

  announceSupply(id, mode = "drop") {
    if (!this.visible || !this.toast) return;
    const itemName = t(`kaiju_item_${id}`) || id.toUpperCase();
    this.toast.textContent = mode === "pickup"
      ? `EQUIPPED: ${itemName.toUpperCase()} — PRESS [R] TO FIRE`
      : `${t("kaiju_supply_drop")} · ${itemName} (FLY IN OR SHOOT TO EQUIP)`;
    this.toast.classList.toggle("kj-toast-pickup", mode === "pickup");
    this.toast.classList.add("on");
    this._toastT = mode === "pickup" ? 4.0 : 3.5;
  }

  // ---------------------------------------------------------------- frame
  // Change detection: returns true (and stores v) only when the value differs from last frame.
  _chg(key, v) {
    if (this._last[key] === v) return false;
    this._last[key] = v;
    return true;
  }

  update(dt) {
    if (!this.visible) return;
    const K = this.K;
    const k = K.kaiju;
    const w = K.weapons;
    this._pulse += dt;

    if (this._alertT > 0) {
      this._alertT -= dt;
      if (this._alertT <= 0) this.alert.classList.remove("on");
    }
    // Keep bottom controls instruction permanently visible while in Kaiju mode
    if (!this.hint.classList.contains("on")) this.hint.classList.add("on");

    // Kaiju HP: calculate total HP and maxHP across all monsters in the swarm
    const allKaijus = K.kaijus && K.kaijus.length > 0 ? K.kaijus : (k ? [k] : []);
    let totHp = 0, totMaxHp = 0;
    for (let i = 0; i < allKaijus.length; i++) {
      const m = allKaijus[i];
      totHp += Math.max(0, m.hp || 0);
      totMaxHp += (m.maxHp || CFG.KAIJU_MAX_HP || 18000);
    }
    const hp = totMaxHp > 0 ? Math.max(0, Math.min(1, totHp / totMaxHp)) : 0;
    const hpQ = Math.round(hp * 1000);
    if (this._chg("hp", hpQ)) this.hpFill.style.transform = `scaleX(${hpQ / 1000})`;
    const enr = allKaijus.some((m) => m && m.enraged);
    if (this._chg("enr", enr)) this.hpBar.classList.toggle("kj-enraged", enr);

    // Swarm count label
    const living = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive ? [k] : []);
    const livingCount = living.length;
    const isZh = typeof document !== "undefined" && (document.documentElement.lang === "zh" || (navigator.language && navigator.language.startsWith("zh")));
    let swarmText = "";
    if (livingCount > 0) {
      swarmText = isZh ? `怪兽群 · 剩余 ${livingCount} 只` : `KAIJU SWARM · ${livingCount} ALIVE`;
    } else {
      swarmText = isZh ? `怪兽群 · 已击溃` : `KAIJU SWARM · DEFEATED`;
    }
    if (this.nameLabel && this._chg("swarmLabel", swarmText)) {
      this.nameLabel.textContent = swarmText;
    }

    // City damage + edge glow.
    const cd = K.getCityDamage ? K.getCityDamage() : 0;
    const cdQ = Math.round(cd * 1000);
    if (this._chg("cd", cdQ)) {
      this.cityFill.style.transform = `scaleX(${cdQ / 1000})`;
      this.cityVal.textContent = `${Math.floor(cdQ / 10)}%`;
    }
    const lvl = cd >= CFG.HUD_WARN_RED ? 2 : cd >= CFG.HUD_WARN_AMBER ? 1 : 0;
    if (this._chg("lvl", lvl)) {
      this.edge.classList.toggle("kj-amber", lvl === 1);
      this.edge.classList.toggle("kj-red", lvl === 2);
      this.cityBar.classList.toggle("kj-amber", lvl === 1);
      this.cityBar.classList.toggle("kj-red", lvl === 2);
    }

    // Unit hull segments + lives.
    const h = K.heli;
    const maxHp = (K.unitMaxHealth && K.unitMaxHealth[K.activeUnit]) || CFG.HELI_HP;
    const hf = Math.max(0, Math.min(1, h.health / maxHp));
    const segOn = Math.ceil(hf * CFG.HELI_SEGMENTS - 1e-6);
    if (this._chg("seg", segOn)) {
      for (let i = 0; i < this.segs.length; i++) {
        this.segs[i].classList.toggle("on", i < segOn);
        this.segs[i].classList.toggle("low", segOn <= 3);
      }
    }
    if (this._chg("lives", h.lives)) {
      for (let i = 0; i < this.pips.length; i++) this.pips[i].classList.toggle("on", i < h.lives);
    }
    // Low health vignette (pulsing below 35%).
    const low = h.alive && hf < 0.35 ? (1 - hf / 0.35) * (0.75 + 0.25 * Math.sin(this._pulse * 6)) : 0;
    const vig = Math.round(low * 50);
    if (this._chg("vig", vig)) this.vignette.style.opacity = String(vig / 50);
    const down = !h.alive && K.state !== "results";
    if (this._chg("down", down)) {
      this.msg.textContent = down ? t("kaiju_down") : "";
      this.msg.classList.toggle("on", down);
    }

    // Weapons.
    const heatQ = Math.round((w ? Math.max(0, Math.min(1, w.heat || 0)) : 0) * 200);
    if (this._chg("heat", heatQ)) this.heatFill.style.transform = `scaleX(${heatQ / 200})`;
    const oh = !!(w && w.overheated);
    if (this._chg("oh", oh)) {
      this.heatBar.classList.toggle("kj-red", oh);
      this.heatLabel.textContent = t(oh ? "kaiju_overheat" : "kaiju_heat");
      this.heatLabel.classList.toggle("kj-label-red", oh);
    }
    const misQ = Math.round((w ? Math.max(0, Math.min(1, w.missileCooldown || 0)) : 0) * 200);
    if (this._chg("mis", misQ)) {
      this.misFill.style.transform = `scaleX(${1 - misQ / 200})`;
      this.ring.setAttribute("stroke-dashoffset", ((misQ / 200) * RING_C).toFixed(1));
      this.misBar.classList.toggle("kj-ready", misQ === 0);
      this.cross.classList.toggle("kj-mis-ready", misQ === 0);
    }

    // Dodge cooldown bar
    const dodgeQ = Math.round((K.dash ? Math.max(0, Math.min(1, K.dash.cooldown || 0)) : 0) * 200);
    if (this._chg("dodge", dodgeQ)) {
      this.dodgeFill.style.transform = `scaleX(${1 - dodgeQ / 200})`;
      this.dodgeBar.classList.toggle("kj-ready", dodgeQ === 0);
    }

    // Super weapon status
    const sup = K.super && K.super.item;
    const supKey = sup ? `${sup.id}:${sup.charges}/${sup.maxCharges}` : "";
    if (this._chg("sup", supKey)) {
      if (!sup) {
        this.superRow.style.display = "none";
      } else {
        this.superRow.style.display = "";
        this.superLabel.textContent = `${t(sup.nameKey)} [R]`;
        this.superFill.style.transform = `scaleX(${Math.max(0, Math.min(1, sup.charges / Math.max(1, sup.maxCharges)))})`;
      }
    }

    // Laser lock / Danger zone pill
    const lzPhase = k && k.laser ? k.laser.phase : "idle";
    const warnState = !h.alive ? 0 : (lzPhase === "lock" || lzPhase === "fire") ? 2 : (k && k.inDanger) ? 1 : 0;
    if (this._chg("warn", warnState)) {
      if (warnState === 2) {
        this.warnPill.textContent = `${t("kaiju_lock")} — ${t("kaiju_dodge").toUpperCase()}`;
        this.warnPill.className = "kj-warn-pill on kj-warn-lock";
      } else if (warnState === 1) {
        this.warnPill.textContent = t("kaiju_danger");
        this.warnPill.className = "kj-warn-pill on kj-warn-danger";
      } else {
        this.warnPill.className = "kj-warn-pill";
      }
    }

    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.toast.classList.remove("on");
    }

    // Lock reticle.
    const ret = w && w.reticle;
    const fighting = K.state === "fight" || K.state === "intro";
    const showLock = !!(ret && fighting && h.alive);
    if (this._chg("lockOn", showLock)) this.lock.style.display = showLock ? "" : "none";
    if (showLock) {
      const lp = Math.max(0, Math.min(1, w.lockProgress || 0));
      const locked = !!w.locked;
      const rx = Math.round(ret.x * 2), ry = Math.round(ret.y * 2);
      if (this._chg("rx", rx) | this._chg("ry", ry)) this.lock.style.transform = `translate(${rx / 2}px, ${ry / 2}px)`;
      const rot = locked ? 0 : Math.round(((1 - lp) * 90 + this._pulse * 120 * (1 - lp)) % 360);
      const sc = locked ? 100 : Math.round(100 + (1 - lp) * 70);
      if (this._chg("lrot", rot) | this._chg("lsc", sc)) this.lockG.setAttribute("transform", `rotate(${rot}) scale(${sc / 100})`);
      if (this._chg("locked", locked)) this.lock.classList.toggle("kj-locked", locked);
    }
    const crossOn = fighting && h.alive;
    if (this._chg("crossOn", crossOn)) this.cross.style.display = crossOn ? "" : "none";

    // Radar overlay (30 Hz).
    this._radarT -= dt;
    if (this.rctx && this._radarT <= 0) {
      this._radarT = 1 / 30;
      this._drawRadar();
    }
  }

  _proj(x, z, out) {
    const p = this._pr, o = p.o;
    out[0] = (lonToMx(o.centerLon + x / o.mPerDegLon) - p.pmx) * p.ws;
    out[1] = (latToMy(o.centerLat - z / o.mPerDegLat) - p.pmy) * p.ws;
    return out;
  }

  _drawRadar() {
    const ctx = this.rctx;
    const S = RADAR_SIZE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.radar.width, this.radar.height);
    const K = this.K;
    const k = K.kaiju;
    const ms = K.app.mapSystem;
    const o = ms && ms.navigator && ms.navigator.origin;
    if (!k || !k.position || !o) return;
    const zoom = ms._mmZoom || 15.7;
    const ws = 256 * Math.pow(2, zoom);
    const p = K.app.pos;
    const pmx = lonToMx(o.centerLon + p.x / o.mPerDegLon);
    const pmy = latToMy(o.centerLat - p.z / o.mPerDegLat);
    const pr = this._pr || (this._pr = { o: null, pmx: 0, pmy: 0, ws: 0 });
    pr.o = o; pr.pmx = pmx; pr.pmy = pmy; pr.ws = ws;
    const tmp = this._rtmp || (this._rtmp = [0, 0]);
    const rot = (K.app.yaw || 0) - Math.PI; // same heading-up rotation as the minimap

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(rot);

    // Supply drop markers (cyan/amber diamonds).
    const drops = K.supply && K.supply.drops;
    if (drops && drops.length > 0) {
      const limD = S * 0.44;
      for (let i = 0; i < drops.length; i++) {
        const dr = drops[i];
        this._proj(dr.x, dr.z, tmp);
        let dx = tmp[0], dy = tmp[1];
        const dd = Math.hypot(dx, dy);
        if (dd > limD) { dx = (dx / dd) * limD; dy = (dy / dd) * limD; }
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(-rot);
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 5);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fillStyle = dr.danger ? "rgba(255, 190, 50, 0.95)" : "rgba(56, 242, 255, 0.95)";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(0, 20, 30, 0.85)";
        ctx.stroke();
        ctx.restore();
      }
    }

    // Laser beam on radar (lock / fire).
    if (k.laser && (k.laser.phase === "lock" || k.laser.phase === "fire") && k.laser.dir) {
      const lo = k.laser.origin || k.position;
      const llen = Math.max(80, k.laser.length || 600);
      this._proj(lo.x, lo.z, tmp);
      const x0 = tmp[0], y0 = tmp[1];
      this._proj(lo.x + k.laser.dir.x * llen, lo.z + k.laser.dir.z * llen, tmp);
      const x1 = tmp[0], y1 = tmp[1];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      if (k.laser.phase === "fire") {
        ctx.strokeStyle = "rgba(255, 50, 50, 0.9)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 240, 240, 0.95)";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255, 60, 60, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Breath cone (telegraph -> active).
    const charge = k.breathActive ? 1 : Math.max(0, Math.min(1, k.breathCharge || 0));
    if (charge > 0 && k.breathDir) {
      const bx = k.breathOrigin && (k.breathOrigin.x || k.breathOrigin.z) ? k.breathOrigin.x : k.position.x;
      const bz = k.breathOrigin && (k.breathOrigin.x || k.breathOrigin.z) ? k.breathOrigin.z : k.position.z;
      const base = Math.atan2(k.breathDir.x, k.breathDir.z);
      const half = (CFG.BREATH_HALF_ANGLE_DEG * Math.PI) / 180;
      const R = CFG.BREATH_RANGE * (k.breathActive ? 1 : 0.35 + 0.65 * charge);
      this._proj(bx, bz, tmp);
      ctx.beginPath();
      ctx.moveTo(tmp[0], tmp[1]);
      for (let i = 0; i <= 6; i++) {
        const a = base - half + (2 * half * i) / 6;
        this._proj(bx + Math.sin(a) * R, bz + Math.cos(a) * R, tmp);
        ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.closePath();
      ctx.fillStyle = k.breathActive ? "rgba(255, 120, 40, 0.55)" : `rgba(255, 80, 60, ${(0.12 + 0.25 * charge).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 150, 90, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Kaiju markers for all living kaijus (clamped to the radar edge when out of range).
    const livingRadar = K.getLivingKaijus ? K.getLivingKaijus() : (k && k.alive ? [k] : []);
    for (let rIdx = 0; rIdx < livingRadar.length; rIdx++) {
      const mon = livingRadar[rIdx];
      if (!mon || !mon.position) continue;
      this._proj(mon.position.x, mon.position.z, tmp);
      let mx = tmp[0], my = tmp[1];
      const lim = S * 0.46;
      const d = Math.hypot(mx, my);
      const edge = d > lim;
      if (edge) {
        mx = (mx / d) * lim;
        my = (my / d) * lim;
      }
      const pulse = 0.5 + 0.5 * Math.sin(this._pulse * 5);
      ctx.fillStyle = "rgba(255, 70, 60, 0.95)";
      if (edge) {
        // Small arrow pointing outwards.
        const a = Math.atan2(my, mx);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(mx, my, 7 + pulse * 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 70, 60, ${(0.35 - pulse * 0.3).toFixed(3)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 70, 60, 0.95)";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(20, 0, 0, 0.8)";
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
