<script setup lang="ts">
import { ref } from 'vue'

// Draft copy, taken from the character bible. The one-line stories are placeholders to rewrite.
const PARTS = [
  {
    id: 'optic', name: 'Left optic', img: 'img/ware-optic.webp',
    spec: ['Gold ring, cyan emitter', 'Circuit lines from eye to temple', 'Three LED dots under each eye'],
    story: 'She reads a street the way other people read a menu.',
  },
  {
    id: 'arm', name: 'Right arm', img: 'img/ware-arm.webp',
    spec: ['Polished chrome from the upper arm down', 'Dark elbow hub, thick gold ring', 'Hot-pink pistons, gold knuckle caps'],
    story: 'The stitched scar at the shoulder is where skin stops and chrome starts.',
  },
  {
    id: 'knees', name: 'Knees', img: 'img/ware-knee.webp',
    spec: ['Pointed chrome caps, both legs', 'Gold rings on a dark hinge', 'Pink pistons take the landings'],
    story: 'Rooftop drops are faster than stairs.',
  },
  {
    id: 'ink', name: 'Ink', img: 'img/ware-sakura.webp',
    spec: ['Sakura branch, left shoulder', 'Stems turn into circuit lines', 'Two hot-pink petals, barcode on the right hip'],
    story: 'The petals drift between chapters of this site.',
  },
  {
    id: 'scars', name: 'Scars', img: 'img/ware-scar.webp',
    spec: ['Blade scar, left side of the stomach', 'Collarbone scar with stitch marks', 'Surgery scar at the arm'],
    story: 'Not every delivery went to plan.',
  },
]
const active = ref(0)
</script>

<template>
  <div class="ware">
    <p class="mono">CYBERWARE / SELECT A PART</p>
    <h2>What she is made of</h2>
    <div class="ware__tabs" role="tablist">
      <button
        v-for="(p, i) in PARTS" :id="`ware-tab-${p.id}`" :key="p.id" class="chip" type="button" role="tab"
        :aria-selected="i === active" @click="active = i"
      >{{ p.name }}</button>
    </div>
    <article class="ware__card">
      <figure><img :src="PARTS[active]!.img" :alt="`${PARTS[active]!.name} design sheet detail`" /></figure>
      <div class="ware__text">
        <h3>{{ PARTS[active]!.name }}</h3>
        <ul><li v-for="line in PARTS[active]!.spec" :key="line">{{ line }}</li></ul>
        <p class="ware__story">{{ PARTS[active]!.story }}</p>
        <p class="tag">Placeholder: sheet art. Blender close-ups of each part can go here.</p>
      </div>
    </article>
  </div>
</template>
