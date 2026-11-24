import {
  AdditiveBlending, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedBufferAttribute,
  InstancedMesh, PlaneGeometry, ShaderMaterial, SphereGeometry, TorusGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEX, col, lerp, rng } from '../../palette'
import { cityUniforms, common } from './glsl'

/** Where people can walk: the pavement between the kerb and the shopfronts. */
export interface Pavement { inner: number; outer: number; top: number; zMin: number; zMax: number }

const GLOW = [col(HEX.pink), col(HEX.cyan), col(0xff9a3c), col(0xf4f0ff), col(0xb6ff3c)]

/**
 * Life at street level: crowds of dark figures walking the pavements, many under umbrellas with
 * glowing rims, and steam rising from the road. Walking happens in the vertex shader from the
 * shared clock, so the crowd costs no work per frame and four draw calls in all.
 */
export class StreetLife {
  readonly group = new Group()
  private readonly crowd: InstancedMesh[] = []

  constructor(p: Pavement, count: number) {
    const rand = rng(2077)
    const range = p.zMax - p.zMin

    // A person: legs, coat, head. With an umbrella, a canopy and handle on top.
    const person = () => [
      new CylinderGeometry(0.2, 0.14, 0.85, 5).translate(0, 0.42, 0),
      new CylinderGeometry(0.17, 0.25, 0.75, 6).translate(0, 1.2, 0),
      new SphereGeometry(0.13, 6, 4).translate(0, 1.7, 0),
    ]
    const bodyU = mergeGeometries([
      ...person(),
      new ConeGeometry(0.62, 0.32, 9, 1, true).translate(0, 2.18, 0),
      new CylinderGeometry(0.012, 0.012, 0.6, 3).translate(0, 1.85, 0),
    ])!
    const bodyW = mergeGeometries(person())!
    // The glowing parts: the umbrella's rim and shaft, or a lit collar and a visor.
    const glowU = mergeGeometries([
      new TorusGeometry(0.62, 0.045, 3, 18).rotateX(Math.PI / 2).translate(0, 2.02, 0),
      new CylinderGeometry(0.03, 0.03, 0.5, 4).translate(0, 2.0, 0),
    ])!
    const glowW = mergeGeometries([
      new TorusGeometry(0.19, 0.035, 4, 12).rotateX(Math.PI / 2).translate(0, 1.56, 0),
      new TorusGeometry(0.135, 0.03, 4, 12, Math.PI).rotateX(Math.PI / 2).translate(0, 1.72, 0),
    ])!

    const walkers = (n: number) => {
      // x on the pavement, starting z, speed (sign is direction), size.
      const walk = new Float32Array(n * 4)
      const glow = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const side = rand() > 0.5 ? 1 : -1
        const dir = rand() > 0.5 ? 1 : -1
        walk.set([side * lerp(p.inner, p.outer, rand()), p.zMin + rand() * range, dir * lerp(0.9, 1.7, rand()), lerp(0.88, 1.1, rand())], i * 4)
        const c = GLOW[Math.floor(rand() * GLOW.length)]!
        glow.set([c.r, c.g, c.b], i * 3)
      }
      return { walk: new InstancedBufferAttribute(walk, 4), glow: new InstancedBufferAttribute(glow, 3) }
    }

    const vertex = /* glsl */ `
      attribute vec4 aWalk; attribute vec3 aGlow;
      uniform float uTime; uniform float uZMin; uniform float uRange; uniform float uTop;
      varying vec3 vWorld; varying vec3 vGlow; varying float vUp;
      void main() {
        float z = uZMin + mod(aWalk.y - uZMin + aWalk.z * uTime, uRange);
        float bob = abs(sin(uTime * abs(aWalk.z) * 3.4 + aWalk.y)) * 0.05;
        vec3 w = position * aWalk.w + vec3(aWalk.x, uTop + bob, z);
        vWorld = w; vGlow = aGlow; vUp = normal.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }
    `
    const uniforms = { ...cityUniforms, uZMin: { value: p.zMin }, uRange: { value: range }, uTop: { value: p.top } }
    // Bodies are silhouettes against the shopfronts, with a little rain sheen on top.
    const bodyMat = new ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vGlow; varying float vUp;
        ${common}
        void main() {
          vec3 c = vec3(0.012, 0.01, 0.02) + zoneColor(vWorld.z) * 0.05 * max(vUp, 0.0);
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }
      `,
    })
    const glowMat = new ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vGlow; varying float vUp;
        ${common}
        void main() {
          float d = distance(vWorld, cameraPosition);
          gl_FragColor = vec4(vGlow * 4.0 * exp(-d * 0.0025), 1.0);
        }
      `,
      toneMapped: false,
    })

    // About half the crowd carries umbrellas.
    const nU = Math.round(count * 0.55)
    for (const [n, body, glow] of [[nU, bodyU, glowU], [count - nU, bodyW, glowW]] as const) {
      const a = walkers(n)
      for (const [geo, mat] of [[body, bodyMat], [glow, glowMat]] as const) {
        geo.setAttribute('aWalk', a.walk)
        geo.setAttribute('aGlow', a.glow)
        const mesh = new InstancedMesh(geo, mat, n)
        mesh.frustumCulled = false
        this.crowd.push(mesh)
        this.group.add(mesh)
      }
    }

    this.group.add(this.steam(p, rand))
  }

  /**
   * Cones of lamplight through the rain under each street lamp: an additive cone that is
   * brightest at the lamp and soft at its edges, so the beam reads as lit air.
   */
  lampBeams(heads: { x: number; y: number; z: number }[], color: Color) {
    const geo = new ConeGeometry(3.2, 1, 14, 1, true).translate(0, -0.5, 0)
    const at = new Float32Array(heads.length * 4)
    heads.forEach((h, i) => at.set([h.x, h.y, h.z, i * 1.7], i * 4))
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    const mat = new ShaderMaterial({
      uniforms: { ...cityUniforms, uColor: { value: color } },
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aAt; varying float vH; varying vec3 vWorld; varying vec3 vN; varying float vSeed;
        void main() {
          vH = -position.y; vSeed = aAt.w;
          vec3 w = vec3(position.x, position.y * aAt.y, position.z) + aAt.xyz;
          vWorld = w; vN = normal;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vH; varying vec3 vWorld; varying vec3 vN; varying float vSeed;
        ${common}
        void main() {
          vec3 v = normalize(cameraPosition - vWorld);
          float face = pow(abs(dot(normalize(vN), v)), 1.5);
          float fall = (1.0 - vH) * (1.0 - vH) * 0.85 + 0.15;
          // Rain drifting through the beam.
          float streak = 0.75 + 0.25 * vnoise(vec2(vWorld.x * 6.0 + vWorld.z * 6.0, vWorld.y * 0.6 + uTime * 9.0 + vSeed));
          float d = distance(vWorld, cameraPosition);
          gl_FragColor = vec4(uColor * face * fall * streak * 0.4 * exp(-d * 0.004), 1.0);
        }
      `,
    })
    const mesh = new InstancedMesh(geo, mat, heads.length)
    mesh.frustumCulled = false
    this.group.add(mesh)
  }

  /** Show fewer people on slow devices. */
  setLite(lite: boolean) {
    for (const m of this.crowd) m.count = lite ? Math.floor(m.geometry.getAttribute('aWalk').count / 2) : m.geometry.getAttribute('aWalk').count
  }

  /** Columns of steam from vents in the road, lit by whatever district they rise in. */
  private steam(p: Pavement, rand: () => number) {
    const n = 50
    const at = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const onRoad = rand() > 0.4
      const x = (rand() > 0.5 ? 1 : -1) * (onRoad ? lerp(1, p.inner - 2, rand()) : lerp(p.inner, p.outer + 1, rand()))
      at.set([x, p.zMin + 20 + rand() * (p.zMax - p.zMin - 40), lerp(8, 18, rand()), rand() * 50], i * 4)
    }
    const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0)
    geo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    const mat = new ShaderMaterial({
      uniforms: { ...cityUniforms },
      transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aAt; varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
        void main() {
          vUv = uv; vSeed = aAt.w;
          vec3 base = vec3(aAt.x, 0.0, aAt.y);
          // Turn to face the camera around the vertical.
          vec3 toCam = cameraPosition - base; toCam.y = 0.0;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + 1e-5);
          float h = aAt.z;
          vec3 w = base + right * position.x * h * 0.8 + vec3(0.0, position.y * h, 0.0);
          vWorld = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
        ${common}
        void main() {
          float t = uTime * 0.35 + vSeed;
          vec2 q = vec2(vUv.x * 2.0, vUv.y * 1.6 - t);
          float n = vnoise(q * 3.0) * 0.6 + vnoise(q * 7.0 + 3.1) * 0.4;
          // Narrow at the vent, spreading and thinning as it rises.
          float width = mix(0.12, 0.5, vUv.y);
          float body = smoothstep(width, 0.0, abs(vUv.x - 0.5)) * smoothstep(0.0, 0.08, vUv.y) * (1.0 - vUv.y);
          float a = body * smoothstep(0.3, 0.8, n);
          vec3 c = (zoneColor(vWorld.z) * 0.5 + vec3(0.25, 0.22, 0.3)) * a * 1.7;
          float d = distance(vWorld, cameraPosition);
          // Thin out right at the lens so flying through a plume doesn't wash the screen.
          gl_FragColor = vec4(c * exp(-d * 0.004) * smoothstep(3.0, 16.0, d), 1.0);
        }
      `,
    })
    const mesh = new InstancedMesh(geo, mat, n)
    mesh.frustumCulled = false
    return mesh
  }
}
