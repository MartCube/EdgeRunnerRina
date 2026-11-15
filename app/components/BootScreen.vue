<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ ready: boolean; failed: boolean }>()
defineEmits<{ enter: [withSound: boolean] }>()

const LINES = [
  'MANDA EXPRESS COURIER OS 3.7',
  'LEFT OPTIC ............ ONLINE',
  'WEATHER ............... RAIN, 9 C',
  'RIGHT ARM / KNEES ..... OK',
  'ROUTE ................. DISTRICT 7 > ROOFTOP',
  'SIGNAL ................ RM-01 FOUND',
]
const shown = ref(0)
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => {
    if (shown.value < LINES.length) shown.value++
    else clearInterval(timer)
  }, 230)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="boot" role="dialog" aria-label="Start">
    <div class="boot__box">
      <p class="boot__title">Rina Manda</p>
      <ul class="boot__log">
        <li v-for="(line, i) in LINES" :key="line" :class="{ 'is-in': i < shown }">{{ line }}</li>
      </ul>
      <p v-if="failed" class="boot__warn">This browser could not start 3D. The page still works, without the scenes.</p>
      <div class="boot__actions">
        <button id="jack-in" class="btn btn--main" type="button" :disabled="!ready || shown < LINES.length" @click="$emit('enter', true)">
          {{ ready && shown >= LINES.length ? 'Jack in' : 'Loading' }}
        </button>
        <button id="enter-silent" class="btn" type="button" :disabled="!ready" @click="$emit('enter', false)">Enter without sound</button>
      </div>
      <p class="boot__note">Jack in starts the music: D Minor Drive, 123 BPM.</p>
    </div>
  </div>
</template>
