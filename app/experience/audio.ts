/**
 * Music and the beat clock. The track is a fixed 123 BPM, so beats are counted from the
 * playback time. Until the music starts, the clock runs on wall time so the page still pulses.
 */
export const BPM = 123

export class AudioEngine {
  readonly el: HTMLAudioElement
  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private bins?: Uint8Array<ArrayBuffer>
  playing = false

  constructor(src: string) {
    this.el = new Audio(src)
    this.el.preload = 'auto'
    // The track ends cleanly and is not a seamless loop; restarting it is fine for a demo.
    this.el.loop = true
    this.el.volume = 0.8
  }

  /** Must be called from a click, browsers block sound otherwise. */
  async start() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext()
        const source = this.ctx.createMediaElementSource(this.el)
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 256
        this.bins = new Uint8Array(this.analyser.frequencyBinCount)
        source.connect(this.analyser)
        this.analyser.connect(this.ctx.destination)
      }
      await this.ctx.resume()
      await this.el.play()
      this.playing = true
    } catch {
      this.playing = false
    }
    return this.playing
  }

  stop() {
    this.el.pause()
    this.playing = false
  }

  /** Position in beats. */
  beats(wallSeconds: number) {
    const t = this.playing ? this.el.currentTime : wallSeconds
    return (t * BPM) / 60
  }

  /** Loudness of the low end, 0 to 1. */
  level() {
    if (!this.playing || !this.analyser || !this.bins) return 0
    this.analyser.getByteFrequencyData(this.bins)
    let sum = 0
    for (let i = 1; i < 12; i++) sum += this.bins[i]!
    return sum / (11 * 255)
  }

  dispose() {
    this.stop()
    void this.ctx?.close()
  }
}
