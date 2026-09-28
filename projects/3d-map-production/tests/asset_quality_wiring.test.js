import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapProductionService, qualityAssetsFromAssetProcessing } from '../assets/production.js';
import { QualityOrchestrator } from '../assets/quality-system.js';

const fixture=join(process.cwd(),'diagnostics','smoke.fbx');
const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'asset-quality-wiring.json'}};
const map={version:'1.1',project:{id:'asset-quality-wiring'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[],buildings:[],objects:[{id:'quality-object-1',type:'placeholder',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],source}],zones:[],metadata:{unresolved_items:[]}};
const scene={objects:[{id:'quality-object-1',position:[0,0,0],dimensions:[1,1,1]}]};
const readyAssets=()=>({state:'READY',assets:[{asset_id:'asset-quality-1',state:'COMPLETE',target_dimensions:[1,1,2],objects:[{object_id:'quality-object-1'}],result:{asset:{asset_id:'asset-quality-1',status:'READY',active_version:'v002',model_path:fixture,generation_fingerprint:'quality-generated-v002'},validation:{pass:true,metrics:{dimensions:[1,1,2],origin:[0,0,0],vertex_count:8,polygon_count:6}}}}]});
const dependencies=(project,assets,quality)=>({assetOrchestrator:{run:async()=>assets},qualityOrchestrator:quality,blenderFinalizer:{run:async()=>({scene_measurement:scene})},exportService:{run:async()=>{const path=join(project,'blender','map.fbx');await mkdir(join(project,'blender'),{recursive:true});await writeFile(path,'fake');return{fbx_path:path}}}});
const realQuality=(project,calls)=>{const quality=new QualityOrchestrator(project),run=quality.run.bind(quality);quality.run=async(...args)=>{calls.quality++;return run(...args)};return quality};

test('READY asset processing automatically supplies real QualityOrchestrator',async()=>{
  assert.ok(existsSync(fixture));
  const project=await mkdtemp(join(tmpdir(),'asset-quality-auto-')),calls={quality:0},quality=realQuality(project,calls),service=new MapProductionService(project,dependencies(project,readyAssets(),quality));
  const result=await service.run({map});
  const checkpoint=JSON.parse(await readFile(join(project,'production_checkpoint.json'),'utf8'));
  assert.equal(result.final_state,'READY');assert.equal(calls.quality,1);assert.equal(result.quality_input_source,'ASSET_PROCESSING');assert.equal(result.quality_processing.assets_total,1);assert.ok(existsSync(join(project,'quality','quality_plan.json')));assert.ok(existsSync(join(project,'quality','quality_report.json')));assert.equal(checkpoint.stages.QUALITY_PROCESSING.status,'COMPLETE');
});

test('no READY assets skips real quality processing',async()=>{
  const project=await mkdtemp(join(tmpdir(),'asset-quality-none-')),calls={quality:0},quality=realQuality(project,calls),service=new MapProductionService(project,dependencies(project,{state:'READY',assets:[]},quality));
  const result=await service.run({map}),checkpoint=JSON.parse(await readFile(join(project,'production_checkpoint.json'),'utf8'));
  assert.equal(result.final_state,'READY');assert.equal(calls.quality,0);assert.equal(checkpoint.stages.QUALITY_PROCESSING.status,'SKIPPED');assert.equal(checkpoint.stages.QUALITY_PROCESSING.metadata.applicable,false);
});

test('explicit quality assets override automatic asset-processing input',async()=>{
  const project=await mkdtemp(join(tmpdir(),'asset-quality-manual-')),calls={quality:0},quality=realQuality(project,calls),service=new MapProductionService(project,dependencies(project,readyAssets(),quality));
  const manual={asset_id:'manual-quality-1',dimensions:[1,1,1],expected_dimensions:[1,1,1],actual_dimensions:[1,1,1],vertex_count:8,polygon_count:6};
  const result=await service.run({map,qualityAssets:[manual]}),plan=JSON.parse(await readFile(join(project,'quality','quality_plan.json'),'utf8'));
  assert.equal(result.final_state,'READY');assert.equal(calls.quality,1);assert.equal(result.quality_input_source,'MANUAL');assert.equal(plan.items[0].asset_id,'manual-quality-1');
});

test('real quality failure routes to WAITING_USER',async()=>{
  const project=await mkdtemp(join(tmpdir(),'asset-quality-failure-')),calls={quality:0},quality=realQuality(project,calls),service=new MapProductionService(project,dependencies(project,readyAssets(),quality));
  const result=await service.run({map,qualityAssets:[{asset_id:'quality-failure-1',dimensions:[1,1,1],expected_dimensions:[1,1,1],actual_dimensions:[1,1,1],vertex_count:8,polygon_count:6,render_metrics:{front:{pass:false}}}]});
  assert.equal(calls.quality,1);assert.equal(result.final_state,'WAITING_USER');assert.equal(result.quality_processing.pass,false);
});

test('quality asset builder excludes incomplete or unvalidated asset results',()=>{
  assert.equal(qualityAssetsFromAssetProcessing({assets:[{state:'FAILED'},{state:'COMPLETE',result:{asset:{status:'READY'},validation:{pass:false}}}]}).length,0);
});