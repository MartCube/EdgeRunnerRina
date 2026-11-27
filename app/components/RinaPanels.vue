<script lang="ts">
/** A part of Rina the camera can move in on: height as a share of hers, sideways offset, distance. */
export interface Part {
  id: string
  name: string
  img: string
  spec: string[]
  story: string
  y: number
  x: number
  dist: number
}

/** The panels of her file, one shown at a time. */
export type Section = 'file' | 'parts' | 'sheets'
</script>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ open: boolean; section: Section }>()
const emit = defineEmits<{ close: []; focus: [part: Part | null]; 'update:section': [section: Section] }>()

// Draft copy, taken from the character bible. The one-line stories are placeholders to rewrite.
// She faces the camera, so her right arm is on the left of the screen (negative x).
const PARTS: Part[] = [
  {
    id: 'optic', name: 'Left optic', img: 'img/ware-optic.webp', y: 0.92, x: 0.1, dist: 3.4,
    spec: ['Gold ring, cyan emitter', 'Circuit lines from eye to temple', 'Three LED dots under each eye'],
    story: 'She reads a street the way other people read a menu.',
  },
  {
    id: 'arm', name: 'Right arm', img: 'img/ware-arm.webp', y: 0.62, x: -1.6, dist: 5,
    spec: ['Polished chrome from the upper arm down', 'Dark elbow hub, thick gold ring', 'Hot-pink pistons, gold knuckle caps'],
    story: 'The stitched scar at the shoulder is where skin stops and chrome starts.',
  },
  {
    id: 'knees', name: 'Knees', img: 'img/ware-knee.webp', y: 0.3, x: 0, dist: 5,
    spec: ['Pointed chrome caps, both legs', 'Gold rings on a dark hinge', 'Pink pistons take the landings'],
    story: 'Rooftop drops are faster than stairs.',
  },
  {
    id: 'ink', name: 'Ink', img: 'img/ware-sakura.webp', y: 0.78, x: 1.3, dist: 4,
    spec: ['Sakura branch, left shoulder', 'Stems turn into circuit lines', 'Two hot-pink petals, barcode on the right hip'],
    story: 'She got the branch the week the arm went in.',
  },
  {
    id: 'scars', name: 'Scars', img: 'img/ware-scar.webp', y: 0.64, x: 0.3, dist: 4.2,
    spec: ['Blade scar, left side of the stomach', 'Collarbone scar with stitch marks', 'Surgery scar at the arm'],
    story: 'Not every delivery went to plan.',
  },
]

const SHEETS = [
  { id: 'turnaround', name: 'Turnaround' },
  { id: 'head', name: 'Head' },
  { id: 'torso', name: 'Torso' },
  { id: 'arm', name: 'Cyber arm' },
  { id: 'legs', name: 'Legs' },
]

const TABS = [
  { id: 'file', name: 'File' },
  { id: 'parts', name: 'Cyberware' },
  { id: 'sheets', name: 'Sheets' },
] as const

const part = ref<Part | null>(null)
const sheet = ref(-1)
const zoomed = ref(false)

function pickPart(p: Part) {
  part.value = part.value?.id === p.id ? null : p
  emit('focus', part.value)
}

function openSheet(i: number) {
  sheet.value = (i + SHEETS.length) % SHEETS.length
  zoomed.value = false
}

watch(
  () => props.open,
  (open) => {
    if (open) return
    part.value = null
    sheet.value = -1
  },
)
</script>

<template>
  <!-- One panel at a time, picked from the dock (or the tabs on a phone). -->
  <div class="file" :class="[{ 'is-open': open }, `tab-${section}`]" :inert="!open">
    <div class="file__bar">
      <p class="mono">LINK ESTABLISHED / RM-01</p>
      <div class="file__tabs" role="tablist" aria-label="Rina's file">
        <button v-for="t in TABS" :key="t.id" class="chip" type="button" role="tab" :aria-selected="section === t.id" @click="emit('update:section', t.id)">{{ t.name }}</button>
      </div>
      <button id="close-file" class="chip" type="button" @click="emit('close')">Close</button>
    </div>

    <section class="panel panel--file" aria-label="Courier file">
      <p class="mono">COURIER FILE / RM-01</p>
      <h2>Rina Manda</h2>
      <dl>
        <div><dt>Role</dt><dd>Cyborg street courier, mid-20s</dd></div>
        <div><dt>Optics</dt><dd>Ice-blue right eye, cybernetic left</dd></div>
        <div><dt>Chrome</dt><dd>Right arm, both knees</dd></div>
        <div><dt>Marks</dt><dd>Sakura circuit tattoo, hip barcode, three scars</dd></div>
      </dl>
      <p class="panel__story">She takes the roofs because the streets are slow. District 7 pays by the minute, and nobody in it is faster than Rina.</p>
      <p class="tag">Placeholder story. Rewrite in her voice.</p>
    </section>

    <section class="panel panel--parts" aria-label="Cyberware, ink and scars">
      <p class="mono mono--pink">CYBERWARE / INK / SCARS</p>
      <ul>
        <li v-for="p in PARTS" :key="p.id">
          <button class="part" type="button" :aria-expanded="part?.id === p.id" @click="pickPart(p)">
            <img :src="p.img" alt="" width="64" height="64" loading="lazy">
            <span class="part__name">{{ p.name }}</span>
            <span class="part__lead">{{ p.spec[0] }}</span>
          </button>
          <div v-if="part?.id === p.id" class="part__more">
            <ul>
              <li v-for="line in p.spec.slice(1)" :key="line">{{ line }}</li>
            </ul>
            <p class="panel__story">{{ p.story }}</p>
          </div>
        </li>
      </ul>
      <p class="mono hint">Pick a part: the camera moves in on it</p>
    </section>

    <section class="panel panel--sheets" aria-label="Character sheets">
      <p class="mono mono--gold">CHARACTER SHEETS</p>
      <ul>
        <li v-for="(s, i) in SHEETS" :key="s.id">
          <button class="sheet" type="button" @click="openSheet(i)">
            <img :src="`img/sheets/${s.id}-thumb.webp`" :alt="`${s.name} sheet`" loading="lazy">
            <span>{{ s.name }}</span>
          </button>
        </li>
      </ul>
    </section>

    <Teleport to="body">
    <div v-if="sheet >= 0" class="viewer" role="dialog" aria-modal="true" :aria-label="`${SHEETS[sheet]!.name} sheet`" @keydown.esc.stop="sheet = -1">
      <div class="viewer__bar">
        <p class="mono mono--gold">SHEET {{ sheet + 1 }} / {{ SHEETS.length }} / {{ SHEETS[sheet]!.name }}</p>
        <div class="viewer__tools">
          <button class="chip" type="button" @click="openSheet(sheet - 1)">Previous</button>
          <button class="chip" type="button" @click="openSheet(sheet + 1)">Next</button>
          <button class="chip" type="button" :aria-pressed="zoomed" @click="zoomed = !zoomed">Zoom</button>
          <button id="close-sheet" class="chip" type="button" @click="sheet = -1">Close</button>
        </div>
      </div>
      <div class="viewer__frame" :class="{ 'is-zoomed': zoomed }">
        <img :key="sheet" :src="`img/sheets/${SHEETS[sheet]!.id}.webp`" :alt="`${SHEETS[sheet]!.name} sheet`" @click="zoomed = !zoomed">
      </div>
    </div>
    </Teleport>
  </div>
</template>
