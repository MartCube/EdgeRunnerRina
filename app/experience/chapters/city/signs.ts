import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

const PINK = '#ff2a6d'
const CYAN = '#00f0ff'
const AMBER = '#ff9a3c'
const WHITE = '#f4f0ff'
const LIME = '#b6ff3c'
const COLORS = [PINK, CYAN, AMBER, WHITE, PINK, CYAN, LIME]
const FONT = '"Big Shoulders Display", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", Impact, sans-serif'

// All names are invented for this city.
const VERTICAL = ['ラーメン', '配達', 'サイバー', 'ネオン', '酒', '薬局', 'ホテル', 'RAMEN', 'NOODLE', '24H', 'DATA', 'SYNTH', 'カラオケ', '電脳', '質屋', 'BAR']
const HORIZONTAL = ['HAKU RAMEN', 'ZENITH ARCADE', 'KARAOKE 歌', 'KAZE PHARMA', 'NOVA SYNTH', 'NEON NOODLE', 'DEEP DIVE', 'LUCKY 7 PAWN', 'CHROME CLINIC', 'OPEN 24H']

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

/** Repeating text for the hologram rings around the tallest towers. */
export function ticker(): CanvasTexture {
  const { c, g } = canvas(2048, 128)
  g.fillStyle = WHITE
  g.textBaseline = 'middle'
  g.font = `900 96px ${FONT}`
  g.fillText('DISTRICT 7  ///  電脳  ///  ZENITH  ///  NOVA  ///', 10, 70)
  const tex = finish(c)
  tex.wrapS = RepeatWrapping
  return tex
}
