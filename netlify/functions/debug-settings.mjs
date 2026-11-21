import { getStore } from '@netlify/blobs';
import {
    DEBUG_DEFAULTS, isValidDebugSettings, isValidSceneSettings, isValidTransform
} from '../../src/shared/debugSettings.js';

const STORE_NAME = 'configurator-debug-settings';
const SETTINGS_KEY = 'shared-demo';
const isValidProductId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) &&
    !['__proto__', 'constructor', 'prototype'].includes(id);
const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export default async request => {
    if (!['GET', 'PATCH', 'DELETE'].includes(request.method)) {
        return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, PATCH, DELETE' } });
    }
    // Writes belong to this site's demo; browser requests from other origins are rejected.
    const origin = request.headers.get('origin');
    if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin) {
        return json({ error: 'Origin not allowed' }, 403);
    }
    let update;
    if (request.method === 'PATCH') {
        try {
            const text = await request.text();
            if (text.length > 65536) return json({ error: 'Settings payload too large' }, 413);
            update = JSON.parse(text);
        } catch {
            return json({ error: 'Invalid JSON' }, 400);
        }
        if (!isValidSceneSettings(update?.scene) || !isValidTransform(update?.transform) ||
            !isValidProductId(update.productId)) {
            return json({ error: 'Invalid debug settings' }, 400);
        }
        if (update.initialProducts !== undefined &&
            (!update.initialProducts || typeof update.initialProducts !== 'object' ||
                Array.isArray(update.initialProducts) ||
                !Object.entries(update.initialProducts).every(([id, transform]) =>
                    isValidProductId(id) && isValidTransform(transform)))) {
            return json({ error: 'Invalid initial product settings' }, 400);
        }
    }
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        if (request.method === 'GET') {
            const settings = await store.get(SETTINGS_KEY, { type: 'json' });
            if (settings !== null && !isValidDebugSettings(settings)) {
                throw new Error('Stored debug settings have an invalid format');
            }
            return json({ settings });
        }
        // Retry conditional writes so concurrent saves preserve other products' transforms.
        for (let attempt = 0; attempt < 3; attempt++) {
            const entry = await store.getWithMetadata(SETTINGS_KEY, { type: 'json' });
            if (request.method === 'PATCH' && entry && !isValidDebugSettings(entry.data)) {
                throw new Error('Stored debug settings have an invalid format');
            }
            const settings = request.method === 'DELETE'
                ? { version: 1, scene: { ...DEBUG_DEFAULTS }, products: {} }
                : {
                    version: 1,
                    scene: update.scene,
                    products: {
                        ...(entry ? entry.data.products : update.initialProducts),
                        [update.productId]: update.transform
                    }
                };
            // Persist a reset record so old browser-local settings cannot reappear after reset.
            const condition = entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
            const result = await store.setJSON(SETTINGS_KEY, settings, condition);
            if (result.modified) return json({ settings });
        }
        return json({ error: 'Concurrent update; please retry' }, 409);
    } catch (error) {
        console.error('Shared debug settings storage failed:', error);
        return json({ error: 'Shared settings are temporarily unavailable' }, 503);
    }
};
