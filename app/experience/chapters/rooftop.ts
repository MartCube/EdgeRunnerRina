import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import type { PerspectiveCamera } from 'three'
import { HEX, col, lerp, smooth } from '../palette'
import type { Frame, RinaView } from '../types'
import { ROOF } from './city'
import { RoofDress } from './roofdress'

/** Height of the figure in scene units. */
export const TALL = 9.4

/**
 * Chapter 3, Rina: the rooftop where she waits.
 * She is her rigged model (see rina.ts), which also runs the scan sweep. The 2D card below
 * is the fallback while the model loads, or if public/models/rina.glb is missing.
 */
export class RooftopChapter {
  readonly group = new Group()
  readonly focus = new Vector3(ROOF.x, ROOF.y + TALL * 0.52, ROOF.z + 18)
  /** Placeholder roof furniture, and where the Blender rooftop set goes instead. */
  readonly furniture = new Group()
  /** The parts that move with the music, kept whether or not the Blender set is in. */
  readonly fixtures = new Group()
  readonly setHolder = new Group()
  /** Where Rina's model stands; the card is her placeholder. */
  readonly figureHolder = new Group()
  readonly card: Mesh
  private readonly figure: ShaderMaterial
  private readonly beacon: MeshBasicMaterial
  /** Pad, halo, signs, koi, drone, traffic and her lights: see roofdress.ts. */
  readonly dress = new RoofDress()

  constructor(onLoad: () => void) {
    const top = ROOF.y
    const flat = (hex: number, gain = 1) => new MeshBasicMaterial({ color: col(hex, gain) })

    // Roof furniture, all simple blocks. A Blender rooftop set replaces them (slot "rooftop-set").
    const parapet = flat(0x2a2848)
    const half = ROOF.size / 2
    for (const [x, z, w, d] of [
      [0, half - 0.6, ROOF.size, 1.2],
      [0, -half + 0.6, ROOF.size, 1.2],
      [-half + 0.6, 0, 1.2, ROOF.size],
      [half - 0.6, 0, 1.2, ROOF.size],
    ] as const) {
      const wall = new Mesh(new BoxGeometry(w, 1.6, d), parapet)
      wall.position.set(ROOF.x + x, top + 0.8, ROOF.z + z)
      this.furniture.add(wall)
    }
    const unit = flat(0x34325a)
    for (const [x, z, s] of [
      [-13, 6, 1],
      [-8.5, 3, 0.7],
      [14, 2, 1.2],
    ] as const) {
      const ac = new Mesh(new BoxGeometry(4 * s, 3 * s, 3 * s), unit)
      ac.position.set(ROOF.x + x, top + 1.5 * s, ROOF.z + z)
      const vent = new Mesh(new CylinderGeometry(1 * s, 1 * s, 0.3, 14), flat(0x14141f))
      vent.position.set(ROOF.x + x, top + 3 * s + 0.15, ROOF.z + z)
      this.furniture.add(ac, vent)
    }
    const mast = new Mesh(new CylinderGeometry(0.16, 0.22, 20, 8), flat(0x3a3860))
    mast.position.set(ROOF.x + 17, top + 10, ROOF.z + 8)
    this.beacon = new MeshBasicMaterial({ color: col(HEX.pink, 2) })
    const lamp = new Mesh(new BoxGeometry(0.7, 0.7, 0.7), this.beacon)
    lamp.position.set(ROOF.x + 17, top + 20.3, ROOF.z + 8)
    this.fixtures.add(mast, lamp)

    this.group.add(this.furniture, this.fixtures, this.dress.group)
    this.setHolder.position.set(ROOF.x, top, ROOF.z)
    this.figureHolder.position.set(ROOF.x, top, ROOF.z + 18)
    this.group.add(this.setHolder, this.figureHolder)

    // Rina.
    const map = new TextureLoader().load('img/rina-pose.webp', onLoad, undefined, onLoad)
    map.colorSpace = SRGBColorSpace
    this.figure = new ShaderMaterial({
      transparent: true,
      side: DoubleSide,
      uniforms: { uMap: { value: map }, uScan: { value: 0 }, uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) }, uPink: { value: col(HEX.pink) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform sampler2D uMap; uniform float uScan; uniform float uTime; uniform vec3 uCyan; uniform vec3 uPink;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          if (t.a < 0.35) discard;
          // The sweep runs head to feet. Above the line she is printed; below it, still a hologram.
          float line = 1.04 - uScan * 1.1;
          float printed = step(line, vUv.y);
          float luma = dot(t.rgb, vec3(0.299, 0.587, 0.114));
          float rows = 0.6 + 0.4 * step(0.5, fract(vUv.y * 150.0 - uTime * 1.4));
          float jitter = step(0.96, fract(sin(floor(vUv.y * 60.0) * 91.7 + floor(uTime * 12.0)) * 4375.5));
          vec3 holo = uCyan * (0.25 + luma * 1.5) * rows + uPink * jitter * 0.6;
          vec3 c = mix(holo, t.rgb * 1.7, printed);
          float band = smoothstep(0.03, 0.0, abs(vUv.y - line));
          c += (uCyan + 0.4) * band * 2.2;
          float alpha = mix(0.82 * rows + band, 1.0, printed);
          gl_FragColor = vec4(c, alpha * smoothstep(0.35, 0.6, t.a));
        }
      `,
    })
    this.card = new Mesh(new PlaneGeometry(TALL * (526 / 1024), TALL), this.figure)
    this.card.position.set(ROOF.x, top + TALL / 2 - 0.05, ROOF.z + 18)
    this.group.add(this.card)
  }

  /**
   * The camera in front of Rina.
   * @param p  0 to 1, the landing: the camera closes in as it goes.
   * @param v  What the visitor is doing: file open, dragged around her, looking at a part.
   */
  pose(p: number, v: RinaView, camera: PerspectiveCamera, target: Vector3, f: Frame) {
    const e = smooth(0, 0.7, p)
    // A tall screen needs more distance to fit her in.
    const wide = smooth(0.9, 1.5, camera.aspect)
    const stand = lerp(15.5, 11.5, e) * lerp(1.5, 1, wide) + v.link * lerp(4, 1.5, wide)
    const dist = lerp(stand * v.dolly, v.partDist, v.zoom)
    const feetY = this.focus.y - TALL * 0.52
    target.set(
      this.focus.x + v.partX * v.zoom,
      // With her file open on a phone the panels fill the lower half, so she moves up.
      lerp(this.focus.y - v.link * (1 - wide) * 3.4, feetY + TALL * v.partY, v.zoom),
      this.focus.z,
    )
    // Orbit goes all the way round her; tilt lifts the camera over her. Both fade out while
    // the camera is moved in on one of her parts.
    const tilt = v.tilt * (1 - v.zoom)
    const flat = Math.cos(tilt) * dist
    const sway = 1 - Math.min(1, Math.abs(v.tilt) * 2 + v.zoom * 0.6)
    camera.position.set(
      target.x + Math.sin(v.orbit) * flat + Math.cos(v.orbit) * f.pointer.x * 1.3 * sway,
      Math.max(feetY + 0.6, target.y + Math.sin(tilt) * dist + lerp(1.4, 0.3, e) * (1 - v.zoom) + f.pointer.y * 0.6 * sway),
      target.z + Math.cos(v.orbit) * flat - Math.sin(v.orbit) * f.pointer.x * 1.3 * sway,
    )
  }

  update(p: number, f: Frame) {
    this.figure.uniforms.uScan!.value = smooth(0.06, 0.55, p)
    this.figure.uniforms.uTime!.value = f.time
    this.beacon.color.copy(col(HEX.pink, f.beatIndex % 2 ? 0.5 : 2.4))
    this.dress.update(f)
  }
}
