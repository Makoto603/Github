import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { RealBlenderProvider } from '../core.js';

const BLENDER='C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe';
const run=(bin,args)=>new Promise(resolve=>{const child=spawn(bin,args,{windowsHide:true});let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.on('error',error=>resolve({code:-1,output:error.message}));child.on('close',code=>resolve({code,output}));});
const safe=value=>String(value).replace(/\\/g,'\\\\');

export class RealBlenderFinalizer {
  constructor({blenderPath=BLENDER}={}){this.blenderPath=blenderPath;this.base=new RealBlenderProvider(blenderPath);}
  async run({project,map,material=null,assetProcessing=null,generatedAssets=[]}={}){
    await mkdir(join(project,'structure'),{recursive:true});
    await writeFile(join(project,'structure','map_structure.json'),JSON.stringify(map,null,2));
    await this.base.generate(project,map);
    const blend=join(project,'blender','map.blend'),materialized=join(project,'blender','materialized.blend'),measurement=join(project,'blender','scene_measurement.json'),generatedFile=join(project,'blender','generated_assets.json'),script=join(project,'blender','finalize-generated-assets.py');
    await writeFile(generatedFile,JSON.stringify(generatedAssets,null,2));
    await writeFile(script,`import bpy,json
bpy.ops.wm.open_mainfile(filepath=r'''${safe(blend)}''')
generated=json.load(open(r'''${safe(generatedFile)}'''))
for asset in generated:
 bpy.ops.object.select_all(action='DESELECT')
 bpy.ops.import_scene.fbx(filepath=asset['model_path'])
 imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
 if not imported: raise RuntimeError('Generated asset has no importable mesh: '+asset['asset_id'])
 source=max(imported,key=lambda o:len(o.data.vertices)); mesh=source.data
 for object_id in asset.get('object_ids',[]):
  target=bpy.data.objects.get(object_id)
  if target is None or target.type!='MESH': raise RuntimeError('Generated asset target missing: '+object_id)
  target.data=mesh
 for obj in imported:
  if obj.name in bpy.data.objects and obj.users_collection: bpy.data.objects.remove(obj,do_unlink=True)
rows=[]
for obj in bpy.context.scene.objects:
 if obj.type!='MESH': continue
 rows.append({'id':obj.name,'position':list(obj.location),'rotation_quaternion':list(obj.rotation_quaternion),'scale':list(obj.scale),'world_matrix':[list(row) for row in obj.matrix_world],'bounding_box':[list(corner) for corner in obj.bound_box],'dimensions':list(obj.dimensions),'vertex_count':len(obj.data.vertices),'polygon_count':len(obj.data.polygons)})
json.dump({'provider_name':'RealBlenderFinalizer','provider_mode':'real','is_fake':False,'objects':rows,'generated_assets':[x['asset_id'] for x in generated]},open(r'''${safe(measurement)}''','w'))
bpy.ops.wm.save_as_mainfile(filepath=r'''${safe(materialized)}''')`);
    const executed=await run(this.blenderPath,['--background','--python',script]);
    if(executed.code!==0||!existsSync(materialized)||!existsSync(measurement))throw Error(`Real Blender finalization failed: ${executed.output.slice(-2000)}`);
    return {scene_measurement:JSON.parse(await readFile(measurement,'utf8')),blend_path:materialized,asset_processing:assetProcessing,generated_assets:generatedAssets,material};
  }
}

export class RealFbxExportService {
  constructor({blenderPath=BLENDER}={}){this.blenderPath=blenderPath;}
  async run({project}={}){
    const blend=join(project,'blender','materialized.blend'),fbx=join(project,'blender','map.fbx'),script=join(project,'blender','export-final-fbx.py');
    if(!existsSync(blend))throw Error('Real Blender materialized scene is required for FBX export');
    await writeFile(script,`import bpy\nbpy.ops.wm.open_mainfile(filepath=r'''${safe(blend)}''')\nbpy.ops.export_scene.fbx(filepath=r'''${safe(fbx)}''')`);
    const executed=await run(this.blenderPath,['--background','--python',script]);
    if(executed.code!==0||!existsSync(fbx)||(await stat(fbx)).size<=0)throw Error(`Real FBX export failed: ${executed.output.slice(-2000)}`);
    return {fbx_path:fbx,provider_mode:'real'};
  }
}