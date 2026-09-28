import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../core.js';
import { MapProductionApplicationService } from '../assets/map-production-application-service.js';
import { MapProductionService } from '../assets/production.js';
import { ReferenceOrchestrator, ReferenceRegistry } from '../assets/reference-system.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+ZyXSUwAAAABJRU5ErkJggg==','base64');
const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'web-reference-e2e.json'}};
const semanticMap={version:'1.1',project:{id:'web-reference-e2e'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[{id:'road-1',points:[[0,0,0],[5,0,0]],width:1,elevation:0,rotation:[0,0,0],source}],buildings:[{id:'building-1',footprint:[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],height:3,floors:1,position:[1,1,1.5],rotation:[0,0,0],scale:[1,1,1],source}],objects:[{id:'ground-1',type:'ground',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[10,10,.1],source}],zones:[],metadata:{unresolved_items:[]}};
const decisions={decisions:[{object_id:'ground-1',production_mode:'PROCEDURAL'},{object_id:'road-1',production_mode:'PROCEDURAL'},{object_id:'building-1',production_mode:'GENERATED_ASSET'}]};
const measurement={objects:[{id:'ground-1',position:[0,0,0],dimensions:[10,10,.1]},{id:'road-1',position:[0,0,0],dimensions:[5,1,.1]},{id:'building-1',position:[1,1,1.5],dimensions:[2,2,3]}]};
const requirement={reference_requirement_id:'ref-building',mode:'AUTO_ACQUIRE',status:'PENDING',category:'building',purpose:'GEOMETRY',search_terms:['building-1'],minimum_resolution:[1,1],reference_count:1,required:true};

const fakeLocal={searches:0,async search(){this.searches++;return[]},async store(){throw Error('local store must not run')}};
function webProvider(project,calls,{invalidFirst=false}={}){return{async search(){calls.search++;return[...(invalidFirst?[{candidate_id:'invalid',source_uri:'https://example.invalid/invalid.bin',source_domain:'example.invalid',status:'CANDIDATE',title:'invalid'}]:[]),{candidate_id:'valid',source_uri:'https://example.invalid/building.png',source_domain:'example.invalid',status:'CANDIDATE',title:'building reference',license:'CC0',license_url:'https://example.invalid/license',reference_type:'GEOMETRY',provenance:'GENERATED'}]},async fetch(candidate){calls.fetch++;const dir=join(project,'web-fixture');await mkdir(dir,{recursive:true});const path=join(dir,candidate.candidate_id==='invalid'?'invalid.bin':'building.png');await writeFile(path,candidate.candidate_id==='invalid'?Buffer.from('not-an-image'):png);return{...candidate,local_path:path}},async normalize(candidate){calls.normalize++;return candidate}}}

test('Application Service reaches READY through real web AUTO_ACQUIRE reference processing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'full-production-web-reference-')),{path:project}=await createProject(root,'web-reference-e2e'),bridge=join(project,'production_bridge'),calls={search:0,fetch:0,normalize:0,asset:0,material:0,quality:0,blender:0,export:0,unity:0};
  await Promise.all([mkdir(join(project,'structure'),{recursive:true}),mkdir(bridge,{recursive:true})]);
  await writeFile(join(project,'structure','map_structure.json'),JSON.stringify(semanticMap));
  const assets={asset_requirements:[{asset_id:'asset-building',object_ids:['building-1'],generation_mode:'generated_asset',target_dimensions:[2,2,3],generation_profile:'Prototype',provider_preferences:['fake'],reference_requirement_id:'ref-building',status:'APPROVED',material_requirement:{material_id:'material-building'}}]};
  for(const [file,value] of [['production_readiness.json',{state:'READY'}],['binding_review.json',decisions],['asset_requirements.json',assets],['reference_requirements.json',{reference_requirements:[requirement]}]])await writeFile(join(bridge,file),JSON.stringify(value));
  const registry=await new ReferenceRegistry(project).init(),referenceOrchestrator=new ReferenceOrchestrator(project,{registry,localProvider:{...fakeLocal,searches:0},webProvider:webProvider(project,calls)});
  const app=new MapProductionApplicationService({productionServiceFactory:target=>new MapProductionService(target,{
    referenceOrchestrator,
    assetOrchestrator:{run:async received=>{calls.asset++;const asset=received.asset_requirements[0];assert.equal(received.asset_requirements.length,1);assert.ok(asset.reference_image);assert.ok(asset.reference_fingerprint);assert.equal(asset.reference_set.length,1);return{state:'READY',assets:[]}}},
    materialOrchestrator:{run:async()=>{calls.material++;const dir=join(target,'materials');await mkdir(dir,{recursive:true});await Promise.all(['material_plan.json','material_report.json','material_validation.json'].map(file=>writeFile(join(dir,file),'{}')));return{pass:true}}},
    qualityOrchestrator:{run:async()=>{calls.quality++;return{report:{pass:true}}}},
    blenderFinalizer:{run:async()=>{calls.blender++;return{scene_measurement:measurement}}},
    exportService:{run:async()=>{calls.export++;const path=join(target,'blender','map.fbx');await mkdir(join(target,'blender'),{recursive:true});await writeFile(path,'fake-fbx');return{fbx_path:path}}},
    unityProvider:{exportAndValidate:async()=>{calls.unity++;const dir=join(target,'unity');await mkdir(dir,{recursive:true});await writeFile(join(dir,'import_validation.json'),JSON.stringify({pass:true}));return{pass:true}}}
  })});
  const response=await app.startFullProduction(project),report=JSON.parse(await readFile(join(project,'references','reference_report.json'),'utf8')),reference=(await registry.list())[0];
  assert.equal(response.result.final_state,'READY');assert.equal(response.state.checkpoint.current_stage,'READY');assert.equal(response.state.checkpoint.stages.REFERENCE_PROCESSING.status,'COMPLETE');assert.equal(response.state.checkpoint.stages.QUALITY_PROCESSING.status,'SKIPPED');
  assert.equal(report.requirements_total,1);assert.equal(report.approved,1);assert.ok(report.web_hits>=1);assert.equal(reference.status,'APPROVED');assert.equal(reference.source_type,'WEB');assert.equal(reference.source_uri,'https://example.invalid/building.png');assert.ok(existsSync(reference.local_path));
  assert.deepEqual(calls,{search:1,fetch:1,normalize:1,asset:1,material:1,quality:0,blender:1,export:1,unity:1});
});

test('USER_REVIEW web candidates remain un-fetched and unapproved',async()=>{
  const project=await mkdtemp(join(tmpdir(),'web-user-review-')),registry=await new ReferenceRegistry(project).init(),calls={search:0,fetch:0,normalize:0},orchestrator=new ReferenceOrchestrator(project,{registry,localProvider:{...fakeLocal,searches:0},webProvider:webProvider(project,calls)});
  const result=await orchestrator.process({asset_requirements:[{asset_id:'asset-building',category:'building',reference_requirement:{...requirement,mode:'USER_REVIEW'}}]});
  assert.equal(result.status,'WAITING_USER');assert.equal(result.report.approved,0);assert.deepEqual(calls,{search:1,fetch:0,normalize:0});
});

test('AUTO_ACQUIRE skips an invalid web image and approves the next valid candidate',async()=>{
  const project=await mkdtemp(join(tmpdir(),'web-invalid-fallback-')),registry=await new ReferenceRegistry(project).init(),calls={search:0,fetch:0,normalize:0},orchestrator=new ReferenceOrchestrator(project,{registry,localProvider:{...fakeLocal,searches:0},webProvider:webProvider(project,calls,{invalidFirst:true})});
  const result=await orchestrator.process({asset_requirements:[{asset_id:'asset-building',category:'building',reference_requirement:requirement}]});
  assert.equal(result.status,'READY');assert.equal(result.report.approved,1);assert.deepEqual(calls,{search:1,fetch:2,normalize:2});assert.equal((await registry.list())[0].source_type,'WEB');
});

test('required AUTO_ACQUIRE web-search failure becomes WAITING_USER instead of throwing',async()=>{
  const project=await mkdtemp(join(tmpdir(),'web-search-failure-')),registry=await new ReferenceRegistry(project).init(),orchestrator=new ReferenceOrchestrator(project,{registry,localProvider:{...fakeLocal,searches:0},webProvider:{search:async()=>{throw Error('WIKIMEDIA_TIMEOUT')}}});
  const result=await orchestrator.process({asset_requirements:[{asset_id:'asset-building',category:'building',reference_requirement:requirement}]});
  assert.equal(result.status,'WAITING_USER');assert.match(result.report.errors[0],/WIKIMEDIA_TIMEOUT/);
});