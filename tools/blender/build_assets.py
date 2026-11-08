# -*- coding: utf-8 -*-
"""
寒鹤博客 · 3D 素材构建脚本（Blender 5.x，headless）

用法（在仓库根目录）：
  "D:\\Blender 5.2\\blender.exe" -b -P tools/blender/build_assets.py -- \
      --scene hero --out assets/3d --render-dir .tmp-render

支持 --scene hero|music|wall|all。
产物：
  assets/3d/<scene>.glb       低模 GLB（含 PBR 材质）
  assets/3d/<scene>-draco.glb  仅用于对比 Draco 体积
  <render-dir>/<scene>.png    RGBA 静态图（之后转 WebP）

所有几何与材质都由本脚本程序化生成，没有引用任何外部贴图。
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Euler


# ---------------------------------------------------------------- 基础工具
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(value):
    v = value.lstrip("#")
    return tuple(srgb_to_linear(int(v[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.cycles.transparent_max_bounces = 3
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 20
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    return scene


def make_mat(name, color, rough=0.75, metal=0.0, emit=None, emit_strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    r, g, b = hex_rgb(color)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        er, eg, eb = hex_rgb(emit)
        bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    mat.use_backface_culling = False
    return mat


def add_mesh(name, verts, faces, materials, face_mat=None):
    """materials: 材质列表；face_mat: 每个面的材质索引"""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    for m in materials:
        ob.data.materials.append(m)
    if face_mat:
        for poly, idx in zip(me.polygons, face_mat):
            poly.material_index = idx
    for poly in me.polygons:
        poly.use_smooth = False
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box_verts(cx, cy, cz, sx, sy, sz):
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    return [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
    ]


BOX_FACES = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def add_box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.0):
    v = box_verts(0, 0, 0, *size)
    ob = add_mesh(name, v, BOX_FACES, [mat])
    ob.location = loc
    ob.rotation_euler = Euler(rot)
    if bevel:
        m = ob.modifiers.new("Bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
    return ob


def add_ico(name, loc, scale, mat, rot=(0, 0, 0), subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1.0, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.rotation_euler = Euler(rot)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def add_cylinder(name, loc, radius, depth, mat, rot=(0, 0, 0), verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = Euler(rot)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def add_camera(loc, look_at, lens=50.0):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    direction = (look_at[0] - loc[0], look_at[1] - loc[1], look_at[2] - loc[2])
    # 让相机 -Z 朝向目标
    from mathutils import Vector
    cam.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def add_area(name, loc, energy, size, color=(1, 1, 1), look_at=(0, 0, 0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = color
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    from mathutils import Vector
    ob.rotation_euler = Vector((look_at[0] - loc[0], look_at[1] - loc[1], look_at[2] - loc[2])).to_track_quat("-Z", "Y").to_euler()
    return ob


def world_ambient(strength=0.35, color="#ffffff"):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    r, g, b = hex_rgb(color)
    bg.inputs[0].default_value = (r, g, b, 1.0)
    bg.inputs[1].default_value = strength


def export_glb(objs, path, draco=False, level=6):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    if draco:
        kwargs.update(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=level,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12,
        )
    bpy.ops.export_scene.gltf(**kwargs)


def render_to(path, width, height):
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- 通用材质
def palette():
    return {
        "paper": make_mat("Paper", "#F3ECDD", 0.82),
        "paper_shade": make_mat("PaperShade", "#DED2BC", 0.86),
        "ink": make_mat("Ink", "#2C4038", 0.7),
        "sage": make_mat("Sage", "#93A890", 0.85),
        "sage_dark": make_mat("SageDark", "#6E8470", 0.85),
        "sand": make_mat("Sand", "#D9C4A3", 0.9),
        "mist": make_mat("Mist", "#E9E5D8", 0.95),
        "brass": make_mat("Brass", "#C79A55", 0.34, metal=0.75),
        "vinyl": make_mat("Vinyl", "#26332D", 0.36, metal=0.15),
        "clay": make_mat("Clay", "#C0633F", 0.7),
        "wood": make_mat("Wood", "#B78E63", 0.72),
        "matboard": make_mat("MatBoard", "#F8F4E9", 0.95),
        "glow": make_mat("Glow", "#F6E3C2", 0.9, emit="#F6E3C2", emit_strength=1.2),
    }


# ---------------------------------------------------------------- 场景一：首页 hero
def build_hero(mats):
    # —— 纸鹤（折纸低模，机身 + 展开双翼 + 长颈 + 尾）——
    P = mats["paper"]
    S = mats["paper_shade"]
    body_v = [
        (0.00, 0.62, 0.10), (-0.26, 0.02, 0.04), (0.26, 0.02, 0.04),
        (0.00, -0.58, 0.14), (0.00, 0.00, -0.16),
    ]
    body_f = [(0, 1, 3), (0, 3, 2), (0, 4, 1), (0, 2, 4), (3, 4, 2), (3, 1, 4)]
    body = add_mesh("CraneBody", body_v, body_f, [P])

    wing_v = [
        (0.00, 0.34, 0.08), (0.00, -0.28, 0.12),
        (-1.30, -0.18, 0.62), (-1.12, 0.42, 0.42),
    ]
    wing_f = [(0, 1, 2), (0, 2, 3)]
    wing_l = add_mesh("CraneWingL", wing_v, wing_f, [S])
    wing_r = add_mesh("CraneWingR", [(-x, y, z) for (x, y, z) in wing_v], [(0, 2, 1), (0, 3, 2)], [S])

    neck_v = [
        (0.10, 0.56, 0.10), (-0.10, 0.56, 0.10),
        (-0.035, 0.95, 0.72), (0.035, 0.95, 0.72),
    ]
    neck_f = [(0, 1, 2), (0, 2, 3)]
    neck = add_mesh("CraneNeck", neck_v, neck_f, [P])

    head_v = [
        (0.035, 0.95, 0.72), (-0.035, 0.95, 0.72),
        (0.00, 1.16, 0.62), (0.00, 1.02, 0.84),
    ]
    head_f = [(0, 1, 2), (0, 2, 3), (0, 3, 1)]
    head = add_mesh("CraneHead", head_v, head_f, [S])

    tail_v = [
        (-0.09, -0.54, 0.10), (0.09, -0.54, 0.10),
        (0.03, -1.02, 0.52), (-0.03, -1.02, 0.52),
    ]
    tail_f = [(0, 1, 2), (0, 2, 3)]
    tail = add_mesh("CraneTail", tail_v, tail_f, [P])

    crane_parts = [body, wing_l, wing_r, neck, head, tail]
    for part in crane_parts:
        part.parent = body
    body.location = (-1.75, 0.0, 1.05)
    body.rotation_euler = Euler((0.06, 0.10, -0.10))
    body.scale = (1.18, 1.18, 1.18)

    # —— 云带（三层低模）——
    cloud_objs = [
        add_ico("CloudA", (-3.30, 1.10, 0.02), (1.55, 0.62, 0.28), mats["mist"], (0.0, 0.2, 0.1)),
        add_ico("CloudB", (0.35, 2.30, -0.35), (1.85, 0.55, 0.22), mats["mist"], (0.0, -0.1, 0.0)),
        add_ico("CloudC", (3.05, 0.55, -0.62), (1.30, 0.70, 0.20), mats["mist"], (0.0, 0.1, -0.05)),
    ]

    # —— 浮空地形：绿顶 + 土色岩体 + 两个碎块 ——
    rock_v = [
        (-0.95, 0.10, -0.48), (0.92, 0.15, -0.52), (1.10, -0.30, -0.10),
        (-1.05, -0.25, -0.05), (0.05, 0.20, 0.42), (0.10, -0.55, 0.10),
    ]
    rock_f = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (1, 0, 5), (2, 1, 5), (3, 2, 5), (0, 3, 5)]
    island = add_mesh("Island", rock_v, rock_f, [mats["sand"]], [0, 0, 0, 0, 1, 1, 1, 1])
    island.location = (2.35, 0.55, -0.55)
    island.rotation_euler = Euler((0.0, 0.0, 0.12))

    cap = add_ico("IslandCap", (2.35, 0.57, -0.30), (0.92, 0.80, 0.16), mats["sage"], (0.0, 0.0, 0.12))
    cap.scale = (0.92, 0.80, 0.16)

    shard1 = add_ico("ShardA", (-0.25, 0.20, -1.30), (0.22, 0.18, 0.12), mats["sage_dark"], (0.4, 0.2, 0))
    shard2 = add_ico("ShardB", (1.55, 0.35, -1.85), (0.14, 0.12, 0.10), mats["sand"], (0.2, 0.5, 0))

    geoms = [body] + crane_parts[1:] + cloud_objs + [island, cap, shard1, shard2]

    world_ambient(0.45, "#FBFAF4")
    add_area("Key", (-4.5, -5.0, 5.0), 900, 5.0, (1.0, 0.97, 0.92), (-1.2, 0.2, 0.9))
    add_area("Fill", (5.0, -3.5, 2.6), 320, 6.0, (0.92, 0.96, 1.0), (0.5, 0, 0.6))
    add_area("Rim", (1.5, 6.0, 4.5), 500, 4.0, (1.0, 0.95, 0.85), (0, 0, 0.5))
    add_camera((0.0, -13.2, 1.10), (0.0, 0.0, 1.02), 52.0)
    return geoms, (1600, 700)


# ---------------------------------------------------------------- 场景二：音乐页
def build_music(mats):
    # 悬浮黑胶：底座 + 唱片 + 标签 + 唱臂 + 配重
    base = add_box("Base", (3.30, 2.30, 0.16), (0, 0, -0.42), mats["wood"], (0, 0, 0), bevel=0.06)
    rim = add_box("BaseRim", (3.44, 2.44, 0.06), (0, 0, -0.52), mats["sage_dark"], (0, 0, 0), bevel=0.03)
    platter = add_cylinder("Platter", (0, 0, -0.30), 1.12, 0.10, mats["matboard"], (0, 0, 0), 48)
    disc = add_cylinder("Disc", (0, 0, -0.20), 1.30, 0.045, mats["vinyl"], (0, 0, 0), 64)
    label = add_cylinder("Label", (0, 0, -0.168), 0.42, 0.012, mats["clay"], (0, 0, 0), 40)
    labelring = add_cylinder("LabelRing", (0, 0, -0.160), 0.30, 0.008, mats["matboard"], (0, 0, 0), 32)
    hole = add_cylinder("Hole", (0, 0, -0.150), 0.055, 0.010, mats["ink"], (0, 0, 0), 16)
    # 标签上的记号：让转动看得出来
    marker = add_box("Marker", (0.055, 0.30, 0.012), (0, 0.30, -0.146), mats["paper"], (0, 0, 0))
    marker.parent = label

    # 唱臂：立柱 + 横臂 + 唱头 + 配重
    post = add_cylinder("ArmPost", (1.52, -0.92, 0.16), 0.075, 0.62, mats["brass"], (0, 0, 0), 20)
    arm = add_cylinder("Tonearm", (0, -0.52, 0.40), 0.045, 2.10, mats["brass"], (0, 0, 0), 16)
    arm.rotation_euler = Euler((math.radians(84), 0.0, math.radians(-18)))
    arm.location = (0.70, -0.47, 0.40)
    head = add_box("Cartridge", (0.16, 0.34, 0.14), (-0.28, 0.32, 0.30), mats["ink"], (0, 0.35, 0.1), bevel=0.02)
    weight = add_cylinder("Counterweight", (1.62, -0.92, 0.52), 0.13, 0.18, mats["ink"], (0, 0.52, 0))

    geoms = [base, rim, platter, disc, label, labelring, hole, marker, post, arm, head, weight]

    world_ambient(0.5, "#FBFAF4")
    add_area("Key", (-3.2, -4.0, 4.6), 620, 4.5, (1.0, 0.97, 0.9), (0, 0, 0.1))
    add_area("Fill", (4.2, -2.4, 2.0), 220, 5.0, (0.9, 0.95, 1.0), (0, 0, 0.2))
    add_area("Top", (0.0, 1.2, 6.0), 260, 3.5, (1.0, 1.0, 0.96), (0, 0, 0))
    add_camera((0.35, -5.2, 3.05), (0.0, 0.0, -0.05), 50.0)
    return geoms, (1200, 760)


# ---------------------------------------------------------------- 场景三：照片墙
def frame_mesh(name, w, h, depth, mats):
    """一根框条围成的相框 + 内衬板，一个 mesh（两种材质）"""
    t = 0.075           # 框条宽度
    verts, faces, fmats = [], [], []

    def push_box(cx, cy, cz, sx, sy, sz, mat_idx):
        base = len(verts)
        verts.extend(box_verts(cx, cy, cz, sx, sy, sz))
        for f in BOX_FACES:
            faces.append(tuple(base + i for i in f))
            fmats.append(mat_idx)

    # 框条：左右上下（平面在 XZ，厚度沿 Y）
    push_box(-(w / 2 - t / 2), 0, 0, t, depth, h, 0)
    push_box((w / 2 - t / 2), 0, 0, t, depth, h, 0)
    push_box(0, 0, (h / 2 - t / 2), w - 2 * t, depth, t, 0)
    push_box(0, 0, -(h / 2 - t / 2), w - 2 * t, depth, t, 0)
    # 内衬板（背面）
    push_box(0, depth / 2 - 0.01, 0, w - 2 * t, 0.02, h - 2 * t, 1)
    return add_mesh(name, verts, faces, [mats["wood"], mats["matboard"]], fmats)


def build_wall(mats):
    geoms = []
    # 3 x 3，尺寸与高度略有差异，轻微旋转
    layout = [
        (-2.15, 1.62, 1.42, 1.86, 0.10, -0.06),
        (0.00, 1.52, 1.52, 1.96, 0.06, 0.04),
        (2.18, 1.60, 1.34, 1.82, 0.08, 0.07),
        (-2.20, -0.08, 1.30, 1.44, -0.07, 0.03),
        (0.02, -0.02, 1.44, 1.52, -0.05, -0.05),
        (2.12, -0.10, 1.38, 1.48, -0.09, 0.05),
        (-2.10, -1.72, 1.36, 1.42, 0.09, 0.02),
        (0.04, -1.78, 1.48, 1.54, 0.07, 0.06),
        (2.16, -1.70, 1.42, 1.48, 0.11, -0.04),
    ]
    for i, (x, z, w, h, rz, ry) in enumerate(layout, start=1):
        fr = frame_mesh("Frame_%02d" % i, w, h, 0.40, mats)
        fr.location = (x, 0, z)
        fr.rotation_euler = Euler((0, ry, rz))
        # 相片槽：贴在框前，独立对象，便于前端换贴图
        slot_v = [(-(w - 0.16) / 2, 0, -(h - 0.16) / 2), ((w - 0.16) / 2, 0, -(h - 0.16) / 2),
                  ((w - 0.16) / 2, 0, (h - 0.16) / 2), (-(w - 0.16) / 2, 0, (h - 0.16) / 2)]
        # 让平面朝 -Y（面向相机）
        slot = add_mesh("Slot_%02d" % i, [(vx, -0.205, vz) for (vx, _vy, vz) in slot_v],
                        [(0, 1, 2, 3)], [mats["matboard"]])
        slot.parent = fr
        slot.location = (0, 0, 0)
        slot.rotation_euler = Euler((math.radians(90), 0, 0))
        geoms.extend([fr, slot])

    # 背后漂浮的小几何块，增加层次
    deco1 = add_ico("DecoA", (-3.6, 1.4, 2.3), (0.16, 0.12, 0.16), mats["sage"], (0.3, 0.2, 0.1))
    deco2 = add_ico("DecoB", (3.5, 1.0, -2.4), (0.12, 0.10, 0.12), mats["brass"], (0.2, 0.4, 0.3))
    geoms.extend([deco1, deco2])

    world_ambient(0.55, "#FBFAF4")
    add_area("Key", (-3.5, -5.0, 5.5), 700, 5.0, (1.0, 0.97, 0.9), (0, 0, 0))
    add_area("Fill", (4.0, -4.0, 1.0), 260, 6.0, (0.92, 0.96, 1.0), (0, 0, 0))
    add_area("Top", (0.0, 0.5, 7.0), 300, 4.5, (1.0, 1.0, 0.97), (0, 0, 0))
    add_camera((0.0, -21.5, 0.55), (0.0, 0.0, 0.0), 50.0)
    return geoms, (1200, 760)


# ---------------------------------------------------------------- 主流程
def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="all")
    ap.add_argument("--out", default="assets/3d")
    ap.add_argument("--render-dir", default=".tmp-render")
    ap.add_argument("--no-render", action="store_true")
    args = ap.parse_args(argv)

    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out_dir = args.out if os.path.isabs(args.out) else os.path.join(repo, args.out)
    render_dir = args.render_dir if os.path.isabs(args.render_dir) else os.path.join(repo, args.render_dir)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(render_dir, exist_ok=True)

    builders = {"hero": build_hero, "music": build_music, "wall": build_wall}
    todo = list(builders) if args.scene == "all" else [args.scene]
    for key in todo:
        reset_scene()
        mats = palette()
        geoms, res = builders[key](mats)
        glb = os.path.join(out_dir, key + ".glb")
        export_glb(geoms, glb)
        export_glb(geoms, os.path.join(out_dir, key + "-draco.glb"), draco=True)
        print("EXPORT %s -> %d bytes" % (key, os.path.getsize(glb)))
        # 统计面数
        tris = 0
        for ob in geoms:
            if ob.type == "MESH":
                tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print("TRIS %s = %d" % (key, tris))
        if not args.no_render:
            png = os.path.join(render_dir, key + ".png")
            render_to(png, res[0], res[1])
            print("RENDER %s -> %s" % (key, png))


if __name__ == "__main__":
    main()
