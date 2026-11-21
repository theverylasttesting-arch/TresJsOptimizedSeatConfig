import { test, expect } from '@playwright/test';

test('all color styles render signed LUT values without wrapping or losing interpolation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // Isolate grading from the model, lighting and materials so GPU output is measurable.
    await page.route('**/__lut-test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>LUT regression</title>' }));
    await page.goto('/__lut-test__');
    const failures = await page.evaluate(async () => {
        const { ProductConfigurator } = await import('/src/components/tres/ProductConfigurator.js');
        const { sampleLut } = await import('/src/components/tres/materials.js');
        const { DataTexture, WebGLRenderer, WebGLRenderTarget, RGBAFormat, UnsignedByteType } = await import('/node_modules/.vite/deps/three.js');
        const { LUTPass } = await import('/node_modules/three/examples/jsm/postprocessing/LUTPass.js');
        const manifest = await (await fetch('/assets/luts/luts.json')).json();
        const colors = [
            [8, 12, 40], [12, 20, 60], [30, 50, 100], [80, 100, 160],
            [0, 0, 0], [255, 255, 255], [128, 128, 128],
            [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255],
        ];
        const input = new DataTexture(new Uint8Array(colors.flatMap(rgb => [...rgb, 255])), colors.length, 1, RGBAFormat, UnsignedByteType);
        input.needsUpdate = true;
        const renderer = new WebGLRenderer();
        renderer.setSize(colors.length, 1);
        const target = new WebGLRenderTarget(colors.length, 1, { type: UnsignedByteType });
        const configurator = Object.create(ProductConfigurator.prototype);
        Object.assign(configurator, { lutVersion: 0, lutCache: new Map(), lutPass: new LUTPass() });
        const failures = [];
        for (const lut of manifest.luts) {
            for (const intensity of [0, .65, 1]) {
                await configurator.setColorLut(lut, intensity);
                const table = await configurator.lutCache.get(lut.file);
                configurator.lutPass.render(renderer, target, { texture: input });
                const pixels = new Uint8Array(colors.length * 4);
                renderer.readRenderTargetPixels(target, 0, 0, colors.length, 1, pixels);
                colors.forEach((color, index) => {
                    const rgb = color.map(value => value / 255);
                    const graded = sampleLut(table, rgb);
                    rgb.forEach((value, channel) => {
                        const expected = Math.round(Math.max(0, Math.min(1, value * (1 - intensity) + graded[channel] * intensity)) * 255);
                        const actual = pixels[index * 4 + channel];
                        if (Math.abs(actual - expected) > 2) failures.push({ lut: lut.id, intensity, color, channel, expected, actual });
                    });
                });
            }
        }
        for (const entry of configurator.lutCache.values()) (await entry).texture3D.dispose();
        configurator.lutPass.dispose();
        input.dispose();
        target.dispose();
        renderer.dispose();
        return failures;
    });
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
});
