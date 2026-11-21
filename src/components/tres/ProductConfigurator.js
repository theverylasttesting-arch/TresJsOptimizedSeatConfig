import {
    ACESFilmicToneMapping, AmbientLight, AnimationMixer, Color, DirectionalLight,
    EquirectangularReflectionMapping, FloatType, Group, LoopOnce, MathUtils, PMREMGenerator,
    RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { applyMaterialProperties, sampleLut } from './materials.js';

const presets = {
    neutral: [[2.1, [1, .96, .9], [35, 35]], [.65, [.82, .88, 1], [20, -135]], [.35, [1, 1, 1], [25, 160]]],
    soft: [[1.6, [1, .97, .92], [45, 25]], [1.05, [.9, .94, 1], [20, -145]], [.3, [1, 1, 1], [35, 155]]],
    dramatic: [[2.8, [1, .9, .78], [30, 55]], [.3, [.72, .82, 1], [15, -125]], [1.15, [.82, .9, 1], [30, 150]]],
};

export class ProductConfigurator {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.disposed = false;
        this.productVersion = 0;
        this.environmentVersion = 0;
        this.lutVersion = 0;
        this.textureCache = new Map();
        this.environmentCache = new Map();
        this.lutCache = new Map();
        this.materials = new Set();
        this.textures = new Set();
        this.baselines = new WeakMap();
        this.comparisons = new Map();
        this.comparisonEnabled = false;
        this.comparisonSplit = .5;
        this.generateTangentsOnLoad = true;
        this.pivot = new Group();
        this.pivot.name = 'ProductPivot';
        scene.add(this.pivot);
        scene.background = new Color(.78, .8, .84);
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.outputColorSpace = SRGBColorSpace;
        this.controls = new OrbitControls(camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 4;
        this.controls.maxPolarAngle = MathUtils.degToRad(170);
        this.controls.minPolarAngle = MathUtils.degToRad(10);
        this.ambient = new AmbientLight(new Color(.52, .56, .62), 1);
        scene.add(this.ambient);
        this.lights = Array.from({ length: 3 }, () => {
            const light = new DirectionalLight();
            scene.add(light, light.target);
            return light;
        });
        this.setStudioLightingPreset('neutral');
        this.pmrem = new PMREMGenerator(renderer);
        this.draco = new DRACOLoader().setDecoderPath('/draco/');
        this.loader = new GLTFLoader().setDRACOLoader(this.draco);
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));
        this.composer.addPass(new OutputPass());
        this.lutPass = new LUTPass();
        this.lutPass.enabled = false;
        this.composer.addPass(this.lutPass);
        this.size = new Vector2();
    }

    update(delta) {
        this.controls.update();
        this.mixer?.update(Math.min(delta, .1));
        if (delta > 0 && this.animationStartCallback) {
            const onStart = this.animationStartCallback;
            this.animationStartCallback = null;
            onStart();
        }
    }

    render() {
        if (this.disposed) return;
        this.renderer.getSize(this.size);
        const { x: width, y: height } = this.size;
        if (width !== this.width || height !== this.height) {
            this.composer.setSize(width, height);
            this.width = width;
            this.height = height;
        }
        // Scissor is applied to the final postprocessing pass too, so both sides
        // receive the same tone mapping and LUT without a stretched viewport.
        const renderSide = (left, sideWidth) => {
            this.renderer.setScissor(left, 0, sideWidth, height);
            this.composer.render();
        };
        if (!this.comparisonEnabled || !this.comparisons.size) {
            this.renderer.setScissorTest(false);
            this.composer.render();
            return;
        }
        const split = Math.round(width * this.comparisonSplit);
        this.renderer.setScissorTest(true);
        renderSide(0, split);
        const originals = [];
        this.product?.traverse(object => {
            if (!object.isMesh) return;
            originals.push([object, object.material]);
            const replace = material => {
                for (const materials of this.comparisons.values()) if (materials.has(material)) return materials.get(material);
                return material;
            };
            object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
        });
        try { renderSide(split, width - split); }
        finally {
            for (const [object, material] of originals) object.material = material;
            this.renderer.setScissorTest(false);
        }
    }

    async loadProductFromMetadata(metadata) {
        const version = ++this.productVersion;
        const gltf = await this.loader.loadAsync(metadata.model);
        if (this.disposed || version !== this.productVersion) {
            this.disposeObject(gltf.scene);
            return null;
        }
        this.clearMaterialComparisons();
        this.animationStartCallback = null;
        this.mixer?.stopAllAction();
        if (this.model) this.mixer?.uncacheRoot(this.model);
        if (this.product) { this.pivot.remove(this.product); this.disposeObject(this.product); }
        this.model = gltf.scene;
        this.product = new Group();
        this.product.add(this.model);
        this.pivot.add(this.product);
        this.model.traverse(object => {
            if (!object.isMesh) return;
            const clone = original => {
                const material = original.clone();
                this.materials.add(material);
                for (const value of Object.values(material)) if (value?.isTexture) this.textures.add(value);
                return material;
            };
            const original = object.material;
            object.material = Array.isArray(original) ? original.map(clone) : clone(original);
            // GLTFLoader owns the discarded source material, but its textures
            // remain shared with the clones and are disposed separately.
            (Array.isArray(original) ? original : [original]).forEach(material => material.dispose());
        });
        this.clips = gltf.animations;
        this.mixer = new AnimationMixer(this.model);
        this.generateTangents();
        return this.product;
    }

    disposeObject(root) {
        const materials = new Set();
        root.traverse(object => {
            object.geometry?.dispose();
            object.skeleton?.dispose();
            for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) materials.add(material);
        });
        for (const material of materials) { material.dispose(); this.materials.delete(material); }
    }

    hasProductAnimation() { return Boolean(this.clips?.length); }
    playProductAnimation(direction, onStart) {
        if (!this.mixer || !this.clips?.length || this.disposed) return;
        for (const clip of this.clips) {
            const action = this.mixer.clipAction(clip);
            action.reset();
            action.setLoop(LoopOnce, 1);
            action.clampWhenFinished = true;
            action.timeScale = direction === 'reverse' ? -1 : 1;
            action.time = direction === 'reverse' ? clip.duration : 0;
            action.play();
        }
        // Fire on the first frame that advances the accessory, immediately before rendering.
        this.animationStartCallback = onStart;
    }

    getMaterials(names = []) {
        const materials = new Set();
        this.product?.traverse(object => {
            if (!object.isMesh) return;
            for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (names.includes(material.name)) materials.add(material);
        });
        return [...materials];
    }

    loadTexture(url, srgb = false) {
        const key = `${url}:${srgb}`;
        if (!this.textureCache.has(key)) {
            const loading = new TextureLoader().loadAsync(url).then(texture => {
                texture.flipY = false;
                texture.wrapS = texture.wrapT = RepeatWrapping;
                if (srgb) texture.colorSpace = SRGBColorSpace;
                texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
                if (this.disposed) { texture.dispose(); throw new Error('Configurator disposed'); }
                this.textures.add(texture);
                return texture;
            }).catch(error => { this.textureCache.delete(key); throw error; });
            this.textureCache.set(key, loading);
        }
        return this.textureCache.get(key);
    }

    async applyToMaterials(textureSet, materials) {
        const maps = textureSet.maps ?? {};
        const definitions = [['baseColor', 'map', true], ['normal', 'normalMap'], ['ao', 'aoMap'], ['metalness', 'metalnessMap']];
        const loaded = await Promise.all(definitions.map(async ([key, property, srgb]) => maps[key] ? [property, await this.loadTexture(maps[key], srgb)] : null));
        const orm = maps.orm ? await this.loadTexture(maps.orm) : null;
        for (const material of materials) {
            for (const entry of loaded) if (entry) material[entry[0]] = entry[1];
            if (maps.baseColor) material.color.setRGB(1, 1, 1);
            if (orm) {
                material.aoMap = material.roughnessMap = material.metalnessMap = orm;
                material.roughness = material.metalness = 1;
            }
            applyMaterialProperties(material, textureSet.properties);
        }
    }
    async applyTextureSet(textureSet, names) {
        const product = this.product;
        const materials = this.getMaterials(names);
        await this.applyToMaterials(textureSet, materials);
        if (product !== this.product) return;
        for (const material of materials) this.baselines.delete(material);
    }
    setGroupMaterialSettings(names, properties, enabled) {
        for (const material of this.getMaterials(names)) {
            if (!this.baselines.has(material)) this.baselines.set(material, { metalness: material.metalness, roughness: material.roughness, opacity: material.opacity, transparent: material.transparent, reflectivity: material.reflectivity });
            Object.assign(material, this.baselines.get(material));
            if (enabled) applyMaterialProperties(material, properties);
            material.needsUpdate = true;
            for (const group of this.comparisons.values()) {
                const comparison = group.get(material);
                if (comparison) {
                    Object.assign(comparison, this.baselines.get(material));
                    if (enabled) applyMaterialProperties(comparison, properties);
                    comparison.needsUpdate = true;
                }
            }
        }
    }
    async prepareMaterialComparison(id, textureSet, names, isCurrent) {
        const product = this.product;
        const materials = new Map(this.getMaterials(names).map(material => [material, material.clone()]));
        try {
            await this.applyToMaterials(textureSet, [...materials.values()]);
            if (this.disposed || product !== this.product || !isCurrent()) {
                materials.forEach(material => material.dispose());
                return;
            }
            this.setMaterialComparison(id, materials);
        } catch (error) { materials.forEach(material => material.dispose()); throw error; }
    }
    setMaterialComparison(id, materials) {
        this.comparisons.get(id)?.forEach(material => material.dispose());
        if (materials) this.comparisons.set(id, materials);
        else this.comparisons.delete(id);
    }
    clearMaterialComparisons() { for (const id of this.comparisons.keys()) this.setMaterialComparison(id, null); }
    setMaterialComparisonEnabled(value) { this.comparisonEnabled = Boolean(value); }
    setMaterialComparisonSplit(value) { this.comparisonSplit = Math.max(.05, Math.min(.95, value)); }

    async loadEnvironment(metadata) {
        const version = ++this.environmentVersion;
        if (!this.environmentCache.has(metadata.url)) {
            const loading = new RGBELoader().loadAsync(metadata.url).then(texture => {
                if (this.disposed) { texture.dispose(); throw new Error('Configurator disposed'); }
                texture.mapping = EquirectangularReflectionMapping;
                const target = this.pmrem.fromEquirectangular(texture);
                return { texture, target };
            }).catch(error => { this.environmentCache.delete(metadata.url); throw error; });
            this.environmentCache.set(metadata.url, loading);
        }
        const environment = await this.environmentCache.get(metadata.url);
        if (this.disposed || version !== this.environmentVersion) return;
        this.environment = environment;
        this.scene.background = environment.texture;
        this.scene.backgroundIntensity = metadata.skyboxIntensity ?? 1;
        this.setAmbientLightOverride(this.ambientOverride);
    }
    setAmbientLightOverride(enabled) {
        this.ambientOverride = Boolean(enabled);
        this.scene.environment = this.ambientOverride ? null : this.environment?.target.texture ?? null;
    }
    setExposure(value) { this.renderer.toneMappingExposure = Number(value); }
    setAmbientLightStrength(value) { this.ambient.intensity = Number(value); }
    setDirectionalLightsEnabled(enabled) { this.lights.forEach(light => { light.visible = Boolean(enabled); }); }
    setStudioLightingPreset(id) {
        const settings = presets[id];
        if (!settings) return;
        settings.forEach(([intensity, rgb, [pitch, yaw]], index) => {
            const light = this.lights[index];
            light.intensity = intensity;
            light.color.setRGB(...rgb);
            const direction = new Vector3(0, 0, 1).applyEuler(this.pivot.rotation.clone().set(MathUtils.degToRad(pitch), MathUtils.degToRad(yaw), 0));
            light.position.copy(direction.multiplyScalar(5));
        });
    }
    async setColorLut(lut, intensity = .65) {
        const version = ++this.lutVersion;
        if (!lut) { this.lutPass.enabled = false; return null; }
        if (!this.lutCache.has(lut.file)) {
            // These grading tables contain negative and >1 values. Unsigned bytes
            // wrap those values, creating false-color bands instead of smooth grading.
            this.lutCache.set(lut.file, new LUTCubeLoader().setType(FloatType).loadAsync(`/assets/luts/${lut.file}`).then(result => {
                if (this.disposed) { result.texture3D.dispose(); throw new Error('Configurator disposed'); }
                return result;
            }).catch(error => { this.lutCache.delete(lut.file); throw error; }));
        }
        const result = await this.lutCache.get(lut.file);
        if (this.disposed || version !== this.lutVersion) return null;
        this.lutPass.lut = result.texture3D;
        this.lutPass.intensity = Number(intensity);
        this.lutPass.enabled = true;
        const hex = values => '#' + values.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0')).join('');
        return [['Sombras', [.15, .15, .15]], ['Medios', [.5, .5, .5]], ['Luces', [.85, .85, .85]]].map(([label, rgb]) => {
            const transformed = sampleLut(result, rgb).map((value, index) => rgb[index] * (1 - intensity) + value * intensity);
            return { label, source: hex(rgb), result: hex(transformed) };
        });
    }
    setGenerateTangentsOnLoad(enabled) { this.generateTangentsOnLoad = Boolean(enabled); this.generateTangents(); }
    generateTangents() {
        if (!this.generateTangentsOnLoad) return;
        this.product?.traverse(object => {
            const geometry = object.geometry;
            if (geometry?.index && geometry.attributes.normal && geometry.attributes.uv) geometry.computeTangents();
        });
    }
    setPivotPosition({ x, y, z }) { this.pivot.position.set(x, y, z); }
    setProductPosition(x, y, z) { this.product?.position.set(x, y, z); }
    setProductRotation(x, y, z) { this.product?.rotation.set(...[x, y, z].map(MathUtils.degToRad)); }
    setProductScale(value) { this.product?.scale.setScalar(value); }
    applyProductTransform({ position, rotation, scale }) {
        this.setProductPosition(position.x, position.y, position.z);
        this.setProductRotation(rotation.x, rotation.y, rotation.z);
        this.setProductScale(scale);
    }
    dispose() {
        this.disposed = true;
        this.animationStartCallback = null;
        this.controls.dispose();
        this.draco.dispose();
        this.mixer?.stopAllAction();
        if (this.model) this.mixer?.uncacheRoot(this.model);
        this.clearMaterialComparisons();
        if (this.product) this.disposeObject(this.product);
        this.textures.forEach(texture => texture.dispose());
        for (const promise of this.environmentCache.values()) promise.then(({ texture, target }) => { texture.dispose(); target.dispose(); }).catch(() => {});
        for (const promise of this.lutCache.values()) promise.then(lut => lut.texture3D.dispose()).catch(() => {});
        this.composer.passes.forEach(pass => pass.dispose?.());
        this.composer.dispose();
        this.pmrem.dispose();
        this.scene.remove(this.pivot, this.ambient, ...this.lights, ...this.lights.map(light => light.target));
        this.scene.environment = null;
        this.scene.background = null;
    }
}
