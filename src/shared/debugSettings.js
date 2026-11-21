export const DEBUG_DEFAULTS = Object.freeze({
    generateTangentsOnLoad: true,
    exposure: 1.35,
    ambientLight: 1,
    overrideHdrAmbient: false,
    directionalLightsEnabled: true
});

export const isValidTransform = transform => Boolean(transform &&
    ['position', 'rotation'].every(key =>
        ['x', 'y', 'z'].every(axis => Number.isFinite(transform[key]?.[axis]))
    ) && Number.isFinite(transform.scale) && transform.scale > 0);

export const isValidSceneSettings = scene => Boolean(scene &&
    ['generateTangentsOnLoad', 'overrideHdrAmbient', 'directionalLightsEnabled']
        .every(key => typeof scene[key] === 'boolean') &&
    Number.isFinite(scene.exposure) && scene.exposure >= 0 && scene.exposure <= 3 &&
    Number.isFinite(scene.ambientLight) && scene.ambientLight >= 0 && scene.ambientLight <= 2);

export const isValidDebugSettings = settings => Boolean(settings?.version === 1 &&
    isValidSceneSettings(settings.scene) && settings.products &&
    typeof settings.products === 'object' && !Array.isArray(settings.products) &&
    Object.values(settings.products).every(isValidTransform));
