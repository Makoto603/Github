import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapProductionService } from '../assets/production.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+ZyXSUwAAAABJRU5ErkJggg==','base64');
const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'default-reference-wiring.json'}};
const requirement={reference_requirement_id:'ref-building',mode:'AUTO_ACQUIRE',category:'building',purpose:'GEOMETRY',search_terms:['building','architecture','exterior'],minimum_resolution:[1,1],reference_count:1,required:true};
const map=(requirements=[requirement])=>({version:'1.1',project:{id:'default-reference-wiring'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[],buildings:[],objects:[{id:'building-1',type:'placeholder',asset_id:requirements.length?'asset-building':null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],source}],zones:[],asset_requirements:requirements.length?[{asset_id:'asset-building',category:'building',object_ids:['building-1'],reference_image:null,target_dimensions:[1,1,1],review_status:'APPROVED',provenance:{source_stage:'phase1_asset_binding',review_id:'review-1',reviewed_by:'test',source_object_ids:['building-1']}}]:[],metadata:{unresolved_items:[]}});
const scene={objects:[{id:'building-1',position:[0,0,0],dimensions:[1,1,1]}]};
const response=(body,options={})=>new Response(body,options);

const dependencies=(project,calls)=>({
  assetOrchestrator:{run:async received=>{calls.assets++;calls.asset=received.asset_requirements[0]||null;return{state:'READY',assets:[]}}},
  blenderFinalizer:{run:async()=>({scene_measurement:scene})},
  exportService:{run:async()=>{calls.exports++;const file=join(project,'blender','map.fbx');await mkdir(join(project,'blender'),{recursive:true});await writeFile(file,'fake-fbx');return{fbx_path:file}}}
});

const wikimediaTransport=calls=>async url=>{
  calls.http++;
  const parsed=new URL(url);
  if(parsed.hostname==='thumb.wikimedia.org')return response(png,{headers:{'content-type':'image/png','content-length':String(png.length)}});
  if(parsed.searchParams.get('list')==='search')return response(JSON.stringify({query:{search:[{title:'File:Building.png'}]}}),{headers:{'content-type':'application/json'}});
  return response(JSON.stringify({query:{pages:{'1':{pageid:1,title:'File:Building.png',imageinfo:[{url:'https://upload.wikimedia.org/building.png',thumburl:'https://thumb.wikimedia.org/building.png',descriptionurl:'https://commons.wikimedia.org/wiki/File:Building.png',width:1200,height:800,mime:'image/png',extmetadata:{LicenseShortName:{value:'CC0'},Artist:{value:'Example'}}}]}}}}),{headers:{'content-type':'application/json'}});
};

test('default composition uses real local-first Wikimedia fallback without constructor network activity',async()=>{
  const project=await mkdtemp(join(tmpdir(),'default-reference-web-')),calls={http:0,assets:0,exports:0};
  const service=new MapProductionService(project,{...dependencies(project,calls),referenceProviderOptions:{fetchImpl:wikimediaTransport(calls)}});
  assert.equal(service.references.constructor.name,'ReferenceOrchestrator');
  assert.equal(service.references.local.constructor.name,'ConfiguredLocalReferenceProvider');
  assert.equal(service.references.web.constructor.name,'WikimediaCommonsReferenceProvider');
  assert.equal(calls.http,0);
  const result=await service.run({map:map(),referenceRequirements:[{...requirement,asset_id:'asset-building'}]});
  assert.equal(result.final_state,'READY');
  assert.equal(service.references.local.searches,1);
  assert.equal(service.references.web.searches,1);
  assert.equal(service.references.web.fetches,1);
  assert.equal(calls.http,3);
  assert.ok(calls.asset.reference_image);
  assert.ok(existsSync(calls.asset.reference_image));
  assert.ok(calls.asset.reference_fingerprint);
  assert.equal(calls.asset.reference_set.length,1);
});

test('default composition reuses a local reference before Wikimedia',async()=>{
  const project=await mkdtemp(join(tmpdir(),'default-reference-local-')),calls={http:0,assets:0,exports:0};
  const service=new MapProductionService(project,{...dependencies(project,calls),referenceProviderOptions:{fetchImpl:wikimediaTransport(calls)}});
  const local=join(project,'building.png');await writeFile(local,png);
  await service.references.registry.ingest(local,{reference_type:'GEOMETRY',source_type:'LOCAL',category:'building',purpose:'GEOMETRY',status:'APPROVED'});
  const result=await service.run({map:map(),referenceRequirements:[{...requirement,asset_id:'asset-building'}]});
  assert.equal(result.final_state,'READY');
  assert.equal(service.references.web.searches,0);
  assert.equal(calls.http,0);
  assert.ok(calls.asset.reference_image);
});

test('no reference requirement skips web processing',async()=>{
  const project=await mkdtemp(join(tmpdir(),'default-reference-none-')),calls={http:0,assets:0,exports:0};
  const service=new MapProductionService(project,{...dependencies(project,calls),referenceProviderOptions:{fetchImpl:wikimediaTransport(calls)}});
  const result=await service.run({map:map([])});
  assert.equal(result.final_state,'READY');
  assert.equal(service.references.web.searches,0);
  assert.equal(calls.http,0);
});

test('unmatched global requirements leave an empty bound array and skip reference processing',async()=>{
  const project=await mkdtemp(join(tmpdir(),'default-reference-unmatched-')),calls={http:0,assets:0,exports:0};
  const service=new MapProductionService(project,{...dependencies(project,calls),referenceProviderOptions:{fetchImpl:wikimediaTransport(calls)}});
  let processCalls=0;const process=service.references.process.bind(service.references);service.references.process=async value=>{processCalls++;return process(value)};
  const productionInput={generated_assets:[{asset_id:'asset-building',object_ids:['building-1'],generation_mode:'generated_asset',target_dimensions:[1,1,1],generation_profile:'Prototype',provider_preferences:['fake'],reference_requirement_id:'ref-building',status:'APPROVED'}],procedural_objects:[],reference_requirements:[]};
  const result=await service.run({map:map([]),productionInput,referenceRequirements:[{reference_requirement_id:'ref-other',mode:'AUTO_ACQUIRE',status:'PENDING'}]});
  const checkpoint=JSON.parse(await readFile(join(project,'production_checkpoint.json'),'utf8'));
  assert.equal(result.final_state,'READY');
  assert.equal(processCalls,0);
  assert.equal(service.references.web.searches,0);
  assert.equal(calls.http,0);
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.status,'SKIPPED');
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.metadata.applicable,false);
});

test('injected ReferenceOrchestrator remains the only reference executor',async()=>{
  const project=await mkdtemp(join(tmpdir(),'default-reference-injected-')),calls={http:0,assets:0,exports:0,reference:0};
  const plan=join(project,'references','reference_plan.json'),report=join(project,'references','reference_report.json');
  const injected={process:async received=>{calls.reference++;await mkdir(join(project,'references'),{recursive:true});await Promise.all([writeFile(plan,'{}'),writeFile(report,'{}')]);return{status:'READY',map:received,plan:[],report:{items:[]},plan_path:plan,report_path:report}}};
  const service=new MapProductionService(project,{...dependencies(project,calls),referenceOrchestrator:injected,referenceProviderOptions:{fetchImpl:wikimediaTransport(calls)}});
  const result=await service.run({map:map(),referenceRequirements:[{...requirement,asset_id:'asset-building'}]});
  assert.equal(result.final_state,'READY');
  assert.equal(service.references,injected);
  assert.equal(calls.reference,1);
  assert.equal(calls.http,0);
});