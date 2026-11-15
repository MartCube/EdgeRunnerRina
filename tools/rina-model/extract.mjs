import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
for (const t of doc.getRoot().listTextures()) {
  const ext = t.getMimeType()==='image/png'?'png':'jpg';
  fs.writeFileSync(`${process.argv[3]}/${t.getName().slice(-3)}.${ext}`, t.getImage());
}
const m = doc.getRoot().listMaterials()[0];
console.log(m.getMetallicFactor(), m.getRoughnessFactor(), m.getBaseColorFactor());
