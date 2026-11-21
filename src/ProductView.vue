<template>
    <div class="configurator">
        <div
            v-if="isInitializing"
            class="startup-loading-overlay"
            role="status"
            aria-live="polite"
        >
            <div class="loading-spinner" aria-hidden="true"></div>
            <span>Cargando configurador…</span>
        </div>

        <div class="configurator-layout">
            <section class="viewer" aria-label="Visor de producto en 3D">
                <div class="viewer-toolbar">
                    <span class="viewer-title">{{ products.find(item => item.id === selectedProductId)?.name || 'Vista previa del producto' }}</span>
                    <span class="viewer-mode">Vista 3D</span>
                </div>
                <div ref="canvasContainer" class="canvas-container">
                    <TresCanvas :alpha="false" :antialias="true" :dpr="1" aria-label="Producto interactivo en 3D. Arrastra para girar y usa la rueda o pellizca para acercar o alejar.">
                        <ConfiguratorScene @ready="initializeScene" />
                    </TresCanvas>
                    <div v-if="startupError" class="comparison-loading-status" role="alert">{{ startupError }}</div>
                    <div v-if="isComparisonLoading" class="comparison-loading-status" role="status" aria-live="polite">
                        <div class="loading-spinner loading-spinner--small" aria-hidden="true"></div>
                        <span>Cargando acabado de comparación…</span>
                    </div>
                    <div
                        v-if="isComparisonReady"
                        class="comparison-overlay"
                        :style="{ '--comparison-split': `${comparisonSplitPercent}%` }"
                        @pointermove="moveComparisonSlider"
                        aria-label="Comparación de acabados"
                    >
                        <span class="comparison-label comparison-label--before">Actual</span>
                        <span class="comparison-label comparison-label--after">Comparación</span>
                        <button
                            class="comparison-slider"
                            :class="{ 'is-dragging': isDraggingComparison }"
                            type="button"
                            role="slider"
                            aria-label="Mover la división entre los acabados actual y de comparación"
                            aria-valuemin="5"
                            aria-valuemax="95"
                            :aria-valuenow="comparisonSplitPercent"
                            :aria-valuetext="`${comparisonSplitPercent}% actual`"
                            @pointerdown="startComparisonSlider"
                            @pointerup="stopComparisonSlider"
                            @pointercancel="stopComparisonSlider"
                            @keydown="moveComparisonSliderWithKeyboard"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="m9 7-5 5 5 5m6-10 5 5-5 5" />
                            </svg>
                        </button>
                    </div>
                    <details
                        v-if="SHOW_PRODUCT_CHARACTERISTICS && productCharacteristics.length"
                        class="product-characteristics"
                        open
                        aria-labelledby="product-characteristics-title"
                        @pointerdown.stop
                        @wheel.stop
                        @touchmove.stop
                    >
                        <summary>
                            <h2 id="product-characteristics-title">Características</h2>
                            <svg class="characteristics-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </summary>
                        <ul>
                            <li v-for="(characteristic, index) in productCharacteristics" :key="index">{{ characteristic }}</li>
                        </ul>
                    </details>
                </div>
                <div class="viewer-help">Arrastra para girar <span aria-hidden="true">&middot;</span> Rueda o pellizca para acercar</div>
            </section>
            <aside class="control-panel" aria-label="Configuración del producto">
                <div class="controls">
                    <div class="panel-heading"><h2>Personaliza tu producto</h2><p>Configura el producto y ajusta su presentación en 3D.</p></div>
                    <section class="option-section" aria-labelledby="product-options-title">
                        <div class="option-section-heading">
                            <h3 id="product-options-title">Producto</h3>
                            <p>Elige el modelo, sus acabados y los accesorios disponibles.</p>
                        </div>
                    <div v-if="products.length != 0" class="mb-3">
                        <div class="control-label-row">
                            <label class="form-label" for="product-select">Modelo</label>
                            <TooltipHelp label="Modelo" text="Cambia el producto que aparece en el visor y carga sus opciones disponibles." />
                        </div>

                        <select
                            id="product-select"
                            class="form-select"
                            v-model="selectedProductId"
                            :disabled="productLoading || environmentLoading || debugSettingsBusy"
                            @change="updateProduct"
                        >
                            <option
                                v-for="product in products"
                                :key="product.id"
                                :value="product.id"
                            >
                                {{ product.name }}
                            </option>
                        </select>
                    </div>                   

                    <div v-if="productLoading" class="texture-loading mb-3" role="status" aria-live="polite">
                        <div class="loading-spinner loading-spinner--small" aria-hidden="true"></div>
                        <span>Cargando texturas…</span>
                    </div>

                    <template v-else>
                    <div
                        v-for="group in textureGroups"
                        :key="group.id"
                        v-show="group.textureSets.length > 1"
                        class="mb-3"
                        >
                            <div class="control-label-row">
                                <label class="form-label" :for="`texture-set-${group.id}`">
                                    {{ group.name }}
                                </label>
                                <TooltipHelp
                                    :label="group.name"
                                    :text="group.tooltip || `Selecciona el color o acabado para ${group.name.toLowerCase()}.`"
                                />
                            </div>

                            <div v-if="textureLoadingGroups[group.id]" class="texture-loading" role="status" aria-live="polite">
                                <div class="loading-spinner loading-spinner--small" aria-hidden="true"></div>
                                <span>Cargando textura…</span>
                            </div>

                            <select
                                v-else
                                :id="`texture-set-${group.id}`"
                                v-model="selectedTextureSetIds[group.id]"
                                class="form-select"
                                :disabled="productLoading || textureLoadingGroups[group.id] || comparisonLoadingGroups[group.id]"
                                @change="updateTextureSet(group)"
                            >
                                <option
                                    v-for="textureSet in group.textureSets"
                                    :key="textureSet.id"
                                    :value="textureSet.id"
                                >
                                    {{ textureSet.name }}
                                </option>
                            </select>
                        </div>
                    </template>

                    <div v-if="hasProductAnimation" class="mb-3">
                        <div class="control-label-row">
                            <label class="form-label" for="product-animation">Accesorios</label>
                            <TooltipHelp label="Accesorios" text="Elige si quieres colocar o retirar el accesorio del producto." />
                        </div>

                        <select
                            id="product-animation"
                            v-model="animationDirection"
                            class="form-select"
                            :disabled="productLoading"
                            @change="playProductAnimation"
                        >
                            <option value="" disabled>
                                Selecciona una opción
                            </option>
                            <option value="forward">
                                Colocar accesorio
                            </option>
                            <option value="reverse">
                                Retirar accesorio
                            </option>
                        </select>
                    </div>

                    <section v-if="hasComparableTextureGroups" class="material-comparison-controls" aria-labelledby="material-comparison-title">
                        <div class="form-check mb-3">
                            <input
                                id="material-comparison-enabled"
                                v-model="comparisonEnabled"
                                class="form-check-input"
                                type="checkbox"
                                :disabled="productLoading || environmentLoading"
                                @change="updateMaterialComparison"
                            >
                            <label class="form-check-label" for="material-comparison-enabled">
                                Comparar acabados en 3D
                            </label>
                            <TooltipHelp label="Comparar acabados" text="Divide el visor para ver el acabado actual junto al acabado que elijas." />
                        </div>
                        <template v-if="comparisonEnabled">
                            <h3 id="material-comparison-title">Acabado de comparación</h3>
                            <div v-for="group in comparableTextureGroups" :key="`compare-${group.id}`" class="mb-3">
                                <div class="control-label-row">
                                    <label class="form-label" :for="`comparison-set-${group.id}`">
                                        {{ group.name }}
                                    </label>
                                    <TooltipHelp :label="`Acabado de comparación: ${group.name}`" text="Elige qué acabado aparece en el lado de comparación del visor." />
                                </div>
                                <select
                                    :id="`comparison-set-${group.id}`"
                                    v-model="comparisonTextureSetIds[group.id]"
                                    class="form-select"
                                    :disabled="productLoading || environmentLoading || comparisonLoadingGroups[group.id]"
                                    @change="updateComparisonTextureSet(group)"
                                >
                                    <option
                                        v-for="textureSet in group.textureSets"
                                        :key="textureSet.id"
                                        :value="textureSet.id"
                                    >
                                        {{ textureSet.name }}
                                    </option>
                                </select>
                                <div v-if="comparisonLoadingGroups[group.id]" class="texture-loading" role="status" aria-live="polite">
                                    <div class="loading-spinner loading-spinner--small" aria-hidden="true"></div>
                                    <span>Cargando comparación…</span>
                                </div>
                            </div>
                            <p class="comparison-hint">Arrastra la línea del visor para comparar ambos acabados.</p>
                        </template>
                    </section>

                    </section>

                    <section class="option-section" aria-labelledby="render-options-title">
                        <div class="option-section-heading">
                            <h3 id="render-options-title">Apariencia en el visor</h3>
                            <p>Estos ajustes cambian cómo se ve en 3D; el producto y sus acabados no cambian.</p>
                        </div>
                    <div v-if="environments.length != 0" class="mb-3">
                        <div class="control-label-row">
                            <label class="form-label" for="environment-select">Entorno</label>
                            <TooltipHelp label="Entorno HDR" text="Cambia el fondo visible y la luz ambiental que aporta reflejos al producto." />
                        </div>

                        <select
                            id="environment-select"
                            class="form-select"
                            v-model="selectedEnvironmentId"
                            :disabled="environmentLoading || debugSettingsBusy"
                            @change="updateEnvironment"
                        >
                            <option
                                v-for="environment in environments"
                                :key="environment.id"
                                :value="environment.id"
                            >
                                {{ environment.name }}
                            </option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <div class="control-label-row">
                            <label class="form-label" for="studio-lighting-select">Iluminación de estudio</label>
                            <TooltipHelp label="Iluminación de estudio" text="Cambia la dirección, el color y la intensidad de las luces de apoyo. El entorno HDR no cambia." />
                        </div>
                        <select
                            id="studio-lighting-select"
                            v-model="selectedStudioLightingPreset"
                            class="form-select"
                            :disabled="productLoading || environmentLoading"
                            @change="updateStudioLightingPreset"
                        >
                            <option value="neutral">Neutra</option>
                            <option value="soft">Suave</option>
                            <option value="dramatic">Dramática</option>
                        </select>
                    </div>

                    <div v-if="colorLuts.length > 0" class="mb-3">
                        <div class="control-label-row">
                            <label class="form-label" for="color-lut-select">Estilo de color</label>
                            <TooltipHelp label="Estilo de color" text="Aplica una corrección global al color final del visor. No cambia las luces ni las propiedades de los materiales." />
                        </div>
                        <select
                            id="color-lut-select"
                            v-model="selectedColorLut"
                            class="form-select"
                            :disabled="productLoading || environmentLoading || colorLutLoading"
                            @change="updateColorLut"
                        >
                            <option value="">Sin corrección de color</option>
                            <option v-for="lut in colorLuts" :key="lut.id" :value="lut.id">
                                {{ lut.name }}
                            </option>
                        </select>
                        <div v-if="colorLutLoading" class="texture-loading" role="status" aria-live="polite">
                            <div class="loading-spinner loading-spinner--small" aria-hidden="true"></div>
                            <span>Cargando estilo de color…</span>
                        </div>
                        <div v-if="selectedColorLutDetails && colorLutPreview" class="lut-preview" role="group" :aria-label="`Vista previa: ${selectedColorLutDetails.name}`">
                            <div class="lut-preview-copy">
                                <strong>{{ selectedColorLutDetails.name }}</strong>
                                <span>{{ selectedColorLutDetails.description || 'Aplica este tratamiento de color a la vista 3D.' }}</span>
                            </div>
                            <div class="lut-preview-tones">
                                <div v-for="tone in colorLutPreview" :key="tone.label" class="lut-preview-tone">
                                    <span class="lut-preview-tone-label">{{ tone.label }}</span>
                                    <div class="lut-preview-pair" role="img" :aria-label="`${tone.label}: original ${tone.source}, con estilo ${tone.result}`">
                                        <span :style="{ backgroundColor: tone.source }" aria-hidden="true"></span>
                                        <span :style="{ backgroundColor: tone.result }" aria-hidden="true"></span>
                                    </div>
                                </div>
                            </div>
                            <div class="lut-preview-legend" aria-hidden="true">
                                <span><i class="lut-preview-key lut-preview-key--original"></i>Original</span>
                                <span><i class="lut-preview-key" :style="{ backgroundColor: colorLutPreview[1]?.result }"></i>Con estilo</span>
                            </div>
                        </div>
                        <p v-if="colorLutError" class="text-danger small mt-2" role="alert">{{ colorLutError }}</p>
                    </div>

                    </section>

                    <details class="debug-panel">
                        <summary>Ajustes técnicos <span>Iluminación y ajustes</span></summary>
                        <fieldset class="debug-row" :disabled="isInitializing || productLoading || environmentLoading || debugSettingsBusy">

                        <div class="debug-actions">
                            <button type="button" class="debug-button debug-button--primary" @click="saveDebugSettings">{{ debugSettingsOperation === 'save' ? 'Guardando...' : 'Guardar ajustes' }}</button>
                            <button type="button" class="debug-button" @click="resetDebugSettings">{{ debugSettingsOperation === 'reset' ? 'Restableciendo...' : 'Restablecer valores' }}</button>
                        </div>
                        <p class="debug-storage-note">Ajustes compartidos para toda la demo. Recarga para ver cambios de otros navegadores. Restablecer afecta a todos.</p>
                        <p v-if="debugSettingsMessage" class="debug-settings-message" role="status" aria-live="polite">{{ debugSettingsMessage }}</p>

                        <div class="form-check mb-3">
                            <input
                                id="generate-tangents"
                                v-model="generateTangentsOnLoad"
                                class="form-check-input"
                                type="checkbox"
                                @change="updateGenerateTangents"
                            >
                            <label class="form-check-label" for="generate-tangents">
                                Generar tangentes al cargar el producto
                            </label>
                        </div>

                        <div v-if="selectedColorLut" class="mb-3">
                            <h5>Ajustes de color</h5>
                            <label class="form-label" for="color-lut-intensity">
                                Fuerza del estilo: {{ colorLutIntensity.toFixed(2) }}
                            </label>
                            <input
                                id="color-lut-intensity"
                                v-model.number="colorLutIntensity"
                                class="form-range"
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                @input="updateColorLutStrength"
                            >
                        </div>

                        <div v-for="group in materialSettingsGroups" :key="`material-settings-${group.id}`" class="form-check mb-3">
                            <input
                                :id="`material-settings-${group.id}`"
                                v-model="groupMaterialSettingsEnabled[group.id]"
                                class="form-check-input"
                                type="checkbox"
                                @change="updateGroupMaterialSettings(group)"
                            >
                            <label class="form-check-label" :for="`material-settings-${group.id}`">
                                {{ group.materialSettings.debugLabel || `Aplicar perfil: ${group.name}` }}
                            </label>
                        </div>

                        <h5>Iluminación</h5>

                        <div class="form-check form-switch mb-3">
                            <input
                                id="directional-lights"
                                v-model="directionalLightsEnabled"
                                class="form-check-input"
                                type="checkbox"
                                role="switch"
                                @change="updateDirectionalLights"
                            >
                            <label class="form-check-label" for="directional-lights">
                                Luces direccionales
                            </label>
                        </div>

                        <div class="mb-3">
                            <label class="form-label" for="debug-exposure">
                                Exposición: {{ debugExposure.toFixed(2) }}
                            </label>
                            <input
                                id="debug-exposure"
                                v-model.number="debugExposure"
                                class="form-range"
                                type="range"
                                min="0"
                                max="3"
                                step="0.01"
                                @input="updateExposure"
                            >
                        </div>

                        <div class="mb-3">
                            <div class="form-check mb-2">
                                <input
                                    id="override-hdr-ambient"
                                    v-model="overrideHdrAmbient"
                                    class="form-check-input"
                                    type="checkbox"
                                    @change="updateAmbientLightOverride"
                                >
                                <label class="form-check-label" for="override-hdr-ambient">
                                    Ajustar luz ambiental HDR
                                </label>
                            </div>
                            <label class="form-label" for="debug-ambient-light">
                                Intensidad de luz ambiental: {{ debugAmbientLight.toFixed(2) }}
                            </label>
                            <input
                                id="debug-ambient-light"
                                v-model.number="debugAmbientLight"
                                class="form-range"
                                type="range"
                                min="0"
                                max="2"
                                step="0.01"
                                :disabled="!overrideHdrAmbient"
                                @input="updateAmbientLight"
                            >
                        </div>

                        <!-- ===================== -->
                        <!-- POSITION -->
                        <!-- ===================== -->

                        <h5>Posición</h5>

                        <div class="mb-3">
                            <label class="form-label">
                                X
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="0.01"
                                    aria-label="Posición X"
                                    v-model.number="debugPosition.x"
                                    @input="updateProductPosition"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-2"
                                    max="2"
                                    step="0.01"
                                    aria-label="Posición X"
                                    v-model.number="debugPosition.x"
                                    @input="updateProductPosition"
                                >
                            </div>
                        </div>


                        <div class="mb-3">
                            <label class="form-label">
                                Y
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="0.01"
                                    aria-label="Posición Y"
                                    v-model.number="debugPosition.y"
                                    @input="updateProductPosition"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-2"
                                    max="2"
                                    step="0.01"
                                    aria-label="Posición Y"
                                    v-model.number="debugPosition.y"
                                    @input="updateProductPosition"
                                >
                            </div>
                        </div>


                        <div class="mb-3">
                            <label class="form-label">
                                Z
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="0.01"
                                    aria-label="Posición Z"
                                    v-model.number="debugPosition.z"
                                    @input="updateProductPosition"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-2"
                                    max="2"
                                    step="0.01"
                                    aria-label="Posición Z"
                                    v-model.number="debugPosition.z"
                                    @input="updateProductPosition"
                                >
                            </div>
                        </div>


                        <!-- ===================== -->
                        <!-- ROTATION -->
                        <!-- ===================== -->

                        <h5>Rotación</h5>

                        <div class="mb-3">
                            <label class="form-label">
                                X
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="1"
                                    aria-label="Rotación X"
                                    v-model.number="debugRotation.x"
                                    @input="updateProductRotation"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-180"
                                    max="180"
                                    step="1"
                                    aria-label="Rotación X"
                                    v-model.number="debugRotation.x"
                                    @input="updateProductRotation"
                                >
                            </div>
                        </div>


                        <div class="mb-3">
                            <label class="form-label">
                                Y
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="1"
                                    aria-label="Rotación Y"
                                    v-model.number="debugRotation.y"
                                    @input="updateProductRotation"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-180"
                                    max="180"
                                    step="1"
                                    aria-label="Rotación Y"
                                    v-model.number="debugRotation.y"
                                    @input="updateProductRotation"
                                >
                            </div>
                        </div>


                        <div class="mb-3">
                            <label class="form-label">
                                Z
                            </label>

                            <div class="input-group">
                                <input
                                    type="number"
                                    class="form-control"
                                    step="1"
                                    aria-label="Rotación Z"
                                    v-model.number="debugRotation.z"
                                    @input="updateProductRotation"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="-180"
                                    max="180"
                                    step="1"
                                    aria-label="Rotación Z"
                                    v-model.number="debugRotation.z"
                                    @input="updateProductRotation"
                                >
                            </div>
                        </div>


                        <!-- ===================== -->
                        <!-- SCALE -->
                        <!-- ===================== -->

                        <h5>Escala</h5>

                        <div class="mb-3">
                            <div class="input-group">

                                <input
                                    type="number"
                                    class="form-control"
                                    min="0.005"
                                    max="3"
                                    step="0.005"
                                    aria-label="Escala del producto"
                                    v-model.number="debugScale"
                                    @input="updateProductScale"
                                >

                                <input
                                    type="range"
                                    class="form-range"
                                    min="0.005"
                                    max="3"
                                    step="0.005"
                                    aria-label="Escala del producto"
                                    v-model.number="debugScale"
                                    @input="updateProductScale"
                                >

                            </div>
                        </div>

                        </fieldset>
                    </details>
                </div>
            </aside>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { TresCanvas } from '@tresjs/core';
import ConfiguratorScene from './components/tres/ConfiguratorScene.vue';
import TooltipHelp from './components/TooltipHelp.vue';
import { createAccessorySounds } from './shared/accessorySounds';
import { DEBUG_DEFAULTS as debugDefaults, isValidDebugSettings, isValidSceneSettings, isValidTransform } from './shared/debugSettings';

const startupError = ref('');
const canvasContainer = ref(null);
let isDisposed = false;

let configurator = null;
let product = null;
const products = ref([]);
const selectedProductId = ref(null);
// Internal display option; products without characteristics always hide the panel.
const SHOW_PRODUCT_CHARACTERISTICS = true;
const productCharacteristics = computed(() => {
    const characteristics = products.value.find(item => item.id === selectedProductId.value)?.characteristics;
    return Array.isArray(characteristics)
        ? characteristics.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
        : [];
});
const productLoading = ref(false);
const environments = ref([]);
const selectedEnvironmentId = ref(null);
const selectedStudioLightingPreset = ref('neutral');
const selectedColorLut = ref('');
const colorLutIntensity = ref(0.65);
const colorLutLoading = ref(false);
const colorLutError = ref('');
const colorLuts = ref([]);
const colorLutPreview = ref(null);
const environmentLoading = ref(false);
let environmentData = null;
const textureGroups = ref([]);
const selectedTextureSetIds = ref({});
const appliedTextureSetIds = ref({});
const groupMaterialSettingsEnabled = ref({});
const textureLoadingGroups = ref({});
const comparisonEnabled = ref(false);
const comparisonTextureSetIds = ref({});
const comparisonLoadingGroups = ref({});
const comparisonSplitPercent = ref(50);
const isDraggingComparison = ref(false);
const comparableTextureGroups = computed(() => textureGroups.value.filter(group => group.textureSets?.length > 1));
const selectedColorLutDetails = computed(() =>
    colorLuts.value.find(item => item.id === selectedColorLut.value) ?? null
);
const materialSettingsGroups = computed(() => textureGroups.value.filter(group =>
    group.materialNames?.length && group.materialSettings?.properties
));
const hasComparableTextureGroups = computed(() => comparableTextureGroups.value.length > 0);
const isComparisonReady = computed(() => comparisonEnabled.value && comparableTextureGroups.value.some(group =>
    comparisonTextureSetIds.value[group.id] &&
    comparisonTextureSetIds.value[group.id] !== selectedTextureSetIds.value[group.id]
 ) && !Object.values(comparisonLoadingGroups.value).some(Boolean));
const isComparisonLoading = computed(() => comparisonEnabled.value && Object.values(comparisonLoadingGroups.value).some(Boolean));
let comparisonRequestVersion = 0;
const comparisonGroupRequestVersions = new Map();
const isInitializing = ref(true);
const hasProductAnimation = ref(false);
const animationDirection = ref('');
const accessorySounds = createAccessorySounds();
let accessoryAnimationRequest = 0;
const LEGACY_DEBUG_STORAGE_KEY = 'product-configurator.debug.v1';
const DEBUG_SETTINGS_URL = '/.netlify/functions/debug-settings';
const debugSettingsMessage = ref('');
const debugSettingsBusy = ref(false);
const debugSettingsOperation = ref('');
let savedDebugSettings = null;
let legacyProductsToMigrate = null;
const initialSceneSettings = debugDefaults;

const requestDebugSettings = async (method = 'GET', payload) => {
    const response = await fetch(DEBUG_SETTINGS_URL, {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
    });
    if (!response.ok) throw new Error('Shared debug settings request failed');
    const result = await response.json();
    if (!Object.hasOwn(result, 'settings') ||
        (result.settings !== null && !isValidDebugSettings(result.settings))) {
        throw new Error('Invalid shared debug settings');
    }
    return result.settings;
};
const clearLegacyDebugSettings = () => {
    try { localStorage.removeItem(LEGACY_DEBUG_STORAGE_KEY); } catch { /* Shared storage remains authoritative. */ }
};
const loadSharedDebugSettings = async () => {
    try {
        savedDebugSettings = await requestDebugSettings();
        if (savedDebugSettings === null) {
            // Existing browser-local values are offered for explicit publication on first save.
            try {
                const legacy = JSON.parse(localStorage.getItem(LEGACY_DEBUG_STORAGE_KEY));
                if (isValidDebugSettings(legacy)) {
                    savedDebugSettings = legacy;
                    legacyProductsToMigrate = legacy.products;
                    debugSettingsMessage.value = 'Ajustes locales cargados. Pulsa Guardar ajustes para compartir los valores actuales.';
                }
            } catch { /* Missing or invalid local values do not block startup. */ }
        } else {
            clearLegacyDebugSettings();
        }
    } catch {
        savedDebugSettings = null;
        debugSettingsMessage.value = 'No se pudieron cargar los ajustes compartidos. Se usan los valores predeterminados. Recarga para volver a intentarlo.';
    }
    const scene = savedDebugSettings?.scene ?? debugDefaults;
    generateTangentsOnLoad.value = scene.generateTangentsOnLoad;
    debugExposure.value = scene.exposure;
    debugAmbientLight.value = scene.ambientLight;
    overrideHdrAmbient.value = scene.overrideHdrAmbient;
    directionalLightsEnabled.value = scene.directionalLightsEnabled;
};
const generateTangentsOnLoad = ref(initialSceneSettings.generateTangentsOnLoad);
const debugExposure = ref(initialSceneSettings.exposure);
const debugAmbientLight = ref(initialSceneSettings.ambientLight);
const overrideHdrAmbient = ref(initialSceneSettings.overrideHdrAmbient);
const directionalLightsEnabled = ref(initialSceneSettings.directionalLightsEnabled);

const debugPosition = ref({
    x: 0,
    y: 0,
    z: 0
});
const debugRotation = ref({
    x: 0,
    y: 0,
    z: 0
});
const debugScale = ref(1);

const updateProductPosition = () => {

    configurator.setProductPosition(
        debugPosition.value.x,
        debugPosition.value.y,
        debugPosition.value.z
    );

};

const updateProductScale = () => {

    configurator.setProductScale(
        debugScale.value
    );

};

const updateGenerateTangents = () => {

    configurator.setGenerateTangentsOnLoad(
        generateTangentsOnLoad.value
    );

};

const updateDirectionalLights = () => {

    configurator.setDirectionalLightsEnabled(directionalLightsEnabled.value);

};

const updateStudioLightingPreset = () => {
    configurator?.setStudioLightingPreset(selectedStudioLightingPreset.value);
};

const updateGroupMaterialSettings = (group) => {
    configurator?.setGroupMaterialSettings(
        group.materialNames,
        group.materialSettings?.properties,
        groupMaterialSettingsEnabled.value[group.id]
    );
};

const applySelectedColorLut = async (showLoading) => {
    if (!configurator) return;
    const lut = colorLuts.value.find(item => item.id === selectedColorLut.value) ?? null;
    colorLutError.value = '';
    colorLutLoading.value = Boolean(showLoading && lut);
    if (showLoading) colorLutPreview.value = null;
    try {
        colorLutPreview.value = await configurator.setColorLut(lut, colorLutIntensity.value);
    } catch (error) {
        console.error('Failed to apply color LUT:', error);
        selectedColorLut.value = '';
        await configurator.setColorLut(null);
        colorLutPreview.value = null;
        colorLutError.value = 'No se pudo cargar el estilo de color.';
    } finally {
        colorLutLoading.value = false;
    }
};
const updateColorLut = () => applySelectedColorLut(true);
const updateColorLutStrength = () => applySelectedColorLut(false);

const updateExposure = () => {

    configurator.setExposure(debugExposure.value);

};

const updateAmbientLight = () => {

    configurator.setAmbientLightStrength(debugAmbientLight.value);

};

const updateAmbientLightOverride = () => {

    configurator.setAmbientLightOverride(
        overrideHdrAmbient.value
    );

};

const updateProductRotation = () => {

    configurator.setProductRotation(
        debugRotation.value.x,
        debugRotation.value.y,
        debugRotation.value.z
    );

};

const getDebugTransform = () => ({
    position: { ...debugPosition.value },
    rotation: { ...debugRotation.value },
    scale: debugScale.value
});
const getDebugSceneSettings = () => ({
    generateTangentsOnLoad: generateTangentsOnLoad.value,
    exposure: debugExposure.value,
    ambientLight: debugAmbientLight.value,
    overrideHdrAmbient: overrideHdrAmbient.value,
    directionalLightsEnabled: directionalLightsEnabled.value
});
const applyDebugSceneSettings = () => {
    updateGenerateTangents();
    updateExposure();
    updateAmbientLight();
    updateAmbientLightOverride();
    updateDirectionalLights();
};
const saveDebugSettings = async () => {
    const transform = getDebugTransform();
    const scene = getDebugSceneSettings();
    if (!isValidTransform(transform) || !isValidSceneSettings(scene)) {
        debugSettingsMessage.value = 'Revisa los valores antes de guardar. La escala debe ser mayor que cero.';
        return;
    }
    debugSettingsBusy.value = true;
    debugSettingsOperation.value = 'save';
    try {
        savedDebugSettings = await requestDebugSettings('PATCH', {
            scene, productId: selectedProductId.value, transform,
            ...(legacyProductsToMigrate ? { initialProducts: legacyProductsToMigrate } : {})
        });
        legacyProductsToMigrate = null;
        clearLegacyDebugSettings();
        debugSettingsMessage.value = 'Ajustes compartidos guardados. Estarán disponibles al recargar en otros navegadores.';
    } catch {
        debugSettingsMessage.value = 'No se pudieron guardar los ajustes compartidos. Tus cambios siguen en la vista; vuelve a intentarlo.';
    } finally {
        debugSettingsBusy.value = false;
        debugSettingsOperation.value = '';
    }
};
const resetDebugSettings = async () => {
    debugSettingsBusy.value = true;
    debugSettingsOperation.value = 'reset';
    try {
        savedDebugSettings = await requestDebugSettings('DELETE');
        legacyProductsToMigrate = null;
        clearLegacyDebugSettings();
        generateTangentsOnLoad.value = debugDefaults.generateTangentsOnLoad;
        debugExposure.value = debugDefaults.exposure;
        debugAmbientLight.value = debugDefaults.ambientLight;
        overrideHdrAmbient.value = debugDefaults.overrideHdrAmbient;
        directionalLightsEnabled.value = debugDefaults.directionalLightsEnabled;
        applyDebugSceneSettings();
        const productConfig = getProductById(selectedProductId.value);
        if (productConfig) {
            applyProductDebugTransform(productConfig);
            configurator.applyProductTransform(getDebugTransform());
        }
        debugSettingsMessage.value = 'Valores predeterminados restablecidos para toda la demo.';
    } catch {
        debugSettingsMessage.value = 'No se pudieron restablecer los ajustes compartidos. Vuelve a intentarlo.';
    } finally {
        debugSettingsBusy.value = false;
        debugSettingsOperation.value = '';
    }
};

const loadProducts = async () => {

    const response = await fetch('/products.json');

    if (!response.ok) {
        throw new Error('Failed to load products.json');
    }

    return await response.json();

};

const getEnvironmentById = (environmentId) => {

    return environments.value.find(
        environment => environment.id === environmentId
    ) ?? null;

};

const getProductById = (productId) => {

    return products.value.find(
        product => product.id === productId
    ) ?? null;

};

const applyProductDebugTransform = (productConfig) => {

    const transform = Object.hasOwn(savedDebugSettings?.products ?? {}, productConfig.id)
        ? savedDebugSettings.products[productConfig.id]
        : productConfig.transform;
    debugPosition.value = { ...transform.position };
    debugRotation.value = { ...transform.rotation };
    debugScale.value = transform.scale;

};

const applyTextureSet = async (group, textureSetId) => {

    const textureSet = group.textureSets.find(
        item => item.id === textureSetId
    );

    if (!textureSet) {
        return;
    }

    textureLoadingGroups.value = {
        ...textureLoadingGroups.value,
        [group.id]: true
    };

    try {
        await configurator.applyTextureSet(
            textureSet,
            group.materialNames
        );
    } finally {
        textureLoadingGroups.value = {
            ...textureLoadingGroups.value,
            [group.id]: false
        };
    }

};

const updateTextureSet = async (group) => {
    const previousTextureSetId = appliedTextureSetIds.value[group.id];
    const nextTextureSetId = selectedTextureSetIds.value[group.id];
    const resumeComparison = comparisonEnabled.value;
    if (resumeComparison) configurator.setMaterialComparisonEnabled(false);
    try {
        await applyTextureSet(group, nextTextureSetId);
        if (group.materialSettings?.properties) updateGroupMaterialSettings(group);
        appliedTextureSetIds.value = { ...appliedTextureSetIds.value, [group.id]: nextTextureSetId };

        if (comparisonTextureSetIds.value[group.id] === previousTextureSetId) {
            comparisonTextureSetIds.value = {
                ...comparisonTextureSetIds.value,
                [group.id]: nextTextureSetId
            };
        }

        if (comparisonEnabled.value) await updateComparisonGroup(group);
    } finally {
        if (resumeComparison) configurator.setMaterialComparisonEnabled(true);
    }

};

const updateComparisonGroup = async (group) => {
    const requestVersion = (comparisonGroupRequestVersions.get(group.id) ?? 0) + 1;
    comparisonGroupRequestVersions.set(group.id, requestVersion);
    const selectedId = comparisonTextureSetIds.value[group.id];
    if (!comparisonEnabled.value || selectedId === selectedTextureSetIds.value[group.id]) {
        configurator?.setMaterialComparison(group.id, null);
        return;
    }

    const textureSet = group.textureSets.find(item => item.id === selectedId);
    if (!textureSet) return;

    comparisonLoadingGroups.value = { ...comparisonLoadingGroups.value, [group.id]: true };
    try {
        await configurator.prepareMaterialComparison(
            group.id,
            textureSet,
            group.materialNames,
            () => comparisonGroupRequestVersions.get(group.id) === requestVersion &&
                comparisonEnabled.value &&
                comparisonTextureSetIds.value[group.id] === selectedId &&
                selectedTextureSetIds.value[group.id] !== selectedId
        );
    } finally {
        if (comparisonGroupRequestVersions.get(group.id) === requestVersion) {
            comparisonLoadingGroups.value = { ...comparisonLoadingGroups.value, [group.id]: false };
        }
    }
};

const updateComparisonTextureSet = async (group) => {
    await updateComparisonGroup(group);
    if (comparisonEnabled.value) {
        configurator?.setMaterialComparisonSplit(comparisonSplitPercent.value / 100);
        configurator?.setMaterialComparisonEnabled(true);
    }
};

const updateMaterialComparison = async () => {
    const requestVersion = ++comparisonRequestVersion;
    if (!comparisonEnabled.value) {
        configurator?.setMaterialComparisonEnabled(false);
        return;
    }

    await Promise.all(comparableTextureGroups.value.map(updateComparisonGroup));
    if (requestVersion !== comparisonRequestVersion) return;
    configurator?.setMaterialComparisonSplit(comparisonSplitPercent.value / 100);
    configurator?.setMaterialComparisonEnabled(true);
};

const setComparisonSplitFromPointer = (clientX) => {
    const bounds = canvasContainer.value?.getBoundingClientRect();
    if (!bounds?.width) return;
    comparisonSplitPercent.value = Math.max(5, Math.min(95, ((clientX - bounds.left) / bounds.width) * 100));
    configurator?.setMaterialComparisonSplit(comparisonSplitPercent.value / 100);
};

const startComparisonSlider = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingComparison.value = true;
    setComparisonSplitFromPointer(event.clientX);
};

const moveComparisonSlider = (event) => {
    if (isDraggingComparison.value) setComparisonSplitFromPointer(event.clientX);
};

const stopComparisonSlider = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isDraggingComparison.value = false;
};

const moveComparisonSliderWithKeyboard = (event) => {
    const step = event.shiftKey ? 5 : 1;
    let nextValue = comparisonSplitPercent.value;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue -= step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue += step;
    else if (event.key === 'Home') nextValue = 5;
    else if (event.key === 'End') nextValue = 95;
    else return;

    event.preventDefault();
    comparisonSplitPercent.value = Math.max(5, Math.min(95, nextValue));
    configurator?.setMaterialComparisonSplit(comparisonSplitPercent.value / 100);
};

const playProductAnimation = async () => {
    const direction = animationDirection.value;
    if (!direction || !configurator || productLoading.value) return;
    const request = ++accessoryAnimationRequest;
    const productVersion = configurator.productVersion;
    // Unlock audio before starting movement so the first interaction stays in sync too.
    await accessorySounds.prepare();
    if (isDisposed || request !== accessoryAnimationRequest || productLoading.value ||
        productVersion !== configurator.productVersion) return;
    configurator.playProductAnimation(direction, () => accessorySounds.play(direction));
};

const resetMaterialComparison = () => {
    comparisonRequestVersion += 1;
    comparisonGroupRequestVersions.forEach((version, groupId) => {
        comparisonGroupRequestVersions.set(groupId, version + 1);
    });
    comparisonEnabled.value = false;
    comparisonSplitPercent.value = 50;
    comparisonTextureSetIds.value = {};
    comparisonLoadingGroups.value = {};
    configurator?.clearMaterialComparisons();
    configurator?.setMaterialComparisonEnabled(false);
};

const loadProductConfig = async (productConfig) => {

    if (!configurator || !productConfig) {
        return;
    }

    productLoading.value = true;
    resetMaterialComparison();
    textureGroups.value = [];
    selectedTextureSetIds.value = {};
    appliedTextureSetIds.value = {};
    groupMaterialSettingsEnabled.value = {};

    try {
        applyProductDebugTransform(productConfig);

        product = await configurator.loadProductFromMetadata(
            productConfig
        );

        hasProductAnimation.value = configurator.hasProductAnimation();
        animationDirection.value = '';

        configurator.setPivotPosition(
            productConfig.pivot.position
        );

        configurator.applyProductTransform(
            getDebugTransform()
        );

        await Promise.all(
            (productConfig.materialDefaults ?? []).map(material =>
                configurator.applyTextureSet(
                    material,
                    material.materialNames
                )
            )
        );

        textureGroups.value = productConfig.textureGroups ?? [];
        groupMaterialSettingsEnabled.value = Object.fromEntries(
            textureGroups.value
                .filter(group => group.materialSettings?.properties)
                .map(group => [
                    group.id,
                    group.materialSettings.enabledByDefault === true
                ])
        );
        selectedTextureSetIds.value = Object.fromEntries(
            textureGroups.value.map(group => [
                group.id,
                group.defaultTextureSetId ?? group.textureSets[0]?.id
            ])
        );
        appliedTextureSetIds.value = { ...selectedTextureSetIds.value };
        comparisonTextureSetIds.value = { ...selectedTextureSetIds.value };

        await Promise.all(
            textureGroups.value.map(group =>
                applyTextureSet(group, selectedTextureSetIds.value[group.id])
            )
        );
        materialSettingsGroups.value.forEach(updateGroupMaterialSettings);
    } finally {
        productLoading.value = false;
    }

};

const updateProduct = async () => {

    const productConfig = getProductById(
        selectedProductId.value
    );

    if (!productConfig) {
        return;
    }

    resetMaterialComparison();

    if (environmentData) {
        const environment = getEnvironmentForProduct(
            environmentData,
            productConfig
        );

        if (environment) {
            selectedEnvironmentId.value = environment.id;
            await updateEnvironment();
        }
    }

    await loadProductConfig(productConfig);

};

const updateEnvironment = async () => {

    if (!configurator || !selectedEnvironmentId.value) {
        return;
    }

    const environment = getEnvironmentById(
        selectedEnvironmentId.value
    );

    if (!environment) {
        return;
    }

    environmentLoading.value = true;

    try {
        await configurator.loadEnvironment(environment);
    } finally {
        environmentLoading.value = false;
    }

};

const loadEnvironmentMaps = async () => {

    const response = await fetch('/environment-maps.json');

    if (!response.ok) {
        throw new Error('Failed to load environment-maps.json');
    }

    return await response.json();

};

const loadColorLutManifest = async () => {
    try {
        const response = await fetch('/assets/luts/luts.json');
        if (!response.ok) throw new Error('Failed to load LUT manifest');
        const manifest = await response.json();
        const entries = Array.isArray(manifest.luts) ? manifest.luts : [];
        const ids = new Set();
        colorLuts.value = entries.filter(lut => {
            if (
                !lut ||
                typeof lut.id !== 'string' ||
                !/^[\w-]+$/.test(lut.id) ||
                ids.has(lut.id) ||
                typeof lut.name !== 'string' ||
                !lut.name.trim() ||
                typeof lut.file !== 'string' ||
                !/^[\w.-]+\.cube$/i.test(lut.file)
            ) return false;
            ids.add(lut.id);
            return true;
        });
    } catch (error) {
        console.warn('Could not load LUT manifest:', error);
        colorLuts.value = [];
    }
};

const getEnvironmentForProduct = (environmentData, productConfig) => {

    const environmentId =
        productConfig.environmentId ??
        environmentData.defaultEnvironmentId;

    if (!environmentId) {
        return null;
    }

    return environmentData.environments.find(
        environment => environment.id === environmentId
    ) ?? null;

};

const initializeScene = async (instance) => {
    configurator = instance;
    try {
        await loadSharedDebugSettings();
        if (isDisposed) return;
        await loadColorLutManifest();
        if (isDisposed) return;
        applyDebugSceneSettings();
        const [productData, environmentsData] = await Promise.all([loadProducts(), loadEnvironmentMaps()]);
        if (isDisposed) return;
        environmentData = environmentsData;
        products.value = productData.products;
        const productConfig = products.value[0];
        if (!productConfig) throw new Error('No products configured');
        selectedProductId.value = productConfig.id;
        environments.value = environmentData.environments;
        const environment = getEnvironmentForProduct(environmentData, productConfig);
        if (environment) {
            selectedEnvironmentId.value = environment.id;
            await configurator.loadEnvironment(environment);
        }
        if (isDisposed) return;
        await loadProductConfig(productConfig);
    } catch (error) {
        console.error('Could not initialize configurator:', error);
        startupError.value = 'No se pudo cargar el configurador. Recarga la página para volver a intentarlo.';
    } finally {
        isInitializing.value = false;
    }
};
onBeforeUnmount(() => {
    isDisposed = true;
    accessorySounds.dispose();
});
</script>

<style scoped>
.configurator { position: relative; }
.configurator-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
.viewer { position: sticky; top: 24px; display: grid; gap: 12px; min-width: 0; }
.viewer-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 14px 18px; border-radius: 10px; }
.viewer-title { font-size: 0.875rem; font-weight: 600; }
.viewer-mode { flex-shrink: 0; color: #c2dedd; font-size: 0.75rem; }
.canvas-container { position: relative; overflow: hidden; width: 100%; height: min(72vh, 800px); min-height: 400px; border-radius: var(--studio-radius); background: #092c32; box-shadow: var(--studio-elevation); }
.control-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.control-label-row .form-label { flex: 1; min-width: 0; margin: 0; }
.lut-preview { display: grid; gap: 12px; margin-top: 12px; padding: 12px; border: 1px solid rgba(151,217,219,0.38); border-radius: 10px; background: rgba(4,35,40,0.55); }
.lut-preview-copy { display: grid; gap: 4px; }
.lut-preview-copy strong { color: var(--studio-ink); font-size: 0.8125rem; font-weight: 650; }
.lut-preview-copy > span { color: var(--studio-muted); font-size: 0.75rem; line-height: 1.45; }
.lut-preview-tones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.lut-preview-tone { display: grid; gap: 5px; min-width: 0; }
.lut-preview-tone-label { color: var(--studio-muted); font-size: 0.6875rem; }
.lut-preview-pair { display: grid; grid-template-columns: 1fr 1fr; height: 28px; overflow: hidden; border: 1px solid rgba(185,230,229,0.38); border-radius: 5px; }
.lut-preview-pair > span { min-width: 0; }
.lut-preview-legend { display: flex; flex-wrap: wrap; gap: 14px; color: var(--studio-muted); font-size: 0.6875rem; }
.lut-preview-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.lut-preview-key { width: 11px; height: 11px; border: 1px solid rgba(185,230,229,0.55); border-radius: 3px; }
.lut-preview-key--original { background: #808080; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
canvas:active { cursor: grabbing; }
.comparison-loading-status { position: absolute; top: 14px; left: 50%; z-index: 4; display: flex; align-items: center; gap: 9px; max-width: calc(100% - 28px); padding: 9px 13px; transform: translateX(-50%); border: 1px solid rgba(228,250,250,0.72); border-radius: 8px; background: rgba(4,28,33,0.9); color: #fff; font-size: 0.75rem; font-weight: 600; box-shadow: 0 5px 14px rgba(0,8,12,0.4); pointer-events: none; white-space: nowrap; }
.comparison-overlay { position: absolute; z-index: 2; inset: 0; pointer-events: none; }
.comparison-overlay::after { position: absolute; top: 0; bottom: 0; left: var(--comparison-split); width: 2px; background: #fff; box-shadow: 0 0 12px rgba(0, 20, 24, 0.8); content: ''; transform: translateX(-1px); }
.comparison-label { position: absolute; top: 14px; z-index: 1; padding: 7px 11px; border: 1px solid rgba(228, 250, 250, 0.72); border-radius: 6px; background: rgba(4, 28, 33, 0.86); color: #fff; font-size: 0.75rem; font-weight: 650; letter-spacing: 0.01em; box-shadow: 0 5px 14px rgba(0, 8, 12, 0.35); }
.comparison-label--before { left: 14px; }
.comparison-label--after { right: 14px; }
.product-characteristics { position: absolute; bottom: 14px; left: 14px; z-index: 1; width: min(260px, calc(100% - 28px)); max-height: calc(100% - 74px); overflow-y: auto; overscroll-behavior: contain; padding: 14px 16px; border-radius: 12px; background: rgba(4, 28, 33, 0.92); color: var(--studio-ink); box-shadow: 0 5px 14px rgba(0, 8, 12, 0.35); cursor: auto; }
.product-characteristics summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 24px; cursor: pointer; list-style: none; border-radius: 4px; }
.product-characteristics summary::-webkit-details-marker { display: none; }
.product-characteristics summary:hover { color: var(--studio-accent); }
.product-characteristics summary:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 4px; }
.product-characteristics h2 { margin: 0; font-size: 0.8125rem; font-weight: 650; line-height: 1.4; }
.characteristics-chevron { flex-shrink: 0; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transform: rotate(180deg); }
.product-characteristics[open] .characteristics-chevron { transform: rotate(0deg); }
.product-characteristics[open] summary { margin-bottom: 10px; }
.product-characteristics ul { margin: 0; padding-left: 16px; color: var(--studio-muted); font-size: 0.75rem; line-height: 1.5; overflow-wrap: anywhere; }
.product-characteristics li + li { margin-top: 7px; }
@media (max-width: 767px) { .product-characteristics { width: min(220px, calc(100% - 28px)); max-height: calc(50% - 28px); padding: 12px; } }
.comparison-slider { position: absolute; top: 50%; left: var(--comparison-split); z-index: 3; display: grid; width: 44px; height: 44px; place-items: center; padding: 0; transform: translate(-50%, -50%); border: 2px solid #fff; border-radius: 50%; background: rgba(11, 35, 40, 0.88); color: #fff; box-shadow: 0 3px 12px rgba(0, 8, 12, 0.48); cursor: ew-resize; pointer-events: auto; touch-action: none; transition: background-color 120ms ease, box-shadow 120ms ease; }
.comparison-slider:hover, .comparison-slider.is-dragging { background: #116874; box-shadow: 0 4px 16px rgba(0, 8, 12, 0.6); }
.comparison-slider svg { display: block; width: 23px; height: 23px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.comparison-slider:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
.viewer-help { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 16px; border-radius: 10px; color: #c2dedd; font-size: 0.75rem; }
.control-panel { position: relative; isolation: isolate; min-width: 0; border-radius: var(--studio-radius); box-shadow: var(--studio-elevation); }
.control-panel, .viewer-toolbar, .viewer-help {
    background: #0c3035;
    border: 1px solid var(--studio-glass-edge);
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .control-panel, .viewer-toolbar, .viewer-help {
        background: var(--studio-glass);
        -webkit-backdrop-filter: blur(20px) saturate(120%);
        backdrop-filter: blur(20px) saturate(120%);
    }
    .viewer-toolbar, .viewer-help { background: rgba(5, 34, 39, 0.88); }
}
.control-panel::before {
    content: ''; position: absolute; inset: 0; z-index: -1;
    transform: translate(6px, 7px); border-radius: inherit;
    border: 1px solid rgba(101, 205, 211, 0.3);
    background: rgba(5, 51, 58, 0.2); pointer-events: none;
}
.control-panel::after {
    content: ''; position: absolute; inset: 0; z-index: -1;
    border-radius: inherit; pointer-events: none;
    background: linear-gradient(125deg, rgba(161,233,234,0.1), rgba(161,233,234,0.02) 32%, transparent 32.2%, transparent 74%, rgba(34,169,188,0.08));
}
.viewer-toolbar, .viewer-help {
    box-shadow: inset 0 1px 0 rgba(202,251,250,0.3), 0 6px 18px rgba(0,8,12,0.35);
    background-image: linear-gradient(125deg, rgba(171,240,241,0.07) 0 34%, transparent 34.3%);
}
.form-select option { background: #0b3037; color: var(--studio-ink); }
.controls { padding: 26px 24px 0; }
.panel-heading { margin-bottom: 28px; }
.panel-heading h2 { margin: 0 0 8px; font-size: 1.125rem; font-weight: 650; letter-spacing: -0.02em; }
.panel-heading p { margin: 0; color: var(--studio-muted); font-size: 0.8125rem; line-height: 1.6; }
.option-section + .option-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--studio-line); }
.option-section-heading { margin-bottom: 16px; }
.option-section-heading h3 { margin: 0 0 5px; color: var(--studio-ink); font-size: 0.9375rem; font-weight: 650; letter-spacing: -0.01em; }
.option-section-heading p { margin: 0; color: var(--studio-muted); font-size: 0.75rem; line-height: 1.5; }
.controls > .mb-3, .controls > template > .mb-3 { margin-bottom: 24px !important; }
.material-comparison-controls { margin: 6px 0 24px; padding: 18px 14px 4px; border: 1px solid rgba(151,217,219,0.38); border-radius: 10px; background: rgba(4, 35, 40, 0.55); }
.material-comparison-controls h3 { margin: 4px 0 16px; font-size: 0.875rem; font-weight: 650; }
.comparison-hint { margin: 2px 0 12px; color: var(--studio-muted); font-size: 0.75rem; line-height: 1.5; }
.form-label { margin-bottom: 8px; color: var(--studio-ink); font-size: 0.8125rem; font-weight: 600; }
.form-select, .form-control { min-height: 44px; border: 1px solid var(--studio-line); border-radius: 8px; background-color: var(--studio-field); color: var(--studio-ink); font-size: 0.875rem; box-shadow: inset 0 1px 0 rgba(182,239,239,0.16), 3px 4px 8px rgba(0,8,12,0.3); transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease; }
.form-select {
    --bs-form-select-bg-img: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23c2dedd' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e");
    padding: 10px 36px 10px 12px; cursor: pointer;
    border-color: rgba(151,217,219,0.55); border-bottom-color: #58abb6;
    background-image: var(--bs-form-select-bg-img), linear-gradient(125deg, rgba(180,242,242,0.08) 0 38%, transparent 38.5%), linear-gradient(180deg, rgba(94,198,207,0.04), rgba(2,108,93,0.06));
    background-position: right 12px center, center, center;
    background-size: 16px 12px, 100% 100%, 100% 100%;
}
.form-select:hover:not(:disabled), .form-control:hover:not(:disabled) { border-color: #58abb6; background-color: #123f47; }
.form-select:focus, .form-control:focus { border-color: var(--studio-accent); outline: 2px solid var(--studio-accent); outline-offset: 2px; box-shadow: inset 0 -2px 0 rgba(72,217,222,0.5), 0 6px 14px rgba(22,166,190,0.22); }
.form-select:disabled, .form-control:disabled { background-color: #102f35; color: #91b6b8; cursor: wait; }
.debug-panel { margin: 28px -24px 0; border-top: 1px solid var(--studio-line); }
.debug-panel summary { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 20px 24px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; list-style: none; border-radius: 0 0 var(--studio-radius) var(--studio-radius); }
.debug-panel summary::-webkit-details-marker { display: none; }
.debug-panel summary::after { flex-shrink: 0; content: ''; width: 7px; height: 7px; margin-left: auto; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); transition: transform 160ms ease; }
.debug-panel[open] summary::after { transform: rotate(225deg); }
.debug-panel summary:hover { background: var(--studio-field); }
.debug-panel summary span { min-width: 0; color: var(--studio-muted); font-size: 0.75rem; font-weight: 400; }
.debug-row { min-width: 0; padding: 0 24px 24px; border: 0; }
.debug-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 10px; }
.debug-button { flex: 1 1 110px; min-height: 40px; padding: 8px 12px; border: 1px solid var(--studio-line); border-radius: 8px; background: var(--studio-field); color: var(--studio-ink); font: inherit; font-size: 0.75rem; cursor: pointer; }
.debug-button--primary { background: #126575; border-color: #58abb6; }
.debug-button:hover:not(:disabled) { background: #16505a; border-color: var(--studio-accent); }
.debug-button:focus-visible { outline: 2px solid var(--studio-accent); outline-offset: 3px; }
.debug-button:disabled { opacity: 0.5; cursor: wait; }
.debug-storage-note, .debug-settings-message { color: var(--studio-muted); font-size: 0.75rem; line-height: 1.5; margin: 0 0 18px; }
.debug-settings-message { color: var(--studio-ink); }
.debug-row h5 { margin: 24px 0 16px; padding-top: 20px; border-top: 1px solid #30575c; font-size: 0.875rem; font-weight: 650; }
.debug-row .input-group { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 12px; }
.debug-row .input-group > .form-control { width: 100%; min-width: 0; border-radius: 8px !important; font-variant-numeric: tabular-nums; }
.form-check { display: flex; align-items: start; gap: 10px; padding-left: 0; }
.form-check-input { flex: 0 0 auto; float: none; width: 18px; height: 18px; margin: 2px 0 0; border-color: #5b8a8d; cursor: pointer; }
.form-switch .form-check-input { width: 2.25rem; }
.form-check-input { background-color: #092b32; }
.form-check-input:checked { background-color: #16869a; border-color: var(--studio-accent); box-shadow: inset 0 1px 2px rgba(255,255,255,0.35), 0 3px 8px rgba(22,166,190,0.25); }
.form-check-input:focus { border-color: var(--studio-accent); outline: 2px solid var(--studio-accent); outline-offset: 3px; box-shadow: none; }
.form-check-label { color: var(--studio-muted); font-size: 0.8125rem; line-height: 1.5; cursor: pointer; }
.form-range { height: 24px; accent-color: var(--studio-accent); }
.form-range::-webkit-slider-runnable-track { height: 4px; background: #49777b; }
.form-range::-moz-range-track { height: 4px; background: #49777b; }
.form-range::-webkit-slider-thumb { width: 16px; height: 16px; margin-top: -6px; background: var(--studio-accent); }
.form-range::-moz-range-thumb { width: 16px; height: 16px; background: var(--studio-accent); }
.form-range:disabled { opacity: 0.45; }
.form-range:disabled::-webkit-slider-thumb { background: #5b8a8d; }
.form-range:disabled::-moz-range-thumb { background: #5b8a8d; }
.startup-loading-overlay { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border-radius: var(--studio-radius); background: #04171bf5; color: var(--studio-muted); font-size: 0.875rem; }
.loading-spinner { width: 32px; height: 32px; border: 3px solid #49777b; border-top-color: var(--studio-accent); border-radius: 50%; animation: spinner-rotation 0.75s linear infinite; }
.loading-spinner--small { width: 18px; height: 18px; border-width: 2px; }
.texture-loading { display: flex; align-items: center; gap: 10px; min-height: 44px; color: var(--studio-muted); font-size: 0.8125rem; }
@keyframes spinner-rotation { to { transform: rotate(360deg); } }
@media (min-width: 1600px) { .configurator-layout { grid-template-columns: minmax(0, 1fr) 380px; } }
@media (max-width: 1023px) { .configurator-layout { grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; } .controls { padding: 24px 20px 0; } .debug-panel { margin-inline: -20px; } .debug-panel summary, .debug-row { padding-inline: 20px; } }
@media (max-width: 767px) { .configurator-layout { grid-template-columns: minmax(0, 1fr); } .viewer { position: relative; top: auto; } .canvas-container { height: 52svh; min-height: 300px; max-height: 520px; } .viewer-toolbar { padding: 14px 16px; } .viewer-help { padding: 10px 8px; gap: 6px; font-size: 0.6875rem; } }
@media (prefers-reduced-transparency: reduce) {
    .control-panel, .viewer-toolbar, .viewer-help { background: #0c3035; -webkit-backdrop-filter: none; backdrop-filter: none; } .control-panel::before, .control-panel::after { display: none; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } .loading-spinner { animation-duration: 1.5s; } }
</style>
