"""Render level-select photography from the same meshes that ship in the game.
blender -b art/Tuki.blend -t 8 -P art/render_levels.py
"""
import json
import math
import sys
import subprocess
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"public"/"levels"
OUT.mkdir(parents=True,exist_ok=True)


def point(x,y,z):
    return Vector((x,-z,y))


def place(asset, xyz=(0,0,0), yaw=0, lean=0, scale=(1,1,1), pips=2):
    ref=bpy.data.collections[asset+" • Original"]
    root=bpy.data.objects.new("Montaje "+asset,None)
    scene.collection.objects.link(root)
    root.location=point(*xyz)
    root.rotation_mode="QUATERNION"
    root.rotation_quaternion=Quaternion((0,0,1),math.radians(yaw)) @ Quaternion((1,0,0),math.radians(lean))
    root.scale=(scale[0],scale[2],scale[1])
    for source in ref.objects:
        if source.name.startswith("pipset_") and int(source.name[-1])>pips: continue
        obj=source.copy()
        scene.collection.objects.link(obj)
        obj.parent=root
    return root


def light(name, xyz, energy, size, target, color):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy
    data.shape='DISK'
    data.size=size
    data.color=color
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=point(*xyz)
    obj.rotation_euler=(point(*target)-obj.location).to_track_quat('-Z','Y').to_euler()


def camera(xyz, target, lens, aperture):
    data=bpy.data.cameras.new("Óptica")
    data.lens=lens
    data.clip_start=.001
    obj=bpy.data.objects.new("Cámara",data)
    scene.collection.objects.link(obj)
    obj.location=point(*xyz)
    focal_vector=point(*target)-obj.location
    obj.rotation_euler=focal_vector.to_track_quat('-Z','Y').to_euler()
    data.dof.use_dof=True
    data.dof.focus_distance=focal_vector.length
    data.dof.aperture_fstop=aperture
    scene.camera=obj


def studio(level):
    global scene
    scene=bpy.data.scenes.new("Fotografía "+level)
    bpy.context.window.scene=scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=30
    scene.cycles.use_denoising=True
    scene.world=bpy.data.worlds.new("Relleno de cocina")
    scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value=(.88,.85,.79,1)
    bg.inputs["Strength"].default_value=.45
    scene.render.resolution_x=760
    scene.render.resolution_y=400
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="WEBP"
    scene.render.image_settings.quality=92
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    scene.view_settings.exposure=-.45
    scene.render.filepath=str(OUT/(level+".webp"))
    # Continuous tabletop outside the crop, at the in-game texel scale.
    surface=bpy.data.meshes.new("Tablero")
    surface.from_pydata([(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)],[],[(0,1,2,3)])
    surface.materials.append(bpy.data.materials["Arce aceitado"])
    uv=surface.uv_layers.new(name="Taller UV")
    for loop in surface.loops:
        xy=surface.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=(xy.x/.22+.52,xy.y/.11+.47)
    scene.collection.objects.link(bpy.data.objects.new("Mesa del estudio",surface))
    light("Luz de ventana",(-.30,.58,.28),10,.32,(0,.065,0),(1,.89,.74))
    light("Rebote del frente",(.30,.42,-.22),4,.32,(0,.065,0),(.83,.92,1))



# The level selector photographs the same empty board that opens in the editor.
seleccion = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
circuitos = json.loads(subprocess.check_output(["node", "art/circuitos.mjs"], cwd=ROOT))
for file in sorted((ROOT / "src/data").glob("*.json")):
    if seleccion and file.stem not in seleccion:
        continue
    level = json.loads(file.read_text(encoding="utf-8"))
    studio(level["id"])
    props = []
    for obj in level["fijos"]:
        if obj["activo"] == "table":
            continue
        previous = set(scene.objects)
        place(obj["activo"], obj["posicion"], obj["giroY"],
              scale=obj.get("escala", (1, 1, 1)), pips=0 if obj["id"] == "inicio" else 2)
        props.extend(mesh for mesh in scene.objects if mesh not in previous and mesh.type == "MESH")
    if level["id"] in circuitos:
        circuito = circuitos[level["id"]]
        previous = set(scene.objects)
        for part in circuito["partes"]:
            root = place(part["asset"], part["p"])
            x,y,z,w = part["q"]
            root.rotation_quaternion = Quaternion((w,x,-z,y))
        hilo = bpy.data.materials.new("Aislante")
        hilo.use_nodes = True
        aislante = hilo.node_tree.nodes.get("Principled BSDF")
        aislante.inputs["Base Color"].default_value = (.045,.08,.085,1)
        aislante.inputs["Roughness"].default_value = .82
        laton = bpy.data.materials.new("Bornes")
        laton.use_nodes = True
        metal = laton.node_tree.nodes.get("Principled BSDF")
        metal.inputs["Base Color"].default_value = (.64,.38,.11,1)
        metal.inputs["Metallic"].default_value = .48
        metal.inputs["Roughness"].default_value = .34
        for pos in circuito["bornes"]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.003,location=point(*pos))
            bpy.context.object.data.materials.append(laton)
        for ruta in circuito["cables"]:
            cable = bpy.data.curves.new("Cable apoyado","CURVE")
            cable.dimensions = "3D"
            cable.bevel_depth = circuito["radio"]
            cable.bevel_resolution = 3
            line = cable.splines.new("POLY")
            line.points.add(len(ruta)-1)
            for v,xyz in zip(line.points,ruta):
                v.co = (*point(*xyz),1)
            cable.materials.append(hilo)
            scene.collection.objects.link(bpy.data.objects.new("Cable",cable))
        props.extend(mesh for mesh in scene.objects if mesh not in previous and mesh.type in {"MESH","CURVE"})
    view = level["camara"]
    target = view["objetivo"]
    az, el = map(math.radians, (view["azimut"], view["elevacion"]))
    direction = (math.sin(az)*math.cos(el), math.sin(el), math.cos(az)*math.cos(el))
    camera(tuple(t+d for t,d in zip(target,direction)), target, 45, 16)
    cam = scene.camera
    cam.data.type = 'ORTHO'
    cam.data.dof.use_dof = False
    bpy.context.view_layer.update()
    inverse = cam.matrix_world.inverted()
    points = [inverse @ mesh.matrix_world @ Vector(v) for mesh in props for v in mesh.bound_box]
    left, right = min(p.x for p in points), max(p.x for p in points)
    bottom, top = min(p.y for p in points), max(p.y for p in points)
    cam.location += cam.rotation_euler.to_quaternion() @ Vector(((left+right)/2,(bottom+top)/2,0))
    cam.data.ortho_scale = max(right-left,(top-bottom)*scene.render.resolution_x/scene.render.resolution_y)*1.16
    bpy.ops.render.render(write_still=True)
