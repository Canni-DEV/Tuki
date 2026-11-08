"""Render level-select photography from the same meshes that ship in the game.
blender -b art/Tuki.blend -t 8 -P art/render_levels.py
"""
import math
import sys
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
    bg.inputs["Strength"].default_value=.19
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
    light("Luz de ventana",(-.21,.23,.10),3.4,.10,(0,.015,0),(1,.87,.68))
    light("Rebote del frente",(.14,.21,-.18),1.25,.20,(0,.022,0),(.83,.92,1))


if '--new-levels' not in sys.argv:
    studio("recta")
    place("domino",(-.081,0,0),90,pips=0)
    place("domino",(.081,0,0),90,pips=2)
    camera((.136,.110,.220),(0,.024,0),45,16)
    bpy.ops.render.render(write_still=True)

    studio("curva")
    place("tumbler",(-.030,0,.012))
    for i in range(10):
        t = i/9
        x = -.108+.216*t
        z = .065*math.sin(math.pi*t)
        yaw = math.degrees(math.atan2(.216,.065*math.pi*math.cos(math.pi*t))) if 0<i<9 else 90
        place("domino",(x,0,z),yaw,pips=i%3)
    camera((.087,.195,.267),(0,.019,.022),44,16)
    bpy.ops.render.render(write_still=True)

    studio("libro")
    place("book",(-.050,0,-.003),scale=(1,1.48,1))
    place("ramp",(.067,0,0),90)
    place("cradle",(.0105,.02664,0),90)
    place("ball",(.0105,.03464,0))
    place("domino",(-.023,.02664,-.001),77,8,pips=1)
    place("domino",(-.053,.02664,-.013),65,24,pips=0)
    place("domino",(.133,0,.004),84,pips=2)
    camera((.132,.129,.253),(.013,.026,.001),47,14)
    bpy.ops.render.render(write_still=True)

    studio("taza")
    place("book",(-.092,0,-.010),-12,scale=(1.08,1.00,1.08))
    place("book",(-.099,.018,-.015),-7)
    place("domino",(-.079,.036,-.020),73,pips=0)
    place("domino",(-.104,.036,-.035),68,pips=1)
    place("cup",(.025,0,.001),-14)
    place("domino",(-.042,0,.067),49,pips=0)
    place("domino",(-.019,0,.083),60,pips=1)
    place("domino",(.007,0,.095),69,pips=2)
    camera((.113,.150,.242),(.002,.028,.010),47,14)
    bpy.ops.render.render(write_still=True)


studio("vuelta")
place("bend")
place("stand",(.060,0,.024))
place("bob",(.060,.058,.024))
place("ball",(-.0235,.009,-.014))
place("domino",(.089,0,.024),90,pips=1)
camera((.128,.129,.168),(.026,.020,.009),46,18)
bpy.ops.render.render(write_still=True)

studio("subibaja")
place("fulcrum")
place("lever",(0,.039,0),lean=math.degrees(.63))
place("ball",(0,.020,.042))
place("ball",(0,.112,-.031))
place("book",(.060,0,.10))
place("domino",(.030,.018,.086),16,pips=1)
camera((.250,.195,.190),(0,.055,.018),44,18)
bpy.ops.render.render(write_still=True)

studio("puente")
place("book",(0,0,-.05))
place("book",(0,0,.092))
place("hinge",(0,.018,-.009))
place("leaf",(0,.023,-.009),lean=-50)
place("latch",(-.027,.020,-.013))
place("ball",(0,.026,-.030))
place("domino",(0,.018,.079),pips=1)
camera((.141,.119,.177),(0,.034,.015),48,18)
bpy.ops.render.render(write_still=True)
