// Shrinks a Blender export for the web: merges what can be merged, then meshopt.
// node tools/city/pack.mjs in.glb out.glb [--keep-names]
// --keep-names keeps every named mesh apart (the city kit, where each name is a piece).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';

const [src, out, flag] = process.argv.slice(2);
const keep = flag === '--keep-names';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
await doc.transform(dedup(), ...(keep ? [] : [flatten(), join({ keepNamed: false })]), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);

const root = doc.getRoot();
let verts = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) verts += p.getAttribute('POSITION').getCount();
console.log(out, (fs.statSync(out).size / 1e3).toFixed(0), 'KB,', root.listMeshes().length, 'meshes,',
  root.listMaterials().length, 'materials,', verts, 'vertices');
