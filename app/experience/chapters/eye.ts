import {
  AmbientLight,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PointLight,
  RingGeometry,
  ShaderMaterial,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import type { PerspectiveCamera } from 'three'
import { HEX, celRamp, col, lerp, rng, smooth } from '../palette'
import type { Frame } from '../types'

/**
 * Chapter 1, Optic: Rina's cybernetic left eye, built from primitives.
 * The camera starts inside the lens and scroll pulls it out; near the end the aperture
 * closes, which hides the cut to the city.
 */
export class EyeChapter {
  readonly group = new Group()
  private readonly iris = new Group()
  private readonly rings: { node: Group; speed: number }[] = []
  private readonly blades: Mesh[] = []
  private readonly pistons: Mesh[] = []
  private readonly pupil: ShaderMaterial
  private readonly key: PointLight
  private ringKick = 0
  private lastBeat = -1

  constructor() {
    const ramp = celRamp()
    const toon = (hex: number, gain = 1) => new MeshToonMaterial({ color: col(hex, gain), gradientMap: ramp })
    const chrome = toon(0xa9a4bc)
    const steel = toon(0x465a7c)
    const dark = toon(0x242436)
    const gold = toon(HEX.gold, 1.15)
    const pink = toon(HEX.pink, 1.2)

    // Light: a cool key that follows the pointer, pink fill from below.
    this.key = new PointLight(0xdff6ff, 7, 0, 1.4)
    this.key.position.set(1.5, 2, 2.2)
    const fill = new PointLight(HEX.pink, 9, 0, 1.4)
    fill.position.set(-2.6, -2.6, 1.6)
    const sun = new DirectionalLight(0xffffff, 0.35)
    sun.position.set(-2, 3, 6)
    this.group.add(this.key, fill, sun, new AmbientLight(0x4a4a78, 0.55))

    // Outer shell: chrome plates and the gold bezel.
    this.group.add(ringOfPlates(1.62, 2.55, 6, 0.09, 0.16, chrome, 0.22))
    this.group.add(ringOfPlates(2.62, 3.25, 10, 0.05, 0.1, dark, 0.05))
    const bezel = new Mesh(new TorusGeometry(1.56, 0.075, 10, 72), gold)
    bezel.position.z = 0.3
    this.group.add(bezel)
    for (let i = 0; i < 12; i++) {
      const bolt = new Mesh(new CylinderGeometry(0.05, 0.05, 0.08, 10), gold)
      const a = (i / 12) * Math.PI * 2
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(Math.cos(a) * 2.38, Math.sin(a) * 2.38, 0.4)
      this.group.add(bolt)
    }

    // Cables running off into the dark, as in the mechanical eye reference.
    const rand = rng(7)
    const cableMat = toon(0x2f8f98)
    for (let i = 0; i < 7; i++) {
      const a = lerp(2.2, 4.4, rand()) + (i % 2 ? 0 : Math.PI)
      const start = new Vector3(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 0)
      const end = new Vector3(Math.cos(a + 0.5) * 9, Math.sin(a + 0.5) * 9, -1.5 - rand() * 2)
      const mid = start.clone().lerp(end, 0.5).add(new Vector3(rand() - 0.5, rand() * 1.6 - 0.8, 0.6))
      const tube = new TubeGeometry(new CatmullRomCurve3([start, mid, end]), 24, 0.045 + rand() * 0.03, 6)
      this.group.add(new Mesh(tube, cableMat))
    }

    // The iris: three titanium rings that turn against each other, stepping deeper.
    const specs = [
      { rIn: 1.14, rOut: 1.46, n: 5, z: 0.02, speed: 0.08, mat: steel },
      { rIn: 0.86, rOut: 1.1, n: 7, z: -0.14, speed: -0.13, mat: chrome },
      { rIn: 0.66, rOut: 0.83, n: 9, z: -0.28, speed: 0.2, mat: steel },
    ]
    for (const s of specs) {
      const node = ringOfPlates(s.rIn, s.rOut, s.n, 0.07, 0.12, s.mat, s.z)
      this.rings.push({ node, speed: s.speed })
      this.iris.add(node)
    }

    // Three actuators with her hot-pink pistons, on the middle ring.
    for (let i = 0; i < 3; i++) {
      const arm = new Group()
      arm.rotation.z = (i / 3) * Math.PI * 2 + 0.5
      const body = new Mesh(new CylinderGeometry(0.07, 0.07, 0.34, 10), dark)
      body.position.set(0, 1.0, 0.02)
      const rod = new Mesh(new CylinderGeometry(0.04, 0.04, 0.3, 10), pink)
      rod.position.set(0, 0.78, 0.02)
      const cap = new Mesh(new CylinderGeometry(0.085, 0.085, 0.06, 10), gold)
      cap.position.set(0, 1.18, 0.02)
      arm.add(body, rod, cap)
      this.pistons.push(rod)
      this.rings[1]!.node.add(arm)
    }

    // Aperture: eight blades, each swinging on its own pivot.
    const bladeShape = new Shape()
    bladeShape.moveTo(0, 0)
    bladeShape.lineTo(0.02, 1.32)
    bladeShape.lineTo(0.42, 1.22)
    bladeShape.lineTo(0.6, 0.1)
    bladeShape.closePath()
    const bladeGeo = new ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: false })
    const bladeMat = toon(0x3c4258)
    for (let i = 0; i < 8; i++) {
      const arm = new Group()
      arm.rotation.z = (i / 8) * Math.PI * 2
      const blade = new Mesh(bladeGeo, bladeMat)
      blade.position.set(PIVOT, 0, -0.4 - i * 0.014)
      arm.add(blade)
      this.blades.push(blade)
      this.iris.add(arm)
    }
    const throat = new Mesh(new TorusGeometry(0.66, 0.035, 8, 48), gold)
    throat.position.z = -0.33
    this.iris.add(throat)

    // The pupil: the one thing in the eye that emits light.
    this.pupil = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uCyan: { value: col(HEX.cyan) },
        uPink: { value: col(HEX.pink) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime; uniform float uBeat; uniform vec3 uCyan; uniform vec3 uPink;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float core = smoothstep(0.2, 0.0, r);
          float rings = smoothstep(0.75, 1.0, sin(r * 46.0 - uTime * 1.5) * 0.5 + 0.5) * (1.0 - r);
          float spokes = smoothstep(0.9, 1.0, sin(a * 24.0 + uTime * 0.4)) * smoothstep(0.3, 0.6, r) * (1.0 - r);
          float sweep = smoothstep(0.92, 1.0, cos(a - uTime * 0.9)) * smoothstep(0.15, 0.5, r);
          vec3 c = uCyan * (0.55 + core * 2.6 + rings * 1.3 + spokes * 0.9 + uBeat * 0.5);
          c += uPink * sweep * 1.4;
          c *= smoothstep(1.0, 0.82, r);
          // A dark lens centre so it reads as a pupil, not a lamp.
          c *= 0.25 + 0.75 * smoothstep(0.05, 0.17, abs(r - 0.3) + 0.05);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })
    const pupil = new Mesh(new CircleGeometry(0.74, 64), this.pupil)
    pupil.position.z = -0.62
    this.iris.add(pupil)

    // Lens highlight, as in the reference.
    const glint = new Mesh(
      new CircleGeometry(0.11, 24),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    )
    glint.position.set(0.62, 0.66, 0.36)
    const glintRing = new Mesh(
      new RingGeometry(0.16, 0.175, 32),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    )
    glintRing.position.copy(glint.position)
    this.iris.add(glint, glintRing)

    this.group.add(this.iris)

    // Close the back so nothing shows through the gaps.
    const back = new Mesh(new CircleGeometry(3.4, 48), new MeshBasicMaterial({ color: 0x050509 }))
    back.position.z = -0.9
    this.group.add(back)
  }

  /** Where the camera sits for this scroll position. */
  pose(p: number, camera: PerspectiveCamera, target: Vector3, f: Frame) {
    const pull = smooth(0.02, 0.9, p)
    // A portrait screen needs more distance to show the same eye.
    const fit = Math.max(1, 1.15 / camera.aspect)
    const z = lerp(2.15, 9.5, pull * pull * (3 - 2 * pull)) * lerp(1, fit, 0.6)
    camera.position.set(f.pointer.x * 0.18 * pull, f.pointer.y * 0.18 * pull, z)
    target.set(0, 0, 0)
  }

  update(p: number, f: Frame) {
    if (f.beatIndex !== this.lastBeat) {
      this.lastBeat = f.beatIndex
      this.ringKick = 1
    }
    this.ringKick *= Math.exp(-f.dt * 5)

    // The iris looks at the visitor.
    this.iris.position.x = lerp(this.iris.position.x, f.pointer.x * 0.26, 0.12)
    this.iris.position.y = lerp(this.iris.position.y, f.pointer.y * 0.2, 0.12)
    this.iris.rotation.y = this.iris.position.x * 0.9
    this.iris.rotation.x = -this.iris.position.y * 0.9
    this.key.position.set(0.8 + f.pointer.x * 2.4, 1 + f.pointer.y * 2, 2.2)

    // Rings creep, then tick forward on every beat.
    for (const r of this.rings) r.node.rotation.z += r.speed * f.dt * (1 + this.ringKick * 7)
    this.pistons.forEach((rod, i) => {
      rod.position.y = 0.78 - 0.07 * (0.5 + 0.5 * Math.sin(f.time * 2 + i * 2.1)) - this.ringKick * 0.03
    })

    // Aperture: opens as the system boots, breathes with the beat, shuts for the blink.
    const boot = smooth(0, 0.07, p)
    const open = (0.25 + 0.55 * boot + f.beat * 0.07 + f.level * 0.12) * (1 - smooth(0.74, 0.96, p))
    const swing = (1 - Math.min(1, open)) * (Math.PI / 2)
    for (const b of this.blades) b.rotation.z = swing

    this.pupil.uniforms.uTime!.value = f.time
    this.pupil.uniforms.uBeat!.value = f.beat
  }
}

const PIVOT = 0.64

/** A ring cut into separate plates, each with its own thickness so the ink pass finds edges. */
function ringOfPlates(
  rIn: number,
  rOut: number,
  count: number,
  gap: number,
  depth: number,
  material: MeshToonMaterial,
  z: number,
): Group {
  const node = new Group()
  const span = (Math.PI * 2) / count
  for (let i = 0; i < count; i++) {
    const a0 = i * span + gap / 2
    const a1 = (i + 1) * span - gap / 2
    const shape = new Shape()
    shape.absarc(0, 0, rOut, a0, a1, false)
    shape.absarc(0, 0, rIn, a1, a0, true)
    shape.closePath()
    const plate = new Mesh(
      new ExtrudeGeometry(shape, { depth: depth * (i % 2 ? 1 : 0.6), bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1, curveSegments: 18 }),
      material,
    )
    plate.position.z = z
    node.add(plate)
    // A slot cut-out look: a small dark inset on every other plate.
    if (i % 2 === 0 && rOut - rIn > 0.2) {
      const mid = (a0 + a1) / 2
      const slot = new Shape()
      slot.absarc(0, 0, rOut - (rOut - rIn) * 0.35, mid - span * 0.18, mid + span * 0.18, false)
      slot.absarc(0, 0, rIn + (rOut - rIn) * 0.35, mid + span * 0.18, mid - span * 0.18, true)
      slot.closePath()
      const inset = new Mesh(
        new ExtrudeGeometry(slot, { depth: 0.02, bevelEnabled: false, curveSegments: 10 }),
        new MeshBasicMaterial({ color: 0x0d0d16 }),
      )
      inset.position.z = z + depth * 0.6 + 0.03
      node.add(inset)
    }
  }
  return node
}
