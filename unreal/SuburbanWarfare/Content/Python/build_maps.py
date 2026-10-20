"""Builds the five Sullivan, IN maps inside the Unreal editor from the browser game's layouts.

Run once from the editor:  Tools > Execute Python Script... > Content/Python/build_maps.py
(or in the Output Log console, switch "Cmd" to "Python" and type:  import build_maps; build_maps.run())

Each map becomes /Game/Maps/<Name> with:
  * every building, wall, fence, car, prop and invisible boundary as a coloured block (correct size + collision)
  * pitched roofs, roads, driveways, sidewalks, water, trees
  * player starts from the original spawn points
  * Unreal 5 lighting: sun + physical sky + real-time sky light + volumetric clouds + height fog (Lumen)
Blocks live in World Outliner folders (Blockout/...) so they can be swapped for real models later.
"""
import json
import math
import os

import unreal

MAPS = [('culdesac', 'Culdesac'), ('countryclub', 'CountryClub'), ('farmstead', 'Farmstead'), ('countyfair', 'CountyFair'), ('lake', 'Lake')]
HERE = os.path.join(unreal.Paths.project_content_dir(), 'Python')
MAT_DIR = '/Game/SW/Materials'

CUBE = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Cube')
CYL = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Cylinder')
SPHERE = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Sphere')
CONE = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Cone')

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assets = unreal.AssetToolsHelpers.get_asset_tools()
MEL = unreal.MaterialEditingLibrary

# default colours by kind (when the map doesn't give one)
KIND_COLOR = {
    'hedge': '#2f5a24', 'bush': '#3b5f2a', 'trunk': '#5b3a1e', 'post': '#9ca3af', 'fence': '#f3f1ea', 'rail': '#7a5a3a',
    'mailbox': '#1f2937', 'trash': '#166534', 'barrel': '#7c2d12', 'utilpole': '#5a4632', 'lamp': '#1f2937', 'cone': '#f97316',
    'barricade': '#f59e0b', 'slab': '#cfc8b8', 'wall': '#d6b98c', 'lumber': '#c08a50', 'potty': '#2563eb', 'mixer': '#facc15',
    'hay': '#d9b25a', 'hayroll': '#d9b25a', 'pallets': '#a3784e', 'crate': '#b45309', 'tires': '#18181b', 'scrap': '#6b7280',
    'tank': '#e5e7eb', 'fueltank': '#dc2626', 'dumpster': '#1f4d3a', 'generator': '#facc15', 'jersey': '#d4d4d4',
    'grandstand': '#9ca3af', 'stand': '#e5e7eb', 'tractor': '#15803d', 'wagon': '#b45309', 'trailer': '#e5e7eb',
    'counter': '#a3886a', 'couch': '#5b4636', 'bed': '#e5e7eb', 'table': '#8a6a48', 'shelf': '#6b7280', 'workbench': '#8a6a48',
    'picnic': '#8a6a48', 'grill': '#111827', 'swing': '#dc2626', 'playset': '#facc15', 'trampoline': '#1d4ed8', 'pool': '#5b8bb5',
    'kiddiepool': '#60a5fa', 'mower': '#16a34a', 'woodpile': '#7a5a3a', 'planter': '#a16207', 'monument': '#d6d3d1', 'sign': '#ffffff',
    'streetsign': '#15803d', 'plate': '#9ca3af', 'chair': '#f8fafc', 'ac': '#d1d5db', 'lodge': '#a8553f', 'shed': '#64748b',
    'kayaks': '#ef4444', 'lifeguard': '#f8fafc', 'pavilion': '#14532d', 'sled': '#7c2d12', 'ferrisbase': '#e5e7eb',
    'tee': '#e5e7eb', 'ballwasher': '#1d4ed8', 'scarecrow': '#a16207',
    'suv': '#374151', 'pickup': '#7a1c1c', 'golfcart': '#f8fafc', 'truck': '#fde68a',
}
ROUND = {'trunk', 'post', 'utilpole', 'lamp', 'barrel', 'tank', 'fueltank', 'hayroll', 'tires', 'potty_x'}
GROUND = {'lawn': '#4a6b2c', 'pasture': '#7d7a40', 'fairground': '#6f7a3c'}
DECOR_FLAT = {  # kind: (colour, z-offset cm)
    'road': ('#3a3d42', 2), 'driveway': ('#b9b4a8', 2), 'sidewalk': ('#c9c4b8', 3), 'lot': ('#45494e', 2), 'path': ('#9a7449', 2),
    'cartpath': ('#8f8a80', 2), 'floor': ('#9b7650', 3), 'green': ('#4f8a35', 1), 'mown': ('#55893a', 1), 'plowed': ('#5c4128', 1),
    'arena': ('#8a6a45', 1), 'ditch': ('#4c5a2e', 1), 'bunker': ('#e3cf9e', 2), 'creek': ('#3d6f8f', 1), 'cornrow': ('#6f8f2c', 1),
}

_mats = {}
_base = None


def base_material():
    """A simple opaque material with a 'Color' parameter (and matching roughness)."""
    global _base
    if _base:
        return _base
    path = MAT_DIR + '/M_SWBlock'
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        _base = unreal.EditorAssetLibrary.load_asset(path)
        return _base
    m = assets.create_asset('M_SWBlock', MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    col = MEL.create_material_expression(m, unreal.MaterialExpressionVectorParameter, -400, 0)
    col.set_editor_property('parameter_name', 'Color')
    col.set_editor_property('default_value', unreal.LinearColor(0.8, 0.8, 0.8, 1.0))
    rough = MEL.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -400, 200)
    rough.set_editor_property('parameter_name', 'Roughness')
    rough.set_editor_property('default_value', 0.85)
    MEL.connect_material_property(col, '', unreal.MaterialProperty.MP_BASE_COLOR)
    MEL.connect_material_property(rough, '', unreal.MaterialProperty.MP_ROUGHNESS)
    MEL.recompile_material(m)
    unreal.EditorAssetLibrary.save_loaded_asset(m)
    _base = m
    return m


def hex_color(h):
    h = (h or '#cccccc').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4  # sRGB -> linear
    return unreal.LinearColor(lin(r), lin(g), lin(b), 1.0)


def mat(color, rough=0.85):
    key = (color or '#cccccc').lower() + '_%d' % int(rough * 100)
    if key in _mats:
        return _mats[key]
    name = 'MI_' + key.replace('#', '')
    path = MAT_DIR + '/' + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        mi = unreal.EditorAssetLibrary.load_asset(path)
    else:
        mi = assets.create_asset(name, MAT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        MEL.set_material_instance_parent(mi, base_material())
        MEL.set_material_instance_vector_parameter_value(mi, 'Color', hex_color(color))
        MEL.set_material_instance_scalar_parameter_value(mi, 'Roughness', rough)
        unreal.EditorAssetLibrary.save_loaded_asset(mi)
    _mats[key] = mi
    return mi


def block(mesh, center, size_cm, color, folder, rot=None, collide=True, hidden=False, rough=0.85, label=None):
    """Spawn a basic-shape mesh. Basic shapes are 100 cm; size_cm = (X, Y, Z) full extents."""
    a = actors.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(*center), rot or unreal.Rotator(0, 0, 0))
    comp = a.get_component_by_class(unreal.StaticMeshComponent)
    comp.set_static_mesh(mesh)
    a.set_actor_scale3d(unreal.Vector(max(size_cm[0], 1) / 100.0, max(size_cm[1], 1) / 100.0, max(size_cm[2], 1) / 100.0))
    if not hidden:
        comp.set_material(0, mat(color, rough))
    if not collide:
        comp.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    if hidden:
        a.set_actor_hidden_in_game(True)
        comp.set_visibility(False)
    a.set_folder_path(folder)
    if label:
        a.set_actor_label(label)
    return a


def gable_roof(cx, cy, top_z, sx, sy, rise, color, folder, overhang=40):
    """Two sloped slabs meeting at a ridge along the longer side."""
    along_x = sx >= sy
    span = (sy if along_x else sx) / 2.0
    length = (sx if along_x else sy) + overhang * 2
    slant = math.hypot(span + overhang, rise)
    ang = math.degrees(math.atan2(rise, span + overhang))
    for sgn in (-1, 1):
        off = sgn * (span + overhang) / 2.0
        c = (cx, cy + off, top_z + rise / 2.0) if along_x else (cx + off, cy, top_z + rise / 2.0)
        if along_x:
            rot = unreal.Rotator(roll=sgn * ang, pitch=0, yaw=0)
            size = (length, slant, 18)
        else:
            rot = unreal.Rotator(roll=0, pitch=-sgn * ang, yaw=0)
            size = (slant, length, 18)
        block(CUBE, c, size, color, folder, rot, rough=0.7)


def build_box(b):
    k = b['kind']
    x, y, z = b['loc']
    sx, sy, sz = b['size']
    color = b.get('color') or b.get('wall') or KIND_COLOR.get(k, '#bdbdb5')
    center = (x, y, z + sz / 2.0)
    if k == 'invisible':
        block(CUBE, center, (sx, sy, sz), None, 'Blockout/Boundary', hidden=True)
        return
    if k in ('house', 'garage'):
        block(CUBE, center, (sx, sy, sz), b.get('wall', '#e5e1d6'), 'Blockout/Houses')
        block(CUBE, (x, y, z + 30), (sx + 20, sy + 20, 60), '#9a4a3a', 'Blockout/Houses')  # brick foundation
        rise = 360 if b.get('big') else (200 if b.get('ranch') else (160 if k == 'garage' else 300))
        gable_roof(x, y, z + sz, sx, sy, rise, b.get('roof', '#3f3f46'), 'Blockout/Houses')
        if b.get('label'):
            t = actors.spawn_actor_from_class(unreal.TextRenderActor, unreal.Vector(x, y, z + sz + rise + 80))
            tr = t.get_component_by_class(unreal.TextRenderComponent)
            tr.set_text(b['label'])
            safe(lambda: tr.set_editor_property('world_size', 60.0))
            safe(lambda: tr.set_editor_property('horizontal_alignment', unreal.HorizTextAligment.EHTA_CENTER))
            t.set_folder_path('Blockout/Labels')
        return
    if k == 'shellroof':
        block(CUBE, center, (sx, sy, sz), '#e8e4dc', 'Blockout/Buildings')
        gable_roof(x, y, z + sz, sx, sy, b.get('roofH', 2) * 100, b.get('roof', '#3f3f46'), 'Blockout/Buildings')
        return
    if k == 'wallseg':
        block(CUBE, center, (sx, sy, sz), b.get('wall', '#e9e4d8'), 'Blockout/Buildings')
        return
    if k in ('suv', 'pickup', 'golfcart', 'truck'):
        # body + cabin + wheels
        along_x = b.get('facingYaw', 0) in (0, 180)
        L, W = (sx, sy) if along_x else (sy, sx)
        block(CUBE, (x, y, z + sz * 0.38), (sx, sy, sz * 0.5), color, 'Blockout/Vehicles', rough=0.35)
        cab = (sx * 0.55, sy * 0.92) if along_x else (sx * 0.92, sy * 0.55)
        block(CUBE, (x, y, z + sz * 0.8), (cab[0], cab[1], sz * 0.38), '#1b2430', 'Blockout/Vehicles', rough=0.1)
        for fx in (-0.33, 0.33):
            for fy in (-0.5, 0.5):
                wx = x + (fx * L if along_x else fy * W)
                wy = y + (fy * W if along_x else fx * L)
                block(CYL, (wx, wy, z + 40), (80, 80, 30), '#151515', 'Blockout/Vehicles',
                      unreal.Rotator(roll=90, pitch=0, yaw=0) if along_x else unreal.Rotator(roll=0, pitch=90, yaw=0), collide=False)
        return
    if k == 'cone':
        block(CONE, center, (sx, sy, sz), color, 'Blockout/Props')
        return
    if k == 'bush':
        block(SPHERE, (x, y, z + sz * 0.45), (sx, sy, sz), color, 'Blockout/Nature', rough=1.0)
        return
    if k == 'pool' and b.get('round'):
        block(CYL, center, (sx, sy, sz), color, 'Blockout/Props')
        return
    if k in ROUND:
        block(CYL, center, (sx, sy, sz), color, 'Blockout/Props')
        if k == 'lamp':
            block(CUBE, (x, y, z + sz), (60, 60, 25), '#fff7cc', 'Blockout/Props', collide=False)
        if k == 'utilpole':
            block(CUBE, (x, y, z + sz - 60), (14, 240, 14), '#5a4632', 'Blockout/Props', collide=False)
        return
    folder = 'Blockout/Props' if sx * sy < 40000 else 'Blockout/Structures'
    block(CUBE, center, (sx, sy, sz), color, folder)


def build_decor(d, theme):
    k = d['kind']
    x, y, z = d['loc']
    if k in DECOR_FLAT and d.get('size'):
        col, dz = DECOR_FLAT[k]
        block(CUBE, (x, y, dz / 2.0), (d['size'][0], d['size'][1], dz), d.get('color', col), 'Blockout/Ground', collide=False, rough=0.9)
    elif k == 'circleRoad':
        block(CYL, (x, y, 1.5), (d['r'] * 2, d['r'] * 2, 3), '#3a3d42', 'Blockout/Ground', collide=False, rough=0.9)
    elif k == 'sidewalkRing':
        block(CYL, (x, y, 1.0), (d['r1'] * 2, d['r1'] * 2, 2), '#c9c4b8', 'Blockout/Ground', collide=False)
    elif k in ('waterpoly', 'sandpoly') and d.get('pts'):
        xs = [p[0] for p in d['pts']]
        ys = [p[1] for p in d['pts']]
        cx, cy = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
        size = (max(xs) - min(xs), max(ys) - min(ys))
        if k == 'waterpoly':
            block(CUBE, (cx, cy, -5), (size[0], size[1], 10), '#2f5d78', 'Blockout/Water', collide=False, rough=0.05)
        else:
            block(CUBE, (cx, cy, 1), (size[0], size[1], 2), '#d9c7a0', 'Blockout/Ground', collide=False)
    elif k == 'canopy':
        r = d.get('r', 300)
        block(CYL, (x, y, z / 2.0), (60, 60, z), '#5b3a1e', 'Blockout/Nature')
        block(SPHERE, (x, y, z + r * 0.4), (r * 2, r * 2, r * 1.6), d.get('color', '#3f7f35'), 'Blockout/Nature', collide=False, rough=1.0)


def safe(fn):
    try:
        fn()
    except Exception as e:
        unreal.log_warning('setting skipped: %s' % e)


def lighting(theme, bounds):
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 3000))
    lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    sp = theme.get('sunPos', [55, 38, 35])
    # three.js sun position -> unreal light direction (light travels from the sun toward the map)
    ux, uy, uz = -sp[2], sp[0], sp[1]
    yaw = math.degrees(math.atan2(-uy, -ux))
    pitch = -math.degrees(math.atan2(uz, math.hypot(ux, uy)))
    sun.set_actor_rotation(unreal.Rotator(roll=0, pitch=pitch, yaw=yaw), False)
    safe(lambda: lc.set_mobility(unreal.ComponentMobility.MOVABLE))
    safe(lambda: lc.set_editor_property('intensity', 2.0 if theme.get('night') else 10.0))
    safe(lambda: lc.set_editor_property('atmosphere_sun_light', True))
    safe(lambda: lc.set_light_color(hex_color(theme.get('sunColor', '#fff3da'))))
    sun.set_folder_path('Lighting')
    for cls in (unreal.SkyAtmosphere, unreal.VolumetricCloud):
        a = actors.spawn_actor_from_class(cls, unreal.Vector(0, 0, 0))
        a.set_folder_path('Lighting')
    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 500))
    sc = sky.get_component_by_class(unreal.SkyLightComponent)
    safe(lambda: sc.set_mobility(unreal.ComponentMobility.MOVABLE))
    safe(lambda: sc.set_editor_property('real_time_capture', True))
    sky.set_folder_path('Lighting')
    fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
    fc = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    safe(lambda: fc.set_editor_property('fog_density', 0.02))
    safe(lambda: fc.set_editor_property('enable_volumetric_fog', True))
    fog.set_folder_path('Lighting')
    pp = actors.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    safe(lambda: pp.set_editor_property('unbound', True))
    pp.set_folder_path('Lighting')


def build(map_id, asset_name):
    path = '/Game/Maps/' + asset_name
    with open(os.path.join(HERE, 'maps', map_id + '.json')) as f:
        data = json.load(f)
    if not levels.new_level(path):
        unreal.log_error('could not create ' + path + ' (does it already exist? delete it first to rebuild)')
        return
    theme = data['theme']
    bounds = data['boundsCm']
    # ground (with a skirt past the boundary so the horizon isn't a cliff)
    block(CUBE, (0, 0, -25), (bounds * 6, bounds * 6, 50), GROUND.get(theme.get('ground'), '#4a6b2c'), 'Blockout/Ground', rough=1.0)
    with unreal.ScopedSlowTask(len(data['boxes']) + len(data['decor']), 'Building ' + data['name']) as task:
        task.make_dialog(True)
        for b in data['boxes']:
            task.enter_progress_frame(1)
            try:
                build_box(b)
            except Exception as e:  # keep going: one odd piece shouldn't stop the map
                unreal.log_warning('box %s: %s' % (b.get('kind'), e))
        for d in data['decor']:
            task.enter_progress_frame(1)
            try:
                build_decor(d, theme)
            except Exception as e:
                unreal.log_warning('decor %s: %s' % (d.get('kind'), e))
    for s in data['spawns']:
        x, y, z = s['loc']
        a = actors.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(x, y, z + 100), unreal.Rotator(roll=0, pitch=0, yaw=s['yaw']))
        a.set_folder_path('Spawns')
    lighting(theme, bounds)
    levels.save_current_level()
    unreal.log('Built ' + path)


def run(only=None):
    for map_id, asset in MAPS:
        if only and map_id != only:
            continue
        build(map_id, asset)
    if not only:
        levels.load_level('/Game/Maps/Culdesac')


if __name__ == '__main__':
    run()
