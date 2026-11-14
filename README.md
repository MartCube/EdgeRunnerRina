# Rina Manda

A scroll-driven portfolio site built around Rina Manda, a cyborg street courier. One delivery, seen through her cyber eye.

This is the rough demo: the look and the scroll story. It opens on a generated night city, flies down to street level and up to Rina's rooftop. Rina herself is still her 2D art on a card until the Blender model is ready.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # static site in .output/public (what Netlify builds)
```

## How it is put together

- `app/components/RinaSite.vue` is the page: the HUD, the four chapters and the scroll wiring (GSAP ScrollTrigger).
- `app/experience/Experience.ts` owns the one WebGL canvas. The page writes scroll progress into it; it sets the camera, updates each chapter and runs the post-processing (bloom, filmic tone mapping, grain, lens fringing).
- `app/experience/chapters/city.ts` builds the city from instanced boxes and shaders: tiered towers, shopfronts, a wet street with real reflections, glow sprites, signs, billboards and traffic. Its helpers are in `chapters/city/`.
- `app/experience/chapters/rooftop.ts` is Rina's roof, her placeholder card and the scan sweep. `parcel.ts` is the last chapter.
- `app/experience/props.ts` loads Blender models into named slots. See `public/models/README.md` for the slots and export settings.
- `app/experience/audio.ts` plays the track and counts beats at 123 BPM.
- `app/experience/parked/eye.ts` is the code-built cyber eye intro, set aside for now and not loaded.

Placeholders are marked `PLACEHOLDER` in the code and with dashed gold tags on the page. Add `?lite=1` or `?lite=0` to the address to force the light or full renderer.

`npm run demo` builds the same site as a single HTML file in `demo/dist`, for sharing a preview without a deploy.

## For the final site

- **The city must read as more cyberpunk and more futuristic** than this demo (Martin, 14 Nov 2026). The demo city is a base layer. Ideas to get there: megastructures and stacked street levels instead of plain towers, flying traffic in dense lanes, giant holograms, more vertical clutter (pipes, walkways, cables, ads on every surface), and Blender-made hero buildings and props in the model slots.
- The eye intro is set aside for now (`app/experience/parked/eye.ts`).
- Rina and the props are modelled in Blender and exported as GLB, not made in Tripo.
