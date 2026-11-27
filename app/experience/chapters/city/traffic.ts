import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import { rng } from '../../palette'

interface Vehicle {
  /** 0: travels along z, 1: travels along x. */
  axis: 0 | 1
  lane: number
  y: number
  pos: number
  speed: number
  len: number
}

/**
 * Cars on the street and flying traffic between the towers. Each one is a dark body with a
 * white light bar in front and a red one behind; bloom does the rest.
 */
export class Traffic {
  readonly group = new Group()
  private readonly list: Vehicle[] = []
  private readonly body: InstancedMesh
  private readonly front: InstancedMesh
  private readonly rear: InstancedMesh
  private readonly m = new Matrix4()

  constructor(private readonly zMin: number, private readonly zMax: number) {
    const rand = rng(99)
    // Street: two lanes each way.
    for (let i = 0; i < 46; i++) {
      const dir = i % 2 ? 1 : -1
      this.list.push({ axis: 0, lane: -dir * (i % 4 < 2 ? 2.6 : 6.2), y: 0.75, pos: zMin + rand() * (zMax - zMin), speed: dir * (22 + rand() * 20), len: 4.4 })
    }
    // Air lanes beside the street, well clear of the camera's route.
    for (let i = 0; i < 70; i++) {
      const dir = i % 2 ? 1 : -1
      const lane = (i % 2 ? 1 : -1) * (34 + Math.floor(rand() * 5) * 22)
      this.list.push({ axis: 0, lane, y: 48 + Math.floor(rand() * 6) * 24 + rand() * 3, pos: zMin + rand() * (zMax - zMin), speed: dir * (45 + rand() * 50), len: 7 })
    }
    // High lanes over the rooftops, seen from the opening shot: streams of lights crossing the city.
    const high = rng(321)
    for (let i = 0; i < 140; i++) {
      const dir = i % 2 ? 1 : -1
      const lane = (i % 2 ? 1 : -1) * (60 + Math.floor(high() * 9) * 48)
      this.list.push({ axis: 0, lane, y: 170 + Math.floor(high() * 5) * 26 + high() * 4, pos: zMin + high() * (zMax - zMin), speed: dir * (70 + high() * 60), len: 8 })
    }
    // Cross traffic, only where the camera is down at street level.
    for (let i = 0; i < 36; i++) {
      const dir = i % 2 ? 1 : -1
      this.list.push({ axis: 1, lane: -330 - Math.floor(rand() * 5) * 62, y: 52 + Math.floor(rand() * 4) * 22, pos: (rand() - 0.5) * 600, speed: dir * (50 + rand() * 40), len: 7 })
    }

    const n = this.list.length
    const box = new BoxGeometry(1, 1, 1)
    this.body = new InstancedMesh(box, new MeshBasicMaterial({ color: 0x06060c }), n)
    const light = (hex: number, gain: number) => {
      const mat = new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(gain), toneMapped: false })
      return new InstancedMesh(box, mat, n)
    }
    this.front = light(0xdff1ff, 5)
    this.rear = light(0xff1a2a, 5)
    for (const mesh of [this.body, this.front, this.rear]) {
      mesh.frustumCulled = false
      this.group.add(mesh)
    }
  }

  update(dt: number) {
    const span = this.zMax - this.zMin
    this.list.forEach((v, i) => {
      v.pos += v.speed * dt
      if (v.axis === 0) {
        if (v.pos > this.zMax) v.pos -= span
        if (v.pos < this.zMin) v.pos += span
      } else if (Math.abs(v.pos) > 300) {
        v.pos = -Math.sign(v.pos) * 300
      }
      const dir = Math.sign(v.speed)
      const wide = v.len > 5 ? 2.6 : 2
      const tall = v.len > 5 ? 1.3 : 1.2
      const place = (mesh: InstancedMesh, along: number, w: number, h: number, l: number, up = 0) => {
        if (v.axis === 0) this.m.makeScale(w, h, l).setPosition(v.lane, v.y + up, v.pos + along * dir)
        else this.m.makeScale(l, h, w).setPosition(v.pos + along * dir, v.y + up, v.lane)
        mesh.setMatrixAt(i, this.m)
      }
      place(this.body, 0, wide, tall, v.len)
      place(this.front, v.len / 2, wide * 0.9, 0.22, 0.25, -0.1)
      place(this.rear, -v.len / 2, wide * 0.9, 0.2, 0.25, 0.05)
    })
    this.body.instanceMatrix.needsUpdate = true
    this.front.instanceMatrix.needsUpdate = true
    this.rear.instanceMatrix.needsUpdate = true
  }
}
