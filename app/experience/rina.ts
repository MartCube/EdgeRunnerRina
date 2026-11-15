import { AnimationMixer, Box3, LoopOnce, LoopRepeat, Mesh, Ray, Vector3 } from 'three'
import type { AnimationAction, AnimationClip, Group, Material, MeshStandardMaterial, Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { HEX, col, smooth } from './palette'
import { fit } from './props'

/** Clip names in rina.glb (exported from Tripo with a Mixamo rig). */
type ClipName = 'wait' | 'look_around' | 'heart_pose' | 'run' | 'walk'

/** Seconds of "wait" between two look-arounds. */
const LOOK_EVERY = [9, 15] as const
const FADE = 0.45

/**
 * Rina as a rigged model, in two places:
 *
 * - On the rooftop she stands in "wait", now and then plays "look_around", and does
 *   "heart_pose" when the visitor's pointer is over her. The scan sweep from the old 2D card
 *   runs over her too: below the line she is still a cyan hologram.
 * - In the city run a second copy runs down the street ahead of the camera.
 */
export class Rina {
  private roof?: Actor
  private runner?: Actor
  private runnerRoot?: Object3D
  private readonly scanUniforms = { uLine: { value: 1e4 }, uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) } }
  private readonly hitBox = new Box3()
  private hovering = false
  private nextLook = rand(...LOOK_EVERY)
  private height = 1

  /** True once the model is in; until then the 2D card stays. */
  get ready() {
    return !!this.roof
  }

  /**
   * @param gltf      The loaded rina.glb.
   * @param roofHolder Where she stands on the roof (origin at her feet).
   * @param street    Group for the running copy, in city space.
   * @param height    Her height in scene units.
   */
  attach(gltf: GLTF, roofHolder: Group, street: Group, height: number) {
    this.height = height
    const clips = gltf.animations

    // The runner is a separate copy with its own skeleton and plain materials.
    const runnerModel = cloneSkinned(gltf.scene)
    this.runnerRoot = fit(runnerModel, height)
    this.runnerRoot.visible = false
    street.add(this.runnerRoot)
    this.runner = new Actor(runnerModel, clips)
    this.runner.play('run', 0)

    // The rooftop copy gets the scan sweep.
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) o.material = this.withScan(o.material as MeshStandardMaterial)
      o.frustumCulled = false
    })
    roofHolder.add(fit(gltf.scene, height))
    this.roof = new Actor(gltf.scene, clips)
    this.roof.play('wait', 0)
    this.roof.mixer.addEventListener('finished', () => this.roof?.play('wait', FADE))

    roofHolder.updateWorldMatrix(true, false)
    const feet = new Vector3().setFromMatrixPosition(roofHolder.matrixWorld)
    this.hitBox.min.set(feet.x - height * 0.22, feet.y, feet.z - height * 0.15)
    this.hitBox.max.set(feet.x + height * 0.22, feet.y + height, feet.z + height * 0.15)
  }

  /** Hologram below a world height, printed above it. Same look as the old card's sweep. */
  private withScan(source: Material): Material {
    const mat = (source as MeshStandardMaterial).clone()
    const u = this.scanUniforms
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vScanY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvScanY = (modelMatrix * vec4(transformed, 1.0)).y;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vScanY;\nuniform float uLine;\nuniform float uTime;\nuniform vec3 uCyan;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float holo = step(vScanY, uLine);
          float rows = 0.55 + 0.45 * step(0.5, fract(vScanY * 9.0 - uTime * 1.4));
          diffuseColor.rgb *= 1.0 - holo * 0.92;
          totalEmissiveRadiance += uCyan * holo * rows * 0.9;
          totalEmissiveRadiance += (uCyan + 0.4) * smoothstep(0.12, 0.0, abs(vScanY - uLine)) * 2.5;`,
        )
    }
    mat.customProgramCacheKey = () => 'rina-scan'
    return mat
  }

  /**
   * Called every frame.
   * @param scan     0 to 1, how far the sweep has gone (head to feet).
   * @param feetY    World height of her feet on the roof.
   * @param onRoof   Whether the rooftop chapter is on screen.
   * @param runP     Progress of the city run, for the runner.
   * @param camera   Camera position, the runner keeps ahead of it.
   */
  update(dt: number, time: number, scan: number, feetY: number, onRoof: boolean, runP: number, camera: Vector3) {
    const u = this.scanUniforms
    u.uTime.value = time
    u.uLine.value = feetY + this.height * (1.04 - scan * 1.1)

    if (this.roof && onRoof) {
      const r = this.roof
      if (r.current === 'wait') {
        this.nextLook -= dt
        if (this.nextLook <= 0) {
          r.play('look_around', FADE, true)
          this.nextLook = rand(...LOOK_EVERY)
        }
      }
      r.mixer.update(dt)
    }

    // The runner shows for the street-level stretch of the run, a little ahead of the camera.
    if (this.runner && this.runnerRoot) {
      const show = smooth(0.3, 0.36, runP) * (1 - smooth(0.7, 0.76, runP))
      this.runnerRoot.visible = show > 0.01
      if (this.runnerRoot.visible) {
        this.runnerRoot.position.set(camera.x * 0.5, 0, camera.z - 20 - (1 - show) * 15)
        this.runnerRoot.rotation.y = Math.PI // run away from the camera, down the street
        this.runner.mixer.update(dt)
      }
    }
  }

  /**
   * Hover test against a box around her. Starts "heart_pose" when the pointer moves onto her.
   * @returns whether the pointer is over her.
   */
  pointer(ray: Ray | null): boolean {
    const over = !!ray && !!this.roof && ray.intersectsBox(this.hitBox)
    if (over && !this.hovering && this.roof && this.roof.current !== 'heart_pose') {
      this.roof.play('heart_pose', 0.3, true)
      this.nextLook = rand(...LOOK_EVERY)
    }
    this.hovering = over
    return over
  }
}

/** One animated copy: a mixer and its clips, cross-fading between them. */
class Actor {
  readonly mixer: AnimationMixer
  current: ClipName | '' = ''
  private readonly actions = new Map<string, AnimationAction>()

  constructor(root: Object3D, clips: AnimationClip[]) {
    this.mixer = new AnimationMixer(root)
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip))
  }

  /** Fades to a clip. `once` plays it one time and holds the last frame until the next play. */
  play(name: ClipName, fade: number, once = false) {
    const next = this.actions.get(name)
    if (!next) return
    const prev = this.current ? this.actions.get(this.current) : undefined
    next.reset()
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity)
    next.clampWhenFinished = once
    next.play()
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false)
    this.current = name
  }
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
