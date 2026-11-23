// Shrinks a Higgsfield / SAM 3 image-to-3D GLB into a light street prop.
// node tools/higgsfield/pack-prop.mjs in.glb out.glb [triangles=6000] [texture=512]
// Welds, simplifies to the triangle budget, adds smooth normals, recompresses the texture to
// WebP and packs the mesh with meshopt (the site's loader reads meshopt).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, normals, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [src, out, tris = '6000', size = '512'] = process.argv.slice(2);
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);

let before = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) before += p.getIndices().getCount() / 3;
const ratio = Math.min(1, Number(tris) / before);

for (const mat of doc.getRoot().listMaterials()) {
  // Scanned props come in unlit-white or glossy; a worn painted metal reads right under the city lamps.
  mat.setMetallicFactor(0.35).setRoughnessFactor(0.55);
  // Let the painted neon and lit display glow a little, from the colour texture itself.
  const base = mat.getBaseColorTexture();
  if (base) mat.setEmissiveTexture(base).setEmissiveFactor([0.3, 0.3, 0.3]);
}
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }),
  normals({ overwrite: true }),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [Number(size), Number(size)], quality: 82 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(out, doc);

let after = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += p.getIndices().getCount() / 3;
console.log(out, (fs.statSync(out).size / 1e3).toFixed(0), 'KB,', Math.round(before), '->', Math.round(after), 'triangles');
