/** Scroll progress of each chapter, 0 to 1, written by the page and read by the scenes. */
export interface Progress {
  optic: number
  run: number
  rina: number
  /** How far the cyberware panel has scrolled in. */
  ware: number
  /** How far the delivery receipt has scrolled in. */
  delivered: number
}

/** What every scene gets each frame. */
export interface Frame {
  time: number
  dt: number
  /** Smoothed pointer, -1 to 1 on both axes, y up. */
  pointer: { x: number; y: number }
  /** 1 on the beat, falling to 0 before the next one. */
  beat: number
  beatIndex: number
  /** Music loudness, 0 to 1. Stays 0 while silent. */
  level: number
  lite: boolean
  progress: Progress
}

export const CHAPTERS = ['optic', 'run', 'rina', 'ware', 'delivered'] as const
export type ChapterId = (typeof CHAPTERS)[number]
