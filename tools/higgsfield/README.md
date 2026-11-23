# Higgsfield assets

Art made with Higgsfield for the city.

| File | Made with | Used by |
| --- | --- | --- |
| `public/img/ads/<brand>.webp` (and `-lite`) | GPT Image 2.6, 16:9, medium quality, 1k | The billboards. `AD_ART` in `app/experience/chapters/city.ts` maps each advert slot in `city/signs.ts` to a picture. The canvas-drawn adverts show until a picture loads, and stay if one fails. Lite mode loads the 512 px copies. |
| `public/models/vending.glb` | GPT Image 2.6 picture of a vending machine, then SAM 3 image-to-3D (1 credit) | Slot `street-prop`: six machines on the pavement. |

## Adding a billboard

1. Generate a 16:9 picture with the brand name and tagline big enough to read from a distance.
2. Save it as WebP at 1024x576 and 512x288 (`<name>.webp`, `<name>-lite.webp`, quality 70).
3. Put the name in `AD_ART` at the slot of the advert it replaces.

## Packing a prop

```bash
npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
node tools/higgsfield/pack-prop.mjs raw.glb public/models/vending.glb 6000 512
```

It simplifies to the triangle budget, adds normals, makes the colour texture glow faintly,
recompresses it to WebP and packs the mesh with meshopt. SAM 3 is the cheap image-to-3D model;
Tripo H3.1 costs about 9 credits a model and gives cleaner geometry if credits allow.
