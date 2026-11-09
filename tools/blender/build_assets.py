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
from mathutils import Euler, Matrix, Vector


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


def add_cone(name, loc, r1, r2, depth, mat, rot=(0, 0, 0), verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = Euler(rot)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def paint_faces(ob, mats, pick):
    """按面法线给同一个网格分配不同材质（用来做绿顶/土色岩体）"""
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    for p in ob.data.polygons:
        p.material_index = pick(p.normal)


def add_cylinder(name, loc, radius, depth, mat, rot=(0, 0, 0), verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.rotation_euler = Euler(rot)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def add_rod(name, p0, p1, radius, mat, verts=12):
    """两点之间的圆柱（唱臂、连杆等）"""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    ob = add_cylinder(name, tuple((a + b) / 2.0), radius, d.length, mat, verts=verts)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return ob


def add_planar_uv(ob):
    """给平面网格加 UV（X→u，Z→v），前端才能把照片贴上去"""
    me = ob.data
    me.uv_layers.new(name="UVMap")
    ax = [v.co.x for v in me.vertices]
    az = [v.co.z for v in me.vertices]
    x0, x1, z0, z1 = min(ax), max(ax), min(az), max(az)
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = 0.0 if x1 == x0 else (co.x - x0) / (x1 - x0)
            v = 0.0 if z1 == z0 else (co.z - z0) / (z1 - z0)
            uv[li].uv = (u, v)


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
        "mist": make_mat("Mist", "#F7F4EA", 1.0),
        "brass": make_mat("Brass", "#C79A55", 0.34, metal=0.75),
        "vinyl": make_mat("Vinyl", "#26332D", 0.36, metal=0.15),
        "clay": make_mat("Clay", "#B4684C", 0.72),
        "wood": make_mat("Wood", "#C9B69B", 0.74),
        "matboard": make_mat("MatBoard", "#F8F4E9", 0.95),
        "glow": make_mat("Glow", "#F6E3C2", 0.9, emit="#F6E3C2", emit_strength=1.2),
    }


# ---------------------------------------------------------------- 场景一：首页 hero
def cloud_cluster(name, loc, parts, mats, rot=(0, 0, 0)):
    """以柔和云团和细小高光层构成云朵，join 成整体便于漂移"""
    from mathutils import Matrix
    spheres = []
    for (dx, dy, dz, sx, sy, sz) in parts:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(dx, dy, dz))
        ob = bpy.context.active_object
        # 先把非等比缩放烘进网格，join 时才不会被主子物体的缩放带偏
        ob.data.transform(Matrix.Diagonal((sx, sy, sz, 1.0)))
        ob.data.materials.append(mats["mist"])
        for p in ob.data.polygons:
            p.use_smooth = True
        spheres.append(ob)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in spheres:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = spheres[0]
    bpy.ops.object.join()
    cloud = bpy.context.active_object
    cloud.name = name
    cloud.location = loc
    cloud.rotation_euler = Euler(rot)
    return cloud


def floating_island(name, loc, radius, depth, mats, rot=(0, 0, 0)):
    """经典浮空岛：多边形草顶 + 锥形岩体，比压扁的球更像地形"""
    n = 9
    verts = [(0.0, 0.0, 0.16)]
    for i in range(n):
        a = 2 * math.pi * i / n
        r = radius * (0.84 if i % 2 else 1.0)
        verts.append((math.cos(a) * r, math.sin(a) * r, 0.0))
    for i in range(n):
        a = 2 * math.pi * i / n
        r = radius * (0.78 if i % 2 else 0.93)
        verts.append((math.cos(a) * r, math.sin(a) * r, -0.10))
    verts.append((0.0, 0.0, -depth))
    apex = len(verts) - 1
    faces, fmats = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append((0, 1 + i, 1 + j)); fmats.append(1)                       # 草顶
        faces.append((1 + i, 1 + j, 1 + n + j)); fmats.append(0)               # 土皮
        faces.append((1 + i, 1 + n + j, 1 + n + i)); fmats.append(0)
        faces.append((1 + n + i, 1 + n + j, apex)); fmats.append(2)            # 岩体
    ob = add_mesh(name, verts, faces, [mats["sand"], mats["sage"], mats["sage_dark"]], fmats)
    ob.location = loc
    ob.rotation_euler = Euler(rot)
    return ob


def build_hero(mats):
    # —— 优雅的展翼鹤：长颈、尖喙、分层羽片和带折痕的扇形双翼 ——
    P = mats["paper"]
    # 用暖白、珍珠灰和淡金的细微差异强调折纸折面
    wing_light = make_mat("WingLight", "#FFF7E8", 0.68)
    wing_shadow = make_mat("WingShadow", "#D9D9D2", 0.78)
    body_v = [
        (0.00, 0.62, 0.08), (-0.30, 0.05, -0.04), (0.30, 0.05, -0.04),
        (0.00, -0.68, 0.16), (0.00, -0.02, 0.30), (0.00, -0.02, -0.20),
    ]
    body_f = [(0, 1, 4), (0, 4, 2), (3, 4, 1), (3, 2, 4), (0, 5, 1), (0, 2, 5), (3, 5, 1), (3, 2, 5)]
    body = add_mesh("CraneBody", body_v, body_f, [P])

    # 左翼：四个三角面构成带折痕的斜上掠翼
    wing_v = [
        (-0.12,.40,.22),(-.12,-.34,.18),(-.52,.08,.42),(-.98,.27,.67),
        (-1.52,.34,.93),(-1.86,.43,1.12),(-1.60,-.37,.91),(-1.03,-.34,.65),(-.50,-.25,.39),
        (-1.10,.20,.54),(-1.42,.08,.66),(-1.64,-.08,.77),(-1.70,-.24,.83)
    ]
    wing_f = [(0,2,1),(2,8,1),(2,7,8),(2,3,7),(3,9,7),(3,10,9),(3,4,10),(4,11,10),(4,5,11),(5,12,11),(5,6,12),(6,7,12),(7,9,12),(9,10,12),(10,11,12)]
    wing_l = add_mesh("CraneWingL", wing_v, wing_f, [P, wing_light, wing_shadow], [0,1,2,1,2,0,1,2,1,0,2,1,0,2,1])
    wing_r = add_mesh("CraneWingR", [(-x, y, z) for (x, y, z) in wing_v],
                      [tuple(reversed(f)) for f in wing_f], [P, wing_light, wing_shadow], [0,1,2,1,2,0,1,2,1,0,2,1,0,2,1])

    neck = add_cone("CraneNeck", (0.0, 0.60, 0.58), 0.14, 0.075, 0.86, P,
                    rot=(math.radians(-35), 0, 0), verts=6)
    head = add_ico("CraneHead", (0.0, 0.86, 0.94), (0.145, 0.17, 0.13), P, subdiv=2)
    beak = add_cone("CraneBeak", (0.0, 1.08, 0.93), 0.045, 0.002, 0.34, mats["clay"],
                    rot=(math.radians(-90), 0, 0), verts=6)
    tail = add_cone("CraneTail", (0.0, -1.02, 0.40), 0.10, 0.012, 1.05, P,
                    rot=(math.radians(66), 0, 0), verts=6)

    crane_parts = [body, wing_l, wing_r, neck, head, beak, tail]
    for part in crane_parts[1:]:
        part.parent = body
    body.location = (-1.95, 0.0, 1.13)
    body.rotation_euler = Euler((0.05, 0.16, -0.14))
    body.scale = (1.02, 1.02, 1.02)

    # —— 三层云带（多球堆叠，避免压成薄片）——
    cloud_a = cloud_cluster("CloudA", (-3.35, 1.15, -0.05),
                            [(0, 0, 0, 0.90, 0.55, 0.42), (0.95, 0.03, -0.02, 0.76, 0.48, 0.36),
                             (-0.95, -0.02, -0.04, 0.72, 0.45, 0.34), (0.34, 0.08, 0.30, 0.70, 0.42, 0.32),
                             (-0.36, 0.05, 0.28, 0.64, 0.40, 0.30)], mats, (0, 0.18, 0.06))
    cloud_b = cloud_cluster("CloudB", (2.05, 1.95, -1.25),
                            [(0, 0, 0, 1.05, 0.52, 0.40), (1.05, 0.03, -0.02, 0.86, 0.46, 0.34),
                             (-1.02, 0.02, -0.03, 0.82, 0.44, 0.32), (0.40, 0.07, 0.26, 0.76, 0.40, 0.28),
                             (-0.42, 0.05, 0.24, 0.70, 0.38, 0.27)], mats, (0, -0.10, 0))
    # 远景薄云带，降低画面空旷感；体积克制以保持标题可读
    cloud_c = cloud_cluster("CloudC", (0.05, 2.8, 1.35),
                            [(0,0,0,1.05,.30,.14),(.86,.02,.04,.72,.25,.12),(-.92,.01,.02,.66,.24,.12)], mats)
    cloud_d = cloud_cluster("CloudD", (-3.4,2.15,1.20), [(-.8,0,0,.85,.32,.19),(0,0,.10,1.0,.38,.25),(.75,0,0,.8,.3,.18)], mats)
    # —— 浮空地形 ——
    island = floating_island("Island", (2.85, 0.55, -0.35), 0.82, 0.58, mats, (0.05, 0, 0.1))
    shard1 = floating_island("ShardA", (-0.65, 0.30, -1.55), 0.24, 0.20, mats, (0.2, 0.3, 0.4))
    shard2 = floating_island("ShardB", (1.35, 0.40, -2.10), 0.15, 0.13, mats, (0.1, 0.2, 0.6))

    geoms = crane_parts + [cloud_a, cloud_b, cloud_c, cloud_d, island, shard1, shard2]

    world_ambient(0.55, "#FBFAF4")
    add_area("Key", (-4.5, -5.0, 5.0), 420, 5.0, (1.0, 0.91, 0.78), (-1.2, 0.2, 0.9))
    add_area("Fill", (5.0, -3.5, 2.6), 220, 6.0, (0.68, 0.82, 1.0), (0.5, 0, 0.6))
    add_area("Rim", (1.5, 6.0, 4.5), 380, 4.0, (1.0, 0.78, 0.55), (0, 0, 0.5))
    bpy.context.scene.view_settings.exposure = -0.15
    add_camera((0.0, -13.4, 3.85), (0.0, 0.0, 0.95), 52.0)
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

    # 唱片上的三处浅色刻度：让匀速转动看得出来
    marks = []
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        m = add_box("DiscMark%d" % i, (0.055, 0.26, 0.010),
                    (math.cos(a) * 0.72, math.sin(a) * 0.72, -0.172), mats["paper"], (0, 0, a))
        marks.append(m)
    bpy.context.view_layer.update()
    for ob in [label, labelring, hole] + marks:
        ob.parent = disc
        # 直接赋 parent 不会自动补 parent_inverse，不设会让子物体被父物体的位置二次偏移
        ob.matrix_parent_inverse = disc.matrix_world.inverted()

    # 唱臂：立柱 + 连杆 + 唱头 + 配重（全部连在一起，不再悬空）
    post = add_cylinder("ArmPost", (1.62, -0.95, 0.07), 0.075, 0.80, mats["brass"], (0, 0, 0), 20)
    arm = add_rod("Tonearm", (1.60, -0.93, 0.50), (-0.18, 0.34, 0.28), 0.045, mats["brass"], 14)
    head = add_box("Cartridge", (0.15, 0.30, 0.12), (-0.19, 0.36, 0.26), mats["ink"], (0, 0.2, 0.52), bevel=0.02)
    weight = add_rod("Counterweight", (1.68, -1.02, 0.50), (2.02, -1.16, 0.46), 0.13, mats["ink"], 16)

    geoms = [base, rim, platter, disc, label, labelring, hole] + marks + [post, arm, head, weight]

    world_ambient(0.5, "#FBFAF4")
    add_area("Key", (-3.2, -4.0, 4.6), 520, 4.5, (1.0, 0.97, 0.9), (0, 0, 0.1))
    add_area("Fill", (4.2, -2.4, 2.0), 190, 5.0, (0.9, 0.95, 1.0), (0, 0, 0.2))
    add_area("Top", (0.0, 1.2, 6.0), 230, 3.5, (1.0, 1.0, 0.96), (0, 0, 0))
    bpy.context.scene.view_settings.exposure = -0.25
    add_camera((2.55, -5.15, 3.35), (0.0, 0.0, -0.28), 44.0)
    return geoms, (1200, 760)


# ---------------------------------------------------------------- 场景三：照片墙
def frame_mesh(name, w, h, depth, mats, frame_mat):
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
    return add_mesh(name, verts, faces, [frame_mat, mats["matboard"]], fmats)


def build_wall(mats):
    geoms = []
    # 3 x 3，尺寸与高度略有差异，轻微旋转
    layout = [
        (-2.15, 1.75, 1.42, 1.86, 0.10, -0.06),
        (0.00, 1.72, 1.52, 1.90, 0.06, 0.04),
        (2.18, 1.73, 1.34, 1.82, 0.08, 0.07),
        (-2.20, -0.05, 1.30, 1.44, -0.07, 0.03),
        (0.02, -0.10, 1.44, 1.48, -0.05, -0.05),
        (2.12, -0.02, 1.38, 1.48, -0.09, 0.05),
        (-2.10, -1.80, 1.36, 1.42, 0.09, 0.02),
        (0.04, -1.90, 1.48, 1.52, 0.07, 0.06),
        (2.16, -1.78, 1.42, 1.48, 0.11, -0.04),
    ]
    frame_colors = [mats["wood"], mats["sage"], mats["paper"]]
    for i, (x, z, w, h, rz, ry) in enumerate(layout, start=1):
        fr = frame_mesh("Frame_%02d" % i, w, h, 0.40, mats, frame_colors[(i - 1) % 3])
        fr.location = (x, 0, z)
        fr.rotation_euler = Euler((0, ry, rz))
        bpy.context.view_layer.update()
        # 相片槽：贴在框前（平面本身已在 XZ 内），独立对象，便于前端换贴图
        slot = add_mesh("Slot_%02d" % i,
                        [(-(w - 0.16) / 2, -0.215, -(h - 0.16) / 2), ((w - 0.16) / 2, -0.215, -(h - 0.16) / 2),
                         ((w - 0.16) / 2, -0.215, (h - 0.16) / 2), (-(w - 0.16) / 2, -0.215, (h - 0.16) / 2)],
                        [(0, 1, 2, 3)], [mats["matboard"]])
        add_planar_uv(slot)
        slot.parent = fr          # 槽的坐标本来就是相对相框的，不能再套 parent_inverse
        slot.location = (0, 0, 0)
        geoms.extend([fr, slot])

    # 背后漂浮的小几何块，增加层次
    deco1 = add_ico("DecoA", (-3.6, 1.4, 2.3), (0.16, 0.12, 0.16), mats["sage"], (0.3, 0.2, 0.1))
    deco2 = add_ico("DecoB", (3.5, 1.0, -2.4), (0.12, 0.10, 0.12), mats["brass"], (0.2, 0.4, 0.3))
    geoms.extend([deco1, deco2])

    world_ambient(0.55, "#FBFAF4")
    add_area("Key", (-3.5, -5.0, 5.5), 700, 5.0, (1.0, 0.97, 0.9), (0, 0, 0))
    add_area("Fill", (4.0, -4.0, 1.0), 260, 6.0, (0.92, 0.96, 1.0), (0, 0, 0))
    add_area("Top", (0.0, 0.5, 7.0), 300, 4.5, (1.0, 1.0, 0.97), (0, 0, 0))
    bpy.context.scene.view_settings.exposure = -0.25
    add_camera((0.0, -13.5, 0.55), (0.0, 0.0, -0.05), 50.0)
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
