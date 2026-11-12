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
  optic: 'Optic',
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
const chapter = ref<ChapterId>('optic')
const label = ref('OPTIC')
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
  const next: ChapterId = p.optic < 0.999 ? 'optic' : p.run < 1 ? 'run' : p.ware < 0.5 ? 'rina' : p.delivered < 0.5 ? 'ware' : 'delivered'
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
  const y = el.getBoundingClientRect().top + scrollY + (id === 'optic' || id === 'ware' || id === 'delivered' ? 0 : innerHeight * 0.4)
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
  bind('optic', 'top top', 'bottom top')
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
    <div class="lid lid--top" aria-hidden="true" />
    <div class="lid lid--bottom" aria-hidden="true" />
    <div class="scanlines" aria-hidden="true" />

    <BootScreen v-if="!booted" :ready="ready" :failed="failed" @enter="enter" />

    <!-- HUD: her optic overlay is the site's interface. -->
    <header class="hud hud--top">
      <div class="hud__id">
        <strong>MANDA EXPRESS</strong>
        <span>OPTIC FEED / UNIT RM-01</span>
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
      <section :ref="(el) => (sections.optic = el as HTMLElement)" class="chapter chapter--optic">
        <div class="pin">
          <div class="reticle" data-ch="optic" data-from="0.03" data-to="0.62" aria-hidden="true">
            <i /><i /><i /><i />
            <span>TARGET ACQUIRED</span>
            <span>{{ clock }} LOCAL</span>
          </div>
          <div class="caption caption--hero" data-ch="optic" data-from="0" data-to="0.3">
            <p class="mono">OPTIC SYSTEM ONLINE / APERTURE CALIBRATED</p>
            <h1>Rina Manda</h1>
            <p class="lede">Cyborg street courier. One delivery left tonight, and you are looking through the eye that is carrying it.</p>
            <p class="mono hint">Scroll to pull back through the lens</p>
          </div>
          <div class="caption caption--low" data-ch="optic" data-from="0.4" data-to="0.82">
            <p class="mono">LEFT OPTIC / TITANIUM IRIS / GOLD BEZEL</p>
            <h2>The eye is built in code</h2>
            <p>Every ring, blade and piston is a separate part. It follows your cursor and ticks on the beat.</p>
          </div>
        </div>
      </section>

      <section :ref="(el) => (sections.run = el as HTMLElement)" class="chapter chapter--run">
        <div class="pin">
          <div class="caption caption--left" data-ch="run" data-from="0.05" data-to="0.3">
            <p class="mono">PICKUP CONFIRMED / DISTRICT 7 / RAIN</p>
            <h2>The run</h2>
            <p>2.4 km to the drop. She takes the roofs, you take the street.</p>
          </div>
          <div class="caption caption--right" data-ch="run" data-from="0.4" data-to="0.66">
            <p class="mono">STREET LEVEL</p>
            <h2>A city made of one box</h2>
            <p>Towers, windows, signs and rain are generated, so there is nothing to download. The ink lines and halftone are one pass over all of it.</p>
          </div>
          <div class="caption caption--left" data-ch="run" data-from="0.76" data-to="0.97">
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
            <p class="tag">Placeholder: her 2D art on a card. The rigged 3D model takes this spot.</p>
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
