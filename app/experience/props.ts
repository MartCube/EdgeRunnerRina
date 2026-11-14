import { AnimationMixer, Box3, Group, Vector3 } from 'three'
import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Slots for Blender models.
 *
 * Each slot starts as a code-built placeholder. Export a model from Blender as GLB, put it
 * in `public/models/`, and list its file name under the slot's id in
 * `public/models/manifest.json`. On load the placeholder is hidden and the model takes its
 * place, scaled so its height matches the slot. See `public/models/README.md`.
 */
export const SLOT_IDS = ['rina', 'parcel', 'rooftop-set', 'street-prop'] as const
export type SlotId = (typeof SLOT_IDS)[number]

type Manifest = Partial<Record<SlotId, string>>

export class Props {
  private manifest: Manifest = {}
  private readonly loader = new GLTFLoader()
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

  /**
   * Fills a slot if a model is listed for it.
   * @param holder    Group the model is added to; its origin is where the model's base goes.
   * @param height    Height in scene units the model is scaled to.
   * @param placeholder  Hidden once the model is in.
   */
  fill(id: SlotId, holder: Object3D, height: number, placeholder?: Object3D) {
    const file = this.manifest[id]
    if (!file) return
    this.loader.load(
      `models/${file}`,
      (gltf) => {
        const model = gltf.scene
        const box = new Box3().setFromObject(model)
        const size = box.getSize(new Vector3())
        const scale = height / (size.y || 1)
        // Stand the model on the slot's origin, centred.
        const centre = box.getCenter(new Vector3())
        model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)
        model.scale.setScalar(scale)
        const wrap = new Group()
        wrap.add(model)
        holder.add(wrap)
        if (placeholder) placeholder.visible = false
        // Play the first animation, for example an idle baked in Blender.
        if (gltf.animations[0]) {
          const mixer = new AnimationMixer(model)
          mixer.clipAction(gltf.animations[0]).play()
          this.mixers.push(mixer)
        }
      },
      undefined,
      (err) => console.warn(`Model for slot "${id}" could not be loaded, keeping the placeholder.`, err),
    )
  }

  update(dt: number) {
    for (const m of this.mixers) m.update(dt)
  }
}
