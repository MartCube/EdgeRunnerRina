import { Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'
import { rng } from '../../palette'

/**
 * Street-facing side of a tower, where the Blender kit hangs its clutter.
 * `x` is the wall plane, `side` which side of the street the tower is on (-1 left, 1 right).
 */
export interface Facade { x: number; side: number; z0: number; z1: number; y0: number; y1: number }
export interface RoofSpot { x: number; z: number; top: number }

const FLOOR = 3.6

/** Kit pieces from tools/city/build_kit.py, as they are named in city-kit.glb. */
type Piece = 'ac' | 'balcony' | 'escape' | 'pipe' | 'vent' | 'tank' | 'hut' | 'antenna'
/** Pieces left out on phones and lite mode, and the share of the rest that is kept. */
const LITE: Partial<Record<Piece, number>> = { escape: 0, balcony: 0.5, ac: 0.4, vent: 0, pipe: 0.5 }

/**
 * The facade kit: AC units, balconies with laundry, fire escapes, pipes and vents on the
 * street walls, water tanks, stair huts and antennas on the roofs. Each piece is drawn as
 * one instanced mesh per material, so a few thousand of them cost a couple of dozen draws.
 */
export class FacadeKit {
  readonly group = new Group()
  private readonly meshes: { mesh: InstancedMesh; piece: Piece; full: number }[] = []

  constructor(kit: Object3D, facades: Facade[], roofs: RoofSpot[]) {
    const place = scatter(facades, roofs)
    const parts = new Map<Piece, Mesh[]>()
    kit.updateMatrixWorld(true)
    kit.traverse((o) => {
      if (!(o instanceof Mesh)) return
      // Blender names the node "<piece>__<material>"; a mesh with several materials comes
      // in as a group of meshes under that node.
      const named = o.name.includes('__') ? o : o.parent
      const piece = named?.name.split('__')[0] as Piece | undefined
      if (!piece || !place.has(piece)) return
      if (!parts.has(piece)) parts.set(piece, [])
      parts.get(piece)!.push(o)
    })
    const m = new Matrix4()
    for (const [piece, list] of parts) {
      const at = place.get(piece)!
      for (const part of list) {
        const mesh = new InstancedMesh(part.geometry, part.material, at.length)
        at.forEach((p, i) => mesh.setMatrixAt(i, m.multiplyMatrices(p, part.matrixWorld)))
        mesh.computeBoundingSphere()
        this.meshes.push({ mesh, piece, full: at.length })
        this.group.add(mesh)
      }
    }
  }

  setLite(lite: boolean) {
    for (const { mesh, piece, full } of this.meshes) {
      // The placements are shuffled, so the first part of the list is a fair sample.
      mesh.count = lite ? Math.floor(full * (LITE[piece] ?? 1)) : full
    }
  }
}

/** Where every piece goes. Deterministic, so the city looks the same on every visit. */
function scatter(facades: Facade[], roofs: RoofSpot[]): Map<Piece, Matrix4[]> {
  const rand = rng(4242)
  const out = new Map<Piece, Matrix4[]>()
  const up = new Vector3(0, 1, 0)
  const add = (piece: Piece, x: number, y: number, z: number, turn: number, sy = 1) => {
    const q = new Quaternion().setFromAxisAngle(up, turn)
    const mat = new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(1, sy, 1))
    if (!out.has(piece)) out.set(piece, [])
    out.get(piece)!.push(mat)
  }

  for (const f of facades) {
    // Turn the piece's front (+Z) to face the street.
    const turn = -f.side * Math.PI / 2
    const len = f.z1 - f.z0
    const top = Math.min(f.y1 - 2, 96)
    const along = (u: number) => f.z0 + 1.8 + u * (len - 3.6)

    // A run of pipes up one edge of the wall.
    if (rand() < 0.85) add('pipe', f.x, f.y0, along(rand() < 0.5 ? 0.02 : 0.98), turn, f.y1 - f.y0)

    // Fire escape: one column, a landing every floor.
    const escape = len > 14 && rand() < 0.4 ? along(lerp01(0.2, 0.8, rand())) : null
    if (escape !== null) for (let y = f.y0 + FLOOR; y < Math.min(top, 60); y += FLOOR) add('escape', f.x, y, escape, turn)

    // Balconies in a column or two, missing on some floors.
    const cols: number[] = []
    if (rand() < 0.65) {
      const n = len > 30 ? 3 : len > 18 ? 2 : 1
      for (let k = 0; k < n; k++) cols.push(along((k + 0.5) / n + (rand() - 0.5) * 0.1))
    }
    for (const z of cols) {
      if (escape !== null && Math.abs(z - escape) < 4.4) continue
      for (let y = f.y0 + 1; y < Math.min(top, 70); y += FLOOR) if (rand() < 0.75) add('balcony', f.x, y, z, turn)
    }

    // AC units and vents spread over the rest of the wall.
    const density = lerp01(0.12, 0.34, rand())
    for (let y = f.y0 + 2.2; y < top; y += FLOOR) {
      for (let z = f.z0 + 1.5; z < f.z1 - 1.5; z += 2.6) {
        if (escape !== null && Math.abs(z - escape) < 2.6) continue
        if (cols.some((c) => Math.abs(z - c) < 2.4) && y < 70) continue
        const r = rand()
        if (r < density) add('ac', f.x, y + (rand() - 0.5) * 0.6, z + (rand() - 0.5) * 0.8, turn)
        else if (r < density + 0.012) add('vent', f.x, y, z, turn)
      }
    }
  }

  for (const r of roofs) {
    const turn = rand() * Math.PI * 2
    const dx = (rand() - 0.5) * 6, dz = (rand() - 0.5) * 6
    const pick = rand()
    if (pick < 0.4) add('tank', r.x + dx, r.top, r.z + dz, turn)
    else if (pick < 0.7) add('hut', r.x + dx, r.top, r.z + dz, turn)
    if (rand() < 0.45) add('antenna', r.x - dx * 0.6, r.top, r.z - dz * 0.6, turn)
  }

  // Shuffle so that lite mode, which keeps the first part of each list, thins evenly.
  for (const list of out.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[list[i], list[j]] = [list[j]!, list[i]!]
    }
  }
  return out
}

function lerp01(a: number, b: number, t: number) {
  return a + (b - a) * t
}
