<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import type { Experience } from '../experience/Experience'
import { BPM } from '../experience/audio'
import type { Stage } from '../experience/types'
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
watch(stage, (s) => {
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
}

function replay() {
  if (!exp || !flight) return
  closeFile()
  exp.interactive = false
  exp.dissolve()
  gsap.to(exp.view, { orbit: 0, duration: 0.3 })
  hover.value = false
  stage.value = 'flight'
  flight.restart()
}

/** Clicking her: the heart pose, a pulse, and her file opens around her. */
function pick() {
  pulse.value++
  if (stage.value !== 'landed' || !exp) return
  stage.value = 'linked'
  gsap.to(exp.view, { link: 1, orbit: 0, duration: 0.9, ease: 'power2.out' })
}

/** The label beside her does the same as clicking her, for keyboards and anyone who misses her. */
function connect() {
  exp?.heart()
  pick()
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
  flight?.kill()
  removeEventListener('keydown', onKey)
  exp?.dispose()
  document.documentElement.classList.remove('is-locked')
})
</script>

<template>
  <div ref="root" class="site" :class="[`is-${stage}`, { 'is-booted': stage !== 'boot', 'is-lite': lite }]">
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
      <p v-if="stage === 'landed'" class="mono drag-hint">Drag to look around her</p>

      <RinaPanels :open="stage === 'linked'" @close="closeFile" @focus="focus" />
    </main>
  </div>
</template>
