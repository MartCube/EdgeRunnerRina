# Rina Manda

A portfolio site built around Rina Manda, a cyborg street courier. One delivery, seen through her cyber eye.

The page does not scroll. A second and a half after Enter, a flight starts by itself: over a generated night city, down between the towers and up to Rina's rooftop. There she waits as a cyan hologram on a projector pad, waves when the camera arrives and follows you with her head. Pointing at her draws an outline and pins scan labels to her optic, chrome arm, ink and knees; clicking her plays her heart pose, materialises her from the feet up and opens her file: who she is, her cyberware (pick a part and the camera moves in on it) and her character sheets. Once she is solid, clicking her, the dock under her or the keys 1 to 5 play her reactions (wave, chrome arm flex, heart, look around, glitch), each with a line in a speech bubble.

The plan for the richer city (Tripo models, a Blender-built scene, Higgsfield plates) is in the project's "Rina site v2" plan; this is Phase 1 of it.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # static site in .output/public (what Netlify builds)
```

## How it is put together

- `app/components/RinaSite.vue` is the page: the HUD, the steps of the visit (boot, idle, flight, landed, linked) and the timeline that flies the camera (GSAP).
- `app/components/RinaPanels.vue` is her file: the holo panels, the part list and the sheet viewer.
- `app/experience/Experience.ts` owns the one WebGL canvas. The page writes flight progress and the view around Rina into it; it sets the camera, handles hover, click and drag on her, and runs the post-processing (bloom, filmic tone mapping, grain, lens fringing).
- `app/experience/chapters/city.ts` builds the city from instanced boxes and shaders: tiered towers, shopfronts, a wet street with real reflections, glow sprites, signs, billboards and traffic. Its helpers are in `chapters/city/`.
- `app/experience/chapters/rooftop.ts` is Rina's roof, the camera in front of her, and her fallback 2D card. `chapters/roofdress.ts` dresses the roof in code: her holo pad and light column, the turning halo behind her, the vertical neon signs, parapet neon, the wet floor (rain rings and neon reflections), string lights, three holo koi, her courier drone, flying cars passing behind, and the spot lights that pick her out.
- `app/experience/rina.ts` is the rigged Rina: her animations (wait, look_around, heart_pose), poses built in code on top of them (wave and flex: each bone is swung toward a direction in her frame), head tracking, the beat nod, the glowing optic, the pink and cyan rim light, the glitch, the hologram and its materialise sweep, the hover outline, and the swap to a high-detail model (slot `rina-hd`) when one is listed.
- `app/experience/props.ts` loads Blender models into named slots. See `public/models/README.md` for the slots and export settings.
- `app/experience/audio.ts` plays the track and counts beats at 123 BPM.
- `app/experience/parked/eye.ts` is the code-built cyber eye intro, set aside for now and not loaded.

Placeholders are marked `PLACEHOLDER` in the code and with dashed gold tags on the page. Add `?lite=1` or `?lite=0` to the address to force the light or full renderer.

`npm run demo` builds the same site as a single HTML file in `demo/dist`, for sharing a preview without a deploy.

## For the final site

- **The city must read as more cyberpunk and more futuristic** than this demo (Martin, 14 Nov 2026). The demo city is a base layer. Ideas to get there: megastructures and stacked street levels instead of plain towers, flying traffic in dense lanes, giant holograms, more vertical clutter (pipes, walkways, cables, ads on every surface), and Blender-made hero buildings and props in the model slots.
- The eye intro is set aside for now (`app/experience/parked/eye.ts`).
- Rina's model comes from Tripo (Mixamo rig); `tools/rina-model` turns the raw export in `source-models/` into the web file. The props are still to be made.
