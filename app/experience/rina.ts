import { AnimationMixer, BackSide, Box3, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, SkinnedMesh, Vector3 } from 'three'
import type { AnimationAction, AnimationClip, Group, Material, MeshStandardMaterial, Object3D, Ray } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HEX, col } from './palette'
import { fit } from './props'

/** Clip names in rina.glb (exported from Tripo with a Mixamo rig). */
type ClipName = 'wait' | 'look_around' | 'heart_pose' | 'run' | 'walk'

/** Seconds of "wait" between two look-arounds. */
const LOOK_EVERY = [9, 15] as const
const FADE = 0.45

/**
 * Rina as a rigged model on her rooftop.
 *
 * She stands in "wait" and now and then plays "look_around". While the pointer is over her a
 * cyan outline traces her, and a click (see Experience) plays "heart_pose". The scan sweep
 * runs over her as the camera lands: below the line she is still a cyan hologram.
 */
export class Rina {
  /** World position of her feet, and her height, for placing the HUD around her. */
  readonly feet = new Vector3()
  height = 1
  private actor?: Actor
  private readonly outlines: SkinnedMesh[] = []
  private readonly scanUniforms = { uLine: { value: 1e4 }, uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) } }
  private readonly outlineUniforms = { uWidth: { value: 0.05 } }
  private readonly hitBox = new Box3()
  private nextLook = rand(...LOOK_EVERY)
  private glow = 0
  private hovering = false

  /** True once the model is in; until then the 2D card stays. */
  get ready() {
    return !!this.actor
  }

  /**
   * @param gltf    The loaded rina.glb.
   * @param holder  Where she stands on the roof (origin at her feet).
   * @param height  Her height in scene units.
   */
  attach(gltf: GLTF, holder: Group, height: number) {
    this.height = height
    const skinned: SkinnedMesh[] = []
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) o.material = this.withScan(o.material as MeshStandardMaterial)
      if (o instanceof SkinnedMesh) skinned.push(o)
      o.frustumCulled = false
    })
    // The hover outline: the same skinned mesh drawn again, pushed out along its normals and
    // showing only its back faces, so a cyan rim follows her through every pose.
    const rim = this.outlineMaterial()
    for (const mesh of skinned) {
      const shell = new SkinnedMesh(mesh.geometry, rim)
      shell.bind(mesh.skeleton, mesh.bindMatrix)
      shell.position.copy(mesh.position)
      shell.quaternion.copy(mesh.quaternion)
      shell.scale.copy(mesh.scale)
      shell.frustumCulled = false
      shell.visible = false
      mesh.parent?.add(shell)
      this.outlines.push(shell)
    }
    holder.add(fit(gltf.scene, height))
    this.actor = new Actor(gltf.scene, gltf.animations)
    this.actor.play('wait', 0)
    this.actor.mixer.addEventListener('finished', () => this.actor?.play('wait', FADE))

    holder.updateWorldMatrix(true, false)
    this.feet.setFromMatrixPosition(holder.matrixWorld)
    const f = this.feet
    this.hitBox.min.set(f.x - height * 0.22, f.y, f.z - height * 0.15)
    this.hitBox.max.set(f.x + height * 0.22, f.y + height, f.z + height * 0.15)
  }

  private outlineMaterial(): Material {
    const mat = new MeshBasicMaterial({ color: col(HEX.cyan, 1.6), side: BackSide, fog: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.outlineUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWidth;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          mvPosition.xyz += normalize(normalMatrix * objectNormal) * uWidth;
          gl_Position = projectionMatrix * mvPosition;`,
        )
    }
    mat.customProgramCacheKey = () => 'rina-outline'
    return mat
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
   * @param scan    0 to 1, how far the sweep has gone (head to feet).
   * @param active  Whether the rooftop is on screen, so her animations should run.
   */
  update(dt: number, time: number, scan: number, active: boolean) {
    const u = this.scanUniforms
    u.uTime.value = time
    u.uLine.value = this.feet.y + this.height * (1.04 - scan * 1.1)

    // The outline eases in and out, and breathes a little while it is on.
    this.glow += ((this.hovering ? 1 : 0) - this.glow) * (1 - Math.exp(-dt * 12))
    const on = this.glow > 0.02
    for (const o of this.outlines) o.visible = on
    this.outlineUniforms.uWidth.value = this.glow * (0.02 + 0.005 * Math.sin(time * 5))

    const a = this.actor
    if (!a || !active) return
    if (a.current === 'wait') {
      this.nextLook -= dt
      if (this.nextLook <= 0) {
        a.play('look_around', FADE, true)
        this.nextLook = rand(...LOOK_EVERY)
      }
    }
    a.mixer.update(dt)
  }

  /** Whether a ray from the camera passes through her. */
  hit(ray: Ray): boolean {
    return this.ready && ray.intersectsBox(this.hitBox)
  }

  /** Turns the hover outline on or off. */
  hover(on: boolean) {
    this.hovering = on
  }

  /** Plays the heart pose once, then she goes back to waiting. */
  heart() {
    this.actor?.play('heart_pose', 0.3, true)
    this.nextLook = rand(...LOOK_EVERY)
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
