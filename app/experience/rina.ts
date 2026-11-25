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

/**
 * Her standing arms: hanging loose just clear of her hips and cargo pants, elbows a little
 * bent, hands relaxed, with a slow breath in them. Mirrored, with the chrome arm a touch
 * further out since it is heavier.
 */
const IDLE: Pose = {
  length: Infinity,
  aims: [
    ['mixamorigRightArm', 'mixamorigRightForeArm', (t, o) => o.set(-0.23 - Math.sin(t * 1.3) * 0.01, -1, 0.02)],
    ['mixamorigRightForeArm', 'mixamorigRightHand', (t, o) => o.set(-0.13, -1, 0.2 + Math.sin(t * 1.3) * 0.02)],
    ['mixamorigRightHand', 'mixamorigRightHandMiddle1', (_t, o) => o.set(-0.08, -1, 0.14)],
    ['mixamorigLeftArm', 'mixamorigLeftForeArm', (t, o) => o.set(0.2 + Math.sin(t * 1.3 + 0.8) * 0.01, -1, 0.0)],
    ['mixamorigLeftForeArm', 'mixamorigLeftHand', (t, o) => o.set(0.1, -1, 0.17 + Math.sin(t * 1.3 + 0.8) * 0.02)],
    ['mixamorigLeftHand', 'mixamorigLeftHandMiddle1', (_t, o) => o.set(0.05, -1, 0.12)],
  ],
}

/** Relaxed curl per joint (knuckle, middle, tip), in radians. */
const FINGER_CURL: [string, [number, number, number]][] = [
  ['Index', [0, 0.18, 0.15]],
  ['Middle', [0, 0.22, 0.18]],
  ['Ring', [0, 0.25, 0.2]],
  ['Pinky', [0, 0.28, 0.22]],
  ['Thumb', [0.15, 0.1, 0.1]],
]
/** How much of the bind pose's finger spread is closed up, toward the middle finger. */
const CLOSE_SPREAD = 0.7
/** How far the thumb is brought in from sticking out, toward the line of the fingers. */
const THUMB_IN = 0.85
/** Tuning knobs for the hand pass (the lab renders flip these). */
// rollRight 0: the chrome hand already hangs compact once its fan is closed; rolling it as
// well twists the chrome fingers into a hook.
export const HAND_TUNE = { roll: 1, rollRight: 0, spread: 1, curl: 1 }
// How far the thumb side of a resting hand turns in toward her, from straight forward.
const PALM_IN = 0.35

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
      ['mixamorigRightForeArm', 'mixamorigRightHand', (_t, o) => o.set(-0.18, 1, 0.22)],
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
  /** Off only for before/after renders. */
  curl = true
  private glitch = 0
  private nod = 0

  constructor() {
    this.optic = new Sprite(new SpriteMaterial({ map: glowTexture(), color: col(HEX.cyan, 0.9), blending: AdditiveBlending, depthWrite: false, fog: false, transparent: true }))
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
    // Stronger reflections, so her chrome arm and knee caps catch the neon, and sharper
    // textures when she is seen at an angle.
    mat.envMapIntensity = 2.4
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) if (tex) tex.anisotropy = 8
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
    u.uRim.value = 0.38 + this.glow * 0.7 + beat * 0.2
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

    this.root?.updateMatrixWorld(true)
    // While she stands, her arms hang relaxed at her sides instead of the export's
    // hands-on-hips, which pressed her hands into her hips. Her own clips (look around,
    // heart) take the arms back as they play.
    const want = a.current === 'wait' ? 1 : 0
    this.relax += (want - this.relax) * (1 - Math.exp(-dt * 5))
    if (this.relax > 0.001) {
      const w = this.relax * this.relax * (3 - 2 * this.relax)
      this.aim(IDLE, time, w)
      if (this.curl) this.rollPalms(w)
    }
    this.applyPose(dt)
    this.applyGaze(dt, time, beat)
    this.keepHandsOut()
    this.curlFingers(time)
    this.placeOptic(time)
  }

  /**
   * Her model was bound with its fingers straight and fanned out, and the clips keep them
   * that way, which reads as a stiff, frozen hand. Each frame the fan is closed toward the
   * middle finger, the thumb is brought in, and the middle and tip joints curl a little toward
   * the palm, more toward the pinky. The flex tightens the chrome hand; the wave opens it.
   * (Her finger bones only roughly follow the mesh, so big curls deform badly: keep them small.)
   */
  private curlFingers(time: number) {
    const b = (n: string) => this.bones.get('mixamorig' + n)
    if (!this.curl) return
    const reacting = this.lastPose
    for (const side of ['Left', 'Right'] as const) {
      const hand = b(side + 'Hand')
      const index = b(side + 'HandIndex1')
      const pinky = b(side + 'HandPinky1')
      if (!hand || !index || !pinky) continue
      let k = 1 + Math.sin(time * 0.9 + (side === 'Left' ? 1.7 : 0)) * 0.06
      if (side === 'Right' && reacting === POSES.flex) k = 1 + this.poseWeight * 0.6
      if (side === 'Right' && reacting === POSES.wave) k = 1 - this.poseWeight * 0.55
      const mid = b(side + 'HandMiddle1')
      if (!mid) continue
      // Palm normal: across the knuckles (pinky to index) crossed with the way the fingers point.
      const across = this.f1.subVectors(index.getWorldPosition(this.f2), pinky.getWorldPosition(this.f3))
      const along = this.f2.subVectors(mid.getWorldPosition(this.f3), hand.getWorldPosition(this.f4))
      const palm = this.f5.crossVectors(along, across).normalize()
      if (side === 'Right') palm.negate()
      // Close the fan: turn each knuckle about the palm normal toward the middle finger.
      const mid2 = b(side + 'HandMiddle2')
      if (mid2) {
        const dm = this.f1.subVectors(mid2.getWorldPosition(this.f1), mid.getWorldPosition(this.f3))
        dm.addScaledVector(palm, -dm.dot(palm)).normalize()
        for (const finger of ['Index', 'Ring', 'Pinky', 'Thumb']) {
          const bone = b(side + 'Hand' + finger + 1)
          const child = b(side + 'Hand' + finger + 2)
          if (!bone || !child) continue
          const d = this.f2.subVectors(child.getWorldPosition(this.f2), bone.getWorldPosition(this.f3))
          d.addScaledVector(palm, -d.dot(palm))
          if (d.lengthSq() < 1e-12) continue
          d.normalize()
          const angle = Math.atan2(this.f3.crossVectors(d, dm).dot(palm), d.dot(dm))
          this.q.setFromAxisAngle(palm, angle * (finger === 'Thumb' ? THUMB_IN : CLOSE_SPREAD) * HAND_TUNE.spread)
          this.turnWorld(bone, this.q)
        }
      }
      for (const [finger, curls] of FINGER_CURL) {
        for (let j = 1; j <= 3; j++) {
          const bone = b(side + 'Hand' + finger + j)
          const child = b(side + 'Hand' + finger + (j + 1))
          if (!bone || !child) break
          const dir = this.f2.subVectors(child.getWorldPosition(this.f3), bone.getWorldPosition(this.f4))
          // Rotating about dir x palm swings the joint's child toward the palm.
          const axis = this.f3.crossVectors(dir, palm)
          if (axis.lengthSq() < 1e-12) break
          axis.normalize()
          this.q.setFromAxisAngle(axis, HAND_TUNE.curl * curls[j - 1]! * Math.min(k, finger === 'Thumb' ? 1.4 : 3))
          this.turnWorld(bone, this.q)
        }
      }
    }
  }

  /**
   * While she stands, roll her forearm so the palm faces her thigh with the thumb forward,
   * the way arms hang at rest, instead of the bind pose's palms-back.
   */
  private rollPalms(w: number) {
    const b = (n: string) => this.bones.get('mixamorig' + n)
    this.root?.getWorldQuaternion(this.pq)
    const forward = this.f1.set(0, 0, 1).applyQuaternion(this.pq)
    for (const side of ['Left', 'Right'] as const) {
      const fore = b(side + 'ForeArm')
      const hand = b(side + 'Hand')
      const index = b(side + 'HandIndex1')
      const pinky = b(side + 'HandPinky1')
      if (!fore || !hand || !index || !pinky) continue
      const axis = this.f2.subVectors(hand.getWorldPosition(this.f2), fore.getWorldPosition(this.f3)).normalize()
      const across = this.f3.subVectors(index.getWorldPosition(this.f3), pinky.getWorldPosition(this.f4))
      // Thumb side forward, turned a little in toward her.
      const want = this.f4.copy(forward)
      const inward = this.f5.set(side === 'Left' ? -1 : 1, 0, 0).applyQuaternion(this.pq)
      want.addScaledVector(inward, PALM_IN)
      across.addScaledVector(axis, -across.dot(axis))
      want.addScaledVector(axis, -want.dot(axis))
      if (across.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) continue
      across.normalize(); want.normalize()
      const angle = Math.atan2(this.f5.crossVectors(across, want).dot(axis), across.dot(want))
      this.q.setFromAxisAngle(axis, angle * w * HAND_TUNE.roll * (side === 'Right' ? HAND_TUNE.rollRight : 1))
      this.turnWorld(fore, this.q)
    }
  }
  private readonly f1 = new Vector3()
  private readonly f2 = new Vector3()
  private readonly f3 = new Vector3()
  private readonly f4 = new Vector3()
  private readonly f5 = new Vector3()

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
    this.aim(this.lastPose, t, this.poseWeight * this.poseWeight * (3 - 2 * this.poseWeight))
  }

  /** Swings each bone of a pose toward its direction, by weight `w` (0 leaves the clip as is). */
  private aim(pose: Pose, t: number, w: number) {
    for (const [boneName, childName, dir] of pose.aims) {
      const bone = this.bones.get(boneName)
      const child = this.bones.get(childName)
      if (!bone || !child) continue
      const from = this.v1.subVectors(child.getWorldPosition(this.v2), bone.getWorldPosition(this.v3))
      // A zero-length bone would give a NaN rotation and a broken (black) frame: skip it.
      if (from.lengthSq() < 1e-10) continue
      from.normalize()
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

  /**
   * Keeps her hands out of her body. Her clips came from a slimmer rig, so on her baggy
   * cargo pants and hips the hands sink in (hands on hips, the look-around, the start of the
   * heart pose), and a code-built pose can swing a hand into her head.
   *
   * Her body is roughed out as capsules on the skeleton: an oval torso, a thick thigh per
   * leg for the pants, and a ball for the head and hair. Each frame, the wrist and the middle
   * of the hand are tested against them; if one is inside, the upper arm is turned so the
   * hand lands just outside. Two passes, so a push out of one shape into another is caught.
   */
  private keepHandsOut() {
    const h = this.height
    const b = (n: string) => this.bones.get('mixamorig' + n)
    const hips = b('Hips')
    const spine = b('Spine2')
    const head = b('Head')
    if (!hips || !spine || !head) return
    const hipsP = hips.getWorldPosition(this.c1)
    const spineP = spine.getWorldPosition(this.c2)
    const headP = head.getWorldPosition(this.c3).addScaledVector(UP, h * 0.045)
    const shapes: [Vector3, Vector3, number, number][] = [
      // a, b, radius, depth squash (her front-to-back is thinner than side to side)
      [hipsP, spineP, h * 0.118, 1.35],
      [headP, headP, h * 0.085, 1],
    ]
    for (const side of ['Left', 'Right']) {
      const up = b(side + 'UpLeg')
      const knee = b(side + 'Leg')
      if (up && knee) shapes.push([up.getWorldPosition(new Vector3()), knee.getWorldPosition(new Vector3()), h * 0.082, 1])
    }
    const handR = h * 0.022
    for (const side of ['Left', 'Right']) {
      const arm = b(side + 'Arm')
      const points = [b(side + 'Hand'), b(side + 'HandMiddle2')].filter((x): x is Object3D => !!x)
      if (!arm || !points.length) continue
      for (let pass = 0; pass < 2; pass++) {
        let best = 0
        const push = this.push.set(0, 0, 0)
        let at: Vector3 | null = null
        for (const pt of points) {
          const p = pt.getWorldPosition(this.c4)
          for (const [a, c, r, squash] of shapes) {
            const near = closestOnSegment(p, a, c, this.c5)
            const d = this.c6.subVectors(p, near)
            d.z *= squash
            const dist = d.length()
            const pen = r + handR - dist
            if (pen > best) {
              best = pen
              if (dist < 1e-5) d.set(side === 'Left' ? 1 : -1, 0, 0)
              d.z /= squash
              push.copy(d.normalize()).multiplyScalar(pen + h * 0.004)
              at = this.c7.copy(p)
            }
          }
        }
        if (!at || best <= 0) break
        // Swing the upper arm so this point moves out along `push`.
        const shoulder = arm.getWorldPosition(this.c5)
        const from = this.v1.subVectors(at, shoulder)
        const to = this.v2.copy(at).add(push).sub(shoulder)
        if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) break
        this.q.setFromUnitVectors(from.normalize(), to.normalize())
        this.turnWorld(arm, this.q)
      }
    }
  }
  private readonly push = new Vector3()
  private readonly c1 = new Vector3()
  private readonly c2 = new Vector3()
  private readonly c3 = new Vector3()
  private readonly c4 = new Vector3()
  private readonly c5 = new Vector3()
  private readonly c6 = new Vector3()
  private readonly c7 = new Vector3()

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

  /**
   * A small soft cyan point on her left optic. It stays below the bloom threshold so it
   * reads as a lit lens, not a flare, and fades out as her face turns away from the viewer,
   * so it never pokes out past her cheek or through her hair.
   */
  private placeOptic(time: number) {
    const pos = this.anchor('optic', this.optic.position)
    let facing = 1
    const head = this.bones.get('mixamorigHead')
    const rest = this.rest.get('mixamorigHead')
    if (this.gaze && head && rest) {
      head.getWorldQuaternion(this.q).multiply(this.q2.copy(rest).invert())
      const fwd = this.v1.copy(FORWARD).applyQuaternion(this.q)
      const toViewer = this.v2.subVectors(this.gaze, pos).normalize()
      facing = smoothstep(0.35, 0.8, fwd.dot(toViewer))
    }
    const s = this.height * (0.016 + 0.002 * Math.sin(time * 2.2) + this.glow * 0.004)
    this.optic.scale.setScalar(s)
    this.optic.material.opacity = (0.25 + this.solid * 0.45) * facing
  }

  /**
   * Shows every extra copy of her (outline, wireframe, optic) so the loading screen can
   * compile their shaders up front, or hands visibility back to `update`.
   */
  showAll() {
    for (const o of this.outlines) o.visible = true
    for (const w of this.wires) w.visible = true
    this.optic.visible = true
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
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

/** The point on segment a-b closest to p. */
function closestOnSegment(p: Vector3, a: Vector3, b: Vector3, out: Vector3) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const len = abx * abx + aby * aby + abz * abz
  const t = len < 1e-10 ? 0 : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len, 0, 1)
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t)
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
