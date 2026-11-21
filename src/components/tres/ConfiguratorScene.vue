<script setup>
import { onBeforeUnmount, watch } from 'vue';
import { useLoop, useTresContext } from '@tresjs/core';
import { ProductConfigurator } from './ProductConfigurator.js';

const emit = defineEmits(['ready']);
const context = useTresContext();
let configurator;
watch(() => context.camera.activeCamera.value, camera => {
    if (!camera || configurator) return;
    configurator = new ProductConfigurator(context.scene.value, context.renderer.instance, camera);
    emit('ready', configurator);
}, { immediate: true, flush: 'post' });
const { render, onBeforeRender } = useLoop();
onBeforeRender(({ delta }) => configurator?.update(delta));
render(notifySuccess => {
    if (!configurator) return;
    configurator.render();
    notifySuccess();
});
onBeforeUnmount(() => configurator?.dispose());
</script>

<template>
    <TresPerspectiveCamera :position="[0, 0.513, 1.41]" :fov="45" :near="0.01" :far="1000" />
</template>
