<template>
  <header class="app-header" role="banner" aria-label="Application header">
    <router-link to="/" class="brand" aria-label="PKR Home">
      <span class="brand-text" aria-hidden="true">PKR</span>
    </router-link>
  </header>
</template>

<script setup>
import { RouterLink } from 'vue-router';
// No JS needed; header is now persistent and accounts for safe area
</script>

<style scoped>
.app-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Keep a dark background under OS status bar and Telegram top UI */
    height: calc(56px + env(safe-area-inset-top, 0px));
    padding-top: env(safe-area-inset-top, 0px);
    background: #0e0e10;
    border-bottom: 1px solid #2a2a2a;
}
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

