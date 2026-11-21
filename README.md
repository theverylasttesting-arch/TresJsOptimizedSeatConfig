# Optimized Seat Configurator · TresJS

This repository contains the optimized assets for Cloudflare hosting. The original high-resolution assets remain in `TresJSSeatConfig`.

## Optimized assets

Models use Draco geometry and embedded WebP textures, capped at 2048 pixels, with mesh simplification disabled. The viewer decodes these files automatically before rendering. The seat retains its named materials and accessory animation. Draco quantization and WebP encoding can be lossy; decoding does not recover discarded detail.

Standalone base-color textures use WebP quality 90 where smaller. Normal and ORM maps retain their original files unless lossless WebP is smaller. HDR environments are 2048×1024 Radiance files, downsampled in linear radiance so they retain HDR lighting intensity. Unused texture exports and the stale product backup are excluded.

`npm run check:assets` checks source public assets against Cloudflare's 25 MiB per-file limit. `npm run build` also checks every generated file in `dist`. Set Cloudflare's build command to `npm run build`, output directory to `dist`, and Node version to 22 or newer. Dependencies, build output and test screenshots are ignored by Git.

Shared debug settings currently use the Netlify Function documented below. Cloudflare needs an equivalent API implementation to share those settings; static viewing and configuration work without it, using defaults.

Vue 3 product configurator ported from [theverylasttesting-arch/SeatConfigurator](https://github.com/theverylasttesting-arch/SeatConfigurator) to TresJS 5 and Three.js. This is an independent project: it does not share Git history, remotes, build outputs, or deployment identity with the PlayCanvas repository.

## Development

Use Node.js 22 or newer (required by TresJS's VueUse dependency).

```sh
npm ci
npm run dev
```

`npm run build` creates `dist`; `npm run preview` serves that build.

## Rendering and controls

`src/ProductView.vue` preserves the Spanish configuration interface. `src/components/tres/ConfiguratorScene.vue` connects TresCanvas's camera, scene, renderer, and render loop to `ProductConfigurator.js`.

The port supports the supplied GLB models, material groups, base color/normal/ORM textures, side-by-side finish comparison with a draggable and keyboard-accessible divider, forward/reverse accessory animation, HDR environments, three studio-light presets, exposure and ambient controls, all thirteen color LUTs with strength and preview swatches, product transforms, and shared debug settings. Drag to orbit; scroll or pinch to zoom. Draco decoders are served locally from `public/draco`.

Product metadata remains in `public/products.json`; environments are in `public/environment-maps.json`; LUT definitions are in `public/assets/luts/luts.json`. The collapsible characteristics panel displays details for products with characteristics metadata.

Three.js handles ORM textures directly (red = occlusion, green = roughness, blue = metalness). Metadata gloss values convert to roughness. Three.js and PlayCanvas use different lighting and tone-mapping implementations, so lighting values and saved transforms may benefit from visual adjustment; pixel-identical rendering is not promised.

## Shared settings and Netlify

The existing Netlify Function and validation format are retained. `Guardar ajustes` saves the product transform and shared lighting/tangent settings. `Restablecer valores` resets the shared configuration. Changes affect all visitors to this new Netlify site, with per-product transforms and conditional writes for concurrent saves.

Cloudflare does not run the existing Netlify Function. Port `/.netlify/functions/debug-settings` to a Cloudflare-compatible API before relying on shared save/reset operations. Until then, the viewer uses defaults and reports the settings error. The optimized asset migration does not migrate shared storage.

For an optional Netlify deployment, the existing `netlify.toml` and Function are retained. Use a new Netlify site and its own Blobs store, separate from the original repository. Old browser-local settings are migrated only on explicit save when no shared settings exist.

## Validation

```sh
npm test
npm run test:browser
```

Unit checks verify metadata against actual GLB material names, asset paths, gloss conversion, and all shipped LUTs. Browser checks exercise the real viewer on desktop and mobile, switching finishes, comparison, environment, LUTs, and transforms. Shared storage is mocked in browser tests; deployed Netlify storage needs a separate integration check.

The browser test uses installed Microsoft Edge by default. Install Edge or change `channel` in `playwright.config.js` to a locally available Playwright browser. Test artifacts stay in ignored `test-results/`.
