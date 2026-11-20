"""Small helpers shared by the Blender city scripts.

Blender is Z-up; the glTF exporter turns that into the site's Y-up, so a point at
Blender (x, y, z) lands at three.js (x, z, -y). The camera looks at Rina's roof from
three.js +Z, which is Blender -Y: "front" in these scripts means -Y.
"""
import math
import bpy

_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def mat(name, color, metal=0.0, rough=0.8, emit=None, strength=1.0):
    """A Principled material. `emit` makes it glow; the site's bloom picks up anything bright."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit is not None:
        p.inputs['Emission Color'].default_value = (*srgb(emit), 1)
        p.inputs['Emission Strength'].default_value = strength
    _mats[name] = m
    return m


def srgb(hexv):
    """Hex colour to linear RGB, the way Blender stores colours."""
    out = []
    for shift in (16, 8, 0):
        c = ((hexv >> shift) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def _finish(obj, material, name):
    obj.name = name
    if material is not None:
        obj.data.materials.append(material)
    return obj


def box(name, loc, size, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, material, name)


def cyl(name, loc, r, h, material, rot=(0, 0, 0), sides=16, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, material, name)


def bar(name, a, b, r, material, sides=8):
    """A round bar from point a to point b: pipes, rails, cables, ladder rungs."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cyl(name, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), r, length, material, sides=sides)
    o.rotation_mode = 'QUATERNION'
    from mathutils import Vector
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return o


def text(name, body, loc, size, material, rot=(math.pi / 2, 0, 0), extrude=0.02):
    """Flat lettering, turned into a mesh so it exports."""
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.active_object
    t.data.body = body
    t.data.size = size
    t.data.extrude = extrude
    t.data.align_x = 'CENTER'
    t.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    return _finish(bpy.context.active_object, material, name)


def sag(name, a, b, drop, r, material, steps=10):
    """A cable hanging between two points."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - drop * 4 * t * (1 - t)))
    parts = [bar(f'{name}_{i}', pts[i], pts[i + 1], r, material, sides=6) for i in range(steps)]
    return join(parts, name)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def merge_by_material(prefix):
    """One mesh per material keeps the draw calls down on the web."""
    groups = {}
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            continue
        key = o.data.materials[0].name if o.data.materials else 'none'
        groups.setdefault(key, []).append(o)
    for key, objs in groups.items():
        join(objs, f'{prefix}_{key}') if len(objs) > 1 else setattr(objs[0], 'name', f'{prefix}_{key}')


def export(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
