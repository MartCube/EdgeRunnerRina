"""Six street towers, modelled in Blender, that replace the plain boxes on many street lots.

Run (Blender 4.2+ or the `bpy` pip package):
    python tools/city/build_towers.py out.glb

Each tower stands on z = 0 with a 30 x 30 footprint centred on the origin, and its street
face towards Blender +X (three.js +X). The site squeezes each one to its lot, so only the
proportions matter. Every tower exports as up to four meshes named `<tower>__<part>`:

- `wall`: the parts with windows. The site draws them with the city's window shader, which
  lays floors and windows out by world position, so walls should be flat and upright.
- `trim`: ledges, fins, frames and spires, drawn plain dark.
- `neon_pink`, `neon_cyan`: glowing strips.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import box, cyl, export, join, mat, reset  # noqa: E402

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'towers.glb'
reset()
random.seed(7)

# The colours only matter in Blender; the site swaps in its own materials by part name.
M = {
    'wall': mat('wall', 0x2a2840, rough=0.6),
    'trim': mat('trim', 0x14141c, metal=0.4, rough=0.6),
    'neon_pink': mat('neon_pink', 0xff2a6d, emit=0xff2a6d, strength=4),
    'neon_cyan': mat('neon_cyan', 0x00f0ff, emit=0x00f0ff, strength=4),
}
H = 15.0  # half the footprint
POD = 14.0  # podium height: shopfronts go on its street face


def tower(name, parts):
    """parts: list of (part, object). Joins them per part and names them for the site."""
    import bpy
    by = {}
    for part, o in parts:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.data.materials.clear()
        o.data.materials.append(M[part])
        by.setdefault(part, []).append(o)
    for part, objs in by.items():
        o = join(objs, f'{name}__{part}') if len(objs) > 1 else objs[0]
        o.name = f'{name}__{part}'


def b(part, cx, cy, z0, z1, sx, sy):
    """An upright box from z0 to z1, centred on (cx, cy), sx by sy."""
    return (part, box('p', (cx, cy, (z0 + z1) / 2), (sx, sy, z1 - z0), M[part]))


def ledge(z, sx, sy, cx=0.0, over=0.9, t=0.7, neon=None):
    """A slab around a tier at height z, with a neon edge on the street side."""
    slab = [b('trim', cx, 0, z - t, z, sx + over * 2, sy + over * 2)]
    if neon:
        slab.append(b(neon, cx + sx / 2 + over + 0.06, 0, z - t * 0.65, z - t * 0.35, 0.12, sy + over * 2))
    return slab


def podium(sx=30.0, sy=30.0, cx=0.0):
    """Ground floors: shopfronts come from the window shader; a canopy over the pavement."""
    return [b('wall', cx, 0, 0, POD, sx, sy),
            b('trim', cx + sx / 2 + 1.4, 0, 4.6, 5.0, 2.8, sy - 2),
            b('neon_cyan', cx + sx / 2 + 2.8, 0, 4.62, 4.98, 0.1, sy - 2)]


def mast(x, y, z, h):
    return [('trim', cyl('m', (x, y, z + h / 2), 0.35, h, M['trim'], sides=8, r2=0.12)),
            b('neon_pink', x, y, z + h, z + h + 0.8, 0.8, 0.8)]


# ---- A: stepped tower, three setbacks with ledges, fins up the street face, a crown ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_pink')
p.append(b('wall', 0, 0, POD, 62, 26, 26))
for k in range(5):
    y = -10 + k * 5
    p.append(b('trim', 13.5, y, POD + 2, 60, 1.2, 0.5))
p += ledge(62, 26, 26, neon='neon_cyan')
p.append(b('wall', 0, 0, 62, 96, 20, 20))
p += ledge(96, 20, 20, neon='neon_pink')
p.append(b('wall', 0, 0, 96, 112, 13, 13))
for dx, dy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
    p.append(b('trim', dx * 6, dy * 6, 112, 120, 0.7, 0.7))
p += [b('trim', 0, 6, 119.4, 120, 12.7, 0.7), b('trim', 0, -6, 119.4, 120, 12.7, 0.7),
      b('trim', 6, 0, 119.4, 120, 0.7, 12.7), b('trim', -6, 0, 119.4, 120, 0.7, 12.7)]
p += mast(0, 0, 112, 14)
tower('stepped', p)

# ---- B: stacked flats, a core with boxes sticking out of it on every side ----
p = podium()
p += ledge(POD, 30, 30)
p.append(b('wall', -1, 0, POD, 86, 22, 22))
z = POD + 2
while z < 80:
    for face in range(3):
        w = random.uniform(5, 10)
        hgt = random.uniform(4, 9)
        out_ = random.uniform(2, 4)
        along = random.uniform(-7, 7)
        if face == 0:  # street face
            cx, cy, sx, sy = 10 + out_ / 2, along, out_, w
        elif face == 1:
            cx, cy, sx, sy = along - 1, 11 + out_ / 2, w, out_
        else:
            cx, cy, sx, sy = along - 1, -11 - out_ / 2, w, out_
        p.append(b('wall', cx, cy, z, z + hgt, sx, sy))
        p.append(b('trim', cx, cy, z - 0.4, z, sx + 0.6, sy + 0.6))
        if random.random() < 0.3:
            p.append(b(random.choice(['neon_pink', 'neon_cyan']), cx, cy, z + hgt, z + hgt + 0.15, sx + 0.1, sy + 0.1))
    z += random.uniform(5, 9)
p.append(('trim', cyl('tank', (-6, 4, 86 + 3), 3, 6, M['trim'], sides=14)))
p.append(b('trim', 4, -4, 86, 90, 6, 5))
p += mast(4, 6, 86, 10)
tower('stack', p)

# ---- C: chamfered tower, eight sides, banded every few floors, a spire ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_cyan')
r = 14.2
shaft = cyl('oct', (0, 0, (POD + 118) / 2), r, 118 - POD, M['wall'], sides=8)
shaft.rotation_euler = (0, 0, math.pi / 8)
p.append(('wall', shaft))
for zz in range(36, 118, 22):
    ring = cyl('ring', (0, 0, zz), r + 0.9, 0.8, M['trim'], sides=8)
    ring.rotation_euler = (0, 0, math.pi / 8)
    p.append(('trim', ring))
    glow = cyl('glow', (0, 0, zz - 0.5), r + 0.95, 0.2, M['neon_cyan'], sides=8)
    glow.rotation_euler = (0, 0, math.pi / 8)
    p.append(('neon_cyan', glow))
p.append(('trim', cyl('cap', (0, 0, 119), r * 0.8, 2, M['trim'], sides=8, r2=r * 0.55)))
p.append(('trim', cyl('spire', (0, 0, 132), 1.2, 24, M['trim'], sides=8, r2=0.1)))
p.append(b('neon_pink', 0, 0, 124, 125, 1.6, 1.6))
tower('chamfer', p)

# ---- D: twin slabs joined by skybridges ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_pink')
p += [b('wall', 0, 9, POD, 112, 28, 11), b('wall', 0, -9, POD, 92, 28, 11)]
for zz in (44, 70):
    p.append(b('wall', 2, 0, zz, zz + 5, 14, 7.2))
    p.append(b('neon_cyan', 9.06, 0, zz + 0.4, zz + 0.7, 0.12, 7.2))
for y in (14.4, 3.6, -3.6, -14.4):
    top = 112 if y > 0 else 92
    p.append(b('neon_pink' if abs(y) > 10 else 'neon_cyan', 14.06, y, POD + 1, top - 1, 0.12, 0.3))
p.append(b('trim', 0, 9, 112, 113, 28.6, 11.6))
p.append(b('trim', 0, -9, 92, 93, 28.6, 11.6))
p += mast(-6, 9, 113, 16)
tower('twin', p)

# ---- E: balcony slab, a balcony on every floor of the street face ----
p = podium()
p += ledge(POD, 30, 30)
p.append(b('wall', -1, 0, POD, 70, 24, 28))
zz = POD + 3.6
while zz < 68:
    p.append(b('trim', 12.4, 0, zz - 0.25, zz, 2.8, 26))
    p.append(b('trim', 13.7, 0, zz, zz + 1.0, 0.12, 26))
    zz += 3.6
p += [b('trim', 12.4, 13.2, POD, 70, 2.8, 0.4), b('trim', 12.4, -13.2, POD, 70, 2.8, 0.4)]
p.append(b('neon_pink', 13.85, 0, 69, 69.4, 0.12, 26))
# A billboard frame on the roof and a water tank.
p += [b('trim', 4, 0, 70, 84, 0.6, 18), b('trim', 4, 9, 70, 84, 0.8, 0.8), b('trim', 4, -9, 70, 84, 0.8, 0.8),
      b('neon_cyan', 4.36, 0, 76, 84, 0.1, 17.2)]
p.append(('trim', cyl('tank', (-7, -6, 70 + 3.5), 3.2, 7, M['trim'], sides=14)))
tower('slab', p)

# ---- F: overhang, a narrow shaft carrying a wide block over the street ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_cyan')
p.append(b('wall', -5, 0, POD, 60, 18, 24))
p.append(b('wall', 0, 0, 60, 98, 30, 30))
p.append(b('neon_pink', 15.06, 0, 60.4, 60.8, 0.12, 30))
p.append(b('trim', 0, 0, 59.4, 60, 30.4, 30.4))
for y in (-11, 11):
    brace = box('brace', (8.5, y, 50), (1.0, 1.0, 22), M['trim'])
    brace.rotation_euler = (0, -0.62, 0)
    p.append(('trim', brace))
p.append(b('trim', 0, 0, 98, 99, 30.6, 30.6))
p.append(b('trim', -6, 6, 99, 104, 8, 7))
p += mast(6, -6, 99, 12)
tower('overhang', p)

export(out)
print('wrote', out)
