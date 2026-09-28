import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../core.js';
import { MapProductionApplicationService } from '../assets/map-production-application-service.js';
import { MapProductionService } from '../assets/production.js';

const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'fake-e2e.json'}};
const map={version:'1.1',project:{id:'fake-e2e'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[{id:'road-1',points:[[0,0,0],[5,0,0]],width:1,elevation:0,rotation:[0,0,0],source}],buildings:[{id:'building-1',footprint:[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],height:3,floors:1,position:[1,1,1.5],rotation:[0,0,0],scale:[1,1,1],source}],objects:[{id:'ground-1',type:'ground',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[10,10,.1],source}],zones:[],metadata:{unresolved_items:[]}};
const decisions={decisions:[{object_id:'ground-1',production_mode:'PROCEDURAL'},{object_id:'road-1',production_mode:'PROCEDURAL'},{object_id:'building-1',production_mode:'GENERATED_ASSET'}]};
const assetRequirements={asset_requirements:[{asset_id:'asset-building',object_ids:['building-1'],generation_mode:'generated_asset',target_dimensions:[2,2,3],generation_profile:'Prototype',provider_preferences:['fake'],reference_requirement_id:'ref-building',status:'APPROVED',material_requirement:{material_id:'material-building'}}]};
const referenceRequirements={reference_requirements:[{reference_requirement_id:'ref-building',mode:'AUTO_ACQUIRE',status:'PENDING'}]};
const measurement={objects:[{id:'ground-1',position:[0,0,0],dimensions:[10,10,.1]},{id:'road-1',position:[0,0,0],dimensions:[5,1,.1]},{id:'building-1',position:[1,1,1.5],dimensions:[2,2,3]}]};

test('Application Service reaches READY through real production orchestration and fake externals',async()=>{
  const root=await mkdtemp(join(tmpdir(),'full-production-fake-e2e-')),{path:project}=await createProject(root,'fake-e2e'),bridge=join(project,'production_bridge'),calls={reference:0,asset:0,material:0,quality:0,blender:0,export:0,unity:0};
  await Promise.all([mkdir(join(project,'structure'),{recursive:true}),mkdir(bridge,{recursive:true})]);
  await writeFile(join(project,'structure','map_structure.json'),JSON.stringify(map));
  for(const [file,value] of [['production_readiness.json',{state:'READY'}],['binding_review.json',decisions],['asset_requirements.json',assetRequirements],['reference_requirements.json',referenceRequirements]])await writeFile(join(bridge,file),JSON.stringify(value));
  const app=new MapProductionApplicationService({productionServiceFactory:target=>new MapProductionService(target,{
    referenceOrchestrator:{process:async received=>{calls.reference++;const dir=join(target,'references'),plan_path=join(dir,'reference_plan.json'),report_path=join(dir,'reference_report.json');await mkdir(dir,{recursive:true});await writeFile(plan_path,'{}');await writeFile(report_path,'{}');return{status:'READY',map:received,plan:[],report:{items:[]},plan_path,report_path}}},
    assetOrchestrator:{run:async received=>{calls.asset++;assert.equal(received.asset_requirements.length,1);assert.equal(received.asset_requirements[0].asset_id,'asset-building');return{state:'READY',assets:[]}}},
    materialOrchestrator:{run:async()=>{calls.material++;const dir=join(target,'materials');await mkdir(dir,{recursive:true});await Promise.all(['material_plan.json','material_report.json','material_validation.json'].map(file=>writeFile(join(dir,file),'{}')));return{pass:true}}},
    qualityOrchestrator:{run:async()=>{calls.quality++;return{report:{pass:true}}}},
    blenderFinalizer:{run:async()=>{calls.blender++;return{scene_measurement:measurement}}},
    exportService:{run:async()=>{calls.export++;const fbx=join(target,'blender','map.fbx');await mkdir(join(target,'blender'),{recursive:true});await writeFile(fbx,'fake-fbx');return{fbx_path:fbx}}},
    unityProvider:{exportAndValidate:async()=>{calls.unity++;const dir=join(target,'unity');await mkdir(dir,{recursive:true});await writeFile(join(dir,'import_validation.json'),JSON.stringify({pass:true,import_success:true,is_fake:true}));return{pass:true}}}
  })});
  const response=await app.startFullProduction(project),checkpoint=response.state.checkpoint,report=JSON.parse(await readFile(join(project,'map_production_report.json'),'utf8')),manifest=JSON.parse(await readFile(join(project,'production_artifacts.json'),'utf8'));
  assert.equal(response.result.final_state,'READY');
  assert.equal(response.state.report.final_state,'READY');
  assert.equal(checkpoint.checkpoint_contract_version,1);
  assert.equal(checkpoint.current_stage,'READY');
  for(const stage of ['ANALYZING','STRUCTURING','REFERENCE_PROCESSING','ASSET_PROCESSING','MATERIAL_PROCESSING','BLENDER_FINALIZING','VALIDATING','EXPORTING','UNITY_VALIDATING'])assert.equal(checkpoint.stages[stage].status,'COMPLETE');
  assert.equal(checkpoint.stages.QUALITY_PROCESSING.status,'SKIPPED');
  assert.equal(checkpoint.stages.QUALITY_PROCESSING.metadata.applicable,false);
  assert.deepEqual(calls,{reference:1,asset:1,material:1,quality:0,blender:1,export:1,unity:1});
  assert.equal(response.input.generated_assets.length,1);
  assert.equal(response.input.procedural_objects.length,2);
  assert.equal(report.final_state,'READY');
  const names=new Set(manifest.artifacts.map(item=>item.name));
  for(const name of ['map_structure','reference_plan','reference_report','material_plan','material_report','material_validation','fbx','production_report'])assert.ok(names.has(name));
  assert.ok(manifest.artifacts.every(item=>item.path&&item.size>0&&item.sha256));
});