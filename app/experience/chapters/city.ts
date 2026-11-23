import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import type { CanvasTexture, Object3D, PerspectiveCamera } from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { HEX, col, lerp, rng, smooth } from '../palette'
import type { Frame } from '../types'
import { cityUniforms, common } from './city/glsl'
import { adverts, horizontalSigns, ticker, verticalSigns } from './city/signs'
import { Traffic } from './city/traffic'
import { FacadeKit } from './city/kit'
import type { Facade, RoofSpot } from './city/kit'

/** Half width of the street, pavements included. The road itself is ROAD wide each side. */
const STREET = 13
const ROAD = 9
/** Where the street ends and Rina's rooftop stands. */
export const ROOF = { x: 0, y: 70, z: -970, size: 50 }
const START_Z = 90

/** kind 0: tower facade, 1: street-level block with shopfronts, 2: plain dark part. */
interface Box { x: number; y: number; z: number; w: number; h: number; d: number; kind: number; seed: number }
interface Light { x: number; y: number; z: number; w: number; h: number; d: number; color: Color }
interface Halo { x: number; y: number; z: number; size: number; color: Color }

const PALETTE = [col(HEX.pink), col(HEX.cyan), col(0xff9a3c), col(0xf4f0ff), col(0xb6ff3c)]

/**
 * Chapter 1, The run: a generated night city.
 *
 * Everything is built from instanced boxes and shaders: towers in tiers with shader-made
 * windows and shopfronts, a wet street that really reflects the scene, glow sprites that fake
 * lit haze around every light, signs, billboards, hologram rings and moving traffic.
 * Blender models can replace any of it later; see props.ts.
 */
export class CityChapter {
  readonly group = new Group()
  private readonly rain: ShaderMaterial
  private readonly rainMesh: LineSegments
  private readonly halos: Mesh
  private readonly haloGeo: InstancedBufferGeometry
  private readonly haloCount: number
  private readonly mirror: Reflector
  private readonly flatGround: Mesh
  private readonly traffic: Traffic
  private readonly tickers: { tex: CanvasTexture; mesh: Mesh }[] = []
  private readonly beams: Mesh[] = []
  private readonly adMats: ShaderMaterial[] = []
  /** Street walls and roofs, kept for the Blender facade kit, which loads later. */
  private readonly facades: Facade[] = []
  private readonly roofSpots: RoofSpot[] = []
  private kit?: FacadeKit
  private lite = false

  constructor() {
    const rand = rng(1337)
    const boxes: Box[] = []
    const lights: Light[] = []
    const halos: Halo[] = []
    const roofs: { x: number; top: number; z: number; side: number }[] = []
    const pick = () => PALETTE[Math.floor(rand() * 3)]!
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, kind = 0, seed = rand()) =>
      boxes.push({ x, y, z, w, h, d, kind, seed })
    const light = (x: number, y: number, z: number, w: number, h: number, d: number, color: Color, gain = 3) =>
      lights.push({ x, y, z, w, h, d, color: color.clone().multiplyScalar(gain) })
    const halo = (x: number, y: number, z: number, size: number, color: Color, gain = 1) =>
      halos.push({ x, y, z, size, color: color.clone().multiplyScalar(gain) })

    /** A tower in up to three tiers, each set back from the one below, with clutter on top. */
    const tower = (x: number, z: number, w: number, d: number, h: number, street: boolean) => {
      const seed = rand()
      let top = 0
      const side = Math.sign(x)
      const wall = (bw: number, bd: number, y0: number, y1: number) =>
        street && this.facades.push({ x: x - side * bw / 2, side, z0: z - bd / 2, z1: z + bd / 2, y0, y1 })
      if (street) {
        const podium = lerp(12, 22, rand())
        box(x, podium / 2, z, w, podium, d, 1, seed)
        // Clutter starts above the shop signs.
        wall(w, d, 8, podium)
        top = podium
      }
      const tiers = h > 90 ? 3 : h > 45 ? 2 : 1
      let tw = w * (street ? 0.86 : 1)
      let td = d * (street ? 0.86 : 1)
      for (let t = 0; t < tiers; t++) {
        const th = ((h - top) / (tiers - t)) * (t === tiers - 1 ? 1 : lerp(0.7, 1.1, rand()))
        box(x, top + th / 2, z, tw, th, td, 0, seed + t * 0.013)
        wall(tw, td, top + 0.5, top + th)
        top += th
        tw *= lerp(0.62, 0.86, rand())
        td *= lerp(0.62, 0.86, rand())
      }
      // Roof clutter: plant rooms, tanks, a mast with a warning light.
      for (let k = 0; k < 3; k++) {
        const s = lerp(2.5, 6, rand())
        box(x + (rand() - 0.5) * tw * 0.8, top + s / 2, z + (rand() - 0.5) * td * 0.8, s * 1.4, s, s, 2)
      }
      if (h > 110 || rand() > 0.7) {
        const mast = lerp(12, 46, rand())
        box(x, top + mast / 2, z, 0.7, mast, 0.7, 2)
        light(x, top + mast, z, 1.3, 1.3, 1.3, col(0xff2030), 4)
        halo(x, top + mast, z, 16, col(0xff2030), 0.5)
      }
      return top
    }

    // The street: lots on both sides, a taller second row, and cross streets as gaps.
    for (const side of [-1, 1]) {
      let sinceCross = 0
      for (let z = START_Z; z > ROOF.z + 26; ) {
        const d = lerp(22, 40, rand())
        const w = lerp(24, 38, rand())
        const h = lerp(34, 130, rand() * rand())
        const cz = z - d / 2
        const top = tower(side * (STREET + w / 2), cz, w, d, h, true)
        roofs.push({ x: side * (STREET + w / 2), top, z: cz, side })
        this.roofSpots.push({ x: side * (STREET + w / 2), top, z: cz })
        const w2 = lerp(34, 54, rand())
        tower(side * (STREET + 44 + w2 / 2), cz, w2, d + 8, lerp(110, 290, rand()), false)

        // Shopfront light spilling onto the pavement.
        for (let s = z - 4; s > z - d + 2; s -= 9) halo(side * (STREET - 0.5), 3.4, s, 15, pick(), 0.2)
        // Vending machines and kiosks.
        if (rand() > 0.45) {
          const c = PALETTE[Math.floor(rand() * PALETTE.length)]!
          const vz = cz + (rand() - 0.5) * d * 0.6
          box(side * (STREET - 1), 1.3, vz, 1.2, 2.6, 1.8, 2)
          light(side * (STREET - 1.62), 1.5, vz, 0.06, 1.9, 1.4, c, 1.2)
          halo(side * (STREET - 2.2), 1.6, vz, 7, c, 0.35)
        }
        z -= d
        sinceCross += d
        if (sinceCross > 120) {
          sinceCross = 0
          z -= 22
        } else {
          z -= lerp(1.5, 5, rand())
        }
      }
      // Pavement and kerb light.
      box(side * (ROAD + (STREET - ROAD) / 2), 0.2, -450, STREET - ROAD, 0.4, 1200, 2)
      light(side * ROAD, 0.42, -450, 0.14, 0.08, 1200, col(HEX.cyan), 0.8)
    }

    // Rina's building closes the street.
    box(ROOF.x, ROOF.y / 2, ROOF.z, ROOF.size, ROOF.y, ROOF.size, 0)

    // Megastructures: the far skyline, wrapped in hologram rings.
    const megas: { x: number; z: number; w: number; h: number }[] = []
    for (let i = 0; i < 26; i++) {
      const w = lerp(46, 90, rand())
      const h = lerp(260, 520, rand())
      const side = i % 2 ? 1 : -1
      const x = i < 10 ? lerp(-330, 330, rand()) : side * lerp(150, 420, rand())
      const z = i < 10 ? ROOF.z - lerp(90, 330, rand()) : lerp(60, ROOF.z, rand())
      tower(x, z, w, w, h, false)
      megas.push({ x, z, w, h })
    }

    // Street lamps.
    for (let z = START_Z - 10; z > ROOF.z + 40; z -= 30) {
      for (const side of [-1, 1]) {
        const x = side * (ROAD + 0.9)
        box(x, 5.5, z, 0.3, 11, 0.3, 2)
        box(x - side * 1.4, 10.9, z, 3, 0.25, 0.3, 2)
        light(x - side * 2.6, 10.7, z, 1.2, 0.16, 0.5, col(0xffe2b0), 2.2)
        halo(x - side * 2.6, 10.2, z, 18, col(0xffc070), 0.3)
      }
    }

    // Skybridges and the gantries that carry banners. Kept to the stretch the camera
    // flies at street level, so nothing crosses its path on the way down or up.
    const banners: { z: number; y: number }[] = []
    for (let z = -310; z > -630; z -= lerp(38, 64, rand())) {
      if (rand() > 0.55) {
        const y = lerp(34, 52, rand())
        box(0, y, z, STREET * 2 + 8, 7, 9, 0)
        light(0, y - 3.6, z, STREET * 2, 0.2, 0.5, pick(), 3)
        halo(0, y - 5, z, 34, pick(), 0.22)
      } else {
        const y = lerp(22, 27, rand())
        box(0, y + 2.6, z, STREET * 2 + 2, 0.4, 0.4, 2)
        banners.push({ z, y })
      }
    }
    // Overhead cables.
    for (let z = START_Z - 30; z > ROOF.z + 60; z -= lerp(16, 40, rand())) box(0, lerp(30, 64, rand()), z, STREET * 2, 0.09, 0.09, 2)

    this.group.add(this.buildSky())
    this.group.add(this.buildTowers(boxes))

    // ---- Signs ----
    const vTex = verticalSigns()
    const hTex = horizontalSigns()
    const signMat = (map: CanvasTexture) => {
      const mat = new MeshBasicMaterial({ map, side: DoubleSide, toneMapped: false })
      mat.color.setScalar(1.7)
      return mat
    }
    const vMats = vTex.map(signMat)
    const hMats = hTex.map(signMat)
    const blade = new PlaneGeometry(3.1, 12.4)
    for (let z = START_Z - 20; z > ROOF.z + 50; z -= lerp(6, 15, rand())) {
      const side = rand() > 0.5 ? 1 : -1
      const i = Math.floor(rand() * vMats.length)
      const sign = new Mesh(blade, vMats[i]!)
      const s = lerp(0.6, 1.5, rand())
      sign.scale.setScalar(s)
      sign.position.set(side * (STREET - 2.1 * s), lerp(9, 46, rand()), z)
      this.group.add(sign)
      halo(sign.position.x, sign.position.y, z, 26 * s, SIGN_GLOW[i % SIGN_GLOW.length]!, 0.3)
    }
    const banner = new PlaneGeometry(18, 4.5)
    banners.forEach((b, i) => {
      const sign = new Mesh(banner, hMats[i % hMats.length]!)
      sign.position.set(0, b.y, b.z)
      this.group.add(sign)
      halo(0, b.y, b.z, 40, SIGN_GLOW[(i + 2) % SIGN_GLOW.length]!, 0.3)
    })
    // Shop signs flat on the facades.
    const shop = new PlaneGeometry(10, 2.5)
    for (const r of roofs) {
      if (rand() > 0.6) continue
      const sign = new Mesh(shop, hMats[Math.floor(rand() * hMats.length)]!)
      sign.position.set(r.side * (STREET - 0.25), lerp(7.5, 11, rand()), r.z)
      sign.rotation.y = -r.side * Math.PI / 2
      this.group.add(sign)
    }

    // ---- Billboards ----
    const ads = adverts()
    const adGeo = new PlaneGeometry(1, 1)
    const billboard = (x: number, y: number, z: number, w: number, turn: number, i: number) => {
      const mat = new ShaderMaterial({
        uniforms: { ...cityUniforms, uMap: { value: ads[i % ads.length] }, uSeed: { value: rand() * 20 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vWorld;
          void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vWorld; uniform sampler2D uMap; uniform float uSeed;
          ${common}
          void main() {
            vec2 uv = vUv;
            // Now and then a slice of the picture tears sideways.
            float t = floor(uTime * 7.0 + uSeed);
            float tear = step(0.93, hash(vec2(t, floor(uv.y * 14.0)))) * step(0.6, hash(vec2(t, uSeed)));
            uv.x += tear * 0.06;
            vec3 c = vec3(texture2D(uMap, uv + vec2(0.004, 0.0)).r, texture2D(uMap, uv).g, texture2D(uMap, uv - vec2(0.004, 0.0)).b);
            c *= 0.82 + 0.18 * sin(uv.y * 420.0);
            c *= 0.9 + 0.1 * sin(uTime * 30.0 + uSeed) * step(0.8, hash(vec2(t * 0.1, uSeed)));
            float frame = step(0.012, uv.x) * step(uv.x, 0.988) * step(0.02, uv.y) * step(uv.y, 0.98);
            c = mix(vec3(0.01), c * (2.3 + uBeat * 0.4), frame);
            gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
          }
        `,
      })
      this.adMats.push(mat)
      const board = new Mesh(adGeo, mat)
      board.scale.set(w, w * 0.5625, 1)
      board.position.set(x, y, z)
      board.rotation.y = turn
      this.group.add(board)
      halo(x, y, z + 4, w * 2.2, PALETTE[i % 3]!, 0.22)
      return board
    }
    roofs.forEach((r, i) => {
      if (i % 3 !== 0 || r.z > 40) return
      const w = lerp(20, 30, rand())
      // On the roof, turned to face the street and the oncoming camera. i / 3 so the roof
      // boards cycle through every advert, not just the two that every third index lands on.
      billboard(r.x - r.side * 4, r.top + w * 0.28 + 3, r.z, w, -r.side * 0.55, i / 3)
      box(r.x - r.side * 4, r.top + 1.5, r.z - 0.6, 0.6, 3, 0.6, 2)
    })
    megas.slice(0, 14).forEach((m, i) => {
      const w = m.w * 0.9
      billboard(m.x, m.h * lerp(0.4, 0.62, rand()), m.z + m.w / 2 + 1.2, w, 0, i + 1)
    })

    // Hologram rings turning around the tallest towers.
    megas.slice(0, 7).forEach((m, i) => {
      const tex = ticker()
      tex.repeat.set(2, 1)
      const ring = new Mesh(
        new CylinderGeometry(m.w * 0.82, m.w * 0.82, 16, 48, 1, true),
        new MeshBasicMaterial({ map: tex, color: PALETTE[i % 2]!.clone().multiplyScalar(1.6), transparent: true, opacity: 0.8, side: DoubleSide, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      )
      ring.position.set(m.x, m.h * lerp(0.7, 0.9, rand()), m.z)
      this.tickers.push({ tex, mesh: ring })
      this.group.add(ring)
    })

    // Searchlights sweeping from the skyline.
    const beamGeo = new PlaneGeometry(14, 700)
    beamGeo.translate(0, 350, 0)
    megas.slice(0, 4).forEach((m, i) => {
      const beam = new Mesh(
        beamGeo,
        new ShaderMaterial({
          transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
          uniforms: { uColor: { value: PALETTE[i % 2]!.clone().multiplyScalar(0.5) } },
          vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            varying vec2 vUv; uniform vec3 uColor;
            void main() { float a = pow(max(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0), 2.0) * pow(max(1.0 - vUv.y, 0.0), 1.5); gl_FragColor = vec4(uColor * a, a); }
          `,
        }),
      )
      beam.position.set(m.x, m.h, m.z)
      this.beams.push(beam)
      this.group.add(beam)
    })

    this.group.add(this.buildLights(lights))

    // ---- Ground ----
    const groundGeo = new PlaneGeometry(1400, 1900)
    this.mirror = new Reflector(groundGeo, { textureWidth: 1024, textureHeight: 1024, clipBias: 0.02, shader: groundShader(true) })
    this.flatGround = new Mesh(groundGeo, new ShaderMaterial(groundShader(false)))
    for (const g of [this.mirror, this.flatGround]) {
      g.rotation.x = -Math.PI / 2
      g.position.set(0, 0, -520)
      this.group.add(g)
    }

    this.traffic = new Traffic(ROOF.z + 40, START_Z)
    this.group.add(this.traffic.group)

    // ---- Glow sprites ----
    this.haloCount = halos.length
    this.haloGeo = new InstancedBufferGeometry()
    const quad = new PlaneGeometry(1, 1)
    this.haloGeo.index = quad.index
    this.haloGeo.setAttribute('position', quad.getAttribute('position'))
    this.haloGeo.setAttribute('uv', quad.getAttribute('uv'))
    const at = new Float32Array(halos.length * 4)
    const tint = new Float32Array(halos.length * 3)
    halos.forEach((h, i) => {
      at.set([h.x, h.y, h.z, h.size], i * 4)
      tint.set([h.color.r, h.color.g, h.color.b], i * 3)
    })
    this.haloGeo.setAttribute('aAt', new InstancedBufferAttribute(at, 4))
    this.haloGeo.setAttribute('aTint', new InstancedBufferAttribute(tint, 3))
    this.haloGeo.instanceCount = halos.length
    this.halos = new Mesh(
      this.haloGeo,
      new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending,
        uniforms: { uBeat: cityUniforms.uBeat },
        vertexShader: /* glsl */ `
          attribute vec4 aAt; attribute vec3 aTint; varying vec2 vUv; varying vec3 vTint; varying float vDist;
          void main() {
            vec4 mv = viewMatrix * vec4(aAt.xyz, 1.0);
            mv.xy += position.xy * aAt.w;
            vUv = uv; vTint = aTint; vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vTint; varying float vDist; uniform float uBeat;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float a = pow(max(1.0 - r, 0.0), 2.4);
            // Fade out right at the lens, and into the fog far away.
            a *= smoothstep(3.0, 26.0, vDist) * exp(-vDist * 0.0022);
            gl_FragColor = vec4(vTint * a * (0.5 + uBeat * 0.08), a * 0.5);
          }
        `,
      }),
    )
    this.halos.frustumCulled = false
    this.halos.renderOrder = 5
    this.group.add(this.halos)

    // ---- Rain ----
    const drops = 4200
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
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: cityUniforms.uTime, uColor: { value: new Color(0x9fc8ff) } },
      vertexShader: /* glsl */ `
        attribute float aEnd; uniform float uTime; varying float vFade;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 78.0, 90.0);
          vec3 w = vec3(mod(p.x - cameraPosition.x, 120.0) - 60.0, p.y - 45.0, mod(p.z - cameraPosition.z, 120.0) - 60.0) + cameraPosition;
          w += vec3(0.5, 3.4, 0.0) * aEnd;
          vFade = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vFade; void main() { gl_FragColor = vec4(uColor, 0.05 + 0.2 * vFade); }`,
    })
    this.rainMesh = new LineSegments(rainGeo, this.rain)
    this.rainMesh.frustumCulled = false
    this.group.add(this.rainMesh)
  }

  private buildSky() {
    const sky = new Mesh(
      new SphereGeometry(1700, 32, 16),
      new ShaderMaterial({
        side: BackSide, depthWrite: false,
        uniforms: { ...cityUniforms, uTop: { value: col(0x030308) } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vDir; uniform vec3 uTop;
          ${common}
          void main() {
            float h = vDir.y;
            // City glow on the horizon, dark overhead.
            vec3 c = mix(uFog * 1.5, uTop, smoothstep(-0.02, 0.5, h));
            c += uPink * 0.1 * smoothstep(0.3, -0.05, h) * smoothstep(0.4, -1.0, vDir.z);
            c += uCyan * 0.05 * smoothstep(0.25, -0.05, h) * smoothstep(-0.4, 1.0, vDir.x);
            // Low cloud, lit from below by the districts.
            vec2 q = vDir.xz / max(h + 0.12, 0.05);
            float cloud = vnoise(q * 1.6 + uTime * 0.01) * 0.6 + vnoise(q * 4.0 - uTime * 0.015) * 0.4;
            c += mix(uPink, uCyan, vnoise(q * 0.7)) * smoothstep(0.45, 0.9, cloud) * 0.07 * smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.3, 0.9, h));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    )
    sky.renderOrder = -10
    return sky
  }

  private buildTowers(boxes: Box[]) {
    const geo = new BoxGeometry(1, 1, 1)
    const info = new Float32Array(boxes.length * 2)
    const material = new ShaderMaterial({
      uniforms: cityUniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aInfo;
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vSize; varying vec2 vInfo;
        void main() {
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vLocal = position * vSize;
          vNormal = normal;
          vInfo = aInfo;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld; varying vec3 vSize; varying vec2 vInfo;
        ${common}
        void main() {
          float seed = vInfo.x; float kind = vInfo.y;
          vec3 n = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          float s1 = hash(vec2(seed, 1.0)), s2 = hash(vec2(seed, 2.0)), s3 = hash(vec2(seed, 3.0)), s4 = hash(vec2(seed, 4.0));
          vec3 zone = zoneColor(vWorld.z);
          float low = exp(-max(vWorld.y, 0.0) * 0.03);
          vec3 base = mix(vec3(0.010, 0.011, 0.018), vec3(0.030, 0.026, 0.042), s1);
          float side = abs(n.x) > 0.5 ? 1.0 : 0.0;
          vec3 c;

          if (n.y > 0.5) {
            // Roofs: dark, wet, a few stray lights.
            c = base * 0.7 + uFog * 0.12;
            c += vec3(1.0, 0.25, 0.1) * step(0.994, hash(floor(vWorld.xz * 0.5))) * 1.5;
          } else if (kind > 1.5) {
            c = base * (0.6 + 0.5 * side) + zone * low * 0.05;
          } else {
            vec2 uv = vec2(side > 0.5 ? vLocal.z : vLocal.x, vLocal.y + vSize.y * 0.5);
            float width = side > 0.5 ? vSize.z : vSize.x;

            // Four facade types: small grid, ribbon windows, narrow slots, wide bays.
            float style = floor(s2 * 4.0);
            vec2 cell = style < 1.0 ? vec2(2.6, 3.6) : style < 2.0 ? vec2(8.0, 3.6) : style < 3.0 ? vec2(1.7, 4.6) : vec2(4.4, 3.8);
            vec2 g = uv / cell;
            vec2 id = floor(g), f = fract(g);
            vec2 pad = style < 2.0 && style >= 1.0 ? vec2(0.03, 0.3) : vec2(0.16, 0.2);
            float win = smoothstep(pad.x, pad.x + 0.05, f.x) * smoothstep(1.0 - pad.x, 0.95 - pad.x, f.x)
                      * smoothstep(pad.y, pad.y + 0.05, f.y) * smoothstep(1.0 - pad.y * 0.6, 0.95 - pad.y * 0.6, f.y);

            float density = mix(0.12, 0.58, s3);
            float on = step(1.0 - density, hash(id + seed * 17.0)) * step(0.28, hash(vec2(id.y, seed * 9.0)));
            vec3 warm = vec3(1.0, 0.70, 0.40), cool = vec3(0.50, 0.78, 1.0);
            float pickc = hash(id * 1.7 + seed);
            vec3 tone = mix(warm, cool, step(0.55, s1));
            vec3 glow = pickc < 0.6 ? tone : (pickc < 0.86 ? mix(cool, warm, step(0.55, s1)) : mix(uPink, uCyan, step(0.5, s4)));
            float bright = 0.3 + 1.5 * hash(id * 3.1 + seed * 5.0);
            // Blinds half drawn on some, and a little depth inside the room.
            float blind = mix(1.0, smoothstep(0.42, 0.5, f.y) * 0.85 + 0.15, step(0.62, hash(id + 3.0)));
            float room = 0.55 + 0.45 * f.y;
            float flick = 1.0 - 0.5 * step(0.985, hash(id + floor(uTime * 4.0)));

            // Dark glass picks up the haze at shallow angles.
            float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
            vec3 glass = mix(base * 0.4, uFog * 1.6 + zone * 0.25, fres * 0.85);
            vec3 lit = glow * on * bright * room * blind * flick * 1.7;

            // Far away the grid is smaller than a pixel; blend to its average so it does not sparkle.
            float lod = smoothstep(0.35, 1.1, max(fwidth(g.x), fwidth(g.y)));
            vec3 wall = base * (0.75 + 0.25 * step(0.05, fract(uv.y / (cell.y * 5.0))));
            vec3 nearC = mix(wall, glass + lit, win);
            vec3 farC = wall * 0.7 + glass * 0.3 + tone * density * 0.14;
            c = mix(nearC, farC, lod);

            // Street light climbing the lower floors, and sky glow on the rest.
            c += zone * low * 0.045 * (0.5 + side);
            c += uFog * 0.3 * (1.0 - low) * (0.4 + 0.6 * side);

            // Neon: a tube up the corner of some towers, a band around others.
            float corner = smoothstep(0.5, 0.15, abs(abs(uv.x) - width * 0.5 + 0.5));
            c += mix(uPink, uCyan, step(0.5, s3)) * corner * step(0.68, s4) * (2.6 + uBeat * 0.8);
            c += mix(uCyan, uPink, step(0.5, s2)) * step(0.988, fract(uv.y / 58.0 + s1)) * step(0.55, s1) * 2.6;

            // Shopfronts along the pavement.
            if (kind > 0.5 && uv.y < 6.6) {
              float bay = uv.x / 9.0;
              float bid = floor(bay); vec2 bf = vec2(fract(bay), uv.y / 6.6);
              float h1 = hash(vec2(bid, seed * 31.0)), h2 = hash(vec2(bid, seed * 7.0));
              vec3 tintc = h1 < 0.3 ? warm : h1 < 0.5 ? uCyan : h1 < 0.7 ? uPink : h1 < 0.85 ? uAmber : vec3(0.8, 1.0, 0.9);
              float open = step(0.22, h2);
              float glassw = step(0.05, bf.x) * step(bf.x, 0.95) * step(0.06, bf.y) * step(bf.y, 0.72);
              float mull = step(0.04, fract(bf.x * 3.0));
              float fascia = step(0.76, bf.y) * step(bf.y, 0.96) * step(0.03, bf.x) * step(bf.x, 0.97);
              vec3 shop = base * 0.5;
              shop = mix(shop, tintc * (0.35 + 0.6 * (1.0 - bf.y)) * mull * open + base * (1.0 - open), glassw);
              shop += tintc * fascia * open * 1.5 * (0.8 + 0.2 * sin(uTime * 2.0 + bid));
              c = shop;
            }
          }
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }
      `,
    })
    const mesh = new InstancedMesh(geo, material, boxes.length)
    const m = new Matrix4()
    boxes.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z)
      mesh.setMatrixAt(i, m)
      info.set([b.seed, b.kind], i * 2)
    })
    geo.setAttribute('aInfo', new InstancedBufferAttribute(info, 2))
    mesh.frustumCulled = false
    return mesh
  }

  /** Every small glowing part: lamp heads, kerb lines, vending screens, warning lights. */
  private buildLights(lights: Light[]) {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ toneMapped: false }), lights.length)
    const m = new Matrix4()
    lights.forEach((l, i) => {
      m.makeScale(l.w, l.h, l.d).setPosition(l.x, l.y, l.z)
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, l.color)
    })
    mesh.frustumCulled = false
    return mesh
  }

  /** Hangs the Blender facade kit (public/models/city-kit.glb) on the street walls. */
  dress(kit: Object3D) {
    this.kit = new FacadeKit(kit, this.facades, this.roofSpots)
    this.kit.setLite(this.lite)
    this.group.add(this.kit.group)
  }

  setLite(lite: boolean) {
    this.lite = lite
    this.kit?.setLite(lite)
    this.rainMesh.geometry.setDrawRange(0, lite ? 1600 : Infinity)
    // Lite drops the real reflection (a second render of the city) and half the glow.
    this.mirror.visible = !lite
    this.flatGround.visible = lite
    this.haloGeo.instanceCount = lite ? Math.floor(this.haloCount / 2) : this.haloCount
  }

  /** Camera along the route: over the skyline, down into the canyon, up to the roof. */
  pose(p: number, camera: PerspectiveCamera, target: Vector3) {
    const at = (q: number, out: Vector3) => {
      const y = track(q, [
        [0, 150],
        [0.1, 140],
        [0.36, 15],
        [0.7, 11.5],
        [0.88, 44],
        [1, ROOF.y + 6],
      ])
      const sway = Math.sin(q * 7) * 4.6 * (1 - smooth(0.78, 1, q)) * smooth(0, 0.15, q)
      return out.set(sway, y, lerp(60, ROOF.z + 32, q))
    }
    at(p, camera.position)
    at(Math.min(1, p + 0.035), target)
    target.z -= 40
    // Open on the skyline, tip down for the dive, then level out along the street.
    target.y -= lerp(8, 0, smooth(0, 0.4, p)) + 62 * smooth(0.06, 0.2, p) * (1 - smooth(0.2, 0.38, p))
    const lock = smooth(0.72, 1, p)
    target.x = lerp(target.x, ROOF.x, lock)
    target.y = lerp(target.y, ROOF.y + 4.6, lock)
    target.z = lerp(target.z, ROOF.z + 18, lock)
    return Math.cos(p * 7) * 0.06 * (1 - lock) * smooth(0, 0.15, p)
  }

  update(f: Frame) {
    cityUniforms.uTime.value = f.time
    cityUniforms.uBeat.value = f.beat
    const g = (this.mirror.material as ShaderMaterial).uniforms
    g.uTime!.value = f.time
    g.uBeat!.value = f.beat
    this.traffic.update(f.dt)
    this.tickers.forEach((t, i) => {
      t.tex.offset.x = f.time * (i % 2 ? 0.02 : -0.03)
      ;(t.mesh.material as MeshBasicMaterial).opacity = 0.4 + 0.12 * Math.sin(f.time * 3 + i)
    })
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(f.time * 0.13 + i * 1.7) * 0.6
      b.rotation.x = Math.cos(f.time * 0.1 + i) * 0.5
    })
  }
}

const SIGN_GLOW = [col(HEX.pink), col(HEX.cyan), col(0xff9a3c), col(0xf4f0ff), col(HEX.pink), col(HEX.cyan), col(0xb6ff3c)]

/**
 * The wet street. With `mirror` it samples a real reflection of the city, smeared and
 * broken up by puddles; without, it fakes the same streaks from the district colours.
 */
function groundShader(mirror: boolean) {
  return {
    name: 'WetStreet',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: new Matrix4() },
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uFog: { value: cityUniforms.uFog.value },
      uPink: { value: cityUniforms.uPink.value },
      uCyan: { value: cityUniforms.uCyan.value },
      uAmber: { value: cityUniforms.uAmber.value },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${mirror ? '#define MIRROR' : ''}
      uniform sampler2D tDiffuse; varying vec4 vUv; varying vec3 vWorld;
      ${common}
      void main() {
        vec2 p = vWorld.xz;
        vec3 V = normalize(cameraPosition - vWorld);
        float puddle = smoothstep(0.42, 0.66, vnoise(p * 0.08) * 0.7 + vnoise(p * 0.31) * 0.3);
        float grain = vnoise(p * 3.0);
        vec3 asphalt = vec3(0.010, 0.010, 0.016) * (0.5 + grain);
        float fres = mix(0.22, 1.0, pow(1.0 - max(V.y, 0.0), 3.0));

        vec3 refl = vec3(0.0);
        #ifdef MIRROR
          // Rain breaks the puddles up; rough asphalt smears the picture downward.
          vec2 wob = vec2(vnoise(p * 4.5 + uTime * 1.3), vnoise(p * 4.5 + 31.0 - uTime * 1.1)) - 0.5;
          float rough = mix(0.016, 0.004, puddle);
          for (int i = 0; i < 6; i++) {
            vec4 q = vUv;
            q.xy += wob * rough * q.w;
            q.y += float(i) * 0.012 * (1.0 - puddle * 0.8) * q.w;
            refl += texture2DProj(tDiffuse, q).rgb;
          }
          refl /= 6.0;
        #else
          vec3 zone = zoneColor(vWorld.z);
          float a = vnoise(vec2(p.x * 0.22, p.y * 0.035));
          float b = vnoise(vec2(p.x * 0.19 + 40.0, p.y * 0.03 + 9.0));
          refl = zone * smoothstep(0.5, 0.85, a) * 0.5 + uCyan * smoothstep(0.58, 0.9, b) * 0.3;
        #endif

        vec3 c = asphalt + refl * fres * mix(0.5, 1.0, puddle);
        // Paint: lane dashes and the centre line.
        float road = step(abs(p.x), ${ROAD.toFixed(1)});
        float dash = step(0.55, fract(p.y / 12.0)) * smoothstep(0.22, 0.12, abs(abs(p.x) - 4.4));
        float centre = smoothstep(0.2, 0.1, abs(abs(p.x) - 0.35));
        c += vec3(0.5, 0.48, 0.42) * (dash + centre * 0.8) * road * 0.12 * (0.5 + grain);
        gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
      }
    `,
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
