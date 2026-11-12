import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { PerspectiveCamera } from 'three'
import { HEX, celRamp, col, smooth } from '../palette'
import type { Frame } from '../types'

/**
 * Chapter 5, Delivered: the courier parcel, built in code.
 * PLACEHOLDER shape. A Tripo-made parcel is a good first prop: hard, boxy and small.
 */
export class ParcelChapter {
  readonly group = new Group()
  readonly home = new Vector3(0, 190, -900)
  private readonly box = new Group()
  private readonly led: MeshBasicMaterial

  constructor() {
    const ramp = celRamp()
    const toon = (hex: number, gain = 1) => new MeshToonMaterial({ color: col(hex, gain), gradientMap: ramp })
    this.box.add(new Mesh(new BoxGeometry(3.4, 2.2, 2.6), toon(0x6a6790)))
    for (const x of [-0.9, 0.9]) {
      const strap = new Mesh(new BoxGeometry(0.34, 2.28, 2.68), toon(HEX.pink, 1.1))
      strap.position.x = x
      this.box.add(strap)
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const cap = new Mesh(new BoxGeometry(0.36, 0.36, 0.36), toon(HEX.gold, 1.1))
      cap.position.set(sx * 1.6, sy * 1.0, sz * 1.2)
      this.box.add(cap)
    }
    const label = new Mesh(new PlaneGeometry(1.25, 1.1), new MeshBasicMaterial({ map: barcodeTexture(), toneMapped: false }))
    label.position.set(0, 0.1, 1.31)
    this.box.add(label)
    this.led = new MeshBasicMaterial({ color: col(HEX.cyan, 2) })
    const led = new Mesh(new BoxGeometry(0.5, 0.1, 0.06), this.led)
    led.position.set(0, -0.72, 1.32)
    this.box.add(led)

    const key = new DirectionalLight(0xffffff, 3)
    key.position.set(3, 5, 6)
    const rim = new PointLight(HEX.cyan, 60, 0, 1.6)
    rim.position.set(-5, -1, -3)
    const fill = new PointLight(HEX.pink, 40, 0, 1.6)
    fill.position.set(4, -4, 3)
    this.group.add(this.box, key, rim, fill, new AmbientLight(0x50508a, 1.4))
    this.group.position.copy(this.home)
  }

  pose(camera: PerspectiveCamera, target: Vector3) {
    // The receipt takes the right half on wide screens, so the parcel sits left; on a
    // phone it sits high, above the receipt.
    const wide = smooth(0.9, 1.5, camera.aspect)
    camera.position.set(this.home.x + 3.6 * wide, this.home.y + 0.6 - 2.6 * (1 - wide), this.home.z + 10.5 + 4 * (1 - wide))
    target.set(this.home.x + 3.6 * wide, this.home.y - 2.6 * (1 - wide), this.home.z)
  }

  update(f: Frame) {
    this.box.rotation.y = f.time * 0.35 + f.pointer.x * 0.5
    this.box.rotation.x = 0.28 + f.pointer.y * -0.2
    this.box.position.y = Math.sin(f.time * 1.1) * 0.18
    this.led.color.copy(col(HEX.cyan, 0.8 + f.beat * 2.2))
  }
}

function barcodeTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 224
  const g = c.getContext('2d')!
  g.fillStyle = '#e9e6f2'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#0b0714'
  let x = 22
  let n = 7
  while (x < 232) {
    n = (n * 31 + 11) % 97
    const w = 2 + (n % 4) * 2
    g.fillRect(x, 26, w, 120)
    x += w + 3 + (n % 3) * 2
  }
  g.font = '600 26px "JetBrains Mono", monospace'
  g.textAlign = 'center'
  g.fillText('RM-0037-YOU', 128, 190)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}
