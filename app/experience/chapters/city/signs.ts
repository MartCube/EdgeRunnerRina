import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const PINK = '#ff2a6d'
const CYAN = '#00f0ff'
const AMBER = '#ff9a3c'
const WHITE = '#f4f0ff'
const LIME = '#b6ff3c'
const COLORS = [PINK, CYAN, AMBER, WHITE, PINK, CYAN, LIME]
const FONT = '"Big Shoulders Display", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Impact, sans-serif'

// All names are invented for this city.
const VERTICAL = ['ラーメン', '配達', 'サイバー', 'ネオン', '酒', '薬局', 'ホテル', 'MANDA', 'NOODLE', '24H', 'DATA', 'SYNTH', 'カラオケ', '電脳', '質屋', 'BAR']
const HORIZONTAL = ['HAKU RAMEN', 'ZENITH ARCADE', 'ORBIT BAR', 'KAZE PHARMA', 'NOVA SYNTH', 'MANDA EXPRESS', 'DEEP DIVE', 'LUCKY 7 PAWN', 'CHROME CLINIC', 'OPEN 24H']
const ADS: [string, string][] = [
  ['NOVA', 'DRINK THE FUTURE'],
  ['ZENITH', 'CHROME FOR EVERYONE'],
  ['MANDA EXPRESS', 'WE TAKE THE ROOFS'],
  ['ORBIT', 'SLEEP IS OPTIONAL'],
  ['KAZE', 'NEW EYES. SAME YOU.'],
  ['HAKU', 'NOODLES AT 4 AM'],
]

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}

function finish(c: HTMLCanvasElement) {
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Tall blade signs that hang over the pavement. */
export function verticalSigns(): CanvasTexture[] {
  return VERTICAL.map((word, i) => {
    const { c, g } = canvas(128, 512)
    const color = COLORS[i % COLORS.length]!
    const filled = i % 4 === 3
    g.fillStyle = filled ? color : '#07070c'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = color
    g.lineWidth = 7
    g.strokeRect(7, 7, c.width - 14, c.height - 14)
    if (i % 3 === 0) g.strokeRect(18, 18, c.width - 36, c.height - 36)
    g.fillStyle = filled ? '#07070c' : color
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const chars = [...word]
    const step = (c.height - 70) / chars.length
    g.font = `900 ${Math.min(92, step * 0.86)}px ${FONT}`
    chars.forEach((ch, k) => g.fillText(ch, c.width / 2, 35 + step * (k + 0.5)))
    return finish(c)
  })
}

/** Wide shop signs and the banners that hang across the street. */
export function horizontalSigns(): CanvasTexture[] {
  return HORIZONTAL.map((word, i) => {
    const { c, g } = canvas(768, 192)
    const color = COLORS[(i + 2) % COLORS.length]!
    g.fillStyle = '#07070c'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = color
    g.lineWidth = 8
    g.strokeRect(8, 8, c.width - 16, c.height - 16)
    g.fillStyle = color
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    let size = 132
    do {
      g.font = `900 ${size}px ${FONT}`
      size -= 6
    } while (g.measureText(word).width > c.width - 70)
    g.fillText(word, c.width / 2, c.height / 2 + 6)
    return finish(c)
  })
}

/** Large adverts for the billboards: one loud word, a line under it, a block of colour. */
export function adverts(): CanvasTexture[] {
  return ADS.map(([brand, line], i) => {
    const { c, g } = canvas(1024, 576)
    const a = COLORS[i % 3]!
    const b = COLORS[(i + 1) % 3]!
    const grad = g.createLinearGradient(0, 0, c.width, c.height)
    grad.addColorStop(0, '#0b0616')
    grad.addColorStop(1, i % 2 ? '#2a0a2c' : '#04202c')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    // A graphic shape behind the type.
    g.fillStyle = a
    g.globalAlpha = 0.9
    if (i % 3 === 0) {
      g.beginPath()
      g.arc(790, 250, 190, 0, Math.PI * 2)
      g.fill()
    } else if (i % 3 === 1) {
      g.beginPath()
      g.moveTo(600, 520)
      g.lineTo(820, 60)
      g.lineTo(1000, 520)
      g.fill()
    } else {
      for (let k = 0; k < 7; k++) g.fillRect(620 + k * 56, 70, 30, 420 - k * 34)
    }
    g.globalAlpha = 1
    g.fillStyle = WHITE
    g.textBaseline = 'alphabetic'
    let size = 250
    do {
      g.font = `900 ${size}px ${FONT}`
      size -= 8
    } while (g.measureText(brand).width > c.width - 110)
    g.fillText(brand, 54, 350)
    g.fillStyle = b
    g.font = `800 58px ${FONT}`
    g.fillText(line, 58, 440)
    g.fillRect(58, 474, 300, 10)
    return finish(c)
  })
}

/** Repeating text for the hologram rings around the tallest towers. */
export function ticker(): CanvasTexture {
  const { c, g } = canvas(2048, 128)
  g.fillStyle = WHITE
  g.textBaseline = 'middle'
  g.font = `900 96px ${FONT}`
  g.fillText('MANDA EXPRESS  ///  DISTRICT 7  ///  配達  ///  ZENITH  ///  NOVA  ///', 10, 70)
  const tex = finish(c)
  tex.wrapS = RepeatWrapping
  return tex
}
