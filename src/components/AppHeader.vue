<template>
  <header class="app-header" role="banner" aria-label="Application header">
    <!-- Always-visible dark shelf that sits under system/Telegram top UI -->
    <div class="status-shelf" aria-hidden="true"></div>
    <!-- Branding bar that can hide on scroll -->
    <div class="branding" :class="{ 'branding--hidden': isHidden }">
      <router-link to="/" class="brand" aria-label="PKR Home">
        <span class="brand-text" aria-hidden="true">PKR</span>
      </router-link>
    </div>
  </header>
</template>

<script setup>
import { RouterLink } from 'vue-router';
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';

// Hide-on-scroll only for the branding bar (logo row). The status shelf remains.
const isHidden = ref(false);
let lastY = 0;
let ticking = false;
const HIDE_THRESHOLD = 14;
const SHOW_THRESHOLD = 10;

function handleScroll(target) {
  const currentY = target.scrollTop ?? window.scrollY;
  const delta = currentY - lastY;
  if (currentY < 0) {
    lastY = 0;
    return;
  }
  if (!isHidden.value && delta > HIDE_THRESHOLD && currentY > 24) {
    isHidden.value = true;
  }
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
  const main = document.querySelector('.main-content');
  const target = main || window;
  lastY = main ? main.scrollTop : window.scrollY;
  target.addEventListener('scroll', onScroll, { passive: true });
  isHidden.value = false;
});

watch(isHidden, (val) => {
  document.body.classList.toggle('branding-hidden', val);
}, { immediate: true });

onBeforeUnmount(() => {
  const main = document.querySelector('.main-content');
  const target = main || window;
  target.removeEventListener('scroll', onScroll);
  document.body.classList.remove('branding-hidden');
});
</script>

<style scoped>
.app-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 120;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* clip branding when it slides up */
    /* Total height = status shelf + branding bar */
    height: calc(28px + env(safe-area-inset-top, 0px) + 56px);
    background: #0e0e10;
    border-bottom: 1px solid #2a2a2a;
}
/* When branding is hidden, shrink header height to only the status shelf */
body.branding-hidden .app-header {
    height: calc(28px + env(safe-area-inset-top, 0px));
}
.status-shelf {
    height: calc(28px + env(safe-area-inset-top, 0px));
    background: #0e0e10;
}
.branding {
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden; /* ensure inner text doesn't peek when sliding */
    transition: transform 180ms ease-in-out;
    will-change: transform;
}
.branding--hidden {
    /* Move the branding row completely out of view; add a small extra offset to
       avoid sub-pixel artifacts where a few pixels remain visible on some devices */
    transform: translateY(calc(-56px - 2px));
    opacity: 0;
}
.brand { text-decoration: none; }
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


