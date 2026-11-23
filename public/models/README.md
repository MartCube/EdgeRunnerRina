# Blender models

Drop GLB files here and list them in `manifest.json`. A slot with no entry keeps its code-built placeholder.

```json
{
  "rina": "rina.glb",
  "rooftop-set": "rooftop.glb",
  "city-kit": "city-kit.glb",
  "towers": "towers.glb",
  "street-prop": "vending.glb"
}
```

| Slot id | What it replaces | Notes |
| --- | --- | --- |
| `rina` | Her 2D art on the rooftop | In use: `rina.glb`, made from `source-models/rina.glb` by `tools/rina-model`. Needs the clips `wait`, `look_around` and `heart_pose` (see `app/experience/rina.ts`). |
| `rooftop-set` | The block AC units and parapet on her roof | In use: `rooftop.glb`, built by `tools/city/build_rooftop.py`. Kept at its own size (the roof is 50 across); the neon frame, mast and beacon stay in code. |
| `city-kit` | Nothing; adds clutter to the street walls and roofs | In use: `city-kit.glb`, built by `tools/city/build_kit.py`. Meshes named `<piece>__<material>`; see `app/experience/chapters/city/kit.ts`. |
| `towers` | The plain boxes on most street lots and about half the second row | In use: `towers.glb`, twelve tower designs built by `tools/city/build_towers.py`. Each is squeezed to its lot; see `app/experience/chapters/city/towers.ts`. |
| `street-prop` | Nothing; placed at six spots on the pavement | In use: `vending.glb`, a vending machine made with Higgsfield (picture, then SAM 3 image-to-3D) and packed by `tools/higgsfield/pack-prop.mjs`. Front faces +Z. |

## Export settings (File > Export > glTF 2.0)

- Format: **glTF Binary (.glb)**
- Include: Selected Objects, with only the model selected
- Transform: **+Y Up** on
- Mesh: Apply Modifiers on, UVs and Normals on
- Material: Export, images as JPEG or WebP where there is no transparency
- Animation: on only for Rina
- Compression: off in Blender. Run the file through gltf-transform afterwards (WebP textures, meshopt); the site's loader reads meshopt. `tools/rina-model/build.mjs` shows how.

Before exporting: apply scale and rotation (Ctrl+A, All Transforms) and put the origin at the base of the model. Real-world size does not matter, the site scales each model to fit its slot. Aim for under 5 MB per file; textures at 1024 or 2048 px are plenty.

The site lights models with a neutral studio environment plus pink and cyan lamps, so Principled BSDF materials (base colour, metallic, roughness, emission) come across as they look in Blender's Material Preview.
