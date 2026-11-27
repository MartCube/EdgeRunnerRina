# City models (Blender)

Two scripts build the city's Blender models. Both run in Blender's background mode or with the
`bpy` pip package (`pip install bpy`, Python 3.13), so no Blender window is needed.

| Script | Makes | Used by |
| --- | --- | --- |
| `build_rooftop.py` | `rooftop.glb`: Rina's roof. Stair hut with a lit door, water tank, AC units, pipes, satellite dishes, cables and puddles. | Slot `rooftop-set`. Built to scale (the roof is 50 across), with its origin in the middle of the roof surface. |
| `build_towers.py` | `towers.glb`: twelve street towers (stepped, stacked flats, chamfered, twin slabs, balcony slab, overhang, pagoda crown, Kowloon cluster, hotel, ring arcology, antenna block, night market). Meshes named `<tower>__<part>`: `wall`, `trim`, `neon_pink`, `neon_cyan`. | Slot `towers`. `app/experience/chapters/city/towers.ts` squeezes them onto most street lots and about half the second row in place of the plain boxes, and draws walls with the city's window shader. |
| `build_kit.py` | `city-kit.glb`: facade and roof clutter. AC units, balconies with laundry, fire escapes, pipes, vents, water tanks, stair huts and antennas. | Slot `city-kit`. `app/experience/chapters/city/kit.ts` scatters a few thousand copies over the street walls and roofs. |

```bash
pip install bpy
npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
python tools/city/build_rooftop.py /tmp/rooftop.glb
node tools/city/pack.mjs /tmp/rooftop.glb public/models/rooftop.glb
python tools/city/build_towers.py /tmp/towers.glb
node tools/city/pack.mjs /tmp/towers.glb public/models/towers.glb --keep-names
python tools/city/build_kit.py /tmp/kit.glb
node tools/city/pack.mjs /tmp/kit.glb public/models/city-kit.glb --keep-names
```

`--keep-names` matters for the kit: each mesh is named `<piece>__<material>`, and the site groups
them by piece. Without it, pieces that share a material would be merged into one.

The mast and beacon on Rina's roof stay in code (`chapters/rooftop.ts`), and everything that moves or
pulses with the music (signs, halo, koi, drone, traffic) is in `chapters/roofdress.ts`. Tripo models can join the kit later: add them as new pieces in
`build_kit.py` (import the GLB, name it `<piece>__<material>`) and give them placements in `kit.ts`.

## Megabuildings

`build_towers.py` also builds five `mega_*` designs (arcology, spire, disc, helix, slabs). The
skyline megas in `city.ts` take only these; street lots take the other twelve. Each mega is
turned by its seed so the skyline doesn't repeat.

## Around the models (code only, no assets)

- **Outer city**: a grid of plain window-shader boxes out to the horizon, taller near the centre,
  so the high opening shot has no empty ground.
- **Holo screens**: the street canyon and rooftops use additive shader screens (eye, glyph rain,
  waveform, lattice) instead of text billboards.
- **Haze**: three layers of tinted noise fog at 28, 95 and 190 m that fade as the camera passes.
- **High traffic**: 140 extra flying cars on lanes 170 to 300 m up.
- **Street life** (`city/street.ts`): about 1100 walkers on the pavements, half under umbrellas
  with neon rims, moved entirely in the vertex shader; steam columns from road vents; and
  additive lamplight cones under every street lamp. Lite mode draws half the crowd.
