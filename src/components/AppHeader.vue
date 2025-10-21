<template>
  <header class="app-header" :class="{ 'app-header--hidden': isHidden }" role="banner">
    <router-link to="/" class="brand" aria-label="PKR Home">
      <span class="brand-text" aria-hidden="true">PKR</span>
    </router-link>
  </header>
</template>

<script setup>
import { RouterLink } from 'vue-router';
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';

const isHidden = ref(false);
let lastY = 0;
let ticking = false;
const HIDE_THRESHOLD = 14; // px scrolled down to hide
const SHOW_THRESHOLD = 10; // px scrolled up to show

function handleScroll(target) {
  const currentY = target.scrollTop ?? window.scrollY;
  const delta = currentY - lastY;
  // Avoid negative bounce at top
  if (currentY < 0) {
    lastY = 0;
    return;
  }
  // Hide only after meaningful down scroll
  if (!isHidden.value && delta > HIDE_THRESHOLD && currentY > 24) {
    isHidden.value = true;
  }
  // Show only after meaningful up scroll
  if (isHidden.value && delta < -SHOW_THRESHOLD) {
    isHidden.value = false;
  }
  lastY = currentY;
}

function onScroll(e) {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const target = e.target;
    handleScroll(target);
    ticking = false;
  });
}

onMounted(() => {
  // Prefer the app's main scroll container to avoid fighting with body scroll
  const main = document.querySelector('.main-content');
  const target = main || window;
  lastY = main ? main.scrollTop : window.scrollY;
  target.addEventListener('scroll', onScroll, { passive: true });
  // In case of route change resetting scroll position, ensure header shows
  isHidden.value = false;
});

  // Reflect hidden state on body to allow layout adjustments
  watch(isHidden, (val) => {
    document.body.classList.toggle('header-hidden', val);
  }, { immediate: true });

onBeforeUnmount(() => {
  const main = document.querySelector('.main-content');
  const target = main || window;
  target.removeEventListener('scroll', onScroll);
    document.body.classList.remove('header-hidden');
});
</script>

<style scoped>
.app-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 56px;
    background: #111111;
    border-bottom: 1px solid #2a2a2a;
    transition: transform 180ms ease-in-out;
    will-change: transform;
}
.app-header--hidden { transform: translateY(-100%); }
.brand {
    text-decoration: none;
}
.brand-text {
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 20px;
    line-height: 1;
    background: linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
@media (min-width: 768px) {
  .brand-text { font-size: 22px; }
}
</style>

