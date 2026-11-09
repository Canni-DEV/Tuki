"""Rebuild the editable metric library and its self-contained glTF 2.0 exports.

Run from the checkout: blender -b -P art/build_models.py
Requires Blender 5.x and the Node version pinned by the game.
"""
from pathlib import Path
import json
import math
import struct
import sys
import subprocess
import tempfile
import zlib

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/models"
OUT.mkdir(parents=True, exist_ok=True)
source = "import {modelIds,shapes} from './src/shapes.ts';console.log(JSON.stringify(Object.fromEntries(modelIds.map(id=>[id,shapes(id)]))))"
catalog = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", source], cwd=ROOT))
bpy.ops.wm.read_factory_settings(use_empty=True)
library = bpy.context.scene
library.name = "Tuki • Biblioteca de piezas"
library.unit_settings.system = "METRIC"
TAU = math.tau
TMP = tempfile.TemporaryDirectory()


def png(name, rgb):
    """Pack an sRGB texture in both the blend and each GLB that uses it."""
    path = Path(TMP.name) / (name + ".png")
    height, width, _ = rgb.shape
    def chunk(tag, contents):
        return struct.pack(">I", len(contents)) + tag + contents + struct.pack(">I", zlib.crc32(tag + contents) & 0xffffffff)
    rows = b"".join(b"\x00" + np.clip(row, 0, 255).astype(np.uint8).tobytes() for row in rgb)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
    image = bpy.data.images.load(str(path))
    image.pack()
    return image


def texture_maps():
    rng = np.random.default_rng(4807)
    h, w = 256, 512
    v, u = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    waviness = .037*np.sin(TAU*u) + .014*np.cos(TAU*2*u + 2*np.sin(TAU*v))
    rings = v + waviness * np.sin(TAU*(2*v+u)) + .019*np.sin(TAU*(2*u+v))
    soft = np.sin(TAU*(3*rings)) + .40*np.sin(TAU*(7*rings+u))
    fine = (.5+.5*np.cos(TAU*(42*rings)))**7
    fibres = (.5+.5*np.cos(TAU*(86*rings+u)))**14
    light = 5.1*soft - 10*fine - 6*fibres + rng.normal(0, 1.3, (h, w))
    maple = np.array([209,163,108]) + light[:,:,None]*np.array([.85, 1, 1.1])
    speck = rng.normal(0, 1.6, (128,128))
    speck -= rng.exponential(16, (128,128)) * (rng.random((128,128)) < .028)
    ceramic = np.array([233,216,185])+speck[:,:,None]*[.8,1,1.15]
    sand = np.array([215,191,156])+speck[:,:,None]*[.9,1,1.1]
    weft, warp = np.mgrid[:128,:128]
    cloth = 1.9*np.cos(TAU*weft/6)+1.1*np.cos(TAU*warp/4)+rng.normal(0,2.1,(128,128))
    linen = np.array([56,80,72])+cloth[:,:,None]
    return png("Arce de cocina",maple), png("Gres crema",ceramic), png("Encuadernación", linen), png("Gres arena",sand)


def srgb(x):
    x /= 255
    return x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4


def material(name, color, rough=.55, metal=0, tex=None):
    mat = bpy.data.materials.new(name)
    rgba = tuple(srgb(int(color[i:i+2],16)) for i in (0,2,4)) + (1,)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    pbr = mat.node_tree.nodes.get("Principled BSDF")
    pbr.inputs["Base Color"].default_value = rgba
    pbr.inputs["Roughness"].default_value = rough
    pbr.inputs["Metallic"].default_value = metal
    if tex:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = tex
        mat.node_tree.links.new(node.outputs["Color"], pbr.inputs["Base Color"])
    return mat


wood_img, ceramic_img, cloth_img, sand_img = texture_maps()
wood = material("Arce aceitado", "D0A877", .53, tex=wood_img)
endgrain = material("Miel tostada", "B77944", .55)
warm = material("Canto mandarina", "DF8B4C", .45)
petrol = material("Petróleo laqueado", "205752", .41)
dark = material("Sombra grabada", "19332F", .57)
cream = material("Marfil de los puntos", "F3E3BA", .36)
paper = material("Papel ahuesado", "D9C69E", .85)
paperline = material("Sombra de cuadernillo", "B4A080", .8)
binding = material("Tela encerada", "385048", .70, tex=cloth_img)
gold = material("Latón satinado", "BB9561", .36, .58)
orange = material("Bermellón de la llave", "E7813E", .39)
ceramic = material("Gres crema moteado", "E9D8B9", .32, tex=ceramic_img)
stoneware = material("Gres arena mate", "D7BF9C", .71, tex=sand_img)
foot_clay = material("Pie de gres", "BC9F79", .76)
sage = material("Esmalte salvia", "8FA89B", .31, .23)
sage_dark = material("Canto del esmalte", "466C66", .34, .24)
glass = material("Vidrio verde humo", "789D94", .14, .38)
ball_amber = material("Vidrio ámbar", "D87832", .18, .30)
ball_milk = material("Vidrio opalino", "F6DBA9", .17, .18)


def game(point):
    x,y,z = point
    return x,-z,y


def mesh(name, vertices, faces, mat, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([game(p) for p in vertices], [], faces)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = smooth
    return obj


def bevel(obj, amount, segments=3):
    if not amount:
        return obj
    mod = obj.modifiers.new("Canto trabajado", "BEVEL")
    mod.width = amount
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.affect = "EDGES"
    mod.harden_normals = True
    norm = obj.modifiers.new("Normales de las caras", "WEIGHTED_NORMAL")
    norm.keep_sharp = True
    return obj


def box(name, center, size, mat, radius=0):
    x,y,z = center
    a,b,c = [v/2 for v in size]
    vertices = [(x+i*a,y+j*b,z+k*c) for k in (-1,1) for j in (-1,1) for i in (-1,1)]
    faces = [(0,1,3,2),(4,5,7,6),(0,1,5,4),(2,3,7,6),(0,2,6,4),(1,3,7,5)]
    return bevel(mesh(name,vertices,faces,mat),radius)


def convex(name, flat_points, mat, radius):
    points = [flat_points[i:i+3] for i in range(0,len(flat_points),3)]
    data = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new(game(p)) for p in points]
    bmesh.ops.convex_hull(bm, input=verts)
    bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=bm.verts[:],edges=bm.edges[:])
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name,data)
    collection.objects.link(obj)
    data.materials.append(mat)
    return bevel(obj,radius)


def solid_from_shape(name, spec, mat, radius=0):
    if spec["kind"] == "box":
        return box(name,spec["at"],spec["size"],mat,radius)
    return convex(name,spec["points"],mat,radius)


def roundtile(name, width, height, depth, z, radius, mat):
    profile = []
    for n,(cx,cy) in enumerate([(1,1),(-1,1),(-1,-1),(1,-1)]):
        for k in range(7):
            ang = TAU*(n+k/6)/4
            profile.append((cx*(width/2-radius)+radius*math.cos(ang),
                            .025+cy*(height/2-radius)+radius*math.sin(ang)))
    count = len(profile)
    verts = [(x,y,zz) for zz in (z-depth/2,z+depth/2) for x,y in profile]
    faces = [tuple(range(count)),tuple(range(count,2*count))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    return bevel(mesh(name,verts,faces,mat),.00016,2)


def lathe(name, profile, mat, segments=56, hollow=False):
    verts = [(radius*math.cos(TAU*i/segments),y,radius*math.sin(TAU*i/segments))
             for radius,y in profile for i in range(segments)]
    faces = []
    for j in range(len(profile)-1):
        for i in range(segments):
            a = j*segments+i
            b = j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    if not hollow:
        faces.extend([tuple(range(segments)),tuple(range(len(verts)-segments,len(verts)))])
    return mesh(name,verts,faces,mat,True)


def cup_handle():
    rows, segments = 32,12
    verts = []
    for i in range(rows+1):
        t = math.pi*i/rows
        x = .034+.023*math.sin(t)
        y = .034+.018*math.cos(t)
        side = Vector((.018*math.sin(t),.023*math.cos(t))).normalized()
        radius = .0032+.0007*abs(math.cos(t))**4
        for k in range(segments):
            a = TAU*k/segments
            verts.append((x+radius*side.x*math.cos(a),y+radius*side.y*math.cos(a),radius*math.sin(a)))
    faces = [(j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i)
             for i in range(segments) for j in range(rows)]
    return mesh("Asa de gres",verts,faces,ceramic,True)


def pips(name, layout):
    verts,faces,indices = [],[],[]
    for sign in (-1,1):
        for x,y in layout:
            base = len(verts)
            for r,d in [(.00158,.003987),(.00139,.004037),(.00126,.00404)]:
                for k in range(16):
                    a=TAU*k/16
                    verts.append((x+r*math.cos(a),y+r*math.sin(a),d*sign))
            for ring in range(2):
                for k in range(16):
                    a=base+16*ring+k
                    b=base+16*ring+(k+1)%16
                    faces.append((a,b,b+16,a+16))
                    indices.append(ring)
            faces.append(tuple(range(base+32,base+48)))
            indices.append(1)
    obj=mesh(name,verts,faces,dark)
    obj.data.materials.append(cream)
    for p,idx in zip(obj.data.polygons,indices):
        p.material_index=idx
    return obj


def make_domino():
    roundtile("Núcleo de arce",.025,.05,.0068,0,.00255,wood)
    for sign in (-1,1):
        roundtile("Vivo naranja",.02496,.0499,.00043,sign*.00285,.00255,warm)
        roundtile("Cara laqueada",.02494,.04994,.00105,sign*.003475,.00252,petrol)
        box("Línea impresa",(0,.025,sign*.004017),(.018,.00044,.00009),cream,.00004)
    pips("pipset_0",[(-.0049,.0418),(.0049,.0324),(0,.0124)])
    pips("pipset_1",[(.0049,.0418),(-.0049,.0324),(-.0049,.0171),(.0049,.0077)])
    pips("pipset_2",[(0,.0371),(.0049,.0171),(-.0049,.0077)])


def make_ball():
    latitude, longitude = 46,64
    verts,faces,indices=[],[],[]
    for j in range(latitude+1):
        lat = math.pi*(j/latitude-.5)
        for k in range(longitude):
            a = TAU*k/longitude
            bend = .37*math.sin(2*a+lat)*math.cos(lat)**2
            b=lat+bend
            verts.append((.008*math.cos(b)*math.cos(a),.008*math.sin(b),.008*math.cos(b)*math.sin(a)))
    for j in range(latitude):
        for k in range(longitude):
            a=j*longitude+k; b=j*longitude+(k+1)%longitude
            faces.append((a,b,b+longitude,a+longitude))
            indices.append(1 if j in range(20,24) else 2 if j in range(25,29) else 0)
    obj=mesh("Canica de dos vetas",verts,faces,glass,True)
    obj.data.materials.append(ball_amber)
    obj.data.materials.append(ball_milk)
    for p,idx in zip(obj.data.polygons,indices):
        p.material_index=idx


def make_book():
    box("Cuadernillos",(0,.009,0),(.1374,.0152,.0828),paper,.0009)
    for y in (.0043,.0086,.0131):
        box("Línea de páginas",(0,y,0),(.13753,.00017,.08291),paperline,.00006)
    for y in (.00075,.01725):
        box("Tapa de tela",(0,y,0),(.14,.0015,.085),binding,.00065)
    box("Lomo redondeado",(-.0681,.009,0),(.0038,.018,.085),binding,.0016)
    for z in (-.034,-.030,.03,.034):
        box("Banda del lomo",(-.06987,.009,z),(.00021,.013,.00055),gold,.00009)
    for x in (-.059,.064):
        box("Filete estampado",(x,.01799,0),(.00026,.00008,.074),gold,.000025)
    for z in (-.037,.037):
        box("Filete estampado",(.0025,.01799,z),(.1233,.00008,.00026),gold,.000025)
    box("Señalador de tela",(.041,.0085,.04155),(.0046,.00028,.0024),orange,.0001)


def make_cup():
    lathe("Pie sin esmalte",[(.001,0),(.026,0),(.028,.0006),(.028,.0034),(.021,.004)],foot_clay)
    lathe("Taza torneada",[(.001,.002),(.027,.002),(.031,.0038),(.032,.006),
        (.0332,.010),(.0356,.031),(.0373,.058),(.0375,.0628),(.0374,.0636),
        (.0367,.064),(.0352,.064),(.0345,.0634),(.0343,.0628),(.034,.058),
        (.0322,.032),(.0295,.012),(.026,.0076),(.022,.006),(.001,.006)],ceramic)
    cup_handle()


def make_tumbler():
    diameter, height, _ = catalog["tumbler"][0]["size"]
    radius = diameter / 2
    lathe("Talón sin esmaltar",[(.001,0),(.0245,0),(.0253,.0008),(.0254,.0045),(.024,.005)],foot_clay)
    lathe("Vasito de gres",[(.001,.004),(.0251,.004),(.0256,.0046),(radius,.008),
          (radius,height-.0014),(radius-.0004,height-.0004),(radius-.0013,height),
          (radius-.0022,height-.0003),(radius-.0027,height-.0012),
          (.023,.010),(.0225,.007),(.020,.006),(.001,.006)],stoneware)


def make_funnel():
    # Read the rim, throat and clearance from the shared physical catalogue.
    sections=catalog["funnel"]
    tube,cone=sections[0]["points"],sections[16]["points"]
    bottom,mid,top=min(tube[1::3]),max(tube[1::3]),max(cone[1::3])
    lathe("Tolva de chapa esmaltada",[(.011,bottom),(.012,bottom),(.012,mid),(.02685,top-.0001),
          (.027,top+.00015),(.0264,top+.00040),(.026,top),(.011,mid),(.011,bottom)],sage,hollow=True)
    for spec in sections[-2:]:
        solid_from_shape("Pie de latón",spec,gold,.00045)
    lathe("Aro del cuello",[(.0118,bottom),(.01245,bottom),(.01245,bottom+.001),(.0118,bottom+.001),(.0118,bottom)],sage_dark,48,hollow=True)


def make_casebox(spec):
    x, y, z = spec["at"]
    width, height, depth = spec["size"]
    bottom, top = y - height/2, y + height/2
    # The central paper rectangle and the surrounding lid share an edge and a plane.
    corners = [(-1,-1), (-1,1), (1,1), (1,-1)]
    vertices = [(x + i*w/2, level, z + j*d/2)
                for level,w,d in [(bottom,width,depth), (top,width,depth), (top,.048,.025)]
                for i,j in corners]
    faces = [(3,2,1,0)]
    for start in (0,4):  # outer walls, then the lid around the label
        for i in range(4):
            a, b = start+i, start+(i+1)%4
            faces.append((a,b,b+4,a+4))
    faces.append((8,9,10,11))
    body = mesh("Caja con etiqueta",vertices,faces,warm)
    body.data.materials.append(cream)
    for face in body.data.polygons:
        if all(index >= 8 for index in face.vertices):
            face.material_index = 1
    bevel(body,.00030)
    box("Reborde de la tapa",(0,.0158,0),(.1404,.0017,.0854),sage_dark,.0003)


def build(asset):
    specs=catalog[asset]
    if asset=="domino": return make_domino()
    if asset=="ball": return make_ball()
    if asset=="cup": return make_cup()
    if asset=="tumbler": return make_tumbler()
    if asset=="book": return make_book()
    if asset=="casebox": return make_casebox(specs[0])
    if asset=="funnel": return make_funnel()
    if asset=="bob":
        solid_from_shape("Varilla de latón",specs[0],gold,.0002)
        r=specs[1]["size"][0]/2
        y=specs[1]["at"][1]
        lathe("Peso de esmalte",[(max(.00001,r*math.sin(math.pi*i/24)),y-r*math.cos(math.pi*i/24)) for i in range(25)],orange)
        return
    if asset=="press":
        lathe("Pulsador esmaltado",[(.00001,0),(.0155,0),(.0155,.0035),(.0148,.004),(.00001,.004)],orange)
        return
    if asset=="pencilcase":
        box("Estuche de lona",(0,.006,0),(.037,.012,.080),sage_dark,.0025)
        box("Costura de la cremallera",(0,.012,0),(.002,.0003,.075),gold,.0001)
        box("Tirador",(.002,.0123,.027),(.005,.0005,.011),gold,.0002)
        return
    if asset=="stamp":
        lathe("Sello impreso",[(.013,0),(.013,.00024)],sage_dark)
        for i in range(8):
            a=TAU*i/8
            vertices=[(r*math.cos(a+d),.00028,r*math.sin(a+d)) for r,d in [(.003,0),(.007,-.22),(.011,0),(.007,.22)]]
            mesh("Pétalo de tinta",vertices,[(0,1,2,3)],cream)
        return
    materials = {
        "bend":[sage,sage_dark,sage_dark]*16, "stand":[wood,wood,gold,gold,gold], "lever":[wood]+[warm]*8,
        "fulcrum":[sage_dark,gold,gold], "hinge":[gold], "leaf":[wood,sage_dark,sage_dark], "latch":[orange],
        "oldcradle":[wood,wood,warm], "spacer":[wood], "press":[orange],
        "socket":[sage_dark], "motor":[sage_dark], "doorleaf":[warm], "slider":[sage], "housing":[sage_dark,gold,sage_dark],
        "table":[wood], "block":[wood], "ramp":[wood,endgrain,endgrain],
        "cradle":[wood,wood,warm], "channel":[sage,sage_dark,sage_dark,wood,wood],
        "paddle":[orange], "gate":[sage_dark],"tray":[wood,endgrain,endgrain,endgrain],
        "diverter":[sage,sage_dark,sage_dark],
    }[asset]
    for i,(spec,mat) in enumerate(zip(specs,materials)):
        radius = {"table":.0024,"block":.0013,"paddle":.0008,"cradle":.0006}.get(asset,.00030)
        solid_from_shape(f"{asset} {i+1:02}",spec,mat,radius)
    if asset in ("socket","motor"):
        y=.006 if asset=="socket" else .012
        box("Borne de latón",(0,y+.0004,0),(.005,.0008,.005),gold,.00025)
        if asset=="motor":
            box("Tapa de la pila",(-.003,.007,.00865),(.007,.008,.0003),cream,.0002)
    if asset=="doorleaf":
        box("Tirador de latón",(.038,.014,.0017),(.004,.004,.0004),gold,.0002)
    if asset=="slider":
        for i in range(9):
            box("Diente de cremallera",(-.012+.003*i,.012,-.0015),(.0015,.002,.0006),gold,.00015)

    if asset=="stand":
        box("Casquillo del péndulo",(0,.062,0),(.0045,.009,.0045),sage_dark,.00045)
    if asset=="fulcrum":
        box("Eje entre los montantes",(0,.0378,0),(.035,.002,.002),gold,.0006)
    if asset=="paddle":
        box("Punto de golpe",(0,.0142,-.00152),(.008,.0007,.00011),cream,.00005)
        box("Punto de golpe",(0,.0123,-.00152),(.008,.0007,.00011),cream,.00005)
    if asset=="gate":
        box("Listón naranja",(0,.0112,-.00153),(.0271,.0020,.00009),orange,.000035)
    if asset=="block":
        for side in (-1,1):
            box("Pintura de los testeros",(side*.01791,.006,0),(.0002,.0095,.0215),warm,.00009)


def make_uv(obj, asset):
    data=obj.data
    uv = data.uv_layers.new(name="Taller UV")
    for face in data.polygons:
        major=max(range(3),key=lambda axis: abs(face.normal[axis]))
        for index in face.loop_indices:
            p=data.vertices[data.loops[index].vertex_index].co
            if major==2: u,v=p.x,-p.y
            elif major==1: u,v=p.x,p.z
            else: u,v=-p.y,p.z
            if asset in ("ramp","cradle") and major==2: u,v=v,u
            scale = .22 if asset=="table" else .08
            uv.data[index].uv=(u/scale+.507,v/(scale/2)+.479)


def select(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj


def finish(asset):
    # Apply chamfers and merge detail surfaces before export to bound draw calls.
    for obj in list(collection.objects):
        select(obj)
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        make_uv(obj,asset)
    body=[o for o in collection.objects if not o.name.startswith("pipset_")]
    select(body[0])
    for obj in body: obj.select_set(True)
    if len(body)>1: bpy.ops.object.join()
    bpy.context.object.name=asset
    bpy.context.object.data.name=asset+" · Malla"
    for obj in collection.objects: obj.select_set(True)
    if (("--campaign" not in sys.argv or asset in {"cradle","oldcradle","spacer","casebox","pencilcase","press","socket","motor","doorleaf","slider","housing"})
        and ("--new-models" not in sys.argv or asset in {"bend","stand","bob","lever","fulcrum","hinge","leaf","latch","stamp"})):
        bpy.ops.export_scene.gltf(filepath=str(OUT / (asset+".glb")),export_format="GLB",use_selection=True,use_active_scene=True,
        export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_texcoords=True)
    collection.asset_mark()


collections=[]
for asset in catalog:
    scene=bpy.data.scenes.new("Pieza • "+asset)
    scene.unit_settings.system="METRIC"
    bpy.context.window.scene=scene
    collection=bpy.data.collections.new(asset+" • Original")
    scene.collection.children.link(collection)
    build(asset)
    finish(asset)
    collections.append(collection)

bpy.context.window.scene=library
for i,collection in enumerate(collections):
    instance=bpy.data.objects.new(collection.name,None)
    instance.instance_type="COLLECTION"
    instance.instance_collection=collection
    instance.location=((i%4-1.5)*.23,(1-i//4)*.18,0)
    instance.empty_display_size=.005
    library.collection.objects.link(instance)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=="VIEW_3D":
            area.spaces.active.region_3d.view_distance=1.05
            area.spaces.active.overlay.show_floor=False
            area.spaces.active.clip_start=.0005
            area.spaces.active.shading.color_type="MATERIAL"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"art"/"Tuki.blend"),compress=True)
print("TUKI_ASSETS",len(collections))
