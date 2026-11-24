import {
  AdditiveBlending,
  AnimationMixer,
  BackSide,
  Box3,
  CanvasTexture,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import type { AnimationAction, AnimationClip, Group, Material, MeshStandardMaterial, Object3D, Ray } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HEX, col } from './palette'
import { fit } from './props'

/** Clip names in rina.glb (exported from Tripo with a Mixamo rig). */
type ClipName = 'wait' | 'look_around' | 'heart_pose' | 'run' | 'walk'

/**
 * What she can do when the visitor asks. `heart` and `look` are clips from the export; `wave`
 * and `flex` are poses built in code on top of her standing clip; `glitch` is a shader effect.
 */
export type Reaction = 'heart' | 'wave' | 'flex' | 'glitch' | 'look'

/** Points on her body the page labels: her optic, chrome arm, sakura tattoo and knee. */
export type Anchor = 'optic' | 'arm' | 'tattoo' | 'knee' | 'head'

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
const UP = new Vector3(0, 1, 0)
const RIGHT = new Vector3(1, 0, 0)

/** Bone each label hangs on, and an offset from it as a share of her height (x to her left, y up, z forward). */
const ANCHORS: Record<Anchor, [bone: string, x: number, y: number, z: number]> = {
  optic: ['mixamorigHead', 0.0095, 0.033, 0.078],
  head: ['mixamorigHeadTop_End', 0, 0.02, 0],
  arm: ['mixamorigRightForeArm', 0, 0, 0.01],
  tattoo: ['mixamorigLeftArm', 0.03, -0.01, 0.01],
  knee: ['mixamorigLeftLeg', 0, 0, 0.025],
}

/**
 * A pose built in code: for each bone, the direction (in her own frame: x to her left, y up,
 * z toward the camera) its child should point, as a function of seconds into the pose.
 */
interface Pose {
  length: number
  aims: [bone: string, child: string, dir: (t: number, out: Vector3) => Vector3][]
}

const POSES: Record<'wave' | 'flex', Pose> = {
  // Chrome arm up beside her head, hand swinging side to side.
  wave: {
    length: 2.6,
    aims: [
      ['mixamorigRightArm', 'mixamorigRightForeArm', (_t, o) => o.set(-0.78, 0.5, 0.28)],
      ['mixamorigRightForeArm', 'mixamorigRightHand', (t, o) => o.set(-0.12 + Math.sin(t * 10) * 0.42, 1, 0.3)],
      ['mixamorigRightHand', 'mixamorigRightHandMiddle1', (t, o) => o.set(-0.05 + Math.sin(t * 10 - 0.6) * 0.5, 1, 0.45)],
    ],
  },
  // Chrome arm out level, forearm up: showing off the arm.
  flex: {
    length: 2.8,
    aims: [
      ['mixamorigRightArm', 'mixamorigRightForeArm', (t, o) => o.set(-1, 0.02 + Math.sin(t * 6) * 0.03, 0.12)],
      ['mixamorigRightForeArm', 'mixamorigRightHand', (_t, o) => o.set(0.06, 1, 0.2)],
      ['mixamorigRightHand', 'mixamorigRightHandMiddle1', (_t, o) => o.set(0.7, 0.35, 0.25)],
    ],
  },
}

/**
 * Rina as a rigged model on her rooftop.
 *
 * She stands in "wait" and now and then plays "look_around". Until the visitor connects she
 * is a hologram: dark, striped, wrapped in a cyan wireframe. A click (see Experience) plays
 * "heart_pose" and materialises her, a sweep from her feet to her head that leaves the solid
 * model behind. While the pointer is over her a cyan outline traces her.
 *
 * On top of her clips: her head and upper body turn to follow the visitor (`gaze`), she nods
 * to the music, her left optic glows, a pink and cyan rim light traces her edges, and
 * `react` plays a wave, an arm flex, the heart pose or a glitch.
 *
 * `attach` can be called again with a more detailed model, which takes over mid-animation.
 */
export class Rina {
  /** World position of her feet, and her height, for placing the HUD around her. */
  readonly feet = new Vector3()
  height = 1
  /** While true she holds her standing pose and does not look around, so parts stay where the camera expects. */
  steady = false
  /** World point she looks toward; null lets her head follow her clip alone. */
  gaze: Vector3 | null = null
  /** How much her head follows `gaze`, 0 to 1. The page raises it while the pointer is on her. */
  gazeWeight = 0
  private actor?: Actor
  private root?: Object3D
  private wrap?: Object3D
  private outlines: SkinnedMesh[] = []
  private wires: SkinnedMesh[] = []
  private relaxBones: { bone: Object3D; angle: number }[] = []
  private bones = new Map<string, Object3D>()
  /** Each bone's world rotation in the bind pose, to carry offsets from her frame to the bone's. */
  private rest = new Map<string, Quaternion>()
  private readonly scanUniforms = {
    uLine: { value: 1e4 },
    uTime: { value: 0 },
    uCyan: { value: col(HEX.cyan) },
    uPink: { value: col(HEX.pink) },
    uRim: { value: 0.9 },
    uGlitch: { value: 0 },
  }
  private readonly outlineUniforms = { uWidth: { value: 0.05 } }
  private readonly hitBox = new Box3()
  private readonly q = new Quaternion()
  private readonly q2 = new Quaternion()
  private readonly pq = new Quaternion()
  private readonly wq = new Quaternion()
  private readonly v1 = new Vector3()
  private readonly v2 = new Vector3()
  private readonly v3 = new Vector3()
  private readonly optic: Sprite
  private nextLook = rand(...LOOK_EVERY)
  private glow = 0
  private hovering = false
  /** 0 = all hologram, 1 = all solid; it moves toward `solidTarget`. */
  private solid = 0
  private solidTarget = 0
  private relax = 1
  private gazeNow = 0
  private pose: { pose: Pose; t: number } | null = null
  private poseWeight = 0
  private glitch = 0
  private nod = 0

  constructor() {
    this.optic = new Sprite(new SpriteMaterial({ map: glowTexture(), color: col(HEX.cyan, 2.2), blending: AdditiveBlending, depthWrite: false, fog: false, transparent: true }))
    this.optic.renderOrder = 5
    this.optic.visible = false
  }

  /** True once the model is in; until then the 2D card stays. */
  get ready() {
    return !!this.actor
  }

  /** True once she has been materialised (or is on her way). */
  get isSolid() {
    return this.solidTarget === 1
  }

  /** True while a reaction is playing, so the page does not stack them. */
  get busy() {
    return !!this.pose || this.glitch > 0.05 || this.actor?.current === 'heart_pose' || this.actor?.current === 'look_around'
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
    this.bones.clear()
    this.rest.clear()

    this.height = height
    const skinned: SkinnedMesh[] = []
    gltf.scene.traverse((o) => {
      if (o instanceof Mesh) o.material = this.withScan(o.material as MeshStandardMaterial)
      if (o instanceof SkinnedMesh) skinned.push(o)
      if (o.name.startsWith('mixamorig')) this.bones.set(o.name, o)
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
      const bone = this.bones.get(name)
      if (bone) this.relaxBones.push({ bone, angle })
    }
    this.wrap = fit(gltf.scene, height)
    holder.add(this.wrap)
    this.root = gltf.scene
    // The bind pose stands upright facing the camera: remember each bone's world rotation in it.
    this.wrap.updateWorldMatrix(true, true)
    for (const [name, bone] of this.bones) this.rest.set(name, bone.getWorldQuaternion(new Quaternion()))
    if (!this.optic.parent) holder.parent?.add(this.optic)
    this.optic.scale.setScalar(height * 0.05)

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

  /**
   * Her own material with the hologram built in (solid below a world height, hologram above
   * it), a pink and cyan rim light on her edges, and the glitch: rows of her shifted sideways
   * and flashed back to hologram.
   */
  private withScan(source: Material): Material {
    const mat = (source as MeshStandardMaterial).clone()
    const u = this.scanUniforms
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      const glitchRow = /* glsl */ `
        float glitchRow(float y) {
          float row = floor(y * 5.0);
          return fract(sin(row * 91.3 + floor(uTime * 22.0) * 7.1) * 43758.5);
        }`
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying float vScanY;\nuniform float uTime;\nuniform float uGlitch;\n${glitchRow}`)
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vScanY = (modelMatrix * vec4(transformed, 1.0)).y;
          float gn = glitchRow(vScanY);
          gl_Position.x += step(0.72, gn) * (gn - 0.86) * uGlitch * 0.3 * gl_Position.w;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying float vScanY;\nuniform float uLine;\nuniform float uTime;\nuniform vec3 uCyan;\nuniform vec3 uPink;\nuniform float uRim;\nuniform float uGlitch;\n${glitchRow}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float gn = glitchRow(vScanY);
          float flash = uGlitch * step(0.55, gn);
          float holo = max(step(uLine, vScanY), flash);
          float rows = 0.55 + 0.45 * step(0.5, fract(vScanY * 9.0 - uTime * 1.4));
          diffuseColor.rgb *= 1.0 - holo * 0.92;
          totalEmissiveRadiance += mix(uCyan, uPink, step(0.8, gn) * uGlitch) * holo * rows * (0.22 + flash * 0.6);
          totalEmissiveRadiance += (uCyan + 0.4) * smoothstep(0.16, 0.0, abs(vScanY - uLine)) * 3.5;
          // Rim light: pink from her right, cyan from her left, strongest at grazing angles.
          float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float fres = pow(1.0 - facing, 3.0);
          vec3 rimCol = mix(uPink, uCyan, smoothstep(-0.35, 0.35, normal.x));
          totalEmissiveRadiance += rimCol * fres * uRim * (1.0 - holo);`,
        )
    }
    mat.customProgramCacheKey = () => 'rina-scan'
    return mat
  }

  /**
   * Called every frame.
   * @param active  Whether the rooftop is on screen, so her animations should run.
   * @param beat    1 on a beat of the music, falling to 0; 0 while silent.
   */
  update(dt: number, time: number, active: boolean, beat = 0) {
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
    // The rim light brightens while she is pointed at, and pulses with the music.
    u.uRim.value = 0.75 + this.glow * 0.9 + beat * 0.35
    this.glitch = Math.max(0, this.glitch - dt * 0.9)
    u.uGlitch.value = this.glitch > 0 ? Math.min(1, this.glitch * 1.6) * (0.6 + 0.4 * Math.sin(time * 37)) : 0

    const a = this.actor
    this.optic.visible = !!a && active
    if (!a || !active) return
    if (a.current === 'wait' && !this.steady && !this.pose) {
      this.nextLook -= dt
      if (this.nextLook <= 0) {
        a.play('look_around', FADE, true)
        this.nextLook = rand(...LOOK_EVERY)
      }
    }
    a.mixer.update(dt)

    // Ease her arms out from her body while she stands; the heart pose is left as exported.
    const want = a.current === 'heart_pose' || this.pose ? 0 : 1
    this.relax += (want - this.relax) * (1 - Math.exp(-dt * 6))
    for (const { bone, angle } of this.relaxBones) this.turnWorld(bone, this.q2.setFromAxisAngle(FORWARD, angle * this.relax))

    this.root?.updateMatrixWorld(true)
    this.applyPose(dt)
    this.applyGaze(dt, time, beat)
    this.placeOptic(time)
  }

  /** Rotates a bone by a world-space rotation, on top of whatever pose it already has. */
  private turnWorld(bone: Object3D, rot: Quaternion) {
    bone.parent!.getWorldQuaternion(this.pq)
    bone.getWorldQuaternion(this.wq)
    this.wq.premultiply(rot)
    bone.quaternion.copy(this.pq.invert().multiply(this.wq))
    bone.updateMatrixWorld(true)
  }

  /** The code-built poses: each listed bone is swung so its child lies along the wanted direction. */
  private applyPose(dt: number) {
    const p = this.pose
    if (p) {
      p.t += dt
      if (p.t >= p.pose.length) this.pose = null
    }
    const len = p?.pose.length ?? 1
    const t = p?.t ?? len
    // In over a third of a second, out over the last half second.
    const target = p ? Math.min(1, t / 0.35, (len - t) / 0.5) : 0
    this.poseWeight = p ? Math.max(0, target) : Math.max(0, this.poseWeight - dt * 2.5)
    if (this.poseWeight <= 0.001 || !this.lastPose) return
    const w = this.poseWeight * this.poseWeight * (3 - 2 * this.poseWeight)
    for (const [boneName, childName, dir] of this.lastPose.aims) {
      const bone = this.bones.get(boneName)
      const child = this.bones.get(childName)
      if (!bone || !child) continue
      const from = this.v1.subVectors(child.getWorldPosition(this.v2), bone.getWorldPosition(this.v3)).normalize()
      const to = dir(t, this.v2).normalize()
      this.q.setFromUnitVectors(from, to)
      this.q2.identity().slerp(this.q, w)
      this.turnWorld(bone, this.q2)
    }
  }
  private lastPose: Pose | null = null

  /**
   * Turns her upper spine, neck and head toward `gaze`, a share each, and nods on the beat.
   * Fades out while a clip of her own moves her head (looking around, the heart pose).
   */
  private applyGaze(dt: number, time: number, beat: number) {
    const head = this.bones.get('mixamorigHead')
    const own = this.actor?.current === 'look_around' || this.actor?.current === 'heart_pose'
    const want = this.gaze && head && !own ? this.gazeWeight : 0
    this.gazeNow += (want - this.gazeNow) * (1 - Math.exp(-dt * 4))
    this.nod += (beat - this.nod) * (1 - Math.exp(-dt * 18))
    if (!head || (this.gazeNow < 0.002 && this.nod < 0.002)) return

    let yaw = 0
    let pitch = 0
    if (this.gaze) {
      const d = this.v1.subVectors(this.gaze, head.getWorldPosition(this.v2))
      yaw = clamp(Math.atan2(d.x, d.z), -1.0, 1.0) * this.gazeNow
      pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.45, 0.45) * this.gazeNow
    }
    // A small idle sway keeps her alive even when the pointer is still.
    yaw += Math.sin(time * 0.7) * 0.04 * this.gazeNow
    pitch -= this.nod * 0.07
    for (const [name, share] of [['mixamorigSpine2', 0.22], ['mixamorigNeck', 0.33], ['mixamorigHead', 0.45]] as const) {
      const bone = this.bones.get(name)
      if (!bone) continue
      this.q.setFromAxisAngle(UP, yaw * share)
      this.q2.setFromAxisAngle(RIGHT, -pitch * share)
      this.turnWorld(bone, this.q.multiply(this.q2))
    }
  }

  /** Where one of the labelled points on her is now, in world space. */
  anchor(name: Anchor, out: Vector3): Vector3 {
    const [boneName, x, y, z] = ANCHORS[name]
    const bone = this.bones.get(boneName)
    if (!bone) return out.copy(this.feet).setY(this.feet.y + this.height * 0.5)
    bone.getWorldPosition(out)
    // The offset is given in her bind-pose frame; turn it as the bone has turned since.
    bone.getWorldQuaternion(this.q)
    const rest = this.rest.get(boneName)
    if (rest) this.q.multiply(this.q2.copy(rest).invert())
    return out.add(this.v3.set(x, y, z).multiplyScalar(this.height).applyQuaternion(this.q))
  }

  private placeOptic(time: number) {
    this.anchor('optic', this.optic.position)
    const flicker = Math.sin(time * 3.1) > 0.97 ? 0.4 : 1
    const s = this.height * (0.05 + 0.01 * Math.sin(time * 2.2) + this.glow * 0.02) * flicker
    this.optic.scale.setScalar(s)
    this.optic.material.opacity = 0.35 + this.solid * 0.65
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
    this.react('heart')
  }

  /** Plays one of her reactions. */
  react(r: Reaction) {
    const a = this.actor
    if (!a) return
    this.nextLook = rand(...LOOK_EVERY)
    if (r === 'glitch') {
      this.glitch = 1.2
      return
    }
    if (r === 'wave' || r === 'flex') {
      if (a.current !== 'wait') a.play('wait', 0.3)
      this.pose = { pose: POSES[r], t: 0 }
      this.lastPose = POSES[r]
      return
    }
    this.pose = null
    a.play(r === 'heart' ? 'heart_pose' : 'look_around', 0.3, true)
  }

  /** Back to her standing pose now, for example before the camera moves in on a part. */
  settle() {
    this.pose = null
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

/** A soft round glow with a bright core, for her optic. */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.08, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.2, 'rgba(255,255,255,0.25)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  // A thin horizontal streak through the core, like a lens catching it.
  const streak = g.createLinearGradient(0, 0, 64, 0)
  streak.addColorStop(0, 'rgba(255,255,255,0)')
  streak.addColorStop(0.5, 'rgba(255,255,255,0.7)')
  streak.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = streak
  g.fillRect(0, 31, 64, 2)
  return new CanvasTexture(c)
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
