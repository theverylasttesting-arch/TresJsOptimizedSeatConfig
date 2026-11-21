import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnimationClip, AnimationMixer, FloatType, MeshStandardMaterial, Object3D, VectorKeyframeTrack } from 'three';
import { LUTCubeLoader } from 'three/addons/loaders/LUTCubeLoader.js';
import { applyMaterialProperties, sampleLut } from '../src/components/tres/materials.js';
import { ProductConfigurator } from '../src/components/tres/ProductConfigurator.js';

test('accessory sound starts once on the first moving frame in either direction', () => {
    for (const direction of ['forward', 'reverse']) {
        const model = new Object3D();
        const configurator = Object.create(ProductConfigurator.prototype);
        configurator.controls = { update() {} };
        configurator.mixer = new AnimationMixer(model);
        configurator.clips = [new AnimationClip('accessory', 1, [
            new VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0]),
        ])];
        const positionsAtSoundStart = [];
        configurator.playProductAnimation(direction, () => positionsAtSoundStart.push(model.position.x));
        assert.equal(positionsAtSoundStart.length, 0);
        configurator.update(0);
        assert.equal(positionsAtSoundStart.length, 0);
        configurator.update(0.05);
        assert.equal(positionsAtSoundStart.length, 1);
        assert.ok(Math.abs(positionsAtSoundStart[0] - (direction === 'forward' ? 0.05 : 0.95)) < 0.00001);
        configurator.update(0.05);
        assert.equal(positionsAtSoundStart.length, 1);
        configurator.mixer.stopAllAction();
        configurator.mixer.uncacheRoot(model);
    }
});

test('every configured model, material, texture and HDR asset exists', () => {
    const products = JSON.parse(fs.readFileSync('public/products.json')).products;
    for (const product of products) {
        const buffer = fs.readFileSync(`public${product.model}`);
        assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
        const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
        const names = new Set(gltf.materials.map(material => material.name));
        const configurations = [...(product.materialDefaults ?? []), ...(product.textureGroups ?? [])];
        for (const configuration of configurations) {
            for (const name of configuration.materialNames) assert.ok(names.has(name), `GLB material missing: ${name}`);
            for (const set of configuration.textureSets ?? [configuration]) {
                for (const url of Object.values(set.maps ?? {})) assert.ok(fs.existsSync(`public${url}`), `Missing texture: ${url}`);
            }
        }
    }
    for (const environment of JSON.parse(fs.readFileSync('public/environment-maps.json')).environments) assert.ok(fs.existsSync(`public${environment.url}`));
});

test('gloss metadata translates to roughness and preserves explicit zero values', () => {
    const material = new MeshStandardMaterial();
    applyMaterialProperties(material, { gloss: .15, metalness: 0, opacity: .5 });
    assert.equal(material.roughness, .85);
    assert.equal(material.metalness, 0);
    assert.equal(material.transparent, true);
    applyMaterialProperties(material, { gloss: .2, glossInvert: true, opacity: 1 });
    assert.equal(material.roughness, .2);
    assert.equal(material.transparent, false);
    material.dispose();
});

test('all shipped LUTs preserve signed and extended values in the configurator and preview', async t => {
    // Replace network I/O only; exercise the actual configurator loader and texture type.
    t.mock.method(LUTCubeLoader.prototype, 'loadAsync', function (url) {
        return Promise.resolve(this.parse(fs.readFileSync(`public${url}`, 'utf8')));
    });
    const configurator = Object.create(ProductConfigurator.prototype);
    configurator.lutVersion = 0;
    configurator.lutCache = new Map();
    configurator.lutPass = {};
    const manifest = JSON.parse(fs.readFileSync('public/assets/luts/luts.json'));
    for (const lut of manifest.luts) {
        const preview = await configurator.setColorLut(lut);
        const result = await configurator.lutCache.get(lut.file);
        assert.equal(configurator.lutPass.lut.type, FloatType, lut.file);
        const rows = fs.readFileSync(`public/assets/luts/${lut.file}`, 'utf8').split(/\r?\n/)
            .filter(line => /^[-+\d.]/.test(line)).map(line => line.trim().split(/\s+/).map(Number));
        assert.equal(rows.length, result.size ** 3, lut.file);
        for (let index = 0; index < rows.length; index++) {
            for (let channel = 0; channel < 3; channel++) {
                assert.equal(result.texture3D.image.data[index * 4 + channel], Math.fround(rows[index][channel]), lut.file);
            }
        }
        // Check the preview against original file values at saturated, non-neutral colors.
        const indices = [1, result.size - 1, rows.length - 1,
            rows.findIndex(row => row.some(value => value < 0)),
            rows.findIndex(row => row.some(value => value > 1))].filter(index => index >= 0);
        for (const index of indices) {
            const rgb = [index % result.size, Math.floor(index / result.size) % result.size,
                Math.floor(index / (result.size ** 2))].map(value => value / (result.size - 1));
            sampleLut(result, rgb).forEach((value, channel) => {
                assert.ok(Math.abs(value - rows[index][channel]) < 0.000001, `${lut.file}: preview channel ${channel}`);
            });
        }
        assert.ok(preview.every(item => /^#[0-9a-f]{6}$/.test(item.result)), lut.file);
        result.texture3D.dispose();
    }
});

test('LUT preview interpolates both byte and float textures using their correct ranges', () => {
    const cube = 'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
    for (const loader of [new LUTCubeLoader(), new LUTCubeLoader().setType(FloatType)]) {
        const lut = loader.parse(cube);
        const rgb = [.13, .47, .81];
        sampleLut(lut, rgb).forEach((value, channel) => assert.ok(Math.abs(value - rgb[channel]) < 0.000001));
        lut.texture3D.dispose();
    }
});
