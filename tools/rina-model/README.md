# Rina model pipeline

Turns the raw Tripo export (`source-models/rina.glb`) into the web model (`public/models/rina.glb`):
chrome on the cyber arm and knees, WebP textures (2048 colour, 1024 normal and metal/roughness),
meshopt-compressed geometry and animation, and clip names without Blender's `.001` suffix.

```bash
cd tools/rina-model
npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
pip install pillow numpy
W=/tmp/rina-work && mkdir -p $W/tex
node extract.mjs ../../source-models/rina.glb $W/tex       # pulls the textures out (base colour = 0_0.jpg, metal/rough = ess.png)
node tris.mjs ../../source-models/rina.glb $W/armtris.json # UV triangles of the right arm (by bone weights) and the knees
python3 metal.py $W                                        # paints chrome into the colour and metal/roughness maps
node build.mjs ../../source-models/rina.glb ../../public/models/rina.glb $W/base_new.png $W/mr_new.png 1
```

How the chrome is found: triangles weighted to the right arm bones (RightArm, RightForeArm, RightHand
and fingers), plus the light parts of the knee band. Inside those, near-white and grey texels become
polished chrome, gold stays gold but metallic, pink pistons get half metal, and skin is left alone.
