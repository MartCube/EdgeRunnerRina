import {
  BoxGeometry,
  CanvasTexture,
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
import type { Frame } from '../types'
import { ROOF } from './city'

/** Height of the figure in scene units. */
const TALL = 9.4

/**
 * Chapter 3, Rina: the rooftop where she waits.
 * PLACEHOLDER: she is her 2D art on a flat card until the Blender model exists. The scan
 * sweep (hologram first, then printed solid) is written against the card's UVs and will
 * move to the model's world height when the GLB replaces it (slot "rina" in props.ts).
 */
export class RooftopChapter {
  readonly group = new Group()
  readonly focus = new Vector3(ROOF.x, ROOF.y + TALL * 0.52, ROOF.z + 18)
  /** Placeholder roof furniture, and where a Blender rooftop set goes instead. */
  readonly furniture = new Group()
  readonly setHolder = new Group()
  /** Where Rina's model stands; the card is her placeholder. */
  readonly figureHolder = new Group()
  readonly card: Mesh
  private readonly figure: ShaderMaterial
  private readonly beacon: MeshBasicMaterial
  private readonly frame: MeshBasicMaterial

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
    this.furniture.add(mast, lamp)

    // The neon frame behind her.
    this.frame = new MeshBasicMaterial({ color: col(HEX.pink, 1.7) })
    const sign = new Group()
    for (const [x, y, w, h] of [
      [0, 6.1, 15, 0.28],
      [0, -6.1, 15, 0.28],
      [-7.4, 0, 0.28, 12.4],
      [7.4, 0, 0.28, 12.4],
    ] as const) {
      const bar = new Mesh(new BoxGeometry(w, h, 0.28), this.frame)
      bar.position.set(x, y, 0)
      sign.add(bar)
    }
    const label = new Mesh(
      new PlaneGeometry(13, 3.2),
      new MeshBasicMaterial({ map: labelTexture('MANDA EXPRESS'), transparent: true, toneMapped: false, side: DoubleSide }),
    )
    label.position.set(0, 4.3, 0.05)
    sign.add(label)
    sign.position.set(ROOF.x + 2.5, top + 9.4, ROOF.z + 11)
    this.furniture.add(sign)
    for (const x of [-4, 9]) {
      const post = new Mesh(new BoxGeometry(0.35, 3.4, 0.35), flat(0x1a1a28))
      post.position.set(ROOF.x + x, top + 1.7, ROOF.z + 11)
      this.furniture.add(post)
    }

    this.group.add(this.furniture)
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

  pose(p: number, ware: number, camera: PerspectiveCamera, target: Vector3, f: Frame) {
    const e = smooth(0, 0.7, p)
    // On a wide screen she stands right of centre so the dossier text has room.
    const wide = smooth(0.9, 1.5, camera.aspect)
    const dist = lerp(15.5, 11.5, e) * lerp(1.5, 1, wide) + ware * 16
    camera.position.set(
      ROOF.x + lerp(0, 2.5, e) + f.pointer.x * 1.3,
      this.focus.y + lerp(1.4, 0.3, e) + f.pointer.y * 0.6 + ware * 9,
      this.focus.z + dist,
    )
    target.copy(this.focus)
    target.x -= lerp(0, 4.2, e) * wide
    target.y += ware * 12
  }

  update(p: number, f: Frame) {
    this.figure.uniforms.uScan!.value = smooth(0.06, 0.55, p)
    this.figure.uniforms.uTime!.value = f.time
    this.beacon.color.copy(col(HEX.pink, f.beatIndex % 2 ? 0.5 : 2.4))
    this.frame.color.copy(col(HEX.pink, 1.5 + f.beat * 0.7 + f.level))
  }
}

function labelTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#00f0ff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Shrink the type until the words fit the canvas, whichever font has loaded.
  let size = 170
  do {
    g.font = `900 ${size}px "Big Shoulders Display", Impact, sans-serif`
    size -= 6
  } while (g.measureText(text).width > c.width - 60 && size > 40)
  g.fillText(text, c.width / 2, c.height / 2 + 8)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
