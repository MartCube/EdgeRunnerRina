import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
const [src, out, baseP, mrP, armMetal] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const mat = doc.getRoot().listMaterials()[0];
if (armMetal === '1') {
  mat.getBaseColorTexture().setImage(fs.readFileSync(baseP)).setMimeType('image/png');
  mat.getMetallicRoughnessTexture().setImage(fs.readFileSync(mrP)).setMimeType('image/png');
}
mat.setName('rina');
for (const a of doc.getRoot().listAnimations()) a.setName(a.getName().replace(/\.\d+$/, ''));
await doc.transform(
  dedup(), prune(), resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, resize: [2048, 2048], quality: 88 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normal|metallicRoughness)/, resize: [1024, 1024], quality: 90 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(out, doc);
console.log(out, (fs.statSync(out).size/1e6).toFixed(2), 'MB');
