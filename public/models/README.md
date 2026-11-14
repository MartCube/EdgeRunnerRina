# Blender models

Drop GLB files here and list them in `manifest.json`. A slot with no entry keeps its code-built placeholder.

```json
{
  "rina": "rina.glb",
  "parcel": "parcel.glb"
}
```

| Slot id | What it replaces | Notes |
| --- | --- | --- |
| `rina` | Her 2D art on the rooftop | Standing pose, facing -Y in Blender (the front view). An idle animation plays if the file has one. |
| `parcel` | The parcel in the last chapter | About as wide as it is tall. It spins slowly, so model all sides. |
| `rooftop-set` | AC units, mast and sign frame on her roof | One object group, about 40 m wide. Leave the middle clear for her. |
| `street-prop` | Nothing yet; placed at six spots on the pavement | A vending machine, stall or terminal. |

## Export settings (File > Export > glTF 2.0)

- Format: **glTF Binary (.glb)**
- Include: Selected Objects, with only the model selected
- Transform: **+Y Up** on
- Mesh: Apply Modifiers on, UVs and Normals on
- Material: Export, images as JPEG or WebP where there is no transparency
- Animation: on only for Rina
- Compression: off for now

Before exporting: apply scale and rotation (Ctrl+A, All Transforms) and put the origin at the base of the model. Real-world size does not matter, the site scales each model to fit its slot. Aim for under 5 MB per file; textures at 1024 or 2048 px are plenty.

The site lights models with a neutral studio environment plus pink and cyan lamps, so Principled BSDF materials (base colour, metallic, roughness, emission) come across as they look in Blender's Material Preview.
