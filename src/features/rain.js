import * as THREE from '../../vendor/three.module.js';

/**
 * GPU rain: one LineSegments draw call. Streaks live in a world-anchored box that wraps around the
 * camera entirely in the vertex shader (no per-frame CPU work besides two uniforms).
 */
export function createRain(count = 7000) {
  const pos = new Float32Array(count * 2 * 3);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos[j * 3] = x;
      pos[j * 3 + 1] = y;
      pos[j * 3 + 2] = z;
      end[j] = k;
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));

  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uBox: { value: new THREE.Vector3(80, 46, 80) },
    uWind: { value: new THREE.Vector2(2.2, 0.8) },
    uColor: { value: new THREE.Color(0xaab4c0) },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aEnd;
      uniform vec3 uCam;
      uniform float uTime;
      uniform vec3 uBox;
      uniform vec2 uWind;
      varying float vA;
      void main() {
        float speed = 9.0 + position.x * 3.0;
        vec3 p = position * uBox;
        p.y -= uTime * speed;
        p.xz += uWind * (uTime * speed / 9.0);
        vec3 base = uCam - uBox * 0.5;
        vec3 w = base + mod(p - base, uBox);
        float len = 0.55 + position.z * 0.35;
        vec3 vel = normalize(vec3(uWind.x / 9.0, -1.0, uWind.y / 9.0));
        w -= vel * len * aEnd;
        vec3 rel = w - uCam;
        float dist = length(rel);
        vA = (1.0 - aEnd * 0.85) * smoothstep(uBox.x * 0.5, uBox.x * 0.25, length(rel.xz)) * smoothstep(1.0, 3.0, dist);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        gl_FragColor = vec4(uColor, vA * uOpacity);
      }
    `,
  });
  const mesh = new THREE.LineSegments(geom, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return { mesh, uniforms };
}
