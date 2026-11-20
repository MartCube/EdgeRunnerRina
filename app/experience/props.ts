import { AnimationMixer, Box3, Group, Vector3 } from 'three'
import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Slots for Blender models.
 *
 * Each slot starts as a code-built placeholder. Export a model from Blender as GLB, put it
 * in `public/models/`, and list its file name under the slot's id in
 * `public/models/manifest.json`. On load the placeholder is hidden and the model takes its
 * place, scaled so its height matches the slot. See `public/models/README.md`.
 */
export const SLOT_IDS = ['rina', 'rina-hd', 'rooftop-set', 'city-kit', 'street-prop'] as const
export type SlotId = (typeof SLOT_IDS)[number]

type Manifest = Partial<Record<SlotId, string>>

/**
 * Scales a model to `height` and stands it centred on its parent's origin. Returns the
 * wrapper to add to the scene.
 */
export function fit(model: Object3D, height: number): Group {
  const box = new Box3().setFromObject(model)
  const size = box.getSize(new Vector3())
  const scale = height / (size.y || 1)
  const centre = box.getCenter(new Vector3())
  model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)
  model.scale.setScalar(scale)
  const wrap = new Group()
  wrap.add(model)
  return wrap
}

export class Props {
  private manifest: Manifest = {}
  // Models may be meshopt-compressed (see public/models/README.md), so the loader can unpack that.
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  private readonly mixers: AnimationMixer[] = []

  /** Reads the list of models that exist. A missing or broken list just means no models yet. */
  async init() {
    try {
      const res = await fetch('models/manifest.json')
      if (res.ok) this.manifest = (await res.json()) as Manifest
    } catch {
      this.manifest = {}
    }
  }

  /** Loads the model listed for a slot, or resolves to undefined if there is none or it fails. */
  load(id: SlotId): Promise<GLTF | undefined> {
    const file = this.manifest[id]
    if (!file) return Promise.resolve(undefined)
    return this.loader.loadAsync(`models/${file}`).catch((err) => {
      console.warn(`Model for slot "${id}" could not be loaded, keeping the placeholder.`, err)
      return undefined
    })
  }

  /**
   * Fills a slot if a model is listed for it.
   * @param holder    Group the model is added to; its origin is where the model's base goes.
   * @param height    Height in scene units the model is scaled to, or null to keep the
   *                  model's own size and origin (sets built to scale, like the rooftop).
   * @param placeholder  Hidden once the model is in.
   */
  fill(id: SlotId, holder: Object3D, height: number | null, placeholder?: Object3D) {
    void this.load(id).then((gltf) => {
      if (!gltf) return
      holder.add(height === null ? gltf.scene : fit(gltf.scene, height))
      if (placeholder) placeholder.visible = false
      // Play the first animation, for example an idle baked in Blender.
      if (gltf.animations[0]) {
        const mixer = new AnimationMixer(gltf.scene)
        mixer.clipAction(gltf.animations[0]).play()
        this.mixers.push(mixer)
      }
    })
  }

  update(dt: number) {
    for (const m of this.mixers) m.update(dt)
  }
}
