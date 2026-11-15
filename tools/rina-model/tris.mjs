import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const doc = await new NodeIO().read(process.argv[2]);
const skin = doc.getRoot().listSkins()[0];
const names = skin.listJoints().map(j=>j.getName());
console.error(names.join(' '));
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0'), UV = prim.getAttribute('TEXCOORD_0'), P=prim.getAttribute('POSITION');
const idx = prim.getIndices().getArray();
const arm = new Set(names.map((n,i)=>/Right(Arm|ForeArm|Hand)/.test(n)?i:-1).filter(i=>i>=0));
const n = J.getCount(); const armW = new Float32Array(n); const j=[0,0,0,0], w=[0,0,0,0];
for (let v=0; v<n; v++){ J.getElement(v,j); W.getElement(v,w); let s=0; for(let k=0;k<4;k++) if(arm.has(j[k])) s+=w[k]; armW[v]=s; }
const out=[]; const uv=[0,0]; const pos=[0,0,0];
for (let t=0;t<idx.length;t+=3){ const a=idx[t],b=idx[t+1],c=idx[t+2]; const m=(armW[a]+armW[b]+armW[c])/3; let knee=true; for(const v of [a,b,c]){P.getElement(v,pos); if(pos[1]<0.2||pos[1]>0.4) knee=false;} if(m<0.5 && !knee) continue;
  const tri=[]; for(const v of [a,b,c]){ UV.getElement(v,uv); tri.push(uv[0],uv[1]); } tri.push(m>=0.5?1:0); out.push(tri); }
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.error('arm tris', out.length, 'of', idx.length/3);
