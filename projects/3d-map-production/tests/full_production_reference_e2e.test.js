import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../core.js';
import { MapProductionApplicationService } from '../assets/map-production-application-service.js';
import { MapProductionService } from '../assets/production.js';
import { ReferenceOrchestrator, ReferenceRegistry } from '../assets/reference-system.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+ZyXSUwAAAABJRU5ErkJggg==','base64');
const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'reference-e2e.json'}};
const map={version:'1.1',project:{id:'reference-e2e'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[{id:'road-1',points:[[0,0,0],[5,0,0]],width:1,elevation:0,rotation:[0,0,0],source}],buildings:[{id:'building-1',footprint:[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],height:3,floors:1,position:[1,1,1.5],rotation:[0,0,0],scale:[1,1,1],source}],objects:[{id:'ground-1',type:'ground',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[10,10,.1],source}],zones:[],metadata:{unresolved_items:[]}};
const decisions={decisions:[{object_id:'ground-1',production_mode:'PROCEDURAL'},{object_id:'road-1',production_mode:'PROCEDURAL'},{object_id:'building-1',production_mode:'GENERATED_ASSET'}]};
const measurement={objects:[{id:'ground-1',position:[0,0,0],dimensions:[10,10,.1]},{id:'road-1',position:[0,0,0],dimensions:[5,1,.1]},{id:'building-1',position:[1,1,1.5],dimensions:[2,2,3]}]};

test('Application Service uses real ReferenceOrchestrator with a deterministic AUTO_ACQUIRE provider',async()=>{
  const root=await mkdtemp(join(tmpdir(),'full-production-reference-e2e-')),{path:project}=await createProject(root,'reference-e2e'),bridge=join(project,'production_bridge'),fixtureImage=join(project,'fake-building.png'),calls={provider:0,asset:0,material:0,quality:0,blender:0,export:0,unity:0};
  await Promise.all([mkdir(join(project,'structure'),{recursive:true}),mkdir(bridge,{recursive:true}),writeFile(fixtureImage,png)]);
  await writeFile(join(project,'structure','map_structure.json'),JSON.stringify(map));
  const assets={asset_requirements:[{asset_id:'asset-building',object_ids:['building-1'],generation_mode:'generated_asset',target_dimensions:[2,2,3],generation_profile:'Prototype',provider_preferences:['fake'],reference_requirement_id:'ref-building',status:'APPROVED',material_requirement:{material_id:'material-building'}}]};
  const refs={reference_requirements:[{reference_requirement_id:'ref-building',mode:'AUTO_ACQUIRE',status:'PENDING',category:'building',purpose:'GEOMETRY',search_terms:['building-1'],minimum_resolution:[1,1],required:true}]};
  for(const [file,value] of [['production_readiness.json',{state:'READY'}],['binding_review.json',decisions],['asset_requirements.json',assets],['reference_requirements.json',refs]])await writeFile(join(bridge,file),JSON.stringify(value));
  const registry=await new ReferenceRegistry(project).init();
  const fakeProvider={searches:0,async search(requirement){calls.provider++;this.searches++;return[{candidate_id:'fake-building',local_path:fixtureImage,status:'CANDIDATE',reference_type:requirement.purpose,category:requirement.category,title:'deterministic building reference',provenance:'GENERATED',quality:{resolution:[1,1]}}]},async store(candidate){return registry.ingest(candidate.local_path,{reference_type:candidate.reference_type,category:candidate.category,purpose:candidate.reference_type,provenance:candidate.provenance,status:'CANDIDATE'})}};
  const referenceOrchestrator=new ReferenceOrchestrator(project,{registry,localProvider:fakeProvider,webProvider:null});
  const app=new MapProductionApplicationService({productionServiceFactory:target=>new MapProductionService(target,{
    referenceOrchestrator,
    assetOrchestrator:{run:async received=>{calls.asset++;const asset=received.asset_requirements[0];assert.equal(received.asset_requirements.length,1);assert.ok(asset.reference_image);assert.ok(asset.reference_fingerprint);assert.equal(asset.reference_set.length,1);return{state:'READY',assets:[]}}},
    materialOrchestrator:{run:async()=>{calls.material++;const dir=join(target,'materials');await mkdir(dir,{recursive:true});await Promise.all(['material_plan.json','material_report.json','material_validation.json'].map(file=>writeFile(join(dir,file),'{}')));return{pass:true}}},
    qualityOrchestrator:{run:async()=>{calls.quality++;return{report:{pass:true}}}},
    blenderFinalizer:{run:async()=>{calls.blender++;return{scene_measurement:measurement}}},
    exportService:{run:async()=>{calls.export++;const fbx=join(target,'blender','map.fbx');await mkdir(join(target,'blender'),{recursive:true});await writeFile(fbx,'fake-fbx');return{fbx_path:fbx}}},
    unityProvider:{exportAndValidate:async()=>{calls.unity++;const dir=join(target,'unity');await mkdir(dir,{recursive:true});await writeFile(join(dir,'import_validation.json'),JSON.stringify({pass:true}));return{pass:true}}}
  })});
  const response=await app.startFullProduction(project),report=JSON.parse(await readFile(join(project,'references','reference_report.json'),'utf8')),plan=JSON.parse(await readFile(join(project,'references','reference_plan.json'),'utf8')),checkpoint=response.state.checkpoint;
  assert.equal(response.result.final_state,'READY');
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.status,'COMPLETE');
  assert.equal(checkpoint.stages.MATERIAL_PROCESSING.status,'COMPLETE');
  assert.equal(checkpoint.stages.QUALITY_PROCESSING.status,'SKIPPED');
  assert.equal(report.requirements_total,1);assert.equal(report.approved,1);assert.ok(plan.items[0].reference_fingerprint);assert.equal((await registry.list())[0].status,'APPROVED');
  assert.deepEqual(calls,{provider:1,asset:1,material:1,quality:0,blender:1,export:1,unity:1});
});