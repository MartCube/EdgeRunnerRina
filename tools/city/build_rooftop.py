"""Rina's rooftop, built in Blender.

Run (Blender 4.2+ or the `bpy` pip package):
    blender -b -P tools/city/build_rooftop.py -- out.glb
    python tools/city/build_rooftop.py out.glb

Units are scene units (the roof is 50 across). The origin is the middle of the roof
surface. The site keeps its own neon frame, mast and beacon (they pulse to the music),
so this set leaves them out and keeps clear of where Rina stands: Blender x -8..8,
y -25..-6, which is in front of the camera.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import bar, box, cyl, export, join, mat, merge_by_material, reset, sag, text  # noqa: E402

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'rooftop.glb'
reset()

HALF = 25
concrete = mat('concrete', 0x3a3650, rough=0.92)
cap = mat('cap', 0x5a5670, rough=0.85)
floor = mat('floor', 0x24222f, rough=0.75)
joint = mat('joint', 0x121119, rough=0.9)
metal = mat('metal', 0x6a7088, metal=0.7, rough=0.42)
dark = mat('dark', 0x16161f, metal=0.3, rough=0.6)
rust = mat('rust', 0x7a3b2c, metal=0.4, rough=0.7)
kraft = mat('kraft', 0xa8713f, rough=0.85)
puddle = mat('puddle', 0x0a0b12, metal=0.0, rough=0.04)
paint = mat('paint', 0xffe14d, rough=0.6, emit=0xffe14d, strength=0.35)
tape = mat('tape', 0xffe14d, rough=0.5, emit=0xffe14d, strength=0.6)
pink = mat('neon_pink', 0xff2bd6, emit=0xff2bd6, strength=5)
cyan = mat('neon_cyan', 0x00f0ff, emit=0x00f0ff, strength=4)
warm = mat('lamp_warm', 0xffd9a0, emit=0xffc070, strength=7)
window = mat('window_warm', 0xffb070, emit=0xff9a50, strength=2.2)

# ---- Floor: a slab with expansion joints, a little above the building's own top ----
box('floor', (0, 0, 0.05), (HALF * 2 - 1.6, HALF * 2 - 1.6, 0.1), floor)
for i in range(-4, 5):
    box(f'jx{i}', (i * 5.4, 0, 0.105), (0.12, HALF * 2 - 1.8, 0.02), joint)
    box(f'jy{i}', (0, i * 5.4, 0.105), (HALF * 2 - 1.8, 0.12, 0.02), joint)

# ---- Parapet with a cap, and a railing on the sides and back ----
for x, y, w, d in [(0, -HALF + 0.4, HALF * 2, 0.8), (0, HALF - 0.4, HALF * 2, 0.8),
                   (-HALF + 0.4, 0, 0.8, HALF * 2), (HALF - 0.4, 0, 0.8, HALF * 2)]:
    box('wall', (x, y, 0.65), (w, d, 1.3), concrete)
    box('cap', (x, y, 1.36), (w + 0.2 if w > 1 else 1.0, d + 0.2 if d > 1 else 1.0, 0.12), cap)
rail_h = 1.42 + 1.1
for side in (-1, 1):
    x = side * (HALF - 0.4)
    for y in range(-24, 25, 3):
        bar('post', (x, y, 1.42), (x, y, rail_h), 0.05, metal)
    bar('rail', (x, -HALF, rail_h), (x, HALF, rail_h), 0.06, metal)
    bar('rail', (x, -HALF, rail_h - 0.55), (x, HALF, rail_h - 0.55), 0.04, metal)
for x in range(-24, 25, 3):
    bar('post', (x, HALF - 0.4, 1.42), (x, HALF - 0.4, rail_h), 0.05, metal)
bar('rail', (-HALF, HALF - 0.4, rail_h), (HALF, HALF - 0.4, rail_h), 0.06, metal)
bar('rail', (-HALF, HALF - 0.4, rail_h - 0.55), (HALF, HALF - 0.4, rail_h - 0.55), 0.04, metal)

# ---- Stair hut: door, lamp, overhang, neon edge, stencil ----
hx, hy, hw, hd, hh = -13.0, 13.0, 8.0, 6.0, 4.4
front = hy - hd / 2
box('hut', (hx, hy, hh / 2), (hw, hd, hh), concrete)
box('hut_roof', (hx, hy - 0.3, hh + 0.12), (hw + 0.6, hd + 1.2, 0.24), cap)
box('door_frame', (hx + 2, front - 0.04, 1.3), (1.7, 0.1, 2.6), metal)
box('door', (hx + 2, front - 0.08, 1.25), (1.4, 0.06, 2.4), dark)
box('lamp_cage', (hx + 2, front - 0.22, 2.95), (0.6, 0.36, 0.3), metal)
box('lamp', (hx + 2, front - 0.26, 2.95), (0.46, 0.3, 0.2), warm)
box('window', (hx - 2.2, front - 0.04, 2.5), (1.6, 0.06, 0.9), window)
for k in range(4):
    box('window_bar', (hx - 2.2 - 0.6 + k * 0.4, front - 0.08, 2.5), (0.05, 0.04, 0.9), dark)
box('neon_edge', (hx, front - 0.92, hh - 0.05), (hw + 0.4, 0.08, 0.08), cyan)
box('neon_edge_side', (hx + hw / 2 + 0.32, hy - 0.3, hh - 0.05), (0.08, hd + 1.0, 0.08), cyan)
text('stencil', 'RM-01', (hx - 2.2, front - 0.05, 1.2), 0.9, paint)
text('open', 'OPEN 24', (hx + hw / 2 + 0.06, hy, 3.2), 0.55, pink, rot=(math.pi / 2, 0, math.pi / 2))
for k, (vx, vy) in enumerate([(-15.5, 14.5), (-11.5, 15), (-14, 11.5)]):
    cyl('vent', (vx, vy, hh + 0.24 + 0.5), 0.28, 1.0, metal)
    cyl('vent_cap', (vx, vy, hh + 0.24 + 1.1), 0.42, 0.18, dark, r2=0.1)

# Metal grating from the door towards the middle.
for k in range(6):
    box('grate', (hx + 2 + k * 1.4, front - 1.4 - k * 1.2, 0.16), (1.3, 1.6, 0.06), metal, rot=(0, 0, -0.7))

# ---- Water tank on legs, with a ladder ----
tx, ty, leg = 15.0, 15.0, 3.6
for dx, dy in ((-1.6, -1.6), (1.6, -1.6), (-1.6, 1.6), (1.6, 1.6)):
    bar('leg', (tx + dx, ty + dy, 0.1), (tx + dx * 0.8, ty + dy * 0.8, leg), 0.12, rust)
bar('brace', (tx - 1.6, ty - 1.6, 0.6), (tx + 1.3, ty - 1.3, leg - 0.4), 0.06, rust)
bar('brace', (tx + 1.6, ty - 1.6, 0.6), (tx - 1.3, ty - 1.3, leg - 0.4), 0.06, rust)
box('deck', (tx, ty, leg), (4.2, 4.2, 0.2), rust)
cyl('tank', (tx, ty, leg + 2.2), 2.3, 4.2, metal, sides=28)
cyl('tank_top', (tx, ty, leg + 4.7), 2.4, 0.8, metal, sides=28, r2=0.3)
for z in (leg + 0.8, leg + 2.2, leg + 3.6):
    cyl('band', (tx, ty, z), 2.34, 0.14, rust, sides=28)
for side in (-0.45, 0.45):
    bar('ladder', (tx + side, ty - 2.5, 0.1), (tx + side, ty - 2.5, leg + 4.3), 0.04, metal)
for k in range(1, 16):
    z = k * 0.5
    bar('rung', (tx - 0.45, ty - 2.5, z), (tx + 0.45, ty - 2.5, z), 0.03, metal)

# ---- AC units with fans ----
def ac(x, y, s=1.0, turn=0.0):
    w, d, h = 3.2 * s, 2.4 * s, 2.0 * s
    parts = [box('ac', (x, y, h / 2 + 0.3), (w, d, h), metal),
             box('ac_base', (x, y, 0.15), (w + 0.3, d + 0.3, 0.3), dark),
             cyl('fan_ring', (x, y, h + 0.32), 0.95 * s, 0.1, dark, sides=24),
             cyl('fan_hub', (x, y, h + 0.4), 0.2 * s, 0.12, metal, sides=12)]
    for k in range(4):
        a = k * math.pi / 4
        parts.append(box('blade', (x, y, h + 0.38), (1.7 * s, 0.22 * s, 0.03), metal, rot=(0.25, 0, a)))
    for k in range(5):
        parts.append(box('louvre', (x - w / 2 - 0.02, y - d / 2 + 0.3 * s + k * 0.45 * s, h / 2 + 0.3), (0.06, 0.08, h * 0.8), dark))
    if turn:
        o = join(parts, 'ac_unit')
        o.rotation_euler = (0, 0, turn)
        import bpy
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


for x in (-2.5, 2.0, 6.5):
    ac(x, 20.5)
ac(-20.5, -3.0, 0.9, math.pi / 2)
ac(-20.5, -8.0, 0.9, math.pi / 2)
ac(20.0, 0.0, 1.1, -math.pi / 2)

# ---- Pipes along the back wall, and a stack going up ----
py = 23.2
bar('pipe', (-21, py, 0.7), (21, py, 0.7), 0.22, rust, sides=12)
bar('pipe', (-21, py - 0.6, 0.45), (21, py - 0.6, 0.45), 0.14, metal, sides=12)
for x in (-18, -8, 2, 12):
    box('clamp', (x, py, 0.4), (0.3, 0.6, 0.8), dark)
bar('stack', (21, py, 0.7), (21, py, 7.5), 0.3, rust, sides=12)
cyl('stack_cap', (21, py, 7.7), 0.5, 0.4, dark, r2=0.2)
bar('pipe_up', (-9.5, py, 0.7), (-9.5, hy + hd / 2, 0.7), 0.16, metal)
bar('pipe_up', (-9.5, hy + hd / 2 + 0.2, 0.7), (-9.5, hy + hd / 2 + 0.2, 3.6), 0.16, metal)

# ---- Satellite dishes ----
def dish(x, y, r, aim):
    import bpy
    cyl('dish_post', (x, y, 0.9), 0.08, 1.8, metal)
    d = cyl('dish', (x, y, 1.9), r, 0.45, metal, sides=24, r2=0.15)
    arm = bar('dish_arm', (x, y, 1.9), (x, y, 1.9 + r * 0.9), 0.03, metal)
    o = join([d, arm], 'dish_head')
    bpy.context.scene.cursor.location = (x, y, 1.9)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.rotation_euler = (0.9, 0, aim)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


dish(21.0, 7.0, 1.4, -0.8)
dish(-21.0, 19.0, 1.0, 0.7)
dish(-6.0, 21.5, 0.8, 0.2)

# ---- A courier drone pad and parcels: this is Manda Express's roof ----
px, py2 = 15.0, -14.0
cyl('pad', (px, py2, 0.13), 4.2, 0.06, dark, sides=40)
import bpy  # noqa: E402
bpy.ops.mesh.primitive_torus_add(major_radius=3.6, minor_radius=0.12, location=(px, py2, 0.18))
bpy.context.active_object.data.materials.append(paint)
for a in (0, math.pi / 2):
    box('pad_mark', (px, py2, 0.17), (3.0, 0.3, 0.02), paint, rot=(0, 0, a + math.pi / 4))
for k in range(8):
    a = k * math.pi / 4
    box('pad_light', (px + math.cos(a) * 4.3, py2 + math.sin(a) * 4.3, 0.2), (0.25, 0.25, 0.1), cyan)

def parcel(x, y, z, w, d, h, turn=0.0):
    box('parcel', (x, y, z + h / 2), (w, d, h), kraft, rot=(0, 0, turn))
    box('parcel_tape', (x, y, z + h / 2), (w + 0.02, 0.16, h + 0.02), tape, rot=(0, 0, turn))


parcel(20.0, -8.0, 0.1, 1.4, 1.1, 0.9, 0.2)
parcel(20.2, -8.1, 1.0, 1.0, 0.8, 0.6, -0.1)
parcel(18.4, -7.2, 0.1, 0.9, 0.9, 0.7, 0.6)
parcel(-9.0, 7.5, 0.1, 1.2, 1.0, 0.8, -0.3)
parcel(-8.0, 6.2, 0.1, 0.8, 0.8, 0.6, 0.4)
parcel(-9.2, 7.4, 0.9, 0.8, 0.7, 0.5, 0.1)
box('pallet', (19.6, -7.8, 0.06), (3.2, 2.4, 0.12), rust)

# ---- Cables: hut to the mast the site draws, tank to hut ----
sag('cable', (hx + hw / 2, hy - 1, hh + 0.2), (17.0, -8.0, 15.0), 2.2, 0.035, dark)
sag('cable', (tx - 2.3, ty, leg + 3.0), (hx + hw / 2, hy + 1.5, hh), 1.4, 0.035, dark)
sag('cable', (-HALF + 0.4, -14, rail_h), (hx - hw / 2, hy - 2, hh - 0.4), 1.0, 0.03, dark)

# ---- Puddles from the rain ----
for x, y, r, sx in [(-4, -2, 2.4, 1.6), (9, 4, 1.6, 1.3), (-17, -15, 2.0, 1.8), (6, -20, 1.4, 1.2), (-2, 14, 1.8, 1.5)]:
    p = cyl('puddle', (x, y, 0.115), r, 0.01, puddle, sides=24)
    p.scale = (sx, 1, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

merge_by_material('roof')
export(out)
print('wrote', out)
