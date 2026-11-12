import { Color, HalfFloatType, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing'
import { AudioEngine } from './audio'
import { CityChapter } from './chapters/city'
import { EyeChapter } from './chapters/eye'
import { ParcelChapter } from './chapters/parcel'
import { RooftopChapter } from './chapters/rooftop'
import { InkEffect } from './fx/InkEffect'
import { HEX, clamp01, col, smooth } from './palette'
import type { Frame, Progress } from './types'

export interface ExperienceOptions {
  canvas: HTMLCanvasElement
  /** Element that receives the CSS variables the HUD animates from. */
  root: HTMLElement
  lite: boolean
  onReady: () => void
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
  readonly progress: Progress = { optic: 0, run: 0, rina: 0, ware: 0, delivered: 0 }

  private readonly renderer: WebGLRenderer
  private readonly composer: EffectComposer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 2500)
  private readonly eye = new EyeChapter()
  private readonly city = new CityChapter()
  private readonly roof: RooftopChapter
  private readonly parcel = new ParcelChapter()
  private readonly ink: InkEffect
  private readonly bloom: BloomEffect
  private readonly inkPass: EffectPass
  private readonly target = new Vector3()
  private readonly lookAt = new Vector3()
  private readonly wantPos = new Vector3()
  private readonly pointerRaw = { x: 0, y: 0 }
  private readonly frame: Frame
  private readonly root: HTMLElement
  private lite: boolean
  private inCity = false
  private raf = 0
  private last = 0
  private readonly start = performance.now()
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(opts: ExperienceOptions) {
    this.root = opts.root
    this.lite = opts.lite
    this.frame = {
      time: 0, dt: 0.016, pointer: { x: 0, y: 0 }, beat: 0, beatIndex: 0, level: 0, lite: opts.lite, progress: this.progress,
    }

    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false })
    this.renderer.setClearColor(new Color(HEX.void))

    this.roof = new RooftopChapter(opts.onReady)
    this.city.group.add(this.roof.group)
    this.scene.add(this.eye.group, this.city.group, this.parcel.group)

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.ink = new InkEffect(col(HEX.ink), col(HEX.cyan, 0.5))
    this.bloom = new BloomEffect({ intensity: 1.15, luminanceThreshold: 0.6, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 })
    this.inkPass = new EffectPass(this.camera, this.ink, this.bloom, new VignetteEffect({ darkness: 0.62, offset: 0.28 }))
    this.composer.addPass(this.inkPass)

    this.setLite(opts.lite)
    this.resize()
    addEventListener('resize', this.resize)
    addEventListener('pointermove', this.onPointer, { passive: true })
    this.raf = requestAnimationFrame(this.tick)
  }

  setLite(lite: boolean) {
    this.lite = lite
    this.frame.lite = lite
    this.city.setLite(lite)
    // Lite keeps the outlines and bloom, and drops the halftone and resolution.
    this.ink.uniforms.get('uHalftone')!.value = lite ? 0 : 0.55
    this.resize()
  }

  private resize = () => {
    const w = innerWidth
    const h = innerHeight
    const ratio = Math.min(devicePixelRatio || 1, this.lite ? 1 : 1.75)
    this.renderer.setPixelRatio(ratio)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.ink.uniforms.get('uWidth')!.value = 1.1 * ratio
  }

  private onPointer = (e: PointerEvent) => {
    this.pointerRaw.x = (e.clientX / innerWidth) * 2 - 1
    this.pointerRaw.y = -((e.clientY / innerHeight) * 2 - 1)
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
    const city = p.optic >= 0.999
    let roll = 0

    this.eye.group.visible = !city
    this.city.group.visible = city
    this.parcel.group.visible = city && p.delivered > 0.02

    if (!city) {
      this.eye.pose(p.optic, this.camera, this.target, f)
      this.wantPos.copy(this.camera.position)
      this.eye.update(p.optic, f)
    } else {
      if (p.run < 1) {
        roll = this.city.pose(p.run, this.camera, this.target)
      } else {
        this.roof.pose(p.rina, p.ware, this.camera, this.target, f)
      }
      this.wantPos.copy(this.camera.position)
      if (p.delivered > 0) {
        // Blend from the roof up to the parcel as the receipt scrolls in.
        const k = smooth(0, 1, p.delivered)
        const fromPos = this.wantPos.clone()
        const fromTarget = this.target.clone()
        this.parcel.pose(this.camera, this.target)
        this.wantPos.lerpVectors(fromPos, this.camera.position, k)
        this.target.lerpVectors(fromTarget, this.target, k)
      }
      this.city.update(f)
      this.roof.update(p.rina, f)
      this.parcel.update(f)
    }

    // Cut on the blink, glide everywhere else.
    if (city !== this.inCity || this.reduced) {
      this.inCity = city
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

    this.bloom.intensity = (this.lite ? 0.9 : 1.15) + f.beat * 0.18 + f.level * 0.5

    // Values the HUD and the page animate from.
    const lid = Math.max(smooth(0.9, 0.995, p.optic) * (1 - smooth(0, 0.045, p.run)), 0)
    const s = this.root.style
    s.setProperty('--lid', lid.toFixed(3))
    s.setProperty('--beat', f.beat.toFixed(3))
    s.setProperty('--scrim', (clamp01(p.ware) * 0.8 - smooth(0.3, 1, p.delivered) * 0.5).toFixed(3))

    this.composer.render(f.dt)
  }

  private readonly prevPos = new Vector3()

  dispose() {
    cancelAnimationFrame(this.raf)
    removeEventListener('resize', this.resize)
    removeEventListener('pointermove', this.onPointer)
    this.audio.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
