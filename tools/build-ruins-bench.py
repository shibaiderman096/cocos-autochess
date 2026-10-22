"""Editable modular reserve plinth; run inside Blender, in an isolated scene."""
import bpy, bmesh, math, json, sys
from pathlib import Path

ROOT = Path(r'D:/cocos/NewProject')
OUT = ROOT / 'docs/evidence/board-oblique-zoom-bench'
scene = bpy.data.scenes.new('RuinsBench')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
col = bpy.data.collections.new('ASSET_RuinsBench')
scene.collection.children.link(col)

def material(name, color, metal, rough, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = emission
    return m

stone = material('M_ReserveAncientStone', (.105,.145,.16), .1, .85)
bronze = material('M_ReserveBronze', (.34,.22,.085), .65, .46)
jade = material('M_ReserveJade', (.025,.5,.46), .15, .35, .32)

def mesh(name, verts, faces, mat, bevel=0):
    me = bpy.data.meshes.new(name+'_Mesh')
    me.from_pydata(verts,[],faces); me.update()
    ob = bpy.data.objects.new(name,me); col.objects.link(ob)
    me.materials.append(mat)
    # Each planar face has its own UV island, uniformly packed into the unit square.
    uv = me.uv_layers.new(name='UVMap')
    for fi,f in enumerate(me.polygons):
        nx,ny,nz = map(abs,f.normal)
        axes = (0,1) if nz>=max(nx,ny) else (1,2) if nx>=ny else (0,2)
        coords=[(me.vertices[me.loops[i].vertex_index].co[axes[0]],me.vertices[me.loops[i].vertex_index].co[axes[1]]) for i in f.loop_indices]
        lo=[min(c[a] for c in coords) for a in (0,1)]
        hi=[max(c[a] for c in coords) for a in (0,1)]
        for i,c in zip(f.loop_indices,coords):
            uv.data[i].uv=((fi%8+(c[0]-lo[0])/max(.00001,hi[0]-lo[0])*.8+.1)/8,(fi//8+(c[1]-lo[1])/max(.00001,hi[1]-lo[1])*.8+.1)/8)
    if bevel:
        mod=ob.modifiers.new('EditableEdgeChamfer','BEVEL');mod.width=bevel;mod.segments=1
    return ob

outline=[(-.29,-.35),(.29,-.35),(.33,-.31),(.33,.31),(.29,.35),(-.29,.35),(-.33,.31),(-.33,-.31)]
verts=[(x,y,z) for z in (-.22,0) for x,y in outline]
faces=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
body=mesh('SM_ReserveStone',verts,faces,stone,.012)

# Closed bronze belt intersects the stone by 10 mm; no coplanar duplicate surfaces.
verts=[(x,y,z) for z in (-.15,-.11) for x,y in [(-.34,-.36),(.34,-.36),(.34,.36),(-.34,.36),(-.32,-.34),(.32,-.34),(.32,.34),(-.32,.34)]]
faces=[]
for i in range(4):
    j=(i+1)%4
    faces += [(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i+8,j+8,j+12,i+12),(i,i+4,j+4,j)]
belt=mesh('SM_ReserveBronzeBelt',verts,faces,bronze,.003)
# A raised jade diamond on the front face; bottom-to-top UVs and outward normals.
v=[(x,y,z) for y in (-.358,-.368) for x,z in [(0,-.025),(-.034,-.07),(0,-.115),(.034,-.07)]]
f=[(3,2,1,0),(4,5,6,7)]+[(i,i+4,(i+1)%4+4,(i+1)%4) for i in range(4)]
rune=mesh('SM_ReserveJadeSeal',v,f,jade,.002)
# Normalize winding once on the authored base meshes.
for ob in [body,belt,rune]:
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()

sys.path.insert(0,r'C:/Users/man/.agents/skills/blender-core/scripts')
import env_report
(OUT/'blender-environment.json').write_text(json.dumps(env_report.run(),indent=2),encoding='utf8')
sys.path.insert(0,r'C:/Users/man/.agents/skills/blender-asset-qa/scripts')
import qa_check, review_shots
names=[body.name,belt.name,rune.name]
qa=qa_check.run(objects=names,profile='game')
(OUT/'bench-model-qa.json').write_text(json.dumps(qa,indent=2),encoding='utf8')
if not qa['pass']: raise RuntimeError(json.dumps(qa))
# Save a dedicated project copy. The user's open project is never overwritten.
bpy.data.libraries.write(str(ROOT/'art-source/ruins-bench/ruins-bench.blend'),{scene})
sys.path.insert(0,r'C:/Users/man/.agents/skills/blender-export-pipelines/scripts')
import export_asset
export=export_asset.run(preset='gltf',objects=names,no_anim=True,set=['use_active_scene=True'],out=str(ROOT/'assets/resources/models/ruins-bench/ruins-bench.glb'))
(OUT/'bench-export.json').write_text(json.dumps(export,indent=2),encoding='utf8')
for mode in ['material','wire']:
    review_shots.run(objects=names,out=str(OUT/f'bench-{mode}.png'),mode=mode,res=320)
before={n:tuple(bpy.data.objects[n].dimensions) for n in names}
roundtrip=bpy.data.scenes.new('BenchRoundTrip');bpy.context.window.scene=roundtrip
assert bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/resources/models/ruins-bench/ruins-bench.glb'))=={'FINISHED'}
rt={'objects':[{'name':o.name,'dimensions':list(o.dimensions),'scale':list(o.scale),'uv':len(o.data.uv_layers)} for o in roundtrip.objects if o.type=='MESH'],'sourceDimensions':before}
(OUT/'bench-roundtrip.json').write_text(json.dumps(rt,indent=2),encoding='utf8')
bpy.context.window.scene=scene
print(json.dumps({'qaPass':qa['pass'],'export':export,'roundtrip':rt}))
