# Rina Manda

A scroll-driven portfolio site built around Rina Manda, a cyborg street courier. One delivery, seen through her cyber eye.

The page does not scroll. One scroll (or swipe) starts a flight that plays by itself: over a generated night city, down between the towers and up to Rina's rooftop. There she waits as a cyan hologram and looks around now and then. Pointing at her draws an outline; clicking her plays her heart pose, materialises her from the feet up and opens her file: who she is, her cyberware (pick a part and the camera moves in on it) and her character sheets.

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
- `app/experience/chapters/rooftop.ts` is Rina's roof, the camera in front of her, and her fallback 2D card.
- `app/experience/rina.ts` is the rigged Rina: her animations (wait, look_around, heart_pose), the hologram and its materialise sweep, the hover outline, and the swap to a high-detail model (slot `rina-hd`) when one is listed.
- `app/experience/props.ts` loads Blender models into named slots. See `public/models/README.md` for the slots and export settings.
- `app/experience/audio.ts` plays the track and counts beats at 123 BPM.
- `app/experience/parked/eye.ts` is the code-built cyber eye intro, set aside for now and not loaded.

Placeholders are marked `PLACEHOLDER` in the code and with dashed gold tags on the page. Add `?lite=1` or `?lite=0` to the address to force the light or full renderer.

`npm run demo` builds the same site as a single HTML file in `demo/dist`, for sharing a preview without a deploy.

## For the final site

- **The city must read as more cyberpunk and more futuristic** than this demo (Martin, 14 Nov 2026). The demo city is a base layer. Ideas to get there: megastructures and stacked street levels instead of plain towers, flying traffic in dense lanes, giant holograms, more vertical clutter (pipes, walkways, cables, ads on every surface), and Blender-made hero buildings and props in the model slots.
- The eye intro is set aside for now (`app/experience/parked/eye.ts`).
- Rina's model comes from Tripo (Mixamo rig); `tools/rina-model` turns the raw export in `source-models/` into the web file. The props are still to be made.
