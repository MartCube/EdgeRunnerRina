# Higgsfield assets

Art made with Higgsfield for the city.

| File | Made with | Used by |
| --- | --- | --- |
| `public/models/vending.glb` | GPT Image 2.6 picture of a vending machine, then SAM 3 image-to-3D (1 credit) | Slot `street-prop`: six machines on the pavement. |

## Packing a prop

```bash
npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
node tools/higgsfield/pack-prop.mjs raw.glb public/models/vending.glb 6000 512
```

It simplifies to the triangle budget, adds normals, makes the colour texture glow faintly,
recompresses it to WebP and packs the mesh with meshopt. SAM 3 is the cheap image-to-3D model;
Tripo H3.1 costs about 9 credits a model and gives cleaner geometry if credits allow.

## Skyline

`public/img/skyline.webp` (and the smaller `skyline-lite.webp`) is a Higgsfield matte painting
of a far cyberpunk skyline. `City.loadSkyline` wraps it on a mirrored cylinder far behind the
megabuildings, faded into the fog at its base.
