<script setup>
import { ref, useId } from 'vue';

defineProps({
    label: { type: String, required: true },
    text: { type: String, required: true }
});

const tooltipId = useId();
const isOpen = ref(false);
</script>

<template>
    <span class="tooltip-help" :class="{ 'tooltip-help--open': isOpen }">
        <button
            class="tooltip-help__button"
            type="button"
            :aria-label="`Ayuda: ${label}`"
            :aria-expanded="isOpen"
            :aria-describedby="tooltipId"
            @focus="isOpen = true"
            @click="isOpen = true"
            @keydown.esc.prevent="isOpen = false"
            @blur="isOpen = false"
        >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="10" cy="10" r="7.25" />
                <path d="M10 9v4m0-6h.01" />
            </svg>
        </button>
        <span :id="tooltipId" class="tooltip-help__content" role="tooltip">
            {{ text }}
        </span>
    </span>
</template>

<style scoped>
.tooltip-help { position: relative; z-index: 12; display: inline-flex; flex: 0 0 auto; vertical-align: middle; }
.tooltip-help__button { display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 1px solid #5b8a8d; border-radius: 50%; background: #092b32; color: #c7e2e2; cursor: help; }
.tooltip-help__button:hover { border-color: #78cbd0; background: #10434b; color: #fff; }
.tooltip-help__button:focus-visible { outline: 2px solid #7be0e2; outline-offset: 3px; }
.tooltip-help__button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.tooltip-help__content { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: min(260px, calc(100vw - 48px)); padding: 10px 12px; border: 1px solid #4e7f84; border-radius: 8px; background: #06252b; color: #e5f3f2; box-shadow: 0 8px 22px rgba(0, 10, 14, 0.42); font-size: 0.75rem; font-weight: 450; line-height: 1.5; text-align: left; visibility: hidden; opacity: 0; transform: translateY(-3px); transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease; pointer-events: none; }
.tooltip-help:hover .tooltip-help__content,
.tooltip-help--open .tooltip-help__content { visibility: visible; opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .tooltip-help__content { transition: none; } }
</style>
