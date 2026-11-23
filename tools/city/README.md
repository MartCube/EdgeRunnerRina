# City models (Blender)

Two scripts build the city's Blender models. Both run in Blender's background mode or with the
`bpy` pip package (`pip install bpy`, Python 3.13), so no Blender window is needed.

| Script | Makes | Used by |
| --- | --- | --- |
| `build_rooftop.py` | `rooftop.glb`: Rina's roof. Stair hut with a lit door, water tank, AC units, pipes, satellite dishes, cables and puddles. | Slot `rooftop-set`. Built to scale (the roof is 50 across), with its origin in the middle of the roof surface. |
| `build_kit.py` | `city-kit.glb`: facade and roof clutter. AC units, balconies with laundry, fire escapes, pipes, vents, water tanks, stair huts and antennas. | Slot `city-kit`. `app/experience/chapters/city/kit.ts` scatters a few thousand copies over the street walls and roofs. |

```bash
pip install bpy
npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
python tools/city/build_rooftop.py /tmp/rooftop.glb
node tools/city/pack.mjs /tmp/rooftop.glb public/models/rooftop.glb
python tools/city/build_kit.py /tmp/kit.glb
node tools/city/pack.mjs /tmp/kit.glb public/models/city-kit.glb --keep-names
```

`--keep-names` matters for the kit: each mesh is named `<piece>__<material>`, and the site groups
them by piece. Without it, pieces that share a material would be merged into one.

The neon frame, mast and beacon on Rina's roof stay in code (`chapters/rooftop.ts`), because they
pulse with the music. Tripo models can join the kit later: add them as new pieces in
`build_kit.py` (import the GLB, name it `<piece>__<material>`) and give them placements in `kit.ts`.
