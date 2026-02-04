<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import BaseLayout from '@components/common/BaseLayout.vue';

const headingText = 'Do you miss the album listening experience?';
const lines = ref([]);
const h2Ref = ref(null);
const measureRef = ref(null);

function measureLines() {
  if (!h2Ref.value || !measureRef.value) return;
  const words = headingText.split(/\s+/);
  const measureEl = measureRef.value;
  const width = h2Ref.value.offsetWidth;
  measureEl.style.width = `${width}px`;
  measureEl.innerHTML = words.map((w) => `<span class="word">${w}</span>`).join(' ');
  const wordSpans = measureEl.querySelectorAll('.word');
  if (wordSpans.length === 0) return;
  const lineGroups = [];
  let currentLine = [];
  let lastTop = null;
  wordSpans.forEach((span, i) => {
    const top = span.offsetTop;
    if (lastTop !== null && top > lastTop) {
      lineGroups.push(currentLine);
      currentLine = [];
    }
    currentLine.push(words[i]);
    lastTop = top;
  });
  if (currentLine.length) lineGroups.push(currentLine);
  lines.value = lineGroups;
}

onMounted(() => {
  nextTick(() => measureLines());
  window.addEventListener('resize', measureLines);
});
onUnmounted(() => {
  window.removeEventListener('resize', measureLines);
});
</script>

<template>
  <BaseLayout>
    <section class="text-delft-blue/90 space-y-4">
      <div ref="h2Ref" class="h2-wrapper hidden">
        <h2 class="h2 highlight-heading">
          <template v-if="lines.length">
            <template v-for="(lineWords, lineIndex) in lines" :key="lineIndex">
              <span class="highlight-line">
                <span class="highlight-line-inner">{{ lineWords.join(' ') }}</span>
              </span>
            </template>
          </template>
          <template v-else>{{ headingText }}</template>
        </h2>
        <div ref="measureRef" class="measure-heading" aria-hidden="true"></div>
      </div>
      <h2 class="text-4xl font-normal text-delft-blue">
        <span class="text-[72px] leading-[72px] -tracking-[0.04em] italic font-black text-raspberry">Tunicious</span><br><span class="text-[32px]">helps you give music the attention it deserves.</span>
      </h2>
      <p class="text-xl text-delft-blue/70 font-medium !mt-32">Coming soon…</p>
      <div class="hidden">
        <h2 class="text-[28px] font-normal text-delft-blue">
          <span class="text-[31px] font-bold">Albums move through</span> your library as you listen, revisit, and <span class="text-[31px] font-bold">spend time</span> with them.<br>Some stay close, others naturally drift away — shaped by real listening, not artificial urgency.
        </h2>
        <h2 class="text-4xl font-normal text-delft-blue">
          <span class="text-[72px] leading-[72px] -tracking-[0.04em] italic font-black text-raspberry">Tunicious</span> isn’t about finishing albums or chasing outcomes. It’s a calm, album-first framework where your habits, returns, and small decisions over time quietly shape what matters most.
        </h2>
      </div>
    </section>
  </BaseLayout>
</template>

<style scoped>
.h2-wrapper {
  position: relative;
}

.highlight-heading {
  margin: 0;
}

.highlight-line {
  display: block;
  width: fit-content;
  @apply bg-delft-blue;
  @apply text-mindero;
  padding: 0.15em 0.4em;
  margin-bottom: 0.2em;
  transform: skewX(-8deg);
}

.highlight-line:last-child {
  margin-bottom: 0;
}

.highlight-line-inner {
  display: inline-block;
  transform: skewX(8deg);
}

.measure-heading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  visibility: hidden;
  pointer-events: none;
  font-family: Chivo, sans-serif;
  font-size: 32px;
  line-height: 40px;
  font-weight: 900;
  font-style: italic;
  letter-spacing: -0.01em;
}

@media (min-width: 768px) {
  .measure-heading {
    font-size: 48px;
    line-height: 64px;
  }
}

.measure-heading .word {
  white-space: nowrap;
}
</style>
