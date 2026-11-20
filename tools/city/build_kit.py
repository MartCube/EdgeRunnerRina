"""A kit of facade and roof clutter, built in Blender, that the site scatters over the city.

Run (Blender 4.2+ or the `bpy` pip package):
    python tools/city/build_kit.py out.glb

Every piece is built at the origin. Wall pieces have their back on the wall (Blender y = 0)
and stick out towards -Y, which the site turns to face the street. Roof pieces stand on
z = 0. Each exported mesh is named `<piece>__<material>`; the site makes one instanced
mesh per name, so a piece can have several materials and still cost one draw each.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bar, box, cyl, export, join, mat, reset, sag  # noqa: E402

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'city-kit.glb'
reset()

metal = mat('metal', 0x7a82a0, metal=0.5, rough=0.45)
dark = mat('dark', 0x15151d, metal=0.3, rough=0.65)
concrete = mat('concrete', 0x34304a, rough=0.9)
rust = mat('rust', 0x8a4a36, metal=0.3, rough=0.7)
warm = mat('warm', 0xffc890, emit=0xffa860, strength=2.4)
led = mat('led', 0xff3040, emit=0xff3040, strength=5)
cloth_p = mat('cloth_pink', 0xff5ad8, rough=0.9, emit=0xff2bd6, strength=0.25)
cloth_c = mat('cloth_cyan', 0x5ae8ff, rough=0.9, emit=0x00c8e0, strength=0.2)
cloth_w = mat('cloth_white', 0xd8d4e8, rough=0.9)

pieces = {}


def piece(name, objs):
    """Joins a piece's parts by material and names them for the site."""
    by_mat = {}
    for o in objs:
        by_mat.setdefault(o.data.materials[0].name, []).append(o)
    for m, group in by_mat.items():
        o = join(group, f'{name}__{m}') if len(group) > 1 else group[0]
        o.name = f'{name}__{m}'
    pieces[name] = list(by_mat)


# ---- AC unit on a bracket: 1.1 wide, sticks out 0.75 ----
p = [box('b', (0, -0.42, 0.42), (1.1, 0.62, 0.78), metal),
     cyl('fan', (0.12, -0.74, 0.42), 0.27, 0.03, dark, rot=(math.pi / 2, 0, 0), sides=20),
     box('grill', (-0.38, -0.735, 0.42), (0.18, 0.02, 0.6), dark),
     bar('br', (-0.45, 0, -0.05), (-0.45, -0.7, -0.05), 0.025, dark),
     bar('br', (0.45, 0, -0.05), (0.45, -0.7, -0.05), 0.025, dark),
     bar('br', (-0.45, 0, -0.5), (-0.45, -0.68, -0.05), 0.02, dark),
     bar('br', (0.45, 0, -0.5), (0.45, -0.68, -0.05), 0.02, dark),
     box('led', (-0.38, -0.745, 0.76), (0.05, 0.02, 0.05), led),
     bar('drip', (0.5, -0.2, 0.05), (0.5, -0.2, -1.4), 0.015, dark)]
piece('ac', p)

# ---- Balcony: slab, railing, a lit window behind, laundry on a line. 3.4 wide ----
p = [box('slab', (0, -0.65, 0), (3.4, 1.3, 0.16), concrete),
     box('win', (0, -0.02, 1.35), (2.2, 0.04, 1.9), warm),
     box('frame', (0, -0.04, 1.35), (0.06, 0.06, 1.9), dark),
     box('frame', (0, -0.04, 0.42), (2.3, 0.06, 0.06), dark),
     box('frame', (0, -0.04, 2.3), (2.3, 0.06, 0.06), dark)]
for x in (-1.65, 1.65):
    p.append(bar('rail', (x, -1.25, 0.08), (x, -1.25, 1.05), 0.03, metal))
    p.append(bar('rail', (x, -1.25, 1.05), (x, -0.05, 1.05), 0.03, metal))
p.append(bar('rail', (-1.65, -1.25, 1.05), (1.65, -1.25, 1.05), 0.03, metal))
p.append(bar('rail', (-1.65, -1.25, 0.55), (1.65, -1.25, 0.55), 0.02, metal))
for k in range(12):
    x = -1.5 + k * 0.273
    p.append(bar('rail', (x, -1.25, 0.08), (x, -1.25, 1.05), 0.012, metal))
p.append(sag('line', (-1.6, -0.9, 1.9), (1.6, -0.9, 1.9), 0.12, 0.008, dark))
for k, (x, w, h, m) in enumerate([(-1.1, 0.45, 0.6, cloth_p), (-0.45, 0.6, 0.4, cloth_w), (0.3, 0.4, 0.7, cloth_c), (0.95, 0.5, 0.45, cloth_w)]):
    z = 1.9 - 0.12 * 4 * ((x + 1.6) / 3.2) * (1 - (x + 1.6) / 3.2) - h / 2
    p.append(box('cloth', (x, -0.9, z), (w, 0.02, h), m))
p.append(box('box', (1.1, -0.5, 0.33), (0.6, 0.5, 0.5), metal))
piece('balcony', p)

# ---- Fire escape, one floor high (3.6): landing, rails, a stair down ----
FLOOR = 3.6
p = [box('deck', (0, -0.6, 0), (4.0, 1.2, 0.06), rust)]
for x in (-2.0, 2.0):
    p.append(bar('post', (x, -1.2, 0), (x, -1.2, 1.0), 0.03, rust))
p.append(bar('rail', (-2.0, -1.2, 1.0), (2.0, -1.2, 1.0), 0.03, rust))
p.append(bar('rail', (-2.0, -1.2, 0.5), (2.0, -1.2, 0.5), 0.02, rust))
for k in range(9):
    p.append(bar('bal', (-1.8 + k * 0.45, -1.2, 0), (-1.8 + k * 0.45, -1.2, 1.0), 0.012, rust))
# The stair runs from this landing down to the one below.
p.append(bar('stringer', (1.2, -0.25, 0), (-1.6, -0.25, -FLOOR), 0.03, rust))
p.append(bar('stringer', (1.2, -0.95, 0), (-1.6, -0.95, -FLOOR), 0.03, rust))
for k in range(1, 12):
    t = k / 12
    x, z = 1.2 - 2.8 * t, -FLOOR * t
    p.append(box('tread', (x, -0.6, z), (0.22, 0.7, 0.03), rust))
p.append(bar('bracket', (-1.8, 0, -0.5), (-1.8, -1.15, 0), 0.025, rust))
p.append(bar('bracket', (1.8, 0, -0.5), (1.8, -1.15, 0), 0.025, rust))
piece('escape', p)

# ---- Pipe, 1 high: the site stretches it up a facade ----
p = [cyl('pipe', (0, -0.3, 0.5), 0.14, 1.0, metal, sides=10),
     cyl('pipe2', (0.36, -0.22, 0.5), 0.08, 1.0, rust, sides=8)]
piece('pipe', p)

# ---- Wall vent: louvred box ----
p = [box('vent', (0, -0.18, 0), (1.4, 0.36, 0.9), metal)]
for k in range(5):
    p.append(box('louvre', (0, -0.37, -0.32 + k * 0.16), (1.3, 0.04, 0.05), dark, rot=(0.5, 0, 0)))
piece('vent', p)

# ---- Roof water tank ----
p = []
for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
    p.append(bar('leg', (dx * 1.1, dy * 1.1, 0), (dx * 0.9, dy * 0.9, 2.4), 0.08, rust))
p += [box('deck', (0, 0, 2.4), (2.8, 2.8, 0.14), rust),
      cyl('tank', (0, 0, 3.9), 1.5, 2.9, metal, sides=20),
      cyl('top', (0, 0, 5.6), 1.58, 0.5, metal, sides=20, r2=0.2),
      cyl('band', (0, 0, 3.0), 1.53, 0.1, rust, sides=20),
      cyl('band', (0, 0, 4.6), 1.53, 0.1, rust, sides=20)]
piece('tank', p)

# ---- Roof stair hut with a lit door ----
p = [box('hut', (0, 0, 1.6), (3.6, 3.0, 3.2), concrete),
     box('roof', (0, -0.2, 3.28), (3.9, 3.6, 0.16), dark),
     box('door', (0.6, -1.52, 1.1), (1.0, 0.05, 2.1), dark),
     box('lamp', (0.6, -1.6, 2.4), (0.3, 0.16, 0.14), warm)]
piece('hut', p)

# ---- Antenna cluster with a warning light ----
p = [bar('mast', (0, 0, 0), (0, 0, 7), 0.07, metal),
     bar('mast', (0.8, 0.3, 0), (0.8, 0.3, 4.5), 0.05, metal),
     box('led', (0, 0, 7.05), (0.22, 0.22, 0.22), led)]
for z in (2.5, 4.0, 5.5):
    p.append(bar('x', (-0.6, 0, z), (0.6, 0, z), 0.025, metal))
p.append(cyl('dish', (0.8, 0.3, 4.2), 0.6, 0.25, metal, rot=(1.0, 0, 0.6), sides=18, r2=0.08))
piece('antenna', p)

export(out)
for name, mats in pieces.items():
    print(name, mats)
