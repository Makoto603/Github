import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetRegistry, AssetService } from '../assets/asset-system.js';
import { MapAssetOrchestrator } from '../assets/orchestrator.js';
import { Hunyuan3DProvider } from '../assets/phase2b.js';

const referenceImage='E:\\AI\\Hunyuan3D-2.1\\src\\hy3dshape\\demos\\demo.png';
const assetId='real-hunyuan-smoke-1';
const pngSize=async path=>{const bytes=await readFile(path);return bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]:null};
const json=async path=>existsSync(path)?JSON.parse(await readFile(path,'utf8')):null;
const size=async path=>existsSync(path)?(await readFile(path)).length:0;

if(process.env.MAP_STUDIO_REAL_HUNYUAN!=='1'){
  console.log(JSON.stringify({executed:false,reason:'Set MAP_STUDIO_REAL_HUNYUAN=1 to opt in.'}));
  process.exit(0);
}

const started=Date.now(),project=await mkdtemp(join(tmpdir(),'real-hunyuan-single-'));
const provider=new Hunyuan3DProvider({installation_path:'E:\\AI\\Hunyuan3D-2.1\\src',python_path:'E:\\AI\\Hunyuan3D-2.1\\.venv\\Scripts\\python.exe'});
const registry=await new AssetRegistry(project).init();
const service=new AssetService(project,{provider});
// This smoke intentionally stops after real generation/normalization/validation.
// Disabling the instance replacement method prevents final Blender MAP composition.
service.replace=undefined;
const orchestrator=new MapAssetOrchestrator(project,{registry,service,provider});
const map={project:{id:'real-hunyuan-single-smoke'},objects:[{id:'real-hunyuan-object-1',type:'placeholder',asset_id:assetId,position:[0,0,0],rotation:[0,0,0],scale:[1,1,2]}],asset_requirements:[{asset_id:assetId,category:'building',object_ids:['real-hunyuan-object-1'],reference_image:referenceImage,target_dimensions:[1,1,2],generation_profile:{profile:'Prototype'},provider_preferences:{provider:'Hunyuan3DProvider'},reference_fingerprint:'test-real-hunyuan-smoke',replacement_policy:'replace_ready'}]};
const output={executed:true,project,asset_id:assetId,reference_image:referenceImage,reference_resolution:existsSync(referenceImage)?await pngSize(referenceImage):null,started_at:new Date(started).toISOString()};
try{
  const capability=await provider.capabilities();
  if(!existsSync(referenceImage))throw Error('INVALID_REFERENCE');
  if(!capability.available)throw Error('HUNYUAN_PROVIDER_NOT_READY');
  const report=await orchestrator.run(map);
  const item=report.assets[0],result=item?.result,asset=await registry.get(assetId),version=asset?.active_version||'v002',root=registry.path(assetId),raw=join(root,'generated',version,'raw','output.glb'),normalized=join(root,'validated',version,'normalized.fbx'),metadata=await json(join(root,'validated',version,'normalized_metadata.json'));
  Object.assign(output,{provider:'Hunyuan3DProvider',python:capability.environment.python_path,gpu:capability.environment.gpu,state:report.state,error_code:item?.error_code||null,raw_asset:raw,raw_size:await size(raw),normalized_asset:normalized,normalized_size:await size(normalized),asset_registry_entry:!!asset,asset_version:asset?.active_version||null,validation:result?.validation||null,metadata,duration_ms:Date.now()-started});
  console.log(JSON.stringify(output,null,2));
  process.exit(report.state==='READY'&&asset?.status==='READY'&&result?.validation?.pass?0:2);
}catch(error){
  const root=registry.path(assetId),generated=join(root,'generated','v002'),generation=await json(join(generated,'generation_result.json')),stderrPath=join(generated,'stderr.log'),stderr=existsSync(stderrPath)?(await readFile(stderrPath,'utf8')).slice(-2000):null;
  console.log(JSON.stringify({...output,provider:'Hunyuan3DProvider',state:'FAILED',error_code:generation?.error_code||generation?.error_type||error.message,stage:generation?'GENERATION':'PREFLIGHT',generation_result:generation,stderr_tail:stderr,output_directory:generated,duration_ms:Date.now()-started},null,2));
  process.exit(2);
}