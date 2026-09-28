import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapProductionService, blenderAssetsFromAssetProcessing } from '../assets/production.js';

const fixture=join(process.cwd(),'diagnostics','smoke.fbx');
const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'blender-finalizer-wiring.json'}};
const map={version:'1.1',project:{id:'blender-finalizer-wiring'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[],buildings:[],objects:[{id:'generated-object-1',type:'placeholder',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],source}],zones:[],metadata:{unresolved_items:[]}};
const scene={objects:[{id:'generated-object-1',position:[0,0,0],dimensions:[1,1,1]}]};
const good={asset_id:'asset-generated-1',state:'COMPLETE',target_dimensions:[1,1,2],objects:[{object_id:'generated-object-1'}],result:{asset:{asset_id:'asset-generated-1',status:'READY',active_version:'v002',model_path:fixture,generation_fingerprint:'generated-v002'},validation:{pass:true,metrics:{dimensions:[1,1,2],vertex_count:8,polygon_count:6}}}};
const invalid={asset_id:'asset-invalid-1',state:'COMPLETE',target_dimensions:[1,1,2],objects:[{object_id:'generated-object-1'}],result:{asset:{asset_id:'asset-invalid-1',status:'READY',active_version:'v002',model_path:fixture},validation:{pass:false,metrics:{dimensions:[1,1,2]}}}};
const dependencies=(project,assets,receive)=>({assetOrchestrator:{run:async()=>({state:'READY',assets})},blenderFinalizer:{run:async input=>{receive(input);return{scene_measurement:scene}}},exportService:{run:async()=>{const path=join(project,'blender','map.fbx');await mkdir(join(project,'blender'),{recursive:true});await writeFile(path,'fake');return{fbx_path:path}}}});

test('validated generated assets are passed to the Blender finalizer with normalized mesh binding',async()=>{
  assert.ok(existsSync(fixture));
  const project=await mkdtemp(join(tmpdir(),'blender-finalizer-wiring-')),received=[];
  const service=new MapProductionService(project,dependencies(project,[good,invalid],input=>received.push(input)));
  const result=await service.run({map});
  assert.equal(result.final_state,'READY');assert.equal(received.length,1);assert.equal(received[0].project,project);assert.equal(received[0].map,map);assert.equal(received[0].material,null);assert.equal(received[0].assetProcessing.assets.length,2);assert.equal(received[0].generatedAssets.length,1);
  const asset=received[0].generatedAssets[0];assert.equal(asset.asset_id,'asset-generated-1');assert.equal(asset.model_path,fixture);assert.deepEqual(asset.object_ids,['generated-object-1']);assert.equal(asset.validation.pass,true);
});

test('procedural-only asset processing supplies an empty generatedAssets array',async()=>{
  const project=await mkdtemp(join(tmpdir(),'blender-finalizer-procedural-')),received=[];
  const service=new MapProductionService(project,dependencies(project,[],input=>received.push(input)));
  const result=await service.run({map});
  assert.equal(result.final_state,'READY');assert.equal(received.length,1);assert.deepEqual(received[0].generatedAssets,[]);
});

test('Blender asset adapter excludes failed, partial, and validation-failed results',()=>{
  assert.equal(blenderAssetsFromAssetProcessing(process.cwd(),{assets:[invalid,{...good,state:'FAILED'},{...good,result:{...good.result,asset:{...good.result.asset,status:'FAILED'}}}]}).length,0);
});