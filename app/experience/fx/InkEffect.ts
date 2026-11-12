import { Color, Uniform } from 'three'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'

/**
 * The inked-3D look in one pass: outlines wherever depth breaks, plus halftone dots in the
 * mid tones. Lines are dark ink on lit surfaces and a thin neon rim on dark ones, so
 * silhouettes still read at night.
 */
const fragment = /* glsl */ `
uniform float uWidth;
uniform float uHalftone;
uniform vec3 uInk;
uniform vec3 uRim;

float viewDepth(vec2 uv) {
  return min(-getViewZ(readDepth(uv)), 1400.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 t = texelSize * uWidth;
  float c = viewDepth(uv);
  float lap = abs(viewDepth(uv + vec2(t.x, 0.0)) + viewDepth(uv - vec2(t.x, 0.0)) - 2.0 * c)
            + abs(viewDepth(uv + vec2(0.0, t.y)) + viewDepth(uv - vec2(0.0, t.y)) - 2.0 * c)
            + abs(viewDepth(uv + t) + viewDepth(uv - t) - 2.0 * c);
  float edge = smoothstep(0.012, 0.05, lap / c);
  // Far lines thin out so the skyline does not turn into noise.
  edge *= 1.0 - smoothstep(350.0, 900.0, c) * 0.65;

  vec3 colr = inputColor.rgb;
  float luma = dot(colr, vec3(0.299, 0.587, 0.114));

  // Halftone: 45 degree dot screen, strongest in the mid tones.
  vec2 px = uv * resolution / 5.0;
  vec2 g = fract(mat2(0.7071, -0.7071, 0.7071, 0.7071) * px) - 0.5;
  float dotMask = smoothstep(0.34, 0.26, length(g));
  float mid = smoothstep(0.015, 0.09, luma) * (1.0 - smoothstep(0.16, 0.42, luma));
  colr *= 1.0 - uHalftone * dotMask * mid;

  float lit = smoothstep(0.035, 0.16, luma);
  vec3 inked = mix(colr + uRim * 0.55, uInk, lit);
  outputColor = vec4(mix(colr, inked, edge), inputColor.a);
}
`

export class InkEffect extends Effect {
  constructor(ink: Color, rim: Color) {
    super('InkEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['uWidth', new Uniform(1.25)],
        ['uHalftone', new Uniform(0.55)],
        ['uInk', new Uniform(ink)],
        ['uRim', new Uniform(rim)],
      ]),
    })
  }
}
