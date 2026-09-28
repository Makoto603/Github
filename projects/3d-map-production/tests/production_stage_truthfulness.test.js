import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapProductionService } from '../assets/production.js';

const source={source_type:'GENERATED',confidence:1,source_reference:{source_file:'fixture.json'}};
const map=()=>({version:'1.1',project:{id:'contract-fixture'},coordinate_system:{handedness:'right-handed',up_axis:'Z'},units:'meter',world_origin:[0,0,0],terrain:[],roads:[],buildings:[],objects:[{id:'object-1',type:'placeholder',asset_id:'asset-1',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],source}],zones:[],metadata:{unresolved_items:[]}});
const scene={objects:[{id:'object-1',position:[0,0,0],dimensions:[1,1,1]}]};

async function fixture({reference=false,material=false}={}){
  const project=await mkdtemp(join(tmpdir(),'production-stage-contract-'));
  const referencePlan=join(project,'references','plan.json'),referenceReport=join(project,'references','report.json');
  await mkdir(join(project,'blender'),{recursive:true});
  const service=new MapProductionService(project,{
    assetOrchestrator:{run:async()=>({state:'READY',assets:[]})},
    referenceOrchestrator:{process:async received=>{await mkdir(join(project,'references'),{recursive:true});await writeFile(referencePlan,'{}');await writeFile(referenceReport,'{}');return{status:'READY',plan:[],report:{items:[]},plan_path:referencePlan,report_path:referenceReport,map:received}}},
    materialOrchestrator:{run:async()=>{await mkdir(join(project,'materials'),{recursive:true});await Promise.all(['material_plan.json','material_report.json','material_validation.json'].map(file=>writeFile(join(project,'materials',file),'{}')));return{pass:true}}},
    blenderFinalizer:{run:async()=>({scene_measurement:scene})},
    exportService:{run:async()=>{const fbx=join(project,'blender','map.fbx');await writeFile(fbx,'fake-fbx');return{fbx_path:fbx}}}
  });
  const referenceRequirements=reference?[{asset_id:'asset-1',reference_requirement_id:'ref-1',mode:'AUTO_ACQUIRE',status:'PENDING'}]:[];
  const productionInput={generated_assets:[{asset_id:'asset-1',object_ids:['object-1'],reference_requirement_id:'ref-1',...(material?{material_requirement:{material_id:'m-1'}}:{})}],procedural_objects:[],reference_requirements:referenceRequirements};
  await service.run({map:map(),productionInput,referenceRequirements});
  return JSON.parse(await readFile(join(project,'production_checkpoint.json'),'utf8'));
}

test('A/C/E: executed AUTO_ACQUIRE reference and material stages are COMPLETE',async()=>{
  const checkpoint=await fixture({reference:true,material:true});
  assert.equal(checkpoint.checkpoint_contract_version,1);
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.status,'COMPLETE');
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.metadata.applicable,true);
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.artifacts.length,2);
  assert.equal(checkpoint.stages.MATERIAL_PROCESSING.status,'COMPLETE');
  assert.equal(checkpoint.stages.MATERIAL_PROCESSING.metadata.applicable,true);
});

test('B/D: non-applicable reference and material stages are SKIPPED',async()=>{
  const checkpoint=await fixture();
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.status,'SKIPPED');
  assert.equal(checkpoint.stages.REFERENCE_PROCESSING.metadata.applicable,false);
  assert.equal(checkpoint.stages.MATERIAL_PROCESSING.status,'SKIPPED');
  assert.equal(checkpoint.stages.MATERIAL_PROCESSING.metadata.applicable,false);
  assert.equal(checkpoint.stages.QUALITY_PROCESSING.status,'SKIPPED');
});