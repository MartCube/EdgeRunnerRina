<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Experience } from '../experience/Experience'
import { BPM } from '../experience/audio'
import { CHAPTERS, type ChapterId, type Progress } from '../experience/types'
import BootScreen from './BootScreen.vue'
import CyberwarePanel from './CyberwarePanel.vue'
import DeliveryReceipt from './DeliveryReceipt.vue'

const WAYPOINTS: Record<ChapterId, string> = {
  run: 'The run',
  rina: 'Rina',
  ware: 'Cyberware',
  delivered: 'Delivered',
}

const root = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const sections = reactive<Partial<Record<ChapterId, HTMLElement>>>({})
const booted = ref(false)
const ready = ref(false)
const failed = ref(false)
const sound = ref(false)
const lite = ref(false)
const chapter = ref<ChapterId>('run')
const label = ref('THE RUN')
const route = ref(0)
const clock = ref('')
const signed = ref(false)

let exp: Experience | undefined
let triggers: ScrollTrigger[] = []
let captions: { el: HTMLElement; ch: keyof Progress; from: number; to: number }[] = []
let clockTimer = 0
let scrambleTimer = 0

const chapterNumber = computed(() => String(CHAPTERS.indexOf(chapter.value) + 1).padStart(2, '0'))

function sync() {
  if (!exp) return
  const p = exp.progress
  const next: ChapterId = p.run < 1 ? 'run' : p.ware < 0.5 ? 'rina' : p.delivered < 0.5 ? 'ware' : 'delivered'
  if (next !== chapter.value) chapter.value = next
  const max = document.documentElement.scrollHeight - innerHeight
  route.value = max > 0 ? Math.round((scrollY / max) * 100) : 0
  root.value?.style.setProperty('--route', String(route.value / 100))
  // Captions fade in and out over a short stretch at each end of their range.
  for (const c of captions) {
    const v = p[c.ch]
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
watch(chapter, (c) => scrambleTo(WAYPOINTS[c].toUpperCase()))

async function enter(withSound: boolean) {
  booted.value = true
  document.documentElement.classList.remove('is-locked')
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

function goTo(id: ChapterId) {
  const el = sections[id]
  if (!el) return
  // The last two chapters are read at their top edge; the rest start a little way in.
  const y = el.getBoundingClientRect().top + scrollY + (id === 'rina' ? innerHeight * 0.4 : 0)
  scrollTo({ top: y, behavior: 'smooth' })
}

onMounted(() => {
  document.documentElement.classList.add('is-locked')
  const tick = () => (clock.value = new Date().toLocaleTimeString([], { hour12: false }))
  tick()
  clockTimer = window.setInterval(tick, 1000)

  // Phones and weak machines start in lite mode; the HUD toggle overrides it.
  const nav = navigator as Navigator & { deviceMemory?: number }
  lite.value = matchMedia('(max-width: 760px), (pointer: coarse)').matches || (nav.deviceMemory ?? 8) <= 4
  // ?lite=1 or ?lite=0 in the address forces a mode, for testing.
  const forced = new URLSearchParams(location.search).get('lite')
  if (forced !== null) lite.value = forced !== '0'

  try {
    exp = new Experience({ canvas: canvas.value!, root: root.value!, lite: lite.value, onReady: () => (ready.value = true) })
  } catch {
    failed.value = true
    ready.value = true
  }

  gsap.registerPlugin(ScrollTrigger)
  const bind = (id: ChapterId, start: string, end: string) => {
    triggers.push(
      ScrollTrigger.create({
        trigger: sections[id],
        start,
        end,
        onUpdate: (self) => {
          if (exp) exp.progress[id] = self.progress
          sync()
        },
        onRefresh: (self) => {
          if (exp) exp.progress[id] = self.progress
          sync()
        },
      }),
    )
  }
  bind('run', 'top top', 'bottom top')
  bind('rina', 'top top', 'bottom top')
  bind('ware', 'top bottom', 'top top')
  bind('delivered', 'top bottom', 'top top')

  captions = [...root.value!.querySelectorAll<HTMLElement>('[data-ch]')].map((el) => ({
    el,
    ch: el.dataset.ch as keyof Progress,
    from: Number(el.dataset.from),
    to: Number(el.dataset.to),
  }))
  sync()
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(scrambleTimer)
  triggers.forEach((t) => t.kill())
  exp?.dispose()
  document.documentElement.classList.remove('is-locked')
})
</script>

<template>
  <div ref="root" class="site" :class="{ 'is-booted': booted, 'is-lite': lite }">
    <canvas ref="canvas" class="stage" aria-hidden="true" />
    <div class="scrim" aria-hidden="true" />
    <div class="scanlines" aria-hidden="true" />

    <BootScreen v-if="!booted" :ready="ready" :failed="failed" @enter="enter" />

    <!-- HUD: her optic overlay is the site's interface. -->
    <header class="hud hud--top">
      <div class="hud__id">
        <strong>MANDA EXPRESS</strong>
        <span>DISTRICT 7 / UNIT RM-01</span>
      </div>
      <div class="hud__tools">
        <span class="hud__stat"><i class="beat" />{{ BPM }} BPM</span>
        <span class="hud__stat hud__stat--clock">LOCAL {{ clock }}</span>
        <button id="toggle-sound" class="chip" type="button" :aria-pressed="sound" @click="toggleSound">
          Sound {{ sound ? 'on' : 'off' }}
        </button>
        <button id="toggle-lite" class="chip" type="button" :aria-pressed="lite" @click="toggleLite">
          Lite {{ lite ? 'on' : 'off' }}
        </button>
      </div>
    </header>

    <nav class="route" aria-label="Chapters">
      <div class="route__bar"><i /></div>
      <ol>
        <li v-for="id in CHAPTERS" :key="id" :class="{ 'is-on': id === chapter }">
          <button type="button" @click="goTo(id)">{{ WAYPOINTS[id] }}</button>
        </li>
      </ol>
    </nav>

    <footer class="hud hud--bottom">
      <p class="hud__chapter"><span>{{ chapterNumber }}</span>{{ label }}</p>
      <p class="hud__route">ROUTE {{ String(route).padStart(3, '0') }}%</p>
    </footer>

    <main>
      <section :ref="(el) => (sections.run = el as HTMLElement)" class="chapter chapter--run">
        <div class="pin">
          <div class="caption caption--hero" data-ch="run" data-from="0" data-to="0.1">
            <p class="mono">MANDA EXPRESS / DISTRICT 7 / 02:14</p>
            <h1>Rina Manda</h1>
            <p class="lede">Cyborg street courier. One delivery left tonight, and it has your name on it.</p>
            <p class="mono hint">Scroll to start the run</p>
          </div>
          <div class="caption caption--left" data-ch="run" data-from="0.15" data-to="0.33">
            <p class="mono">PICKUP CONFIRMED / RAIN / 2.4 KM TO DROP</p>
            <h2>The run</h2>
            <p>She takes the roofs. You take the street.</p>
          </div>
          <div class="caption caption--right" data-ch="run" data-from="0.44" data-to="0.64">
            <p class="mono">STREET LEVEL</p>
            <h2>District 7 never closes</h2>
            <p>Noodle bars, chrome clinics and pawn shops, all of it lit and all of it wet.</p>
          </div>
          <div class="caption caption--left" data-ch="run" data-from="0.78" data-to="0.97">
            <p class="mono">ROOFTOP AHEAD / SIGNAL LOCK</p>
            <h2>She is already there</h2>
          </div>
        </div>
      </section>

      <section :ref="(el) => (sections.rina = el as HTMLElement)" class="chapter chapter--rina">
        <div class="pin">
          <div class="caption caption--left caption--dossier" data-ch="rina" data-from="0.04" data-to="0.72">
            <p class="mono">COURIER FILE / RM-01</p>
            <h2>Rina Manda</h2>
            <dl>
              <div><dt>Role</dt><dd>Street courier, mid-20s</dd></div>
              <div><dt>Optics</dt><dd>Ice-blue right eye, cybernetic left</dd></div>
              <div><dt>Chrome</dt><dd>Right arm, both knees</dd></div>
              <div><dt>Marks</dt><dd>Sakura circuit tattoo, hip barcode, three scars</dd></div>
            </dl>
            <p class="mono hint">Point at her. Tap on a phone.</p>
          </div>
        </div>
      </section>

      <section :ref="(el) => (sections.ware = el as HTMLElement)" class="chapter chapter--ware">
        <CyberwarePanel />
      </section>

      <section :ref="(el) => (sections.delivered = el as HTMLElement)" class="chapter chapter--delivered">
        <DeliveryReceipt :clock="clock" :signed="signed" @sign="signed = true" />
      </section>
    </main>
  </div>
</template>
