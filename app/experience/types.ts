/** Where the visitor is in the experience, 0 to 1 each. Written by the page, read by the scenes. */
export interface Progress {
  /** The flight through the city, from the skyline to her roof. */
  run: number
  /** The landing in front of Rina; the scan sweep prints her as it goes. */
  rina: number
}

/** The camera around Rina once it has landed. The page tweens these. */
export interface RinaView {
  /** 0 to 1, how far her file is open. The camera steps back to make room for the panels. */
  link: number
  /** Radians the visitor has dragged the camera around her; any amount, all the way round. */
  orbit: number
  /** Radians the camera is raised above her (negative looks up at her from low down). */
  tilt: number
  /** Distance multiplier from the mouse wheel or a pinch: below 1 is closer. */
  dolly: number
  /** 0 to 1, how far the camera has moved in on one part of her. */
  zoom: number
  /** The part being looked at: height as a share of hers, sideways offset and distance in scene units. */
  partY: number
  partX: number
  partDist: number
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

/** The steps of the visit, in order. */
export type Stage = 'boot' | 'idle' | 'flight' | 'landed' | 'linked'
