# Rina Manda

A scroll-driven portfolio site built around Rina Manda, a cyborg street courier. One delivery, seen through her cyber eye.

This is the rough demo: the look, the scroll story and the eye intro. Rina herself is still her 2D art on a card until the 3D model is ready.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # static site in .output/public (what Netlify builds)
```

## How it is put together

- `app/components/RinaSite.vue` is the page: the HUD, the five chapters and the scroll wiring (GSAP ScrollTrigger).
- `app/experience/Experience.ts` owns the one WebGL canvas. The page writes scroll progress into it; it sets the camera and updates each chapter.
- `app/experience/chapters/` has one file per 3D scene: `eye.ts` (the code-built optic), `city.ts` (generated towers, signs, rain), `rooftop.ts` (Rina's placeholder card and the scan sweep) and `parcel.ts`.
- `app/experience/fx/InkEffect.ts` is the inked look: outlines from depth plus halftone, in one post-processing pass.
- `app/experience/audio.ts` plays the track and counts beats at 123 BPM.

Placeholders are marked `PLACEHOLDER` in the code and with dashed gold tags on the page.

`npm run demo` builds the same site as a single HTML file in `demo/dist`, for sharing a preview without a deploy.
