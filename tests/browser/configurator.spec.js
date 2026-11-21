import { test, expect } from '@playwright/test';

test('loads the real model and exercises finishes, comparison, lighting, LUTs and transforms', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/.netlify/functions/debug-settings', route => route.fulfill({ json: { settings: null } }));
    await page.goto('/');
    await expect(page.locator('.startup-loading-overlay')).toBeHidden();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('#product-select')).toHaveValue('amaya');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#texture-set-upholstery')).toHaveValue('tela-3-gris');
    await page.locator('#texture-set-upholstery').selectOption('tela-2-azul');
    await expect(page.locator('#texture-set-upholstery')).toBeVisible();
    await page.locator('#material-comparison-enabled').check();
    await page.locator('#comparison-set-upholstery').selectOption('tela-6-azul');
    await expect(page.locator('.comparison-overlay')).toBeVisible();
    const slider = page.getByRole('slider', { name: 'Mover la división entre los acabados actual y de comparación' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '51');
    await page.screenshot({ path: 'test-results/comparison.png' });
    await page.locator('#studio-lighting-select').selectOption('dramatic');
    await page.locator('#environment-select').selectOption('hangar');
    await expect(page.locator('#environment-select')).toBeEnabled();
    await page.locator('#color-lut-select').selectOption('natural-boost');
    await expect(page.locator('.lut-preview')).toBeVisible();
    const colors = await page.locator('.lut-preview-pair span').evaluateAll(spans => spans.map(span => span.style.backgroundColor));
    expect(colors.every(Boolean)).toBeTruthy();
    await page.locator('#color-lut-select').selectOption('');
    await page.locator('#material-comparison-enabled').uncheck();
    const animation = page.locator('#product-animation');
    if (await animation.count()) {
        await animation.selectOption('forward');
        await animation.selectOption('reverse');
    }
    await page.locator('details').last().evaluate(element => { element.open = true; });
    await page.getByRole('spinbutton', { name: 'Escala del producto' }).fill('0.12');
    await page.getByRole('spinbutton', { name: 'Escala del producto' }).dispatchEvent('input');
    await page.screenshot({ path: 'test-results/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
    expect(errors).toEqual([]);
});
