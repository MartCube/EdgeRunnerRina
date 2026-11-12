<script setup lang="ts">
defineProps<{ clock: string; signed: boolean }>()
defineEmits<{ sign: [] }>()
</script>

<template>
  <div class="receipt" :class="{ 'is-signed': signed }">
    <p class="mono">MANDA EXPRESS / DELIVERY RECEIPT</p>
    <h2>{{ signed ? 'Delivered' : 'Sign for it' }}</h2>
    <dl>
      <div><dt>Parcel</dt><dd>RM-0037</dd></div>
      <div><dt>Recipient</dt><dd>You</dd></div>
      <div><dt>Route</dt><dd>District 7 to rooftop</dd></div>
      <div><dt>Courier</dt><dd>Rina Manda</dd></div>
      <div><dt>Time</dt><dd>{{ clock }}</dd></div>
      <div><dt>Status</dt><dd class="receipt__status">{{ signed ? 'Delivered' : 'Awaiting signature' }}</dd></div>
    </dl>
    <div class="receipt__code" aria-hidden="true" />
    <button id="sign-delivery" class="btn btn--main" type="button" :disabled="signed" @click="$emit('sign')">
      {{ signed ? 'Signed' : 'Sign for delivery' }}
    </button>
    <p class="receipt__credits">
      Character, direction and music by Martin. Built with Nuxt, Three.js and GSAP.
      <a href="https://github.com/MartCube" target="_blank" rel="noopener">github.com/MartCube</a>
    </p>
    <p class="tag">Placeholder: contact links and credits go here.</p>
  </div>
</template>
