import { AdditiveBlending, AnimationMixer, BackSide, Box3, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, Quaternion, SkinnedMesh, Vector3 } from 'three'
import type { AnimationAction, AnimationClip, Group, Material, MeshStandardMaterial, Object3D, Ray } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HEX, col } from './palette'
import { fit } from './props'

/** Clip names in rina.glb (exported from Tripo with a Mixamo rig). */
type ClipName = 'wait' | 'look_around' | 'heart_pose' | 'run' | 'walk'

/** Seconds of "wait" between two look-arounds. */
const LOOK_EVERY = [9, 15] as const
const FADE = 0.45

/** Seconds the materialise sweep takes, feet to head. */
const MATERIALISE = 1.7
/**
 * The export's standing clips leave her chrome arm sunk into her hip. These bones are turned
 * outward by this many radians about the axis she faces along, on top of the clip, while she
 * stands. Positive swings a hanging arm toward +X (her left).
 */
const ARM_RELAX: [bone: string, angle: number][] = [
  ['mixamorigRightArm', -0.2],
  ['mixamorigLeftArm', 0.06],
]
const FORWARD = new Vector3(0, 0, 1)

/**
 * Rina as a rigged model on her rooftop.
 *
 * She stands in "wait" and now and then plays "look_around". Until the visitor connects she
 * is a hologram: dark, striped, wrapped in a cyan wireframe. A click (see Experience) plays
 * "heart_pose" and materialises her, a sweep from her feet to her head that leaves the solid
 * model behind. While the pointer is over her a cyan outline traces her.
 *
 * `attach` can be called again with a more detailed model, which takes over mid-animation.
 */
export class Rina {
  /** World position of her feet, and her height, for placing the HUD around her. */
  readonly feet = new Vector3()
  height = 1
  /** While true she holds her standing pose and does not look around, so parts stay where the camera expects. */
  steady = false
  private actor?: Actor
  private wrap?: Object3D
  private outlines: SkinnedMesh[] = []
  private wires: SkinnedMesh[] = []
  private relaxBones: { bone: Object3D; angle: number }[] = []
  private readonly scanUniforms = { uLine: { value: 1e4 }, uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) } }
  private readonly outlineUniforms = { uWidth: { value: 0.05 } }
  private readonly hitBox = new Box3()
  private readonly q = new Quaternion()
  private readonly pq = new Quaternion()
  private nextLook = rand(...LOOK_EVERY)
  private glow = 0
  private hovering = false
  /** 0 = all hologram, 1 = all solid; it moves toward `solidTarget`. */
  private solid = 0
  private solidTarget = 0
  private relax = 1

  /** True once the model is in; until then the 2D card stays. */
  get ready() {
    return !!this.actor
  }

  /** True once she has been materialised (or is on her way). */
  get isSolid() {
    return this.solidTarget === 1
  }

  /**
   * @param gltf    The loaded model. Called a second time, it replaces the first model.
   * @param holder  Where she stands on the roof (origin at her feet).
   * @param height  Her height in scene units.
   */
  attach(gltf: GLTF, holder: Group, height: number) {
    const before = this.actor?.state()
    this.wrap?.removeFromParent()
    this.outlines = []
    this.wires = []
    this.relaxBones = []

    this.height = height
    const skinned: SkinnedMesh[] = []
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) o.material = this.withScan(o.material as MeshStandardMaterial)
      if (o instanceof SkinnedMesh) skinned.push(o)
      o.frustumCulled = false
    })
    // Two extra copies of the skinned mesh share her skeleton, so they follow every pose:
    // the hover outline (back faces pushed out along the normals) and the hologram wireframe.
    const rim = this.outlineMaterial()
    const wire = this.wireMaterial()
    const shell = (mesh: SkinnedMesh, material: Material) => {
      const copy = new SkinnedMesh(mesh.geometry, material)
      copy.bind(mesh.skeleton, mesh.bindMatrix)
      copy.position.copy(mesh.position)
      copy.quaternion.copy(mesh.quaternion)
      copy.scale.copy(mesh.scale)
      copy.frustumCulled = false
      mesh.parent?.add(copy)
      return copy
    }
    for (const mesh of skinned) {
      this.outlines.push(shell(mesh, rim))
      this.wires.push(shell(mesh, wire))
    }
    for (const [name, angle] of ARM_RELAX) {
      const bone = gltf.scene.getObjectByName(name)
      if (bone) this.relaxBones.push({ bone, angle })
    }
    this.wrap = fit(gltf.scene, height)
    holder.add(this.wrap)
    this.actor = new Actor(gltf.scene, gltf.animations)
    this.actor.play(before?.name || 'wait', 0, before?.once, before?.time)
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

  /** The hologram's wireframe: every triangle edge in cyan, cut off below the materialise line. */
  private wireMaterial(): Material {
    const mat = new MeshBasicMaterial({ color: col(HEX.cyan, 0.35), wireframe: true, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.scanUniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vScanY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvScanY = (modelMatrix * vec4(transformed, 1.0)).y;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vScanY;\nuniform float uLine;\nuniform float uTime;')
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          if (vScanY < uLine) discard;
          gl_FragColor.rgb *= 0.6 + 0.4 * sin(vScanY * 14.0 - uTime * 3.0);`,
        )
    }
    mat.customProgramCacheKey = () => 'rina-wire'
    return mat
  }

  /** Her own material with the hologram built in: solid below a world height, hologram above it. */
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
          float holo = step(uLine, vScanY);
          float rows = 0.55 + 0.45 * step(0.5, fract(vScanY * 9.0 - uTime * 1.4));
          diffuseColor.rgb *= 1.0 - holo * 0.92;
          totalEmissiveRadiance += uCyan * holo * rows * 0.22;
          totalEmissiveRadiance += (uCyan + 0.4) * smoothstep(0.16, 0.0, abs(vScanY - uLine)) * 3.5;`,
        )
    }
    mat.customProgramCacheKey = () => 'rina-scan'
    return mat
  }

  /**
   * Called every frame.
   * @param active  Whether the rooftop is on screen, so her animations should run.
   */
  update(dt: number, time: number, active: boolean) {
    // The materialise line climbs from under her feet to over her head.
    const step = dt / MATERIALISE
    this.solid += Math.max(-step, Math.min(step, this.solidTarget - this.solid))
    const u = this.scanUniforms
    u.uTime.value = time
    u.uLine.value = this.feet.y + this.height * (this.solid * 1.12 - 0.06)
    const holo = this.solid < 1
    for (const w of this.wires) w.visible = holo

    // The outline eases in and out, and breathes a little while it is on.
    this.glow += ((this.hovering ? 1 : 0) - this.glow) * (1 - Math.exp(-dt * 12))
    const on = this.glow > 0.02
    for (const o of this.outlines) o.visible = on
    this.outlineUniforms.uWidth.value = this.glow * (0.02 + 0.005 * Math.sin(time * 5))

    const a = this.actor
    if (!a || !active) return
    if (a.current === 'wait' && !this.steady) {
      this.nextLook -= dt
      if (this.nextLook <= 0) {
        a.play('look_around', FADE, true)
        this.nextLook = rand(...LOOK_EVERY)
      }
    }
    a.mixer.update(dt)

    // Ease her arms out from her body while she stands; the heart pose is left as exported.
    const want = a.current === 'heart_pose' ? 0 : 1
    this.relax += (want - this.relax) * (1 - Math.exp(-dt * 6))
    for (const { bone, angle } of this.relaxBones) {
      // Turn about the world forward axis: into the parent's frame, rotate, and back out.
      bone.parent!.getWorldQuaternion(this.pq)
      this.q.setFromAxisAngle(FORWARD, angle * this.relax)
      bone.quaternion.premultiply(this.q.premultiply(this.pq.clone().invert()).multiply(this.pq))
    }
  }

  /** Whether a ray from the camera passes through her. */
  hit(ray: Ray): boolean {
    return this.ready && ray.intersectsBox(this.hitBox)
  }

  /** Turns the hover outline on or off. */
  hover(on: boolean) {
    this.hovering = on
  }

  /** Plays the heart pose once, then she goes back to waiting. The first time, it also materialises her. */
  heart() {
    this.solidTarget = 1
    this.actor?.play('heart_pose', 0.3, true)
    this.nextLook = rand(...LOOK_EVERY)
  }

  /** Back to her standing pose now, for example before the camera moves in on a part. */
  settle() {
    if (this.actor && this.actor.current !== 'wait') this.actor.play('wait', FADE)
  }

  /** Back to a hologram, for a replay of the flight. */
  dissolve() {
    this.solid = 0
    this.solidTarget = 0
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

  /** What is playing and how far in, so a replacement model can carry on from the same frame. */
  state() {
    const action = this.current ? this.actions.get(this.current) : undefined
    return { name: this.current as ClipName, time: action?.time ?? 0, once: action?.loop === LoopOnce }
  }

  /** Fades to a clip. `once` plays it one time and holds the last frame until the next play. */
  play(name: ClipName, fade: number, once = false, at = 0) {
    const next = this.actions.get(name)
    if (!next) return
    const prev = this.current ? this.actions.get(this.current) : undefined
    next.reset()
    next.time = at
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
