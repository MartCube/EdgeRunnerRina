import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { PerspectiveCamera } from 'three'
import { HEX, col, lerp, rng, smooth } from '../palette'
import type { Frame } from '../types'

/** Half width of the street the route follows. */
const STREET = 13
/** Where the street ends and Rina's rooftop stands. */
export const ROOF = { x: 0, y: 70, z: -970, size: 50 }
const FOG = col(HEX.haze, 0.55)

const fogChunk = /* glsl */ `
  vec3 applyFog(vec3 c, vec3 world) {
    float d = distance(world, cameraPosition);
    float f = 1.0 - exp(-d * 0.0026);
    f = max(f, smoothstep(40.0, -5.0, world.y) * 0.25 * smoothstep(40.0, 300.0, d));
    return mix(c, uFog, clamp(f, 0.0, 1.0));
  }
`

/**
 * Chapter 2, The run: a generated city. One box, drawn a few hundred times, with windows
 * made in the shader, so there is nothing to download and it stays light on phones.
 */
export class CityChapter {
  readonly group = new Group()
  private readonly towers: ShaderMaterial
  private readonly ground: ShaderMaterial
  private readonly rain: ShaderMaterial
  private readonly rainMesh: LineSegments
  private readonly screens: ShaderMaterial[] = []
  private readonly signs: MeshBasicMaterial[] = []

  constructor() {
    const rand = rng(1337)
    const shared = { uTime: { value: 0 }, uBeat: { value: 0 }, uFog: { value: FOG } }

    // Sky: a haze gradient so tower silhouettes always have something to stand against.
    const sky = new Mesh(
      new SphereGeometry(1300, 24, 12),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { uTop: { value: col(HEX.void) }, uHaze: { value: col(HEX.haze, 1.15) }, uPink: { value: col(HEX.pink, 0.22) } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHaze; uniform vec3 uPink;
          void main() {
            float h = clamp(vDir.y, -1.0, 1.0);
            vec3 c = mix(uHaze, uTop, smoothstep(-0.05, 0.55, h));
            c += uPink * smoothstep(0.25, -0.1, h) * smoothstep(0.2, -0.9, vDir.z);
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    )
    sky.renderOrder = -10
    this.group.add(sky)

    // Towers.
    const boxes: { x: number; y: number; z: number; w: number; h: number; d: number }[] = []
    for (const side of [-1, 1]) {
      for (let z = 70; z > ROOF.z + 20; ) {
        const d = lerp(20, 38, rand())
        const w = lerp(20, 34, rand())
        const h = lerp(34, 120, rand() * rand())
        boxes.push({ x: side * (STREET + w / 2), y: h / 2, z: z - d / 2, w, h, d })
        // A taller row behind, which makes the skyline.
        const w2 = lerp(30, 50, rand())
        const h2 = lerp(90, 250, rand())
        boxes.push({ x: side * (STREET + 40 + w2 / 2), y: h2 / 2, z: z - d / 2, w: w2, h: h2, d: d + 6 })
        z -= d + lerp(2, 9, rand())
      }
    }
    // Rina's building closes the street, with a far skyline behind it.
    boxes.push({ x: ROOF.x, y: ROOF.y / 2, z: ROOF.z, w: ROOF.size, h: ROOF.y, d: ROOF.size })
    for (let i = 0; i < 16; i++) {
      const w = lerp(34, 60, rand())
      const h = lerp(110, 300, rand())
      boxes.push({ x: lerp(-260, 260, rand()), y: h / 2, z: ROOF.z - lerp(70, 220, rand()), w, h, d: w })
    }

    const geo = new BoxGeometry(1, 1, 1)
    const seeds = new Float32Array(boxes.length)
    this.towers = new ShaderMaterial({
      uniforms: {
        ...shared,
        uWall: { value: col(0x1c1b33) },
        uWallLit: { value: col(0x3b3564) },
        uPink: { value: col(HEX.pink) },
        uCyan: { value: col(HEX.cyan) },
        uWarm: { value: col(HEX.orange) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld; varying float vSeed;
        void main() {
          vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vLocal = position * s;
          vNormal = normal;
          vSeed = aSeed;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld; varying float vSeed;
        uniform float uTime; uniform float uBeat;
        uniform vec3 uFog; uniform vec3 uWall; uniform vec3 uWallLit; uniform vec3 uPink; uniform vec3 uCyan; uniform vec3 uWarm;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        ${fogChunk}
        void main() {
          vec3 c;
          if (abs(vNormal.y) > 0.5) {
            c = uWall * 0.7;
          } else {
            // Two flat tones, like cel shading: faces turned to the street are lit.
            float lit = abs(vNormal.x) > 0.5 ? 1.0 : 0.0;
            c = mix(uWall, uWallLit, lit * 0.75);
            // Neon from the street washes the lower floors.
            float wash = smoothstep(46.0, 2.0, vWorld.y);
            c += mix(uPink, uCyan, step(0.5, hash(vec2(vSeed, 3.0)))) * wash * 0.07 * (0.4 + lit);

            vec2 uv = vec2(abs(vNormal.x) > 0.5 ? vLocal.z : vLocal.x, vLocal.y);
            vec2 cell = vec2(3.4, 4.6);
            vec2 id = floor(uv / cell);
            vec2 f = fract(uv / cell);
            float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.78);
            float n = hash(id + vSeed * 17.0);
            // Whole floors go dark together, which looks more like offices than random noise.
            float floorOn = step(0.35, hash(vec2(id.y, vSeed * 9.0)));
            float on = step(0.6, n) * floorOn;
            float pick = hash(id * 1.7 + vSeed);
            vec3 glow = pick < 0.5 ? uWarm : (pick < 0.8 ? uCyan : uPink);
            float flick = 0.75 + 0.25 * step(0.97, hash(id + floor(uTime * 3.0))) + uBeat * 0.2 * step(0.85, n);
            c = mix(c, c * 0.55, win);
            c += glow * win * on * flick * 1.25;

            // Some towers wear a neon band.
            float band = step(0.72, hash(vec2(vSeed, 8.0)));
            float y = fract(vLocal.y / 46.0 + vSeed);
            c += mix(uPink, uCyan, step(0.5, hash(vec2(vSeed, 5.0)))) * band * step(0.975, y) * (1.3 + uBeat * 0.8);
          }
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }
      `,
    })
    const towers = new InstancedMesh(geo, this.towers, boxes.length)
    const m = new Matrix4()
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z)
      towers.setMatrixAt(i, m)
      seeds[i] = rand()
    })
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
    towers.frustumCulled = false
    this.group.add(towers)

    // Wet street: asphalt with smeared neon reflections.
    this.ground = new ShaderMaterial({
      uniforms: { ...shared, uPink: { value: col(HEX.pink) }, uCyan: { value: col(HEX.cyan) }, uBase: { value: col(0x0b0b14) } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; uniform float uTime; uniform float uBeat;
        uniform vec3 uFog; uniform vec3 uPink; uniform vec3 uCyan; uniform vec3 uBase;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        ${fogChunk}
        void main() {
          vec2 p = vWorld.xz;
          float road = smoothstep(${(STREET + 1).toFixed(1)}, ${(STREET - 1).toFixed(1)}, abs(p.x));
          vec3 c = uBase * (0.6 + 0.4 * noise(p * 0.6));
          // Reflections stretch along the street, the way wet asphalt smears light.
          float a = noise(vec2(p.x * 0.22, p.y * 0.035));
          float b = noise(vec2(p.x * 0.19 + 40.0, p.y * 0.03 + 9.0));
          float ripple = 0.75 + 0.25 * noise(p * 2.5 + uTime * 1.5);
          c += uPink * smoothstep(0.52, 0.85, a) * 0.85 * ripple * road;
          c += uCyan * smoothstep(0.56, 0.9, b) * 0.6 * ripple * road;
          // Lane marks and the two kerb lines.
          float dash = step(0.5, fract(p.y / 14.0)) * smoothstep(0.35, 0.2, abs(p.x));
          c += vec3(0.5, 0.45, 0.35) * dash * 0.5;
          c += uCyan * smoothstep(0.35, 0.1, abs(abs(p.x) - ${STREET.toFixed(1)})) * (0.5 + uBeat * 0.6);
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }
      `,
    })
    const ground = new Mesh(new PlaneGeometry(900, 1500), this.ground)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, 0, -520)
    this.group.add(ground)

    // Hanging signs along the street.
    const words = ['MANDA', '配達', 'ラーメン', '24H', 'ネオン', 'EXPRESS', 'サイバー', 'HOTEL', '酒', 'DATA']
    const signTex = words.map((w, i) => signTexture(w, i % 3 === 1 ? '#00f0ff' : i % 3 === 2 ? '#ff7a59' : '#ff2a6d'))
    const signGeo = new PlaneGeometry(3.2, 12.8)
    signTex.forEach((map) => {
      const mat = new MeshBasicMaterial({ map, side: DoubleSide, toneMapped: false })
      mat.color.setScalar(1.5)
      this.signs.push(mat)
    })
    for (let z = 20; z > ROOF.z + 60; z -= lerp(13, 30, rand())) {
      const side = rand() > 0.5 ? 1 : -1
      const sign = new Mesh(signGeo, this.signs[Math.floor(rand() * this.signs.length)]!)
      sign.position.set(side * (STREET - 1.9), lerp(11, 34, rand()), z)
      const s = lerp(0.7, 1.25, rand())
      sign.scale.setScalar(s)
      this.group.add(sign)
      const arm = new Mesh(new BoxGeometry(2.4, 0.25, 0.25), new MeshBasicMaterial({ color: 0x15151f }))
      arm.position.set(side * (STREET - 0.6), sign.position.y + 5.5 * s, z)
      this.group.add(arm)
    }

    // Billboards: animated in the shader for now. These are the frames a video or
    // HyperFrames loop can be dropped into later.
    const screenGeo = new PlaneGeometry(26, 15)
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1
      const mat = new ShaderMaterial({
        uniforms: { ...shared, uA: { value: col(i % 3 ? HEX.pink : HEX.cyan) }, uB: { value: col(i % 3 ? HEX.orange : HEX.pink) }, uSeed: { value: rand() * 10 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vWorld;
          void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vWorld; uniform float uTime; uniform float uBeat; uniform float uSeed;
          uniform vec3 uA; uniform vec3 uB; uniform vec3 uFog;
          ${fogChunk}
          void main() {
            vec2 p = vUv;
            float frame = step(0.03, p.x) * step(p.x, 0.97) * step(0.05, p.y) * step(p.y, 0.95);
            float bars = step(0.5, fract(p.x * 6.0 + uTime * 0.25 + uSeed));
            float wave = smoothstep(0.02, 0.0, abs(p.y - 0.5 - 0.22 * sin(p.x * 9.0 + uTime * 2.0 + uSeed)));
            float scan = 0.8 + 0.2 * sin(p.y * 220.0);
            vec3 c = mix(uA * 0.55, uB * 0.25, bars) * scan;
            c += vec3(1.0) * wave * 1.2;
            c *= 0.85 + uBeat * 0.35;
            c = mix(uA * 1.6, c, frame);
            gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
          }
        `,
      })
      this.screens.push(mat)
      const screen = new Mesh(screenGeo, mat)
      screen.position.set(side * (STREET + 39.6), lerp(60, 110, rand()), -70 - i * 95)
      screen.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
      this.group.add(screen)
    }

    // Rain: short streaks kept in a box that follows the camera.
    const drops = 3200
    const pos = new Float32Array(drops * 6)
    const end = new Float32Array(drops * 2)
    for (let i = 0; i < drops; i++) {
      const x = rand() * 120, y = rand() * 90, z = rand() * 120
      pos.set([x, y, z, x, y, z], i * 6)
      end.set([0, 1], i * 2)
    }
    const rainGeo = new BufferGeometry()
    rainGeo.setAttribute('position', new BufferAttribute(pos, 3))
    rainGeo.setAttribute('aEnd', new BufferAttribute(end, 1))
    this.rain = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0x9fdcff) } },
      vertexShader: /* glsl */ `
        attribute float aEnd; uniform float uTime; varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 70.0, 90.0);
          vec3 w = vec3(mod(p.x - cameraPosition.x, 120.0) - 60.0, p.y - 45.0, mod(p.z - cameraPosition.z, 120.0) - 60.0) + cameraPosition;
          w += vec3(0.35, 2.6, 0.0) * aEnd;
          vFade = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vFade;
        void main() { gl_FragColor = vec4(uColor, 0.07 + 0.16 * vFade); }
      `,
    })
    this.rainMesh = new LineSegments(rainGeo, this.rain)
    this.rainMesh.frustumCulled = false
    this.group.add(this.rainMesh)
  }

  setLite(lite: boolean) {
    this.rainMesh.geometry.setDrawRange(0, lite ? 1400 : Infinity)
  }

  /** Camera along the route: high over the canyon, down to the street, up to the roof. */
  pose(p: number, camera: PerspectiveCamera, target: Vector3) {
    const at = (q: number, out: Vector3) => {
      const y = track(q, [
        [0, 150],
        [0.32, 15],
        [0.7, 11],
        [0.88, 44],
        [1, ROOF.y + 6],
      ])
      const sway = Math.sin(q * 7) * 5 * (1 - smooth(0.78, 1, q))
      return out.set(sway, y, lerp(40, ROOF.z + 32, q))
    }
    at(p, camera.position)
    at(Math.min(1, p + 0.035), target)
    // Look down into the canyon at the start, and lock onto the roof at the end.
    target.z -= 40
    target.y -= 70 * (1 - smooth(0, 0.34, p))
    const lock = smooth(0.72, 1, p)
    target.x = lerp(target.x, ROOF.x, lock)
    target.y = lerp(target.y, ROOF.y + 4.6, lock)
    target.z = lerp(target.z, ROOF.z + 18, lock)
    // Bank into the sway.
    return Math.cos(p * 7) * 0.06 * (1 - lock)
  }

  update(f: Frame) {
    this.towers.uniforms.uTime!.value = f.time
    this.towers.uniforms.uBeat!.value = f.beat
    this.rain.uniforms.uTime!.value = f.time
    const flick = 1.3 + f.beat * 0.5 + f.level * 0.6
    this.signs.forEach((s, i) => s.color.setScalar(flick * (Math.sin(f.time * 9 + i * 4) > 0.985 ? 0.4 : 1)))
  }
}

/** Piecewise smooth interpolation through [progress, value] keys. */
function track(q: number, keys: [number, number][]): number {
  for (let i = 1; i < keys.length; i++) {
    const [q0, v0] = keys[i - 1]!
    const [q1, v1] = keys[i]!
    if (q <= q1) return lerp(v0, v1, smooth(q0, q1, q))
  }
  return keys[keys.length - 1]![1]
}

/** A vertical neon sign drawn on a canvas. */
function signTexture(word: string, color: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a12'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = color
  g.lineWidth = 8
  g.strokeRect(8, 8, c.width - 16, c.height - 16)
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const chars = [...word]
  const step = (c.height - 60) / chars.length
  const size = Math.min(92, step * 0.86)
  g.font = `800 ${size}px "Big Shoulders Display", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`
  chars.forEach((ch, i) => g.fillText(ch, c.width / 2, 30 + step * (i + 0.5)))
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
