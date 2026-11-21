import { UnsignedByteType } from 'three';

// Keep the metadata format shared with the original configurator.
export function applyMaterialProperties(material, properties = {}) {
    if ('metalness' in properties) material.metalness = properties.metalness;
    if ('gloss' in properties) material.roughness = properties.glossInvert ? properties.gloss : 1 - properties.gloss;
    if ('opacity' in properties) {
        material.opacity = properties.opacity;
        material.transparent = properties.opacity < 1;
    }
    if ('reflectivity' in properties) material.reflectivity = properties.reflectivity;
    if ('refraction' in properties && 'transmission' in material) material.transmission = properties.refraction;
    material.needsUpdate = true;
}

export function sampleLut(lut, rgb) {
    const { data } = lut.texture3D.image;
    const scale = lut.texture3D.type === UnsignedByteType ? 255 : 1;
    const n = lut.size;
    const position = rgb.map(value => Math.max(0, Math.min(1, value)) * (n - 1));
    const low = position.map(Math.floor);
    const high = low.map(value => Math.min(n - 1, value + 1));
    const blend = position.map((value, axis) => value - low[axis]);
    const result = [0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
        const indices = low.map((value, axis) => corner & (1 << axis) ? high[axis] : value);
        const weight = blend.reduce((total, value, axis) => total * (corner & (1 << axis) ? value : 1 - value), 1);
        const index = 4 * (indices[0] + n * indices[1] + n * n * indices[2]);
        for (let channel = 0; channel < 3; channel++) result[channel] += data[index + channel] / scale * weight;
    }
    return result;
}
