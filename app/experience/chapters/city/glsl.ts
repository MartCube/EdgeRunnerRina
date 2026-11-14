import { HEX, col } from '../../palette'

/** Fog colour, also used for the sky's low haze. */
export const FOG = col(0x170b2a, 0.7)

/** One set of uniform objects shared by every city material, so a frame updates them once. */
export const cityUniforms = {
  uTime: { value: 0 },
  uBeat: { value: 0 },
  uFog: { value: FOG },
  uPink: { value: col(HEX.pink) },
  uCyan: { value: col(HEX.cyan) },
  uAmber: { value: col(0xff9a3c) },
}

/**
 * Shared shader code: noise, the colour of the district at a point along the street,
 * and fog that glows with that colour near the ground, which is what makes the air look lit.
 */
export const common = /* glsl */ `
  uniform float uTime; uniform float uBeat;
  uniform vec3 uFog; uniform vec3 uPink; uniform vec3 uCyan; uniform vec3 uAmber;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // The street passes through pink, cyan and amber districts.
  vec3 zoneColor(float z) {
    float a = sin(z * 0.0105) * 0.5 + 0.5;
    float b = sin(z * 0.0173 + 2.0) * 0.5 + 0.5;
    return mix(mix(uPink, uCyan, smoothstep(0.3, 0.7, a)), uAmber, smoothstep(0.72, 0.96, b));
  }
  vec3 applyFog(vec3 c, vec3 world) {
    float d = distance(world, cameraPosition);
    float low = exp(-max(world.y, 0.0) * 0.011);
    float f = 1.0 - exp(-d * 0.0019 * (0.75 + 0.5 * low));
    vec3 fc = uFog + zoneColor(world.z) * 0.07 * low;
    return mix(c, fc, clamp(f, 0.0, 1.0));
  }
`
