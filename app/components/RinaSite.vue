<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import type { Experience } from '../experience/Experience'
import { BPM } from '../experience/audio'
import type { Stage } from '../experience/types'
import type { Reaction } from '../experience/rina'
import BootScreen from './BootScreen.vue'
import RinaPanels, { type Part } from './RinaPanels.vue'

/** Seconds the flight takes from the skyline to her roof, and the landing after it. */
const FLIGHT = 10.5
const LANDING = 2.6
/** Seconds the city is held on screen after Enter before the flight starts by itself. */
const HOLD = 1.5

const LABELS: Record<Stage, string> = {
  boot: 'Standby',
  idle: 'District 7',
  flight: 'Inbound',
  landed: 'Rina',
  linked: 'Linked',
}

const root = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const stage = ref<Stage>('boot')
const ready = ref(false)
const failed = ref(false)
const sound = ref(false)
const lite = ref(false)
const hover = ref(false)
const pulse = ref(0)
const label = ref('STANDBY')
const clock = ref('')
const touch = ref(false)
/** What she is saying, and a key that restarts the bubble's animation for each new line. */
const speech = ref('')
const speechKey = ref(0)
/** The scan callouts on her parts: shown while pointed at, and for a few seconds after landing. */
const scanning = ref(false)
const showScan = computed(() => stage.value === 'landed' && (hover.value || scanning.value))
let speechTimer = 0
let scanTimer = 0
let greetTimer = 0
let reactionTurn = 0

/** Her reactions: the buttons in the dock, and what she says when she does each one. */
const REACTIONS: { id: Reaction; label: string; key: string; lines: string[] }[] = [
  { id: 'wave', label: 'Wave', key: '1', lines: ['Hey, choom. Over here.', 'Yeah, I see you.', 'You lost? This roof is mine.'] },
  { id: 'flex', label: 'Chrome arm', key: '2', lines: ['Full chrome. Paid in cash.', 'This arm has never dropped a package.', 'Polished it this morning.'] },
  { id: 'heart', label: 'Heart', key: '3', lines: ['Delivered with love. Mostly.', "Don't make it weird.", 'Five stars, right?'] },
  { id: 'look', label: 'Look around', key: '4', lines: ['Corpo drones up there. Stay low.', "Rain's not stopping tonight.", 'Something is watching this roof.'] },
  { id: 'glitch', label: 'Glitch', key: '5', lines: ['Ugh. My optic is lagging.', 'Signal is dirty tonight.', 'Who is pinging me?'] },
]
const CALLOUTS = [
  { id: 'optic', side: 'r', title: 'Left optic', note: 'RM-OS 3.7 / tracking you' },
  { id: 'tattoo', side: 'r', title: 'Sakura ink', note: 'Left shoulder' },
  { id: 'arm', side: 'l', title: 'Chrome arm', note: 'Right, full replacement' },
  { id: 'knee', side: 'l', title: 'Knee servos', note: 'Both legs / jump assist' },
] as const

let exp: Experience | undefined
let flight: gsap.core.Timeline | undefined
let captions: { el: HTMLElement; from: number; to: number }[] = []
let clockTimer = 0
let scrambleTimer = 0
let holdTimer = 0
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const stageNumber = computed(() => (stage.value === 'landed' || stage.value === 'linked' ? '02' : '01'))

/** Captions fade in and out over a short stretch at each end of their range of the flight. */
function sync() {
  if (!exp) return
  const v = exp.progress.run
  for (const c of captions) {
    const edge = 0.035
    const o = Math.min(c.from === 0 ? 1 : (v - c.from) / edge, (c.to - v) / edge)
    c.el.style.opacity = String(Math.max(0, Math.min(1, o)))
    c.el.style.visibility = o > 0 ? 'visible' : 'hidden'
  }
}

function scrambleTo(text: string) {
  const glyphs = '01<>/\\#_アカサタナ'
  let step = 0
  clearInterval(scrambleTimer)
  scrambleTimer = window.setInterval(() => {
    step++
    label.value = [...text].map((ch, i) => (i < step / 2 || ch === ' ' ? ch : glyphs[Math.floor(Math.random() * glyphs.length)])).join('')
    if (step / 2 >= text.length) clearInterval(scrambleTimer)
  }, 28)
}
/** Becomes true once she has been materialised; the dock of reactions shows from then on. */
const solidSeen = ref(false)
watch(stage, (s) => {
  if (s === 'linked') solidSeen.value = true
  scrambleTo(LABELS[s].toUpperCase())
  if (!exp) return
  exp.hoverable = s === 'landed'
  exp.steady(s === 'linked')
})

/** Enter shows the city for a moment, then the camera flies itself to her roof. */
async function enter(withSound: boolean) {
  stage.value = 'idle'
  holdTimer = window.setTimeout(startFlight, reduced() ? 0 : HOLD * 1000)
  if (withSound) sound.value = (await exp?.audio.start()) ?? false
}

async function toggleSound() {
  if (!exp) return
  if (sound.value) {
    exp.audio.stop()
    sound.value = false
  } else {
    sound.value = await exp.audio.start()
  }
}

function toggleLite() {
  lite.value = !lite.value
  exp?.setLite(lite.value)
}

function startFlight() {
  clearTimeout(holdTimer)
  if (stage.value !== 'idle' || !exp) return
  stage.value = 'flight'
  const p = exp.progress
  flight = gsap
    .timeline({ onUpdate: sync, onComplete: land })
    .to(p, { run: 1, duration: FLIGHT, ease: 'sine.inOut' })
    .to(p, { rina: 0.75, duration: LANDING, ease: 'power2.out' })
  if (reduced()) flight.progress(1)
}

function skip() {
  flight?.progress(1)
}

function land() {
  stage.value = 'landed'
  if (exp) exp.interactive = true
  sync()
  // She notices the camera: a wave, a line, and her parts get scanned.
  greetTimer = window.setTimeout(() => {
    exp?.react('wave')
    say('Took you long enough, choom.')
    scan(4.5)
  }, 500)
}

/** Shows a line over her head. The bubble's own animation (3.2 s) clears it; the timer is a backstop. */
function say(text: string) {
  speech.value = text
  speechKey.value++
  clearTimeout(speechTimer)
  speechTimer = window.setTimeout(() => (speech.value = ''), 8000)
}

function scan(seconds: number) {
  scanning.value = true
  clearTimeout(scanTimer)
  scanTimer = window.setTimeout(() => (scanning.value = false), seconds * 1000)
}

/** One of her reactions, from the dock, a key, or a click on her once she is solid. */
function react(id: Reaction) {
  if (!exp || (stage.value !== 'landed' && stage.value !== 'linked')) return
  const r = REACTIONS.find((x) => x.id === id)!
  exp.react(id)
  say(r.lines[Math.floor(Math.random() * r.lines.length)]!)
  if (id === 'glitch') pulse.value++
}

function replay() {
  if (!exp || !flight) return
  closeFile()
  clearTimeout(greetTimer)
  speech.value = ''
  scanning.value = false
  solidSeen.value = false
  exp.interactive = false
  exp.dissolve()
  gsap.to(exp.view, { orbit: 0, duration: 0.3 })
  hover.value = false
  stage.value = 'flight'
  flight.restart()
}

/**
 * Clicking her. The first time: the heart pose, she materialises, and her file opens around
 * her. Once she is solid, each click plays her next reaction instead.
 */
function pick() {
  pulse.value++
  if (!exp) return
  if (exp.rinaSolid) {
    if (exp.rinaBusy) return
    const order: Reaction[] = ['wave', 'flex', 'glitch', 'heart', 'look']
    react(order[reactionTurn++ % order.length]!)
    return
  }
  exp.heart()
  say('Signal locked. Hi.')
  openFile()
}

function openFile() {
  if (stage.value !== 'landed' || !exp) return
  stage.value = 'linked'
  gsap.to(exp.view, { link: 1, orbit: 0, duration: 0.9, ease: 'power2.out' })
}

/** The label beside her: materialises her the first time, and always opens her file. */
function connect() {
  if (exp && !exp.rinaSolid) {
    exp.heart()
    say('Signal locked. Hi.')
  }
  pulse.value++
  openFile()
}

function closeFile() {
  if (stage.value !== 'linked' || !exp) return
  stage.value = 'landed'
  gsap.to(exp.view, { link: 0, zoom: 0, duration: 0.8, ease: 'power2.inOut' })
}

/** Moves the camera in on one part of her, or back out when the part is deselected. */
function focus(part: Part | null) {
  if (!exp) return
  const v = exp.view
  if (!part) {
    gsap.to(v, { zoom: 0, duration: 0.8, ease: 'power2.inOut' })
    return
  }
  exp.settle()
  gsap.to(v, { zoom: 1, partY: part.y, partX: part.x, partDist: part.dist, orbit: 0, duration: 0.9, ease: 'power2.inOut' })
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeFile()
  const r = REACTIONS.find((x) => x.key === e.key)
  if (r && stage.value === 'landed' && exp?.rinaSolid) react(r.id)
}

onMounted(async () => {
  // The page itself never scrolls: the flight runs by itself once the visitor enters.
  document.documentElement.classList.add('is-locked')
  const tick = () => (clock.value = new Date().toLocaleTimeString([], { hour12: false }))
  tick()
  clockTimer = window.setInterval(tick, 1000)
  touch.value = matchMedia('(pointer: coarse)').matches

  // Phones and weak machines start in lite mode; the HUD toggle overrides it.
  const nav = navigator as Navigator & { deviceMemory?: number }
  lite.value = matchMedia('(max-width: 760px), (pointer: coarse)').matches || (nav.deviceMemory ?? 8) <= 4
  // ?lite=1 or ?lite=0 in the address forces a mode, for testing.
  const forced = new URLSearchParams(location.search).get('lite')
  if (forced !== null) lite.value = forced !== '0'

  captions = [...root.value!.querySelectorAll<HTMLElement>('[data-from]')].map((el) => ({
    el,
    from: Number(el.dataset.from),
    to: Number(el.dataset.to),
  }))
  sync()

  addEventListener('keydown', onKey)

  // Let the boot screen paint first, then fetch and start the 3D engine (three.js lives in
  // its own chunk). Building the city compiles shaders, which would otherwise hold the
  // first frame and leave the screen black.
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))
  try {
    const { Experience } = await import('../experience/Experience')
    exp = new Experience({
      canvas: canvas.value!,
      root: root.value!,
      lite: lite.value,
      onReady: () => (ready.value = true),
      onHover: (over) => (hover.value = over),
      onPick: pick,
    })
    // A handle for poking at the scene from the browser console while developing.
    if (import.meta.dev) Object.assign(window, { __exp: exp })
  } catch {
    failed.value = true
    ready.value = true
  }
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(scrambleTimer)
  clearTimeout(holdTimer)
  clearTimeout(speechTimer)
  clearTimeout(scanTimer)
  clearTimeout(greetTimer)
  flight?.kill()
  removeEventListener('keydown', onKey)
  exp?.dispose()
  document.documentElement.classList.remove('is-locked')
})
</script>

<template>
  <div ref="root" class="site" :class="[`is-${stage}`, { 'is-booted': stage !== 'boot', 'is-lite': lite, 'is-solid': solidSeen }]">
    <canvas ref="canvas" class="stage" aria-hidden="true" />
    <div class="scanlines" aria-hidden="true" />

    <BootScreen v-if="stage === 'boot'" :ready="ready" :failed="failed" @enter="enter" />

    <!-- HUD: her optic overlay is the site's interface. -->
    <header class="hud hud--top">
      <div class="hud__id">
        <strong>RINA MANDA</strong>
        <span>DISTRICT 7 / UNIT RM-01</span>
      </div>
      <div class="hud__tools">
        <span class="hud__stat"><i class="beat" />{{ BPM }} BPM</span>
        <span class="hud__stat hud__stat--clock">LOCAL {{ clock }}</span>
        <button v-if="stage === 'landed'" id="replay" class="chip" type="button" @click="replay">Replay flight</button>
        <button id="toggle-sound" class="chip" type="button" :aria-pressed="sound" @click="toggleSound">
          Sound {{ sound ? 'on' : 'off' }}
        </button>
        <button id="toggle-lite" class="chip" type="button" :aria-pressed="lite" @click="toggleLite">
          Lite {{ lite ? 'on' : 'off' }}
        </button>
      </div>
    </header>

    <footer class="hud hud--bottom">
      <p class="hud__chapter"><span>{{ stageNumber }}</span>{{ label }}</p>
      <button v-if="stage === 'flight'" id="skip" class="btn" type="button" @click="skip">Skip flight</button>
    </footer>

    <main class="overlay">
      <!-- The flight: captions keyed to how far along it is. -->
      <div class="caption caption--left" data-from="0.16" data-to="0.33">
        <p class="mono">SIGNAL RM-01 / RAIN / 2.4 KM</p>
        <h2>District 7 never closes</h2>
      </div>
      <div class="caption caption--right" data-from="0.46" data-to="0.64">
        <p class="mono">STREET LEVEL</p>
        <h2>Lit, loud and wet</h2>
      </div>
      <div class="caption caption--left" data-from="0.78" data-to="0.97">
        <p class="mono">ROOFTOP AHEAD / SIGNAL LOCK</p>
        <h2>She is already there</h2>
      </div>

      <!-- Landed: brackets and a label around her show she can be clicked. -->
      <div v-if="stage === 'landed'" class="lock" :class="{ 'is-over': hover }">
        <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
        <button id="connect" class="lock__label" type="button" @click="connect">
          <span>RM-01 / RINA MANDA</span>
          <strong>{{ touch ? 'Tap to connect' : 'Click to connect' }}</strong>
        </button>
      </div>
      <i v-if="pulse" :key="pulse" class="pulse" aria-hidden="true" />

      <!-- Her scan: labels on her optic, chrome arm, ink and knees, pinned to the model. -->
      <div class="scan" :class="{ 'is-on': showScan }" aria-hidden="true">
        <div v-for="c in CALLOUTS" :key="c.id" class="callout" :class="`callout--${c.side}`" :style="{ left: `var(--${c.id}-x)`, top: `var(--${c.id}-y)` }">
          <i class="callout__dot" /><i class="callout__line" />
          <p class="callout__text"><strong>{{ c.title }}</strong><span>{{ c.note }}</span></p>
        </div>
      </div>

      <!-- What she says, over her head. -->
      <p v-if="speech && (stage === 'landed' || stage === 'linked')" :key="speechKey" class="speech" role="status" @animationend="speech = ''">{{ speech }}</p>

      <!-- Reactions: once she is solid, the dock (or keys 1 to 5, or clicking her) plays one. -->
      <div v-if="stage === 'landed'" class="dock">
        <p class="mono dock__hint">{{ solidSeen ? (touch ? 'Tap her, or pick one' : 'Click her, press 1 to 5, or pick one') : 'Drag to look around her' }}</p>
        <div v-if="solidSeen" class="dock__row">
          <button v-for="r in REACTIONS" :key="r.id" class="chip dock__btn" type="button" @click="react(r.id)">
            <kbd v-if="!touch">{{ r.key }}</kbd>{{ r.label }}
          </button>
          <button class="chip dock__btn dock__btn--file" type="button" @click="openFile">Her file</button>
        </div>
      </div>

      <RinaPanels :open="stage === 'linked'" @close="closeFile" @focus="focus" />
    </main>
  </div>
</template>
