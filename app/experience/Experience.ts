import { Color, DirectionalLight, FogExp2, Group, HalfFloatType, HemisphereLight, NoToneMapping, ACESFilmicToneMapping, UnsignedByteType, PerspectiveCamera, PMREMGenerator, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three'
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
import { HEX } from './palette'
import { Props } from './props'
import { Rina } from './rina'
import type { Anchor, Reaction } from './rina'
import type { Frame, Progress, RinaView } from './types'

const ANCHORS: Anchor[] = ['optic', 'arm', 'tattoo', 'knee', 'head']

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
  readonly view: RinaView = { link: 0, orbit: 0, tilt: 0, dolly: 1, zoom: 0, partY: 0.52, partX: 0, partDist: 6 }
  /** Set by the page once the camera has landed: only then does she react to the pointer. */
  interactive = false
  /** Whether the hover outline may show; the page turns it off while her file is open. */
  hoverable = true

  private readonly renderer: WebGLRenderer
  private composer: EffectComposer
  /** 0 full quality, 1 8-bit buffers, 2 no bloom, 3 no post-processing. Lowered if a frame comes out black. */
  private gfx = 0
  private frameProbe: ((max: number) => void) | null = null
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
  private drag: { x: number; y: number; orbit: number; tilt: number; moved: boolean; lastX: number; lastY: number; lastT: number } | null = null
  /** Spin left over from a flick, in radians per second, so she keeps turning and slows down. */
  private spin = { orbit: 0, tilt: 0 }
  /** Two fingers on the screen: their distance when the pinch began, and the dolly then. */
  private pinch: { d: number; dolly: number } | null = null
  private readonly touches = new Map<number, { x: number; y: number }>()
  private readonly canvas: HTMLCanvasElement
  private readonly opts: ExperienceOptions
  private readonly probe = new Vector3()
  private readonly gazeAt = new Vector3()
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
  private frames = 0
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

    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true })
    this.renderer.setClearColor(new Color(HEX.void))

    // The boot screen stays up until everything has loaded (or failed): her art, her model,
    // the rooftop set, the towers, the facade kit, the street props and the skyline. Then
    // every shader is compiled and real frames are checked over the city and on her roof,
    // so nothing pops in or stalls later and the first thing seen is the finished scene.
    let artLoaded!: () => void
    const art = new Promise<void>((r) => (artLoaded = r))
    const loaded = () => artLoaded()
    this.roof = new RooftopChapter(loaded)
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

    const models = this.props.init().then(() => {
      const rina = this.props.load('rina').then(async (gltf) => {
        if (!gltf) return
        this.rina.attach(gltf, this.roof.figureHolder, TALL)
        this.roof.card.visible = false
        // A high-detail model, if one is listed, loads before the boot screen lifts too.
        if (this.lite) return
        const hd = await this.props.load('rina-hd')
        if (hd) this.rina.attach(hd, this.roof.figureHolder, TALL)
      }).catch((err) => console.warn('[rina] model failed', err))
      const jobs: Promise<unknown>[] = [
        rina,
        this.props.fill('rooftop-set', this.roof.setHolder, null, this.roof.furniture),
        this.props.load('city-kit').then((kit) => kit && this.city.dress(kit.scene)),
        this.city.loadSkyline(this.lite),
        this.props.load('towers').then((towers) => towers && this.city.build(towers.scene)),
      ]
      // Six spots on the pavement, in the stretch the camera flies at street level.
      for (let i = 0; i < 6; i++) {
        const spot = new Group()
        spot.position.set((i % 2 ? 1 : -1) * 11.2, 0.4, -350 - i * 46)
        spot.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2
        this.city.group.add(spot)
        jobs.push(this.props.fill('street-prop', spot, 3.2))
      }
      return Promise.allSettled(jobs)
    })
    void Promise.all([art, models]).then(() => this.warmUp()).then(() => opts.onReady())

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    this.bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 0.9, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.8 })
    this.buildPasses()

    this.setLite(opts.lite)
    addEventListener('resize', this.resize)
    addEventListener('pointermove', this.onPointer, { passive: true })
    opts.canvas.addEventListener('pointerdown', this.onDown)
    opts.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    addEventListener('pointerup', this.onUp, { passive: true })
    addEventListener('pointercancel', this.onUp, { passive: true })
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Full: bloom, filmic tone mapping, grain, edge smoothing, lens fringing. Lite: the first pass only. */
  private buildPasses() {
    this.composer.removeAllPasses()
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (this.gfx >= 2) {
      // Fallback for graphics cards that draw the full chain black: just tone mapping.
      this.composer.addPass(new EffectPass(this.camera, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })))
      this.resize()
      return
    }
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
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Two fingers: pinch to move in or out.
    if (this.pinch && this.touches.size >= 2) {
      this.view.dolly = clampDolly(this.pinch.dolly * (this.pinch.d / Math.max(20, this.fingerGap())))
      return
    }
    // Dragging on the scene spins the camera all the way round her, and up or down a little.
    const d = this.drag
    if (d) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (Math.hypot(dx, dy) > 6) d.moved = true
      if (!d.moved) return
      this.view.orbit = d.orbit - dx * 0.0085
      this.view.tilt = clampTilt(d.tilt + dy * 0.004)
      // Remember how fast it is moving, for the spin after letting go.
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT) / 1000
      this.spin.orbit = (-(e.clientX - d.lastX) * 0.0085) / dt
      this.spin.tilt = ((e.clientY - d.lastY) * 0.004) / dt
      d.lastX = e.clientX
      d.lastY = e.clientY
      d.lastT = now
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
      if (!this.drag && (this.spin.orbit || this.spin.tilt)) {
        const v = this.view
        v.orbit += this.spin.orbit * f.dt
        v.tilt = clampTilt(v.tilt + this.spin.tilt * f.dt)
        const decay = Math.exp(-f.dt * 2.2)
        this.spin.orbit = Math.abs(this.spin.orbit) < 0.02 ? 0 : this.spin.orbit * decay
        this.spin.tilt = Math.abs(this.spin.tilt) < 0.02 ? 0 : this.spin.tilt * decay
      }
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

    if (this.gfx >= 3) this.renderer.render(this.scene, this.camera)
    else this.composer.render(f.dt)
    this.frames++
    if (this.frameProbe) {
      const done = this.frameProbe
      this.frameProbe = null
      done(this.brightest())
    }
  }

  /**
   * Compiles every shader in the scene, then waits for a few real frames to be drawn, so the
   * boot screen only lifts once the city is actually on screen and not a black canvas.
   */
  private async warmUp() {
    // Her outline, wireframe and optic are hidden until needed: show them while compiling.
    this.rina.showAll()
    try {
      await this.renderer.compileAsync(this.scene, this.camera)
    } catch {
      // Older drivers without parallel compile still compile on the first frames below.
    }
    const forced = Number(new URLSearchParams(location.search).get('gfx'))
    if (forced > 0) this.setGfx(Math.min(3, forced))
    // Some graphics cards accept the post-processing setup, or one of the shaders, but draw
    // nothing but black. Look at real frames, first over the city and then on her roof
    // (behind the boot screen); if either is black, step down to a simpler pipeline and look
    // again.
    const p = this.progress
    for (const view of ['city', 'roof'] as const) {
      if (view === 'roof') {
        p.run = 1
        p.rina = 0.75
        this.first = true
      }
      for (;;) {
        await this.waitFrames(3)
        const max = await new Promise<number>((resolve) => (this.frameProbe = resolve))
        console.info(`[rina] ${view}: graphics level ${this.gfx}, brightest pixel ${max}, GPU: ${this.gpuName()}`)
        if (max > 12 || this.gfx >= 3) break
        this.setGfx(this.gfx + 1)
      }
    }
    p.run = 0
    p.rina = 0
    this.first = true
    await this.waitFrames(2)
  }

  private waitFrames(n: number) {
    const target = this.frames + n
    return new Promise<void>((resolve) => {
      const check = () => (this.frames >= target ? resolve() : requestAnimationFrame(check))
      check()
    })
  }

  private setGfx(level: number) {
    this.gfx = level
    if (level >= 3) {
      // Straight to the screen: three.js does the tone mapping itself.
      this.renderer.toneMapping = ACESFilmicToneMapping
      return
    }
    this.renderer.toneMapping = NoToneMapping
    this.composer.dispose()
    this.composer = new EffectComposer(this.renderer, { frameBufferType: level >= 1 ? UnsignedByteType : HalfFloatType })
    this.buildPasses()
  }

  /** Brightest channel value (0-255) over a grid of points on the frame just drawn. */
  private brightest() {
    const gl = this.renderer.getContext()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    const px = new Uint8Array(4)
    let max = 0
    for (let y = 1; y < 16; y++) {
      for (let x = 1; x < 16; x++) {
        gl.readPixels(Math.floor((x / 16) * w), Math.floor((y / 16) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        max = Math.max(max, px[0]!, px[1]!, px[2]!)
      }
    }
    return max
  }

  private gpuName() {
    const gl = this.renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  }

  /** Plays her heart pose, as a click on her does. */
  heart() {
    this.rina.heart()
  }

  /** Plays one of her reactions (wave, flex, heart, glitch, look around). */
  react(r: Reaction) {
    this.rina.react(r)
  }

  /** Whether she has been materialised, and whether a reaction is still playing. */
  get rinaSolid() {
    return this.rina.isSolid
  }
  get rinaBusy() {
    return this.rina.busy
  }

  /** Holds her in her standing pose (while her file is open) or lets her look around again. */
  steady(on: boolean) {
    this.rina.steady = on
  }

  /** Brings her back to her standing pose now, before the camera moves in on a part. */
  settle() {
    this.rina.settle()
  }

  /** Turns her back into a hologram, for a replay of the flight. */
  dissolve() {
    this.rina.dissolve()
  }

  private rayAt(clientX: number, clientY: number) {
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.ndc.set((clientX / innerWidth) * 2 - 1, -((clientY / innerHeight) * 2 - 1)), this.camera)
    return this.raycaster.ray
  }

  private onDown = (e: PointerEvent) => {
    if (!this.interactive) return
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.touches.size === 2) {
        this.drag = null
        this.pinch = { d: this.fingerGap(), dolly: this.view.dolly }
        return
      }
    }
    this.spin.orbit = this.spin.tilt = 0
    const now = performance.now()
    this.drag = { x: e.clientX, y: e.clientY, orbit: this.view.orbit, tilt: this.view.tilt, moved: false, lastX: e.clientX, lastY: e.clientY, lastT: now }
  }

  private fingerGap() {
    const [a, b] = [...this.touches.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1
  }

  /** The mouse wheel moves the camera in toward her or back out. */
  private onWheel = (e: WheelEvent) => {
    if (!this.interactive || this.view.zoom > 0.01) return
    e.preventDefault()
    this.view.dolly = clampDolly(this.view.dolly * Math.exp(e.deltaY * 0.0012))
  }

  /** Puts the camera back in front of her at the usual distance: orbit taken the short way round. */
  resetView() {
    this.spin.orbit = this.spin.tilt = 0
    const o = this.view.orbit
    this.view.orbit = Math.atan2(Math.sin(o), Math.cos(o))
    return this.view
  }

  /** A press that did not turn into a drag is a click: on her, it is the pick. */
  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId)
    if (this.pinch) {
      if (this.touches.size < 2) this.pinch = null
      this.drag = null
      return
    }
    const drag = this.drag
    this.drag = null
    // A flick keeps her turning; a slow release, or a pause before letting go, does not.
    if (drag?.moved && performance.now() - drag.lastT > 80) this.spin.orbit = this.spin.tilt = 0
    if (!drag || drag.moved || !this.interactive) return
    // The page decides what a click on her does: materialise her first, then her reactions.
    if (this.rina.hit(this.rayAt(e.clientX, e.clientY))) this.opts.onPick()
  }

  /** Rina's animations, her hover outline, and where the HUD around her goes on screen. */
  private updateRina(dt: number, time: number) {
    const p = this.progress
    // Once landed she watches the camera, and turns fully toward it while pointed at.
    this.rina.gaze = this.gazeAt.copy(this.camera.position)
    this.gazeAt.x += this.frame.pointer.x * 3
    this.gazeAt.y += this.frame.pointer.y * 2
    this.rina.gazeWeight = this.interactive ? (this.over ? 1 : 0.7) : 0
    this.rina.update(dt, time, p.run > 0.85, this.audio.playing ? this.frame.beat : 0)
    this.roof.dress.solid += ((this.rina.isSolid ? 1 : 0) - this.roof.dress.solid) * Math.min(1, dt * 2)
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
      // The labelled points on her (optic, chrome arm, tattoo, knee) for the scan callouts.
      for (const a of ANCHORS) {
        const pt = this.rina.anchor(a, this.probe).project(this.camera)
        s.setProperty(`--${a}-x`, `${((pt.x + 1) * 0.5 * innerWidth).toFixed(1)}px`)
        s.setProperty(`--${a}-y`, `${((1 - pt.y) * 0.5 * innerHeight).toFixed(1)}px`)
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
    removeEventListener('pointermove', this.onPointer)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    removeEventListener('pointerup', this.onUp)
    removeEventListener('pointercancel', this.onUp)
    this.audio.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}

/** How far up and down the camera may swing around her, in radians. */
const clampTilt = (t: number) => Math.max(-0.12, Math.min(0.95, t))
const clampDolly = (d: number) => Math.max(0.5, Math.min(1.7, d))
