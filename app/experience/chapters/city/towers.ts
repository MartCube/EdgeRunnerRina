import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { BufferAttribute, BufferGeometry } from 'three'
import type { Object3D, ShaderMaterial } from 'three'
import { HEX, col, rng } from '../../palette'

/**
 * A street lot that gets a Blender tower. `boxes` is the range of the city's instanced boxes
 * that stand in for it until the model loads. `side` is which side of the street it is on.
 */
export interface TowerLot { x: number; z: number; w: number; d: number; h: number; side: number; seed: number; boxes: [number, number]; design?: string }

/** Footprint every tower is built to in tools/city/build_towers.py. */
const FOOT = 30
type Part = 'wall' | 'trim' | 'neon_pink' | 'neon_cyan'

/**
 * The Blender towers: twelve designs from tools/city/build_towers.py, each squeezed to fit
 * its lot. Walls and trim are drawn with the city's own
 * window shader, so their windows, shopfronts and fog match the box towers around them; the
 * neon strips glow. One instanced mesh per design and part keeps it to a couple of dozen draws.
 */
export class TowerModels {
  readonly group = new Group()

  constructor(models: Object3D, lots: TowerLot[], towerMat: ShaderMaterial) {
    // Collect the parts of each design, named "<design>__<part>" in towers.glb.
    const designs = new Map<string, Map<Part, BufferGeometry>>()
    models.updateMatrixWorld(true)
    models.traverse((o) => {
      if (!(o instanceof Mesh)) return
      const named = o.name.includes('__') ? o : o.parent
      const [design, part] = (named?.name ?? '').split('__') as [string, Part]
      if (!design || !part) return
      if (!designs.has(design)) designs.set(design, new Map())
      designs.get(design)!.set(part, unpack(o.geometry).applyMatrix4(o.matrixWorld))
    })
    if (!designs.size) return

    // Normalise each design to the unit box the window shader expects: footprint to -0.5..0.5,
    // height (spire included) to -0.5..0.5.
    const info: { name: string; aspect: number }[] = []
    for (const [name, parts] of designs) {
      let top = 0
      for (const g of parts.values()) {
        g.computeBoundingBox()
        top = Math.max(top, g.boundingBox!.max.y)
      }
      const m = new Matrix4().makeScale(1 / FOOT, 1 / top, 1 / FOOT).multiply(new Matrix4().makeTranslation(0, -top / 2, 0))
      for (const g of parts.values()) g.applyMatrix4(m)
      info.push({ name, aspect: top / FOOT })
    }

    // Each lot takes the design whose proportions suit it best, never the same as its neighbour.
    const rand = rng(77)
    const chosen = new Map<string, TowerLot[]>()
    let last = ''
    for (const lot of lots) {
      const want = Math.log(lot.h / lot.w)
      const ranked = info
        .filter((d) => d.name !== last)
        .map((d) => ({ d, score: Math.abs(Math.log(d.aspect) - want) + rand() * 0.9 }))
        .sort((a, b) => a.score - b.score)
      last = ranked[0]!.d.name
      lot.design = last
      if (!chosen.has(last)) chosen.set(last, [])
      chosen.get(last)!.push(lot)
    }

    const neon: Record<string, MeshBasicMaterial> = {
      neon_pink: new MeshBasicMaterial({ color: col(HEX.pink, 2.2), toneMapped: false }),
      neon_cyan: new MeshBasicMaterial({ color: col(HEX.cyan, 2.2), toneMapped: false }),
    }
    const m = new Matrix4()
    const q = new Quaternion()
    const up = new Vector3(0, 1, 0)
    for (const [name, at] of chosen) {
      for (const [part, geo] of designs.get(name)!) {
        const shader = part === 'wall' || part === 'trim'
        const mesh = new InstancedMesh(geo, shader ? towerMat : neon[part]!, at.length)
        const attr = new Float32Array(at.length * 2)
        at.forEach((lot, i) => {
          // The street face is +X in the model: towers on the right of the street turn round.
          q.setFromAxisAngle(up, lot.side > 0 ? Math.PI : 0)
          m.compose(new Vector3(lot.x, lot.h / 2, lot.z), q, new Vector3(lot.w, lot.h, lot.d))
          mesh.setMatrixAt(i, m)
          // Walls get windows and shopfronts (kind 1); trim is plain dark (kind 2).
          attr.set([lot.seed, part === 'wall' ? 1 : 2], i * 2)
        })
        geo.setAttribute('aInfo', new InstancedBufferAttribute(attr, 2))
        mesh.frustumCulled = false
        this.group.add(mesh)
      }
    }
  }
}

/**
 * A float copy of a geometry. towers.glb is meshopt-packed, which stores positions and normals
 * as small integers; transforming those in place would clip everything outside -1..1.
 */
function unpack(src: BufferGeometry): BufferGeometry {
  const geo = new BufferGeometry()
  for (const name of ['position', 'normal'] as const) {
    const a = src.getAttribute(name)
    if (!a) continue
    const out = new Float32Array(a.count * 3)
    for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3)
    geo.setAttribute(name, new BufferAttribute(out, 3))
  }
  if (src.index) geo.setIndex(src.index.clone())
  return geo
}
