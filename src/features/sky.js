import * as THREE from '../../vendor/three.module.js';

/**
 * Day/night sky dome material: Rayleigh-Mie gradient + golden-hour horizon glow + sun disc + phased moon + stars
 * + aurora curtains (aurora.js) + high-altitude cirrus wisps + procedural domain-warped Perlin-Worley volumetric
 * cumulus cloud layer with Beer-Lambert sun shadowing and Henyey-Greenstein silver-lining rim scatter + fog/haze blend.
 * Uniform names stay compatible with createAtmosphericSkyDome()
 * (uSunDir, uZenithColor, uHorizonColor, uGroundColor, uSunColor, uSunIntensity).
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
    // [ground] horizon haze: display-space colour of fully fogged terrain (scene fog is applied after tone mapping),
    // so the distant ground, the haze band and the sky meet without a seam
    uHazeColor: { value: new THREE.Color(0xbfd8ec) },
    uHaze: { value: 0.0 },
    uTime: { value: 0.0 },
    // [aurora] intensity (already x night darkness), xz unit vector toward the arc, arc ground distance (km)
    uAurora: { value: 0.0 },
    uAuroraDir: { value: new THREE.Vector2(0, -1) },
    uAuroraDist: { value: 400.0 },
    uCityGlow: { value: 0.0 }, // [night] urban light pollution (0 by day), from atmosphere.js
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
      uniform vec3 uHazeColor;
      uniform float uHaze;
      uniform float uTime;
      uniform float uAurora;
      uniform vec2 uAuroraDir;
      uniform float uAuroraDist;
      uniform float uCityGlow;
      varying vec3 vWorldDir;

      float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 5; i++) {
          s += a * vnoise(p);
          p = rot * p * 2.03 + vec2(17.1, 9.2);
          a *= 0.5;
        }
        return s;
      }
      // Inverted Worley cellular billow noise for cauliflower cumulus turrets
      float worleyBillow(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float minDist = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 pt = hash22(i + neighbor);
            vec2 diff = neighbor + pt - f;
            minDist = min(minDist, dot(diff, diff));
          }
        }
        return 1.0 - sqrt(clamp(minDist, 0.0, 1.0));
      }
      float worleyFbm(vec2 p) {
        return worleyBillow(p) * 0.625 + worleyBillow(p * 2.15 + vec2(7.3, 13.1)) * 0.25 + worleyBillow(p * 4.4 + vec2(19.7, 5.4)) * 0.125;
      }
      // Domain-warped Perlin-Worley volumetric cloud field (zero circular/oval blob artifacts)
      float sampleCloudField(vec2 p, float cover) {
        vec2 q = p + 0.55 * vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
        vec2 r = p + 0.85 * vec2(fbm(q * 1.9 + vec2(1.7, 9.2)), fbm(q * 1.9 + vec2(2.8, 8.3)));
        float baseFbm = fbm(r);
        float billow = worleyFbm(r * 1.65);
        // Remap Perlin FBM with Worley cellular billow turrets & wispy turbulent edge erosion
        float perlinWorley = mix(baseFbm, billow, 0.36);
        float detailErode = (1.0 - billow) * 0.22 + (1.0 - abs(vnoise(r * 4.8) * 2.0 - 1.0)) * 0.10;
        float raw = perlinWorley - detailErode * (1.0 - 0.52 * cover);
        float thresh = 0.76 - cover * 0.58;
        return smoothstep(thresh, thresh + 0.32, raw);
      }
      // Henyey-Greenstein phase function for forward-scattered cloud silver linings and Mie haze
      float hgPhase(float cosTheta, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 1e-4), 1.5));
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = dir.y;
        vec3 sunD = normalize(uSunDir);
        float sunDot = max(0.0, dot(dir, sunD));
        float upT = pow(clamp(y, 0.0, 1.0), 0.50);
        vec3 col = mix(uHorizonColor, uZenithColor, upT);

        // Rayleigh-Mie golden-hour / twilight aerial glow hugging the horizon on the sun side
        vec2 hd = normalize(dir.xz + vec2(1e-5));
        vec2 hs = normalize(sunD.xz + vec2(1e-5));
        float az = max(dot(hd, hs), 0.0);
        float band = exp(-abs(y - 0.02) * 6.5);
        float upperBand = exp(-max(y, 0.0) * 3.0);
        col += vec3(1.0, 0.44, 0.15) * uGlow * band * (0.28 + 0.78 * pow(az, 2.8));
        col += vec3(0.95, 0.54, 0.36) * uGlow * upperBand * 0.24 * (0.35 + 0.65 * pow(az, 1.5));

        float above = smoothstep(-0.02, 0.03, y);

        // Stars (rotated with the celestial sphere) + subtle Milky Way band
        if (uStars > 0.002 && y > -0.02) {
          vec3 sd = uStarRot * dir;
          vec3 cell = floor(sd * 230.0);
          vec3 f = fract(sd * 230.0) - 0.5;
          float h = hash3(cell);
          if (h > 0.9905) {
            float r2 = dot(f, f);
            float br = (h - 0.9905) / 0.0095;
            float tw = 0.76 + 0.24 * sin(uTime * (1.5 + br * 4.0) + h * 600.0);
            float star = smoothstep(0.09, 0.0, r2) * (0.35 + 1.15 * br * br) * tw;
            vec3 tint = mix(vec3(1.0, 0.86, 0.74), vec3(0.76, 0.86, 1.0), fract(h * 91.7));
            col += tint * star * uStars * smoothstep(0.0, 0.18, y);
          }
          // Second sparser layer of brighter navigation stars
          vec3 cellB = floor(sd * 95.0);
          vec3 fB = fract(sd * 95.0) - 0.5;
          float hB = hash3(cellB + 19.3);
          if (hB > 0.9962) {
            float r2B = dot(fB, fB);
            float starB = smoothstep(0.065, 0.0, r2B) * 1.45;
            col += vec3(0.88, 0.93, 1.0) * starB * uStars * smoothstep(0.02, 0.22, y);
          }
          float mw = exp(-abs(sd.y * 0.7 - sd.x * 0.5) * 4.8) * fbm(sd.xz * 3.5);
          col += vec3(0.11, 0.15, 0.26) * mw * uStars * 0.48 * smoothstep(0.05, 0.35, y);
        }

        // Sun: Mie forward-scatter halo + corona + crisp limb-darkened solar disc
        if (uSunIntensity > 0.002) {
          float mie = min(hgPhase(sunDot, 0.78), 2.8) * 0.14 + pow(sunDot, 7.0) * 0.22 + pow(sunDot, 42.0) * 0.28;
          float disc = smoothstep(0.9983, 0.99955, sunDot) * 1.35;
          col += uSunColor * (mie + disc * above) * uSunIntensity;
        }

        // Moon: soft glow + sunlit crescent (shaded on the side facing uSunDir) + faint lunar maria
        if (uMoonIntensity > 0.002 && y > -0.05) {
          vec3 moonD = normalize(uMoonDir);
          float mDot = dot(dir, moonD);
          float mGlow = pow(max(0.0, mDot), 28.0) * 0.20;
          float mDisc = smoothstep(0.9988, 0.99935, mDot);
          vec3 rVec = dir - moonD * mDot;
          float r2 = max(0.0, 1.0 - mDot * mDot);
          float rNorm = sqrt(r2 / 0.0024);
          vec3 mNorm = normalize(moonD * sqrt(max(0.0, 1.0 - min(1.0, rNorm * rNorm))) + rVec / sqrt(0.0024));
          float lit = smoothstep(-0.08, 0.18, dot(mNorm, sunD));
          float earthshine = 0.07;
          float maria = 0.88 + 0.12 * vnoise(mNorm.xy * 5.5 + 2.1);
          vec3 moonCol = vec3(0.86, 0.91, 1.0) * (mGlow + mDisc * maria * (earthshine + 0.98 * lit) * above);
          col += moonCol * uMoonIntensity;
        }

        // [aurora] Polar aurora oval (100-350 km altitude): 3 undulating curtains at ground distance uAuroraDist
        if (uAurora > 0.002 && y > 0.0) {
          vec2 hdir = normalize(dir.xz + vec2(1e-5));
          float cphi = dot(hdir, uAuroraDir); // cos of azimuth from the poleward bearing
          vec3 aur = vec3(0.0);
          if (cphi > 0.03) {
            float sphi = hdir.x * uAuroraDir.y - hdir.y * uAuroraDir.x;
            float tanY = y / max(length(dir.xz), 0.04);
            float t = uTime;
            for (int k = 0; k < 3; k++) {
              float fk = float(k);
              float D = uAuroraDist + (fk - 1.0) * 95.0; // three parallel arcs ~95 km apart
              float s0 = D * sphi / cphi; // km along the arc
              float ext = 210.0 + 40.0 * fk;
              // large-scale meandering fold of the curtain (hundreds of km) + medium ripple
              float sk = s0 + fk * 130.0;
              float wob = (vnoise(vec2(sk * 0.0035 + t * 0.014, 1.7 + fk * 3.1)) - 0.5) * 160.0
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

        // High-altitude cirrus / anvil filaments above the main cumulus layer (dir.y > 0.12)
        if (y > 0.12 && uCloudCover > 0.005) {
          vec2 cirUv = dir.xz / (y + 0.32) * 1.10 + vec2(uTime * 0.0016, -uTime * 0.0008);
          vec2 qCir = cirUv + 0.55 * vec2(fbm(cirUv * 1.2), fbm(cirUv * 1.2 + 5.2));
          float wisp = fbm(vec2(qCir.x * 2.8, qCir.y * 0.95)) * 0.68
                     + vnoise(qCir * 5.8) * 0.32;
          float cirMask = smoothstep(0.12, 0.34, y) * (0.22 + 0.38 * min(uCloudCover, 0.75));
          float cir = smoothstep(0.55 - uCloudCover * 0.14, 0.86, wisp) * cirMask;
          vec3 cirCol = mix(uCloudLit, uSunColor, clamp(0.22 + 0.45 * uGlow, 0.0, 0.75));
          cirCol += uSunColor * min(hgPhase(sunDot, 0.68), 2.4) * 0.28 * uSunIntensity;
          col = mix(col, cirCol, cir * 0.40);
        }

        // Domain-warped Perlin-Worley FBM volumetric cumulus & stratocumulus layer with 3-step sun raymarch shadowing
        if (uCloudCover > 0.01 && y > -0.02) {
          // Curved dome projection prevents extreme horizon stretching while preserving wide natural cloud perspectives
          float domeY = sqrt(max(y, 0.0) * max(y, 0.0) + 0.035) + 0.04;
          vec2 wind = vec2(uTime * 0.0055, uTime * 0.0018);
          vec2 cuv = dir.xz / domeY * 0.62 + wind;

          float cov = sampleCloudField(cuv, uCloudCover);
          cov *= smoothstep(0.0, 0.15, y); // [ground] the deck thins into the horizon haze instead of ending on a line

          if (cov > 0.003) {
            // 3-step self-shadowing raymarch along the horizontal sun vector inside the cloud layer
            vec2 sunStep = normalize(sunD.xz + vec2(1e-4)) * 0.11;
            float d1 = sampleCloudField(cuv + sunStep * 0.55, uCloudCover);
            float d2 = sampleCloudField(cuv + sunStep * 1.25, uCloudCover);
            float d3 = sampleCloudField(cuv + sunStep * 2.35, uCloudCover);
            float densityTowardsSun = (d1 * 0.45 + d2 * 0.35 + d3 * 0.20) * (1.0 + 0.65 * uCloudCover);

            // Beer-Lambert light transmittance + dual-lobe powder sugar effect
            float beer = exp(-densityTowardsSun * 2.15);
            float powder = 1.0 - exp(-cov * 3.8);
            float lightTrans = mix(beer, beer * (0.55 + 0.75 * powder), 0.65);

            // Internal cauliflower turret shading + dark moisture-laden rain bases in heavy cloud/overcast mode
            float turretHighlight = worleyBillow(cuv * 2.8 + vec2(3.1, 7.4)) * 0.28 + fbm(cuv * 2.2 + 4.0) * 0.32;
            float overcastWeight = smoothstep(0.48, 0.88, uCloudCover);
            vec3 deepBaseCol = mix(uCloudDark, uCloudDark * vec3(0.66, 0.70, 0.77), overcastWeight * 0.75);
            float litFactor = clamp(0.16 + lightTrans * 0.76 + turretHighlight * (1.0 - 0.45 * cov) - cov * (0.24 + 0.26 * overcastWeight), 0.0, 1.0);
            vec3 cc = mix(deepBaseCol, uCloudLit, litFactor);

            // Henyey-Greenstein forward-scattered silver-lining rim glow on wispy cloud edges near the sun vector
            float hg = min(hgPhase(sunDot, 0.76), 3.6) * 0.78 + pow(sunDot, 6.0) * 0.48;
            float silverRim = smoothstep(0.02, 0.34, cov) * (1.0 - smoothstep(0.38, 0.88, cov)) * exp(-densityTowardsSun * 1.4);
            float multiScatter = exp(-cov * 2.1) * powder;
            cc += uSunColor * hg * (silverRim * 0.62 + multiScatter * 0.34 + beer * 0.18) * uSunIntensity;

            col = mix(col, cc, cov * 0.96);
          }
        }

        // [ground] Aerial perspective: towards the horizon the sky fades into the same haze the fog paints on the far
        // terrain; below the horizon (past the world's edge) there is only haze.
        float hzK = exp(-max(y, 0.0) * 13.0) * (1.0 - 0.35 * smoothstep(0.0, 0.25, y));
        col = mix(col, uHazeColor, clamp(hzK, 0.0, 1.0) * uHaze);
        if (y < 0.0) {
          col = mix(col, uHaze > 0.0 ? uHazeColor : uGroundColor, clamp(-y * 4.0, 0.0, 1.0));
        }

        // [night] sodium / LED glow of the city scattered in the low sky (and lighting cloud bases from below)
        if (uCityGlow > 0.001) {
          float hy = max(y, 0.0);
          float lowSky = exp(-hy * 9.0) * 0.75 + exp(-hy * 2.2) * 0.18;
          col += vec3(0.42, 0.27, 0.15) * uCityGlow * lowSky * (y < 0.0 ? 0.6 : 1.0);
        }

        col = mix(col, uFogColor, uFogMix * (1.0 - 0.3 * smoothstep(0.0, 0.8, y)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return { material, uniforms };
}
