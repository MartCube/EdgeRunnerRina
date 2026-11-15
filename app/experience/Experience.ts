import { Color, DirectionalLight, FogExp2, Group, HalfFloatType, HemisphereLight, PerspectiveCamera, PMREMGenerator, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing'
import { AudioEngine } from './audio'
import { CityChapter } from './chapters/city'
import { FOG } from './chapters/city/glsl'
import { RooftopChapter, TALL } from './chapters/rooftop'
import { HEX, smooth } from './palette'
import { Props } from './props'
import { Rina } from './rina'
import type { Frame, Progress, RinaView } from './types'

export interface ExperienceOptions {
  canvas: HTMLCanvasElement
  /** Element that receives the CSS variables the HUD animates from. */
  root: HTMLElement
  lite: boolean
  onReady: () => void
  /** The pointer moved onto or off Rina. */
  onHover: (over: boolean) => void
  /** Rina was clicked or tapped. */
  onPick: () => void
}

/**
 * One canvas for the whole site. The page owns scroll and writes `progress`; this class
 * turns it into a camera pose and per-chapter updates each frame.
 *
 * A chapter is anything with `pose` and `update`. To try a pre-rendered video for a
 * chapter instead of live 3D (for example the run on phones), swap that chapter here;
 * nothing else depends on how a chapter draws itself.
 */
export class Experience {
  readonly audio = new AudioEngine('audio/d-minor-drive.mp3')
  readonly progress: Progress = { run: 0, rina: 0 }
  /** The camera around Rina; the page tweens it. */
  readonly view: RinaView = { link: 0, orbit: 0, zoom: 0, partY: 0.52, partX: 0, partDist: 6 }
  /** Set by the page once the camera has landed: only then does she react to the pointer. */
  interactive = false
  /** Whether the hover outline may show; the page turns it off while her file is open. */
  hoverable = true

  private readonly renderer: WebGLRenderer
  private readonly composer: EffectComposer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(55, 1, 0.3, 4000)
  private readonly city = new CityChapter()
  private readonly roof: RooftopChapter
  private readonly props = new Props()
  private readonly rina = new Rina()
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private pointerSeen = false
  private over = false
  private drag: { x: number; orbit: number; moved: boolean } | null = null
  private readonly canvas: HTMLCanvasElement
  private readonly opts: ExperienceOptions
  private readonly probe = new Vector3()
  private readonly bloom: BloomEffect
  private readonly target = new Vector3()
  private readonly lookAt = new Vector3()
  private readonly wantPos = new Vector3()
  private readonly prevPos = new Vector3()
  private readonly pointerRaw = { x: 0, y: 0 }
  private readonly frame: Frame
  private readonly root: HTMLElement
  private lite: boolean
  private first = true
  private raf = 0
  private last = 0
  private readonly start = performance.now()
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(opts: ExperienceOptions) {
    this.root = opts.root
    this.canvas = opts.canvas
    this.opts = opts
    this.lite = opts.lite
    this.frame = {
      time: 0, dt: 0.016, pointer: { x: 0, y: 0 }, beat: 0, beatIndex: 0, level: 0, lite: opts.lite, progress: this.progress,
    }

    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false })
    this.renderer.setClearColor(new Color(HEX.void))

    this.roof = new RooftopChapter(opts.onReady)
    this.city.group.add(this.roof.group)
    this.scene.add(this.city.group)
    // Signs and other plain materials fade into the same fog the city shaders use.
    this.scene.fog = new FogExp2(FOG, 0.0017)

    // Light for Blender models. The generated city lights itself in its shaders, so these
    // only touch imported materials: a studio environment for reflections, plus the
    // district's pink and cyan.
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.12
    pmrem.dispose()
    const pinkKey = new DirectionalLight(HEX.pink, 0.5)
    pinkKey.position.set(-4, 3, 5)
    const cyanKey = new DirectionalLight(HEX.cyan, 0.4)
    cyanKey.position.set(5, 2, 3)
    this.scene.add(new HemisphereLight(0x8fa8ff, 0x2a1030, 0.25), pinkKey, cyanKey)

    void this.props.init().then(() => {
      void this.props.load('rina').then((gltf) => {
        if (!gltf) return
        this.rina.attach(gltf, this.roof.figureHolder, TALL)
        this.roof.card.visible = false
      })
      this.props.fill('rooftop-set', this.roof.setHolder, 14, this.roof.furniture)
      // Six spots on the pavement, in the stretch the camera flies at street level.
      for (let i = 0; i < 6; i++) {
        const spot = new Group()
        spot.position.set((i % 2 ? 1 : -1) * 11.2, 0.4, -350 - i * 46)
        spot.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2
        this.city.group.add(spot)
        this.props.fill('street-prop', spot, 3.2)
      }
    })

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    this.bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 0.9, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.8 })
    this.buildPasses()

    this.setLite(opts.lite)
    addEventListener('resize', this.resize)
    addEventListener('pointermove', this.onPointer, { passive: true })
    opts.canvas.addEventListener('pointerdown', this.onDown)
    addEventListener('pointerup', this.onUp, { passive: true })
    addEventListener('pointercancel', this.onUp, { passive: true })
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Full: bloom, filmic tone mapping, grain, edge smoothing, lens fringing. Lite: the first pass only. */
  private buildPasses() {
    this.composer.removeAllPasses()
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
    grain.blendMode.opacity.value = 0.1
    this.composer.addPass(
      new EffectPass(
        this.camera,
        this.bloom,
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
        new VignetteEffect({ darkness: 0.6, offset: 0.3 }),
        grain,
      ),
    )
    if (!this.lite) {
      this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()))
      this.composer.addPass(
        new EffectPass(this.camera, new ChromaticAberrationEffect({ offset: new Vector2(0.0011, 0.0006), radialModulation: true, modulationOffset: 0.35 })),
      )
    }
    this.resize()
  }

  setLite(lite: boolean) {
    const changed = lite !== this.lite
    this.lite = lite
    this.frame.lite = lite
    this.city.setLite(lite)
    if (changed) this.buildPasses()
    else this.resize()
  }

  private resize = () => {
    const w = innerWidth
    const h = innerHeight
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.lite ? 1 : 1.75))
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private onPointer = (e: PointerEvent) => {
    this.pointerRaw.x = (e.clientX / innerWidth) * 2 - 1
    this.pointerRaw.y = -((e.clientY / innerHeight) * 2 - 1)
    this.pointerSeen = e.pointerType === 'mouse' || e.pointerType === 'pen'
    // Dragging on the scene turns the camera around her, a little way to each side.
    if (this.drag) {
      const dx = e.clientX - this.drag.x
      if (Math.abs(dx) > 6) this.drag.moved = true
      if (this.drag.moved) this.view.orbit = Math.max(-0.9, Math.min(0.9, this.drag.orbit - dx * 0.006))
    }
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick)
    const f = this.frame
    f.dt = Math.min(0.05, (now - this.last) / 1000 || 0.016)
    this.last = now
    f.time = (now - this.start) / 1000

    const ease = 1 - Math.exp(-f.dt * 5)
    const follow = this.reduced ? 0 : 1
    f.pointer.x += (this.pointerRaw.x * follow - f.pointer.x) * ease
    f.pointer.y += (this.pointerRaw.y * follow - f.pointer.y) * ease

    const beats = this.audio.beats(f.time)
    f.beatIndex = Math.floor(beats)
    f.beat = Math.pow(1 - (beats - f.beatIndex), 3)
    f.level = this.audio.level()

    const p = this.progress
    let roll = 0

    if (p.run < 1) {
      roll = this.city.pose(p.run, this.camera, this.target)
      // The pointer nudges the view a little, so the city has depth even when you stop scrolling.
      this.camera.position.x += f.pointer.x * 1.6
      this.camera.position.y += f.pointer.y * 1.0
    } else {
      this.roof.pose(p.rina, this.view, this.camera, this.target, f)
    }
    this.wantPos.copy(this.camera.position)
    this.city.update(f)
    this.roof.update(p.rina, f)
    this.props.update(f.dt)
    this.updateRina(f.dt, f.time)

    if (this.first || this.reduced) {
      this.first = false
      this.camera.position.copy(this.wantPos)
      this.lookAt.copy(this.target)
    } else {
      const glide = 1 - Math.exp(-f.dt * 7)
      this.camera.position.copy(this.prevPos).lerp(this.wantPos, glide)
      this.lookAt.lerp(this.target, glide)
    }
    this.prevPos.copy(this.camera.position)
    this.camera.lookAt(this.lookAt)
    this.camera.rotateZ(roll)

    this.bloom.intensity = (this.lite ? 1.0 : 1.1) + f.beat * 0.15 + f.level * 0.6

    // Values the HUD and the page animate from.
    const s = this.root.style
    s.setProperty('--beat', f.beat.toFixed(3))

    this.composer.render(f.dt)
  }

  /** Plays her heart pose, as a click on her does. */
  heart() {
    this.rina.heart()
  }

  private rayAt(clientX: number, clientY: number) {
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.ndc.set((clientX / innerWidth) * 2 - 1, -((clientY / innerHeight) * 2 - 1)), this.camera)
    return this.raycaster.ray
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    this.drag = { x: e.clientX, orbit: this.view.orbit, moved: false }
  }

  /** A press that did not turn into a drag is a click: on her, it is the pick. */
  private onUp = (e: PointerEvent) => {
    const drag = this.drag
    this.drag = null
    if (!drag || drag.moved || !this.interactive) return
    if (this.rina.hit(this.rayAt(e.clientX, e.clientY))) {
      this.rina.heart()
      this.opts.onPick()
    }
  }

  /** Rina's animations, her hover outline, and where the HUD around her goes on screen. */
  private updateRina(dt: number, time: number) {
    const p = this.progress
    this.rina.update(dt, time, smooth(0.06, 0.55, p.rina), p.run > 0.85)
    if (!this.rina.ready) return

    const over = this.interactive && this.hoverable && this.pointerSeen && !this.drag?.moved
      && this.rina.hit(this.rayAt((this.pointerRaw.x + 1) * 0.5 * innerWidth, (1 - this.pointerRaw.y) * 0.5 * innerHeight))
    if (over !== this.over) {
      this.over = over
      this.rina.hover(over)
      this.canvas.style.cursor = over ? 'pointer' : ''
      this.opts.onHover(over)
    }

    // Her head and feet in screen pixels, for the brackets and label the page draws around her.
    if (this.interactive) {
      const s = this.root.style
      const feet = this.probe.copy(this.rina.feet).project(this.camera)
      const x = (feet.x + 1) * 0.5 * innerWidth
      const bottom = (1 - feet.y) * 0.5 * innerHeight
      const head = this.probe.copy(this.rina.feet)
      head.y += this.rina.height
      head.project(this.camera)
      s.setProperty('--rina-x', `${x.toFixed(1)}px`)
      s.setProperty('--rina-top', `${((1 - head.y) * 0.5 * innerHeight).toFixed(1)}px`)
      s.setProperty('--rina-bottom', `${bottom.toFixed(1)}px`)
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
    removeEventListener('pointermove', this.onPointer)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    removeEventListener('pointerup', this.onUp)
    removeEventListener('pointercancel', this.onUp)
    this.audio.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
