import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapProductionService } from '../assets/production.js';

const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'fixture.json'}};
const map=()=>({
  version:'1.1',project:{id:'wiring-fixture'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],
  objects:[{id:'ground-1',type:'ground',asset_id:null,position:[0,0,0],rotation:[0,0,0],scale:[10,10,.1],source}],
  roads:[{id:'road-1',points:[[0,0,0],[5,0,0]],width:1,elevation:0,rotation:[0,0,0],source}],
  buildings:[{id:'building-1',footprint:[[0,0,0],[2,0,0],[2,2,0],[0,2,0]],height:3,floors:1,position:[1,1,1.5],rotation:[0,0,0],scale:[1,1,1],source}],
  zones:[],metadata:{unresolved_items:[]}
});
const generated={asset_id:'asset-building',object_ids:['building-1'],generation_mode:'generated_asset',target_dimensions:[2,2,3],generation_profile:'Prototype',provider_preferences:['fake'],reference_requirement_id:'ref-1',status:'APPROVED'};
const input=(references)=>({
  generated_assets:[generated],
  procedural_objects:[{id:'ground-1'},{id:'road-1'}],
  reference_requirements:references
});

async function runWith({references}){
  const project=await mkdtemp(join(tmpdir(),'production-input-wiring-'));
  let assetMap,referenceMap;
  const service=new MapProductionService(project,{
    assetOrchestrator:{run:async received=>{assetMap=received;return{state:'PARTIAL',assets:[]}}},
    referenceOrchestrator:{process:async received=>{referenceMap=received;return{status:'READY',plan:[],report:{items:[]},map:received}}}
  });
  const semanticMap=map(),productionInput=input(references);
  const beforeMap=structuredClone(semanticMap),beforeInput=structuredClone(productionInput);
  const result=await service.run({map:semanticMap,productionInput,referenceRequirements:references});
  return{result,assetMap,referenceMap,semanticMap,productionInput,beforeMap,beforeInput};
}

test('A: passes only generated asset requirements to the asset orchestrator',async()=>{
  const result=await runWith({references:[{reference_requirement_id:'ref-1',mode:'AUTO_ACQUIRE',status:'PENDING'}]});
  assert.equal(result.result.final_state,'PARTIAL');
  assert.equal(result.assetMap.asset_requirements.length,1);
  assert.equal(result.assetMap.asset_requirements[0].asset_id,'asset-building');
  assert.equal(result.assetMap.asset_requirements.some(x=>x.object_ids.includes('ground-1')||x.object_ids.includes('road-1')),false);
});

test('B: binds an AUTO_ACQUIRE reference by reference_requirement_id',async()=>{
  const reference={reference_requirement_id:'ref-1',mode:'AUTO_ACQUIRE',status:'PENDING'};
  const result=await runWith({references:[reference]});
  assert.equal(result.referenceMap.asset_requirements[0].reference_requirements.length,1);
  assert.equal(result.referenceMap.asset_requirements[0].reference_requirements[0],reference);
});

test('C: retains legacy asset_id reference binding',async()=>{
  const reference={asset_id:'asset-building',mode:'AUTO_ACQUIRE',status:'PENDING'};
  const result=await runWith({references:[reference]});
  assert.equal(result.referenceMap.asset_requirements[0].reference_requirements.length,1);
  assert.equal(result.referenceMap.asset_requirements[0].reference_requirements[0],reference);
});

test('D: does not mutate the semantic map or ProductionInput',async()=>{
  const result=await runWith({references:[{reference_requirement_id:'ref-1',mode:'AUTO_ACQUIRE',status:'PENDING'}]});
  assert.deepEqual(result.semanticMap,result.beforeMap);
  assert.deepEqual(result.productionInput,result.beforeInput);
});