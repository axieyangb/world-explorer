import * as THREE from '../../vendor/three.module.js';

/**
 * Day/night sky dome material: gradient + golden-hour horizon glow + sun disc + phased moon + stars
 * + aurora curtains (aurora.js) + procedural drifting cloud layer + fog blend. Uniform names stay compatible with the original
 * createAtmosphericSkyDome() (uSunDir, uZenithColor, uHorizonColor, uGroundColor, uSunColor, uSunIntensity).
 */
export function createSkyMaterial() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.6, -0.4).normalize() },
    uZenithColor: { value: new THREE.Color(0x2b6cb0) },
    uHorizonColor: { value: new THREE.Color(0xbfd8ec) },
    uGroundColor: { value: new THREE.Color(0x636e72) },
    uSunColor: { value: new THREE.Color(0xfff3d1) },
    uSunIntensity: { value: 1.0 },
    uMoonIntensity: { value: 0.0 },
    uStars: { value: 0.0 },
    uStarRot: { value: new THREE.Matrix3() },
    uGlow: { value: 0.0 },
    uCloudCover: { value: 0.25 },
    uCloudLit: { value: new THREE.Color(0xffffff) },
    uCloudDark: { value: new THREE.Color(0x8a96a3) },
    uFogMix: { value: 0.0 },
    uFogColor: { value: new THREE.Color(0xbfd8ec) },
    uTime: { value: 0.0 },
    // [aurora] intensity (already x night darkness), xz unit vector toward the arc, arc ground distance (km)
    uAurora: { value: 0.0 },
    uAuroraDir: { value: new THREE.Vector2(0, -1) },
    uAuroraDist: { value: 400.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      uniform float uMoonIntensity;
      uniform float uStars;
      uniform mat3 uStarRot;
      uniform float uGlow;
      uniform float uCloudCover;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudDark;
      uniform float uFogMix;
      uniform vec3 uFogColor;
      uniform float uTime;
      uniform float uAurora;
      uniform vec2 uAuroraDir;
      uniform float uAuroraDist;
      varying vec3 vWorldDir;

      float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
        return s;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;
        vec3 sunD = normalize(uSunDir);
        float upT = pow(clamp(y, 0.0, 1.0), 0.52);
        vec3 col = mix(uHorizonColor, uZenithColor, upT);

        // Golden-hour / twilight glow hugging the horizon on the sun side
        vec2 hd = normalize(dir.xz + vec2(1e-5));
        vec2 hs = normalize(sunD.xz + vec2(1e-5));
        float az = max(dot(hd, hs), 0.0);
        float band = exp(-abs(y - 0.02) * 7.0);
        col += vec3(1.0, 0.42, 0.14) * uGlow * band * (0.25 + 0.75 * pow(az, 3.0));
        col += vec3(0.55, 0.30, 0.45) * uGlow * 0.25 * band * (1.0 - az);

        float above = smoothstep(-0.02, 0.03, y);

        // Stars (rotating with the celestial sphere)
        if (uStars > 0.001 && y > 0.0) {
          vec3 sd = uStarRot * dir;
          vec3 cell = floor(sd * 220.0);
          float h = hash3(cell);
          if (h > 0.9955) {
            vec3 c = (cell + 0.5) / 220.0;
            float d = length(sd - normalize(c)) * 220.0;
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 9.0) + h * 300.0);
            float mag = (h - 0.9955) / 0.0045;
            col += vec3(0.85, 0.9, 1.0) * smoothstep(0.42, 0.0, d) * uStars * tw * (0.35 + 1.4 * mag) * smoothstep(0.0, 0.15, y);
          }
        }

        // Moon with phase shading
        vec3 moonD = normalize(uMoonDir);
        float md = dot(dir, moonD);
        if (uMoonIntensity > 0.001) {
          float rM = 0.024;
          vec3 t = (dir - moonD * md) / rM;
          float r2 = dot(t, t);
          if (md > 0.0 && r2 < 1.0) {
            vec3 n = t - moonD * sqrt(1.0 - r2);
            float lit = smoothstep(-0.06, 0.12, dot(n, sunD));
            float mare = 0.8 + 0.2 * vnoise(t.xy * 3.0 + t.z * 2.0);
            float edge = smoothstep(1.0, 0.86, r2);
            col = mix(col, vec3(0.93, 0.92, 0.86) * (0.06 + 1.1 * lit * mare), edge * uMoonIntensity * above);
          }
          col += vec3(0.6, 0.7, 0.9) * pow(max(md, 0.0), 900.0) * 0.35 * uMoonIntensity * above;
        }

        // Sun glow + disc
        float sunDot = max(0.0, dot(dir, sunD));
        float mieGlow = pow(sunDot, 10.0) * 0.32 * uSunIntensity;
        float sunDisc = smoothstep(0.9982, 0.9996, sunDot) * 1.35 * uSunIntensity * above;
        col += uSunColor * (mieGlow + sunDisc);

        // Aurora: curtains on an arc uAuroraDist km away (and a fainter one further out), 100 km up to
        // 210-350 km. Each view ray is intersected with the arc in true geometry (incl. Earth curvature)
        // so a near arc stands high and a far one sinks to the horizon and bends down at its ends.
        if (uAurora > 0.002 && y > 0.0) {
          float hl = max(length(dir.xz), 1e-4);
          vec2 hv = dir.xz / hl;
          float cphi = dot(hv, uAuroraDir);
          float tanY = y / hl;
          vec3 aur = vec3(0.0);
          if (cphi > 0.03) {
            float sphi = hv.x * uAuroraDir.y - hv.y * uAuroraDir.x;
            float ext = 110.0 + 140.0 * uAurora;
            for (int k = 0; k < 2; k++) {
              float fk = float(k);
              float D = uAuroraDist * (1.0 + 0.6 * fk) + 60.0 * fk;
              float sk = D * sphi / cphi; // km along the arc
              float t = uTime + fk * 37.0;
              // the curtain folds and ripples: its ground distance wanders along the arc
              float wob = (vnoise(vec2(sk * 0.004 + t * 0.012, fk * 3.1)) - 0.5) * 160.0
                        + (vnoise(vec2(sk * 0.013 - t * 0.03, 5.0 + fk)) - 0.5) * 50.0;
              float dist = max(D + wob, 12.0) / cphi;
              float alt = tanY * dist + dist * dist / 12742.0;
              float v = (alt - 100.0) / ext;
              if (v > -0.15 && v < 1.3) {
                // vertical rays shimmering along the curtain, patchy brightness drifting along the arc
                float r = vnoise(vec2(sk * 0.05 + t * 0.18, fk * 11.0)) * 0.6
                        + vnoise(vec2(sk * 0.17 - t * 0.41, 2.0 + fk * 7.0)) * 0.4;
                float rays = 0.25 + 1.5 * r * r;
                float patchy = smoothstep(0.15, 0.8, vnoise(vec2(sk * 0.0022 - t * 0.02, 9.0 + fk * 4.0)) * 0.7 + vnoise(vec2(sk * 0.009 + t * 0.05, 3.0)) * 0.3);
                float lower = smoothstep(-0.07, 0.01, v + 0.025 * sin(sk * 0.02 + t * 0.7));
                float green = lower * exp(-max(v, 0.0) * 3.6);
                float red = smoothstep(0.2, 0.6, v) * (1.0 - smoothstep(0.75, 1.25, v)) * (0.25 + 0.75 * smoothstep(0.35, 0.9, uAurora));
                float fringe = smoothstep(0.02, -0.05, v) * lower * smoothstep(0.5, 1.0, uAurora);
                vec3 c = vec3(0.16, 1.0, 0.5) * green + vec3(0.7, 0.12, 0.42) * red * 0.55 + vec3(0.85, 0.2, 0.65) * fringe * 0.8;
                // dimmer far away and through the thick air near the horizon
                float fade = exp(-dist / 1600.0) * (0.35 + 0.65 * smoothstep(0.0, 0.2, y));
                aur += c * rays * patchy * fade * (1.0 - 0.45 * fk);
              }
            }
            // soft airglow under the arc
            aur += vec3(0.08, 0.5, 0.25) * 0.12 * exp(-y * 6.0) * smoothstep(0.03, 0.6, cphi) * smoothstep(1800.0, 300.0, uAuroraDist);
          }
          col += aur * uAurora * 0.75 * above;
        }

        // Procedural cloud layer (planar projection, drifting)
        if (uCloudCover > 0.01 && y > -0.02) {
          vec2 cuv = dir.xz / (max(y, 0.0) + 0.09) * 0.55 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(cuv);
          float cov = smoothstep(1.02 - uCloudCover, 1.28 - uCloudCover * 0.9, n + 0.12);
          cov *= smoothstep(-0.02, 0.10, y);
          float shade = fbm(cuv * 1.7 + 4.0);
          vec3 cc = mix(uCloudDark, uCloudLit, clamp(0.25 + shade * 0.9 - cov * 0.35, 0.0, 1.0));
          cc += uSunColor * pow(sunDot, 6.0) * 0.45 * uSunIntensity * (1.0 - cov * 0.6);
          col = mix(col, cc, cov * 0.96);
        }

        if (y < 0.0) {
          col = mix(col, uGroundColor, clamp(-y * 4.0, 0.0, 1.0));
        }

        col = mix(col, uFogColor, uFogMix * (1.0 - 0.3 * smoothstep(0.0, 0.8, y)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return { material, uniforms };
}
