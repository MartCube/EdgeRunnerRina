import { Color, DataTexture, NearestFilter, RedFormat } from 'three'

/** Style tokens from PROJECT.md, as linear colours for shaders and materials. */
export const HEX = {
  void: 0x07070c,
  panel: 0x10101a,
  pink: 0xff2bd6,
  cyan: 0x00f0ff,
  orange: 0xff7a59,
  gold: 0xd4a24c,
  chrome: 0xc9c4d6,
  steel: 0x6f86a8,
  ink: 0x0b0714,
  haze: 0x2b1240,
} as const

export const col = (hex: number, gain = 1) => new Color(hex).multiplyScalar(gain)

/** Four flat bands for cel shading. */
export function celRamp(): DataTexture {
  const tex = new DataTexture(new Uint8Array([70, 135, 200, 255]), 4, 1, RedFormat)
  tex.minFilter = tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

/** Small deterministic random generator so the city is the same on every load. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
