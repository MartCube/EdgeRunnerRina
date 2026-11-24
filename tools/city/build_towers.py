"""Twelve street towers, modelled in Blender, that replace the plain boxes on many street lots.

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


def frame(part, x, cy, z0, z1, w, t=0.3):
    """A neon outline on a sign board facing the street: four thin tubes, not a solid panel."""
    return [b(part, x, cy, z1 - t, z1, 0.12, w), b(part, x, cy, z0, z0 + t, 0.12, w),
            b(part, x, cy - w / 2 + t / 2, z0, z1, 0.12, t), b(part, x, cy + w / 2 - t / 2, z0, z1, 0.12, t)]


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
      ] + frame('neon_cyan', 4.36, 0, 70.6, 83.6, 17.2)
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

# ---- G: pagoda crown, a plain shaft topped by flared tiers ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_cyan')
p.append(b('wall', 0, 0, POD, 78, 24, 24))
for k in range(4):
    z0 = 78 + k * 9
    w = 22 - k * 4
    p.append(b('wall', 0, 0, z0, z0 + 6, w, w))
    roof = cyl('flare', (0, 0, z0 + 7), (w + 7) * 0.72, 2.2, M['trim'], sides=4, r2=(w - 1) * 0.72)
    roof.rotation_euler = (0, 0, math.pi / 4)
    p.append(('trim', roof))
    glow = cyl('edge', (0, 0, z0 + 6.0), (w + 7) * 0.72 + 0.05, 0.2, M['neon_pink'], sides=4)
    glow.rotation_euler = (0, 0, math.pi / 4)
    p.append(('neon_pink', glow))
p.append(('trim', cyl('spire', (0, 0, 122), 0.6, 12, M['trim'], sides=6, r2=0.08)))
tower('pagoda', p)

# ---- H: Kowloon cluster, flats piled on flats, air conditioners everywhere ----
p = podium()
p += ledge(POD, 30, 30)
z = POD
while z < 96:
    hgt = random.uniform(6, 14)
    for _ in range(3):
        w = random.uniform(9, 16)
        d = random.uniform(9, 16)
        cx = random.uniform(-14 + w / 2, 14 - w / 2) + 1.5
        cy = random.uniform(-14 + d / 2, 14 - d / 2)
        top = min(z + hgt * random.uniform(0.8, 1.6), 104)
        p.append(b('wall', cx, cy, z, top, w, d))
        p.append(b('trim', cx, cy, top, top + 0.5, w + 0.4, d + 0.4))
        for _ in range(4):
            az = random.uniform(z + 1, top - 1)
            ay = random.uniform(cy - d / 2 + 1, cy + d / 2 - 1)
            p.append(b('trim', cx + w / 2 + 0.45, ay, az, az + 0.8, 0.9, 1.1))
        if random.random() < 0.35:
            p.append(b(random.choice(['neon_pink', 'neon_cyan']), cx + w / 2 + 0.06, cy, z + 0.5, top - 0.5, 0.12, 0.25))
    z += hgt
p += mast(2, 3, 104, 10)
tower('cluster', p)

# ---- I: hotel, a slab with a tall sign frame on its corner and a helipad ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_pink')
p.append(b('wall', -1, 0, POD, 96, 26, 22))
p += [b('trim', 14.5, 12.5, POD + 4, 92, 3.2, 1.2), b('trim', 14.5, 12.5, POD + 4, POD + 4.6, 3.6, 1.6)]
for zz in range(int(POD) + 8, 90, 8):
    p.append(b('neon_cyan' if (zz // 8) % 2 else 'neon_pink', 16.15, 12.5, zz, zz + 5.5, 0.12, 0.9))
p.append(b('trim', -1, 0, 96, 97, 27, 23))
p.append(('trim', cyl('pad', (-1, 0, 97.6), 9, 1.2, M['trim'], sides=24)))
p.append(('neon_cyan', cyl('padring', (-1, 0, 98.25), 7.5, 0.12, M['neon_cyan'], sides=24)))
tower('hotel', p)

# ---- J: ring arcology, a round tower wrapped in floating rings ----
p = podium()
p += ledge(POD, 30, 30, neon='neon_cyan')
p.append(('wall', cyl('core', (0, 0, (POD + 128) / 2), 12.5, 128 - POD, M['wall'], sides=12)))
for zz in (42, 74, 106):
    p.append(('trim', cyl('ring', (0, 0, zz), 15, 1.6, M['trim'], sides=24)))
    p.append(('neon_pink', cyl('glow', (0, 0, zz - 0.9), 15.05, 0.18, M['neon_pink'], sides=24)))
p.append(('trim', cyl('top', (0, 0, 129), 12.5, 2, M['trim'], sides=12, r2=6)))
p += mast(0, 0, 130, 12)
tower('rings', p)

# ---- K: squat block crowded with antennas, dishes and a billboard ----
p = podium()
p += ledge(POD, 30, 30)
p.append(b('wall', -1, 0, POD, 46, 27, 28))
p.append(b('trim', -1, 0, 46, 46.6, 27.6, 28.6))
for _ in range(9):
    x, y, hh = random.uniform(-12, 8), random.uniform(-12, 12), random.uniform(4, 11)
    p.append(('trim', cyl('ant', (x, y, 46 + hh / 2), 0.18, hh, M['trim'], sides=6)))
for x, y in ((-8, 8), (-6, -9)):
    dish = cyl('dish', (x, y, 48), 2.2, 0.5, M['trim'], sides=16, r2=0.4)
    dish.rotation_euler = (0, 0.9, 0)
    p.append(('trim', dish))
p += [b('trim', 9, 0, 46, 56, 0.6, 20)] + frame('neon_pink', 9.35, 0, 46.4, 55.6, 19.4)
tower('antenna', p)

# ---- L: night market, two low floors under big sign boards ----
p = podium(30, 30)
p.append(b('wall', -2, 0, POD, 30, 26, 30))
p.append(b('trim', -2, 0, 30, 30.6, 26.6, 30.6))
for y, part in ((-8, 'neon_cyan'), (7, 'neon_pink')):
    p += [b('trim', 11.6, y, 16, 27, 0.5, 12)] + frame(part, 11.9, y, 16.4, 26.6, 11.4)
p.append(b('trim', 2, 0, 30.6, 36, 8, 10))
p.append(('trim', cyl('tank', (-8, 7, 33.5), 2.6, 5, M['trim'], sides=14)))
tower('market', p)

# ==== Megabuildings for the far skyline: names start with "mega_" ====

def band(z, r, part='neon_cyan', sides=4, rot=math.pi / 4):
    o = cyl('band', (0, 0, z), r, 0.5, M[part], sides=sides)
    o.rotation_euler = (0, 0, rot)
    return (part, o)


# ---- Arcology: stacked megablocks, each set in, with sky gardens between ----
p = []
z, w = 0.0, 30.0
for k in range(6):
    hgt = [60, 70, 60, 55, 45, 35][k]
    p.append(b('wall', 0, 0, z, z + hgt, w, w))
    p.append(b('trim', 0, 0, z + hgt, z + hgt + 1.2, w + 1.6, w + 1.6))
    p.append(b('neon_pink' if k % 2 else 'neon_cyan', 0, 0, z + hgt + 1.25, z + hgt + 1.6, w + 1.7, w + 1.7))
    # A sky garden: a narrower recessed core before the next block.
    z += hgt + 1.2
    p.append(b('wall', 0, 0, z, z + 6, w * 0.55, w * 0.55))
    for dx, dy in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        p.append(b('trim', dx * w * 0.42, dy * w * 0.42, z, z + 6, 1.2, 1.2))
    z += 6
    w *= 0.86
for k in range(5):
    p.append(b('neon_pink', w / 2 + 0.5, -w / 2 + 2 + k * (w - 4) / 4, 4, z - 10, 0.3, 0.5))
p += mast(0, 0, z, 60)
p += mast(w * 0.3, w * 0.3, z, 30)
tower('mega_arcology', p)

# ---- Spire: a cathedral of tapering tiers ending in a needle ----
p = []
z, r = 0.0, 15.0
for k in range(7):
    hgt = 70 - k * 6
    o = cyl('tier', (0, 0, z + hgt / 2), r, hgt, M['wall'], sides=8, r2=r * 0.86)
    o.rotation_euler = (0, 0, math.pi / 8)
    p.append(('wall', o))
    p.append(band(z + hgt, r * 0.9, 'neon_cyan' if k % 2 else 'neon_pink', sides=8, rot=math.pi / 8))
    z += hgt
    r *= 0.84
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    fin = box('fin', (math.cos(ang) * 13, math.sin(ang) * 13, 120), (1.2, 1.2, 240), M['trim'])
    fin.rotation_euler = (math.sin(ang) * 0.06, -math.cos(ang) * 0.06, 0)
    p.append(('trim', fin))
    p.append(b('neon_pink', math.cos(ang) * 13.7, math.sin(ang) * 13.7, 10, 220, 0.25, 0.25))
p.append(('trim', cyl('needle', (0, 0, z + 50), r, 100, M['trim'], sides=8, r2=0.2)))
p.append(b('neon_cyan', 0, 0, z + 98, z + 101, 1.5, 1.5))
tower('mega_spire', p)

# ---- Disc: a tower carrying a huge platform near the top ----
p = []
p.append(b('wall', 0, 0, 0, 260, 22, 22))
for zz in range(40, 260, 40):
    p.append(b('trim', 0, 0, zz, zz + 1, 23.6, 23.6))
p.append(('trim', cyl('stem', (0, 0, 280), 8, 40, M['trim'], sides=16, r2=14)))
p.append(('wall', cyl('disc', (0, 0, 306), 34, 12, M['wall'], sides=40, r2=28)))
p.append(('trim', cyl('lip', (0, 0, 299.5), 34.6, 1.2, M['trim'], sides=40)))
p.append(('neon_pink', cyl('edge', (0, 0, 300.3), 34.7, 0.4, M['neon_pink'], sides=40)))
p.append(('wall', cyl('dome', (0, 0, 318), 16, 12, M['wall'], sides=24, r2=6)))
p += mast(0, 0, 324, 40)
for zz in range(20, 250, 22):
    p.append(b('neon_cyan', 11.06, 0, zz, zz + 0.4, 0.12, 22))
tower('mega_disc', p)

# ---- Helix: a round tower wrapped in a rising neon spiral ----
p = []
p.append(('wall', cyl('core', (0, 0, 160), 13, 320, M['wall'], sides=16, r2=10)))
steps = 140
for k in range(steps):
    t = k / steps
    ang = t * math.pi * 2 * 6
    rr = 13.6 - 3.0 * t
    seg = box('h', (math.cos(ang) * rr, math.sin(ang) * rr, 8 + t * 300), (1.4, 0.5, 0.5), M['neon_pink'])
    seg.rotation_euler = (0, 0, ang + math.pi / 2)
    p.append(('neon_pink', seg))
for zz in (80, 160, 240):
    p.append(('trim', cyl('ring', (0, 0, zz), 17 - zz * 0.012, 2, M['trim'], sides=24)))
    p.append(('neon_cyan', cyl('rg', (0, 0, zz - 1.1), 17.05 - zz * 0.012, 0.25, M['neon_cyan'], sides=24)))
p += mast(0, 0, 320, 50)
tower('mega_helix', p)

# ---- Slabs: three blades of different heights, bridged ----
p = []
for y, h in ((-10, 300), (0, 360), (10, 250)):
    p.append(b('wall', 0, y, 0, h, 30, 8.5))
    p.append(b('trim', 0, y, h, h + 2, 31, 9.5))
    p.append(b('neon_cyan' if y else 'neon_pink', 15.06, y, 10, h - 4, 0.12, 0.4))
for zz in (90, 170, 230):
    p.append(b('wall', 3, 0, zz, zz + 8, 14, 28))
    p.append(b('neon_pink', 10.06, 0, zz + 3.5, zz + 4.2, 0.12, 28))
p += mast(0, 0, 362, 50)
tower('mega_slabs', p)

export(out)
print('wrote', out)
