<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { Experience } from '../experience/Experience'
import { BPM } from '../experience/audio'
import type { Stage } from '../experience/types'
import BootScreen from './BootScreen.vue'
import RinaPanels, { type Part } from './RinaPanels.vue'

/** Seconds the flight takes from the skyline to her roof, and the landing after it. */
const FLIGHT = 10.5
const LANDING = 2.6

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
let touchY = 0
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
  if (exp) exp.hoverable = s === 'landed'
})

async function enter(withSound: boolean) {
  stage.value = 'idle'
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

/** The first scroll starts the flight; from there the camera flies itself to her roof. */
function startFlight() {
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
  gsap.to(v, { zoom: 1, partY: part.y, partX: part.x, partDist: part.dist, orbit: 0, duration: 0.9, ease: 'power2.inOut' })
}

const onWheel = (e: WheelEvent) => {
  if (e.deltaY > 0) startFlight()
}
const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0]?.clientY ?? 0)
const onTouchMove = (e: TouchEvent) => {
  if (touchY - (e.touches[0]?.clientY ?? touchY) > 14) startFlight()
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeFile()
  if (stage.value !== 'idle' || e.target instanceof HTMLButtonElement) return
  if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) startFlight()
}

onMounted(() => {
  // The page itself never scrolls: one scroll gesture starts the flight.
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

  try {
    exp = new Experience({
      canvas: canvas.value!,
      root: root.value!,
      lite: lite.value,
      onReady: () => (ready.value = true),
      onHover: (over) => (hover.value = over),
      onPick: pick,
    })
  } catch {
    failed.value = true
    ready.value = true
  }

  captions = [...root.value!.querySelectorAll<HTMLElement>('[data-from]')].map((el) => ({
    el,
    from: Number(el.dataset.from),
    to: Number(el.dataset.to),
  }))
  sync()

  addEventListener('wheel', onWheel, { passive: true })
  addEventListener('touchstart', onTouchStart, { passive: true })
  addEventListener('touchmove', onTouchMove, { passive: true })
  addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(scrambleTimer)
  flight?.kill()
  removeEventListener('wheel', onWheel)
  removeEventListener('touchstart', onTouchStart)
  removeEventListener('touchmove', onTouchMove)
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
        <strong>MANDA EXPRESS</strong>
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
      <div class="caption caption--hero" data-from="0" data-to="0.08">
        <p class="mono">MANDA EXPRESS / DISTRICT 7 / 02:14</p>
        <h1>Rina Manda</h1>
        <p class="lede">Cyborg street courier. She is waiting on a rooftop across the city.</p>
        <button v-if="stage === 'idle'" id="start" class="btn btn--main" type="button" @click="startFlight">
          {{ touch ? 'Swipe up to find her' : 'Scroll to find her' }}
        </button>
      </div>
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
