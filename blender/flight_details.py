"""Rebuild the flight-system modules and low-draw-call hangar dressing.
Blender coordinates are converted from the game's Y-up metre convention.
"""
from pathlib import Path
from math import pi
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=.5, emission=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if emission:
        node.inputs['Emission Color'].default_value = (*color, 1)
        node.inputs['Emission Strength'].default_value = emission
    return m

M = {
    'steel': material('Brushed alloy', (.36,.43,.51), .65, .35),
    'dark': material('Graphite', (.035,.048,.065), .35, .5),
    'white': material('Ceramic white', (.76,.8,.82), .15, .42),
    'gold': material('MLI gold', (.64,.36,.065), .55, .35),
    'blue': material('Workshop blue', (.06,.16,.29), .25, .5),
    'orange': material('Safety orange', (.8,.22,.045), .15, .5),
    'rubber': material('Rubber', (.014,.019,.025), 0, .9),
    'green': material('Status green', (.08,.7,.4), 0, .35, 2),
    'light': material('Work lights', (.72,.85,1), 0, .3, 3),
}

def xyz(p): return Vector((p[0], -p[2], p[1]))

def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o

def finish(o, mat, parent):
    o.data.materials.append(M[mat])
    o.parent = parent
    return o

def box(pos, size, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(pos))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, parent)

def rod(a, b, radius, mat, parent, vertices=12):
    av, bv = xyz(a), xyz(b)
    delta = bv-av
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(av+bv)/2)
    o = bpy.context.object
    o.rotation_quaternion = delta.to_track_quat('Z','Y')
    o.rotation_mode = 'QUATERNION'
    for face in o.data.polygons: face.use_smooth = True
    return finish(o, mat, parent)

def label(text, pos, size, parent, mat='white'):
    data = bpy.data.curves.new(text, 'FONT')
    data.body = text
    data.size = size
    data.align_x = 'CENTER'
    data.extrude = .001
    o = bpy.data.objects.new(text, data)
    bpy.context.collection.objects.link(o)
    o.location = xyz(pos)
    o.rotation_euler.x = pi/2
    o.data.materials.append(M[mat])
    o.parent = parent
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)

def merge(parent):
    for mat in M.values():
        meshes = [o for o in parent.children if o.type == 'MESH' and not o.name.startswith('COL_') and o.data.materials[0] == mat]
        if not meshes: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        bpy.context.object.name = f'{parent.name}_{mat.name}'

obc = root('obc_1')
box((0,.06,0), (.22,.12,.24), 'steel', obc)
box((0,.125,0), (.20,.01,.22), 'dark', obc)
for z in [-.08,-.04,0,.04,.08]: box((0,.135,z), (.18,.012,.012), 'steel', obc)
for x in [-.07,0,.07]: rod((x,.06,.12),(x,.06,.135), .009, 'gold', obc)
for x in [-.09,.09]:
    for z in [-.1,.1]: rod((x,0,z),(x,.008,z),.009,'dark',obc)
merge(obc)

adcs = root('adcs_1')
box((0,.025,0),(.24,.05,.24),'steel',adcs)
rod((0,.05,0),(0,.145,0),.095,'dark',adcs,24)
rod((0,.145,0),(0,.16,0),.1,'steel',adcs,24)
box((0,.18,0),(.13,.04,.13),'gold',adcs)
rod((0,.2,0),(0,.28,0),.052,'dark',adcs,20)
rod((0,.274,0),(0,.28,0),.037,'blue',adcs,20)
for x in [-.095,.095]:
    for z in [-.095,.095]: rod((x,.05,z),(x,.061,z),.009,'gold',adcs)
merge(adcs)

decor = root('hangar_details')
# Wall-side workbenches: the playable routes and clean-room entrances stay clear.
for x,z in [(-26,7),(-26,-15),(26,20),(26,-23)]:
    box((x,.5,z),(2.6,1,1.15),'dark',decor).name = f'COL_workbench_{x}_{z}'
    box((x,.88,z),(2.6,.12,1.15),'steel',decor)
    for dx in [-1.12,1.12]:
        for dz in [-.44,.44]: box((x+dx,.43,z+dz),(.07,.86,.07),'dark',decor)
    box((x,.32,z),(2.4,.05,1),'blue',decor)
    box((x-.7,1.1,z),(.45,.32,.42),'blue',decor)
    box((x+.6,.97,z),(.48,.06,.35),'dark',decor)
    for i in range(5): rod((x-.15+i*.07,.97,z+.25),(x-.15+i*.07,.97,z+.03),.012,'steel',decor)
    for dx in [-1.1,1.1]: rod((x+dx,.94,z-.45),(x+dx,1.9,z-.45),.025,'steel',decor)
    box((x,1.91,z-.45),(2.2,.045,.09),'light',decor)
    for dx in [-.3,.3]: box((x+dx,.5,z),(.5,.25,.5),'white',decor)
# Service rails, conduit and wall equipment add depth without more lights/shadows.
for side in [-1,1]:
    x = side*28.7
    for y in [3.2,3.45,8]:
        rod((x,y,-36),(x,y,36),.055 if y<4 else .12,'steel',decor)
    for z in [-31,-19,3,25]:
        box((x,2.1,z),(.25,1.4,1.1),'dark',decor)
        box((x-side*.14,2.1,z),(.035,1.1,.88),'white',decor)
        box((x-side*.17,2.35,z+.25),(.025,.08,.08),'green',decor)
    for z in [-32,-8,16,32]:
        # orange safety bollards attached to broad, stable feet
        rod((side*25.8,0,z),(side*25.8,.85,z),.07,'orange',decor)
        box((side*25.8,.025,z),(.3,.05,.3),'dark',decor)
    for z in [-27,-3,21]:
        box((side*28.4,11,z),(.7,1.3,3.4),'steel',decor)
        for i in range(9): box((side*27.99,11,z-1.4+i*.35),(.05,.85,.06),'dark',decor)
        fan = root(f'vent_fan_{side}_{z}')
        fan.parent = decor
        fan.location = xyz((side*27.94,11,z))
        rod((-.05,0,0),(.05,0,0),.12,'dark',fan,20)
        for angle in [0,pi/3,2*pi/3]:
            blade=box((0,0,0),(.025,.76,.11),'dark',fan)
            blade.rotation_euler.x = angle
        merge(fan)
# Mission operations cabinets behind launch control, out of the walking lanes.
for x in [-18,-20,-22]:
    box((x,1.15,10),(1.6,2.3,.7),'dark',decor).name = f'COL_operations_{x}'
    box((x,1.15,10),(1.6,2.3,.7),'dark',decor)
    box((x,1.5,10.365),(1.35,.65,.025),'blue',decor)
    for y in [.5,.72,.94]: box((x,y,10.365),(1.35,.13,.025),'steel',decor)
    for i in range(6): box((x-.5+i*.19,1.92,10.39),(.045,.045,.025),'green',decor)
    label('FLIGHT SYSTEMS',(x,2.12,10.39),.12,decor)
merge(decor)

out = ROOT/'assets/models'
out.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out/'flight_details.glb'), export_format='GLB', export_yup=True, export_materials='EXPORT', use_selection=False)

# Baked bitmap details keep the runtime materials simple and cheap.
texture_dir = ROOT/'assets/textures/satellite'
texture_dir.mkdir(parents=True,exist_ok=True)
n=512
yy,xx=np.mgrid[0:n,0:n]/n
rng=np.random.default_rng(41)
height=np.zeros((n,n))
for i in range(18):
    a=rng.uniform(0,2*pi); f=rng.uniform(12,70)
    height+=np.sin((xx*np.cos(a)+yy*np.sin(a))*f+rng.uniform(0,6.28))/f
dy,dx=np.gradient(height)
normal=np.stack((-dx*45,-dy*45,np.ones_like(xx)),axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
pixels=np.ones((n,n,4),dtype=np.float32)
pixels[:,:,:3]=normal*.5+.5
image=bpy.data.images.new('Baked foil normal',width=n,height=n,alpha=True)
image.colorspace_settings.name='Non-Color'
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(texture_dir/'foil-normal.png');image.file_format='PNG';image.save()
pixels=np.ones((n,n,4),dtype=np.float32)
pixels[:,:,:3]=[.025,.07,.19]
grid=(np.mod(xx*8,1)<.027)|(np.mod(yy*16,1)<.035)
pixels[grid,:3]=[.32,.43,.58]
busbar=np.mod(xx*24,1)<.008
pixels[busbar,:3]=[.55,.61,.67]
image=bpy.data.images.new('Baked solar cells',width=n,height=n,alpha=True)
image.pixels.foreach_set(pixels.ravel())
image.filepath_raw=str(texture_dir/'solar-cells.png');image.file_format='PNG';image.save()

# A reproducible preview of the new modules; render objects outside the workshop.
decor.hide_render = True
obc.location.x = -.23
adcs.location.x = .23
bpy.ops.object.camera_add(location=(.6,-.9,.65))
camera = bpy.context.object
camera.rotation_euler = (Vector((0,0,.12))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'; camera.data.ortho_scale = 1.0
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type='AREA', location=(1,-2,3))
bpy.context.object.data.energy = 300
bpy.context.object.data.shape = 'DISK'; bpy.context.object.data.size = 3
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 16
bpy.context.scene.render.resolution_x = 960; bpy.context.scene.render.resolution_y = 640
bpy.context.scene.render.resolution_percentage = 100
preview = ROOT/'docs/previews/visual-pass'
preview.mkdir(parents=True,exist_ok=True)
bpy.context.scene.render.filepath = str(preview/'flight-systems.png')
bpy.ops.render.render(write_still=True)
