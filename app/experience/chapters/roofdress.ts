import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { HEX, col, rng } from '../palette'
import type { Frame } from '../types'
import { ROOF } from './city'

/**
 * Everything around Rina on her roof that is built in code: the holo pad she stands on, the
 * halo and neon signs behind her, neon along the parapet, the wet floor with rain rings and
 * neon reflections, string lights, holographic koi swimming round the roof, her courier
 * drone, flying cars passing close by, and the lights that pick her out.
 *
 * Positions are relative to the roof: x across, z toward the camera, y up from the roof top.
 */
export class RoofDress {
  readonly group = new Group()
  private readonly top = ROOF.y
  private readonly at = new Vector3(ROOF.x, ROOF.y, ROOF.z + 18)
  private readonly shaders: ShaderMaterial[] = []
  private readonly signs: { mat: MeshBasicMaterial; base: Color; seed: number }[] = []
  private readonly koi: { group: Group; r: number; h: number; speed: number; phase: number }[] = []
  private readonly cars: { group: Group; speed: number; lane: number }[] = []
  private readonly drone = new Group()
  private readonly rotors: Mesh[] = []
  private readonly droneLights: MeshBasicMaterial[] = []
  private readonly bulbs: InstancedMesh
  private readonly bulbBase: Color[] = []
  private readonly padLight: PointLight
  private readonly tmp = new Vector3()
  private readonly tmp2 = new Vector3()
  private readonly color = new Color()
  /** 0 hologram to 1 solid: the pad and her lights warm up as she materialises. */
  solid = 0

  constructor() {
    const rand = rng(77)
    this.pad()
    this.halo()
    this.neonSigns()
    this.parapetNeon()
    this.wetFloor()
    this.bulbs = this.stringLights()
    for (let i = 0; i < 3; i++) this.addKoi(i, rand)
    this.buildDrone()
    for (let i = 0; i < 10; i++) this.addCar(i, rand)

    // Her lights: a soft key from the front left, a hard pink rim from behind on her right,
    // a cyan one from behind on her left, and cyan bouncing up off the pad.
    const key = new SpotLight(0xffe2ee, 420, 60, 0.42, 0.7, 2)
    key.position.set(this.at.x - 7, this.top + 17, this.at.z + 16)
    key.target.position.set(this.at.x, this.top + 5, this.at.z)
    const pinkRim = new SpotLight(HEX.pink, 520, 40, 0.5, 0.5, 2)
    pinkRim.position.set(this.at.x - 6, this.top + 11, this.at.z - 9)
    pinkRim.target.position.set(this.at.x, this.top + 5, this.at.z)
    const cyanRim = new SpotLight(HEX.cyan, 420, 40, 0.5, 0.5, 2)
    cyanRim.position.set(this.at.x + 7, this.top + 9, this.at.z - 8)
    cyanRim.target.position.set(this.at.x, this.top + 5, this.at.z)
    this.padLight = new PointLight(HEX.cyan, 30, 14, 2)
    this.padLight.position.set(this.at.x, this.top + 0.8, this.at.z + 0.8)
    this.group.add(key, key.target, pinkRim, pinkRim.target, cyanRim, cyanRim.target, this.padLight)
  }

  private shader(mat: ShaderMaterial) {
    this.shaders.push(mat)
    return mat
  }

  /** A projector disc under her feet: rings and ticks turning, and a faint column of light. */
  private pad() {
    const mat = this.shader(new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) }, uPink: { value: col(HEX.pink) }, uSolid: { value: 0 }, uBeat: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime; uniform vec3 uCyan; uniform vec3 uPink; uniform float uSolid; uniform float uBeat;
        float ring(float r, float at, float w) { return smoothstep(w, 0.0, abs(r - at)); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float ticks = step(0.55, fract(a * 24.0 / 6.2832 + uTime * 0.15)) * ring(r, 0.86, 0.05);
          float dashes = step(0.3, fract(a * 6.0 / 6.2832 - uTime * 0.3)) * ring(r, 0.66, 0.025);
          float pulse = ring(r, fract(uTime * 0.45), 0.04) * (1.0 - r);
          float glow = ring(r, 0.97, 0.03) * 1.4 + ring(r, 0.5, 0.012) + ticks * 0.9 + dashes + pulse * 0.8;
          glow += smoothstep(0.5, 0.0, r) * 0.25;
          vec3 c = mix(uCyan, uPink, ticks * 0.6) * glow * (1.3 + uBeat * 0.6 + uSolid * 0.4);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }))
    const disc = new Mesh(new PlaneGeometry(6, 6), mat)
    disc.rotation.x = -Math.PI / 2
    disc.position.set(this.at.x, this.top + 0.16, this.at.z)
    // The column: an open cone, brightest at the bottom, so she seems projected from the pad.
    const beam = this.shader(new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) }, uSolid: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime; uniform vec3 uCyan; uniform float uSolid;
        void main() {
          float lines = 0.6 + 0.4 * step(0.5, fract(vUv.x * 40.0 + uTime * 0.6));
          float fade = pow(1.0 - vUv.y, 2.2);
          gl_FragColor = vec4(uCyan * fade * lines * mix(0.22, 0.07, uSolid), 1.0);
        }`,
    }))
    const cone = new Mesh(new CylinderGeometry(2.4, 2.9, 11, 40, 1, true), beam)
    cone.position.set(this.at.x, this.top + 5.6, this.at.z)
    this.group.add(disc, cone)
  }

  /** A big turning holo ring behind her, like a target lock drawn on the night. */
  private halo() {
    const mat = this.shader(new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) }, uPink: { value: col(HEX.pink) }, uBeat: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime; uniform vec3 uCyan; uniform vec3 uPink; uniform float uBeat;
        float ring(float r, float at, float w) { return smoothstep(w, 0.0, abs(r - at)); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x) / 6.2832 + 0.5;
          float outer = ring(r, 0.96, 0.012) * step(0.12, fract(a * 3.0 + uTime * 0.04));
          float mid = ring(r, 0.84, 0.03) * step(0.5, fract(a * 48.0 - uTime * 0.5)) * step(0.35, fract(a * 4.0 - uTime * 0.07));
          float inner = ring(r, 0.72, 0.008);
          float arc = ring(r, 0.9, 0.006) * step(0.8, fract(a - uTime * 0.11));
          float tick = ring(r, 0.78, 0.04) * step(0.92, fract(a * 12.0));
          vec3 c = uCyan * (outer * 1.2 + mid * 0.7 + inner * 0.6 + tick) + uPink * arc * 2.0;
          gl_FragColor = vec4(c * (0.6 + uBeat * 0.5), 1.0);
        }`,
    }))
    const ring = new Mesh(new PlaneGeometry(13.5, 13.5), mat)
    ring.position.set(this.at.x, this.top + 6.2, this.at.z - 5.5)
    this.group.add(ring)
  }

  /** Neon text on a transparent canvas: a glowing tube look, drawn once. */
  private neonTexture(lines: string[], vertical: boolean, w: number, h: number, color: string, font: string) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = font
    const draw = (blur: number, style: string, width: number) => {
      g.shadowBlur = blur
      g.shadowColor = color
      g.strokeStyle = style
      g.fillStyle = style
      g.lineWidth = width
      lines.forEach((line, i) => {
        if (vertical) {
          const chars = [...line]
          const step = h / (chars.length + 0.6)
          chars.forEach((ch, k) => g.fillText(ch, w / 2 + (i - (lines.length - 1) / 2) * w * 0.5, step * (k + 0.8)))
        } else {
          g.fillText(line, w / 2, (h / (lines.length + 0.4)) * (i + 0.7))
        }
      })
    }
    draw(28, color, 6)
    draw(10, '#ffffff', 2)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    return tex
  }

  private sign(tex: CanvasTexture, w: number, h: number, hex: number, gain: number, x: number, y: number, z: number, ry = 0) {
    const base = col(hex, gain)
    const mat = new MeshBasicMaterial({ map: tex, color: base.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })
    const mesh = new Mesh(new PlaneGeometry(w, h), mat)
    mesh.position.set(ROOF.x + x, this.top + y, ROOF.z + z)
    mesh.rotation.y = ry
    this.signs.push({ mat, base, seed: this.signs.length * 1.7 + 0.3 })
    this.group.add(mesh)
    return mesh
  }

  /** Two tall vertical signs behind her and a sign board on the stair hut. */
  private neonSigns() {
    const frame = new MeshStandardMaterial({ color: 0x15141f, metalness: 0.6, roughness: 0.4 })
    const signBox = (x: number, z: number, w: number, h: number, y: number, pole: number) => {
      const back = new Mesh(new BoxGeometry(w + 0.5, h + 0.5, 0.35), frame)
      back.position.set(ROOF.x + x, this.top + y, ROOF.z + z - 0.25)
      const post = new Mesh(new BoxGeometry(0.4, pole, 0.4), frame)
      post.position.set(ROOF.x + x, this.top + pole / 2, ROOF.z + z - 0.45)
      this.group.add(back, post)
    }
    // Right: her name and "delivery" in one column, pink.
    signBox(10.5, 9, 2.8, 12, 10.5, 16.5)
    this.sign(this.neonTexture(['リナ配達'], true, 256, 1024, '#ff2bd6', 'bold 190px sans-serif'), 2.8, 12, 0xffffff, 1.6, 10.5, 10.5, 9)
    // Left: "night run" in cyan, shorter.
    signBox(-10, 4, 2.2, 7.5, 9, 12.75)
    this.sign(this.neonTexture(['夜走'], true, 256, 768, '#00f0ff', 'bold 200px sans-serif'), 2.2, 7.5, 0xffffff, 1.5, -10, 9, 4)
    // A board along the top of the stair hut.
    this.sign(this.neonTexture(['RM-01  //  OPEN ALL NIGHT'], false, 1024, 128, '#ffb347', 'bold 76px monospace'), 9, 1.1, 0xffffff, 1.4, -13, 5.4, -9.4)
  }

  /** Neon tube along the outer top edge of the parapet: pink at the front, cyan on the sides. */
  private parapetNeon() {
    const half = ROOF.size / 2
    const tube = (hex: number, w: number, d: number, x: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, 0.12, d), new MeshBasicMaterial({ color: col(hex, 2.4), fog: false }))
      m.position.set(ROOF.x + x, this.top + 1.48, ROOF.z + z)
      this.group.add(m)
      // A second, lower line on the outside face.
      const low = new Mesh(new BoxGeometry(w, 0.06, d), new MeshBasicMaterial({ color: col(hex, 1.6), fog: false }))
      low.position.set(ROOF.x + x + (d > w ? Math.sign(x) * 0.5 : 0), this.top + 0.5, ROOF.z + z + (w > d ? Math.sign(z) * 0.5 : 0))
      this.group.add(low)
    }
    tube(HEX.pink, ROOF.size, 0.1, 0, half - 0.05)
    tube(HEX.cyan, 0.1, ROOF.size, -half + 0.05, 0)
    tube(HEX.cyan, 0.1, ROOF.size, half - 0.05, 0)
  }

  /** The wet floor in front: rain rings popping up, and smeared neon reflections under the signs. */
  private wetFloor() {
    const mat = this.shader(new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uCyan: { value: col(HEX.cyan) }, uPink: { value: col(HEX.pink) }, uBeat: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vP; uniform float uTime; uniform vec3 uCyan; uniform vec3 uPink; uniform float uBeat;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float streak(float x, float at, float w) { return exp(-pow((x - at) / w, 2.0)); }
        void main() {
          // vP.x across the roof, vP.y from the back (-) to the front (+), in scene units.
          vec2 cell = floor(vP / 1.6);
          vec2 f = fract(vP / 1.6) - 0.5;
          float rings = 0.0;
          for (int i = 0; i < 2; i++) {
            float h = hash(cell + float(i) * 7.3);
            float t = fract(uTime * (0.5 + h * 0.4) + h * 9.0);
            vec2 o = vec2(hash(cell + 3.1 + float(i)), hash(cell + 5.7 + float(i))) - 0.5;
            float d = length(f - o * 0.5);
            rings += smoothstep(0.025, 0.0, abs(d - t * 0.4)) * (1.0 - t) * (1.0 - t) * step(0.72, h);
          }
          // Reflections: long soft streaks running toward the camera under each light.
          float back = smoothstep(-24.0, 6.0, vP.y) * smoothstep(25.0, 10.0, vP.y);
          float wobble = sin(vP.y * 3.0 + uTime * 2.0) * 0.15;
          vec3 refl = uPink * streak(vP.x + wobble, 10.5, 0.9) * 0.9
                    + uCyan * streak(vP.x - wobble, -10.0, 0.8) * 0.8
                    + uCyan * streak(vP.x, 0.0, 2.2) * 0.35
                    + vec3(1.0, 0.7, 0.35) * streak(vP.x, -13.0, 2.5) * smoothstep(-6.0, -12.0, vP.y) * 0.4;
          float puddle = 0.55 + 0.45 * smoothstep(0.35, 0.65, hash(floor(vP / 4.0)));
          vec3 c = refl * back * puddle * (0.5 + uBeat * 0.2) + mix(uCyan, vec3(1.0), 0.5) * rings * 0.22;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }))
    const w = ROOF.size - 2
    const floor = new Mesh(new PlaneGeometry(w, w), mat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(ROOF.x, this.top + 0.14, ROOF.z)
    // Plane y runs toward -z once rotated flat; flip so +y in the shader is toward the camera.
    floor.scale.y = -1
    this.group.add(floor)
  }

  /** Warm and pink bulbs strung on two sagging cables over the back of the roof. */
  private stringLights() {
    const runs: [Vector3, Vector3, number][] = [
      [new Vector3(-9, 4.6, -12), new Vector3(17, 15, 8), 2.6],
      [new Vector3(-13, 4.4, -9.5), new Vector3(-24.4, 2.6, 18), 1.4],
      [new Vector3(-9, 4.4, -9.5), new Vector3(10.5, 15.5, 8.6), 2.0],
    ]
    const per = 18
    const mesh = new InstancedMesh(new SphereGeometry(0.16, 8, 6), new MeshBasicMaterial({ fog: false }), runs.length * per)
    const m = new Matrix4()
    let i = 0
    const palette = [col(0xffc070, 2.6), col(HEX.pink, 2.4), col(0xffc070, 2.6), col(HEX.cyan, 2.2)]
    for (const [a, b, sag] of runs) {
      for (let k = 1; k <= per; k++) {
        const t = k / (per + 1)
        this.tmp.lerpVectors(a, b, t)
        this.tmp.y -= Math.sin(Math.PI * t) * sag
        m.makeTranslation(ROOF.x + this.tmp.x, this.top + this.tmp.y, ROOF.z + this.tmp.z)
        mesh.setMatrixAt(i, m)
        const c = palette[(k + i) % palette.length]!
        this.bulbBase.push(c)
        mesh.setColorAt(i, c)
        i++
      }
    }
    this.group.add(mesh)
    return mesh
  }

  /**
   * A holographic koi: a flat ribbon shaped into a fish in the vertex shader (wide body,
   * narrow waist, forked tail) that swims with a wave down its length. Two crossed ribbons
   * give it body from any angle.
   */
  private addKoi(i: number, rand: () => number) {
    const fish = new Group()
    const geo = new PlaneGeometry(1, 1, 40, 1)
    const hues: [number, number][] = [[HEX.cyan, HEX.pink], [HEX.pink, 0xffb347], [HEX.cyan, 0xffffff]]
    const [ca, cb] = hues[i % hues.length]!
    for (const vert of [0, 1]) {
      const mat = this.shader(new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
        uniforms: { uTime: { value: 0 }, uPhase: { value: i * 2.1 }, uVert: { value: vert }, uA: { value: col(ca) }, uB: { value: col(cb) }, uLen: { value: 4.2 } },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uPhase; uniform float uVert; uniform float uLen;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            float u = uv.x;
            float v = uv.y * 2.0 - 1.0;
            float body = pow(max(sin(3.1416 * clamp(u / 0.8, 0.0, 1.0)), 0.0), 0.6) * 0.55;
            float tail = smoothstep(0.7, 1.0, u) * 0.85;
            float w = (body + tail) * (uVert > 0.5 ? 0.7 : 1.0);
            float swim = sin(u * 5.0 - uTime * 7.0 + uPhase) * 0.45 * (0.15 + u);
            vec3 p = vec3(0.0);
            p.z = (0.5 - u) * uLen;
            if (uVert > 0.5) { p.y = v * w; p.x = swim; }
            else { p.x = v * w + swim; }
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB;
          varying vec2 vUv;
          void main() {
            float v = abs(vUv.y * 2.0 - 1.0);
            float scales = 0.65 + 0.35 * step(0.5, fract(vUv.x * 26.0 + v * 4.0));
            float edge = smoothstep(1.0, 0.75, v) * 0.55 + smoothstep(0.82, 1.0, v) * 1.2;
            float spot = step(0.6, fract(sin(floor(vUv.x * 9.0) * 12.9) * 437.5)) * step(v, 0.6);
            vec3 c = mix(uA, uB, spot * 0.9 + vUv.x * 0.25) * (edge * scales + 0.15);
            float lines = 0.75 + 0.25 * sin(vUv.x * 120.0 - uTime * 4.0);
            gl_FragColor = vec4(c * lines * 1.4, 1.0);
          }`,
      }))
      fish.add(new Mesh(geo, mat))
    }
    this.group.add(fish)
    this.koi.push({ group: fish, r: 11 + i * 3.5 + rand() * 1.5, h: 8 + i * 3, speed: (0.16 + rand() * 0.06) * (i % 2 ? -1 : 1), phase: i * 2.2 })
  }

  /** Her delivery drone: a small quad with blinking lights and a scan cone, hovering near her. */
  private buildDrone() {
    const body = new MeshStandardMaterial({ color: 0x1b1a26, metalness: 0.8, roughness: 0.35 })
    const trim = new MeshBasicMaterial({ color: col(HEX.pink, 2.2), fog: false })
    const hull = new Mesh(new BoxGeometry(1.1, 0.32, 0.8), body)
    const stripe = new Mesh(new BoxGeometry(1.12, 0.06, 0.82), trim)
    stripe.position.y = 0.04
    const eye = new Mesh(new SphereGeometry(0.13, 12, 8), new MeshBasicMaterial({ color: col(HEX.cyan, 3), fog: false }))
    eye.position.set(0, -0.06, 0.42)
    this.drone.add(hull, stripe, eye)
    const rotorMat = new MeshBasicMaterial({ color: col(HEX.cyan, 0.9), transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, fog: false })
    for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]] as const) {
      const arm = new Mesh(new BoxGeometry(0.08, 0.06, 0.08), body)
      arm.scale.set(Math.hypot(x, z) / 0.08, 1, 1)
      arm.position.set(x / 2, 0.05, z / 2)
      arm.rotation.y = -Math.atan2(z, x)
      const rotor = new Mesh(new CylinderGeometry(0.42, 0.42, 0.02, 20), rotorMat)
      rotor.position.set(x, 0.14, z)
      const blade = new Mesh(new BoxGeometry(0.8, 0.02, 0.06), body)
      rotor.add(blade)
      this.rotors.push(rotor)
      const lamp = new MeshBasicMaterial({ color: col(z < 0 ? 0xff3355 : 0x55ff99, 3), fog: false })
      this.droneLights.push(lamp)
      const dot = new Mesh(new SphereGeometry(0.06, 6, 4), lamp)
      dot.position.set(x, 0.0, z)
      this.drone.add(arm, rotor, dot)
    }
    const cone = new Mesh(
      new ConeGeometry(1.2, 3.2, 24, 1, true).translate(0, -1.6, 0),
      new MeshBasicMaterial({ color: col(HEX.cyan, 0.5), transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
    )
    this.drone.add(cone)
    this.drone.scale.setScalar(0.95)
    this.group.add(this.drone)
  }

  /** A flying car on one of two lanes behind the roof, with a long light trail. */
  private addCar(i: number, rand: () => number) {
    const car = new Group()
    const lane = i % 2
    const dir = lane ? -1 : 1
    const hull = new Mesh(new BoxGeometry(3.4, 0.8, 1.5), new MeshStandardMaterial({ color: 0x14131c, metalness: 0.7, roughness: 0.3 }))
    const head = new Mesh(new BoxGeometry(0.1, 0.18, 1.3), new MeshBasicMaterial({ color: col(0xffffff, 3), fog: false }))
    head.position.x = 1.72 * dir
    const tail = new Mesh(new BoxGeometry(0.1, 0.16, 1.4), new MeshBasicMaterial({ color: col(0xff2040, 3), fog: false }))
    tail.position.x = -1.72 * dir
    const under = new Mesh(new BoxGeometry(2.8, 0.05, 1.2), new MeshBasicMaterial({ color: col(i % 3 ? HEX.cyan : HEX.pink, 2), fog: false }))
    under.position.y = -0.42
    const trail = new Mesh(
      new PlaneGeometry(24, 0.5).translate(-12 * dir - 1.7 * dir, 0, 0),
      this.shader(new ShaderMaterial({
        transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
        uniforms: { uTime: { value: 0 }, uDir: { value: dir } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uDir;
          void main() {
            float along = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
            float core = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
            gl_FragColor = vec4(vec3(1.0, 0.13, 0.25) * pow(along, 2.5) * core * 1.6, 1.0);
          }`,
      })),
    )
    car.add(hull, head, tail, under, trail)
    car.position.set(lerpRange(rand), this.top + (lane ? 21 : 13) + rand() * 3, ROOF.z - (lane ? 75 : 42) - rand() * 8)
    this.cars.push({ group: car, speed: (38 + rand() * 30) * dir, lane })
    this.group.add(car)
  }

  update(f: Frame) {
    const t = f.time
    for (const m of this.shaders) {
      const u = m.uniforms
      u.uTime!.value = t
      if (u.uBeat) u.uBeat.value = f.beat
      if (u.uSolid) u.uSolid.value = this.solid
    }
    this.padLight.intensity = 24 + f.beat * 16 + Math.sin(t * 3) * 4

    // Neon flicker: mostly steady, with the odd stutter, and a lift on the beat.
    for (const s of this.signs) {
      const n = Math.sin(t * 13.0 + s.seed * 17.0) * Math.sin(t * 2.3 + s.seed * 5.0)
      const out = n > 0.93 ? 0.25 : 1
      s.mat.color.copy(s.base).multiplyScalar(out * (1 + f.beat * 0.25))
    }
    for (let i = 0; i < this.bulbBase.length; i++) {
      const tw = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.7)
      this.bulbs.setColorAt(i, this.color.copy(this.bulbBase[i]!).multiplyScalar(tw))
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true

    // Koi swim in circles round her at different heights, rising and dipping.
    for (const k of this.koi) {
      const a = t * k.speed + k.phase
      const g = k.group
      g.position.set(this.at.x + Math.cos(a) * k.r, this.top + k.h + Math.sin(t * 0.6 + k.phase) * 1.2, this.at.z - 14 + Math.sin(a) * k.r * 0.55)
      const s = Math.sign(k.speed)
      this.tmp.set(-Math.sin(a) * k.r * s, Math.cos(t * 0.6 + k.phase) * 0.3, Math.cos(a) * k.r * 0.55 * s).add(g.position)
      g.lookAt(this.tmp)
    }

    // The drone drifts in a lazy figure eight off her right shoulder, always facing her.
    const d = this.drone
    d.position.set(this.at.x - 4.2 + Math.sin(t * 0.5) * 1.4, this.top + 8.6 + Math.sin(t * 1.3) * 0.35, this.at.z - 0.5 + Math.sin(t * 1.0) * 1.0)
    d.lookAt(this.tmp2.set(this.at.x, this.top + 6, this.at.z + 3))
    d.rotation.z += Math.sin(t * 1.3) * 0.08
    for (const r of this.rotors) r.rotation.y += f.dt * 40
    this.droneLights.forEach((l, i) => l.color.copy(col(i < 2 ? 0xff3355 : 0x55ff99, Math.sin(t * 6 + i) > 0.6 ? 4 : 0.4)))

    // Cars loop along their lanes.
    for (const c of this.cars) {
      c.group.position.x += c.speed * f.dt
      if (c.speed > 0 && c.group.position.x > ROOF.x + 260) c.group.position.x = ROOF.x - 260
      if (c.speed < 0 && c.group.position.x < ROOF.x - 260) c.group.position.x = ROOF.x + 260
    }
  }

  /** The drone's position, for the page to raycast against. */
  get dronePosition() {
    return this.drone.position
  }
}

const lerpRange = (rand: () => number) => ROOF.x - 260 + rand() * 520
