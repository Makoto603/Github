import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateMap, validateBlenderScene } from '../core.js';
import { MaterialOrchestrator } from './material-system.js';
import { ConfiguredLocalReferenceProvider, ReferenceOrchestrator, ReferenceRegistry } from './reference-system.js';
import { WikimediaCommonsReferenceProvider } from './wikimedia-reference-provider.js';
import { QualityOrchestrator } from './quality-system.js';
import { AssetRegistry, AssetService } from './asset-system.js';
import { Hunyuan3DProvider } from './phase2b.js';
import { MapAssetOrchestrator } from './orchestrator.js';
import { StageCheckpointValidator } from './stage-checkpoint-validator.js';
import { ResumePlanner } from './resume-planner.js';
import { ProductionStageContract } from './production-stage-contract.js';
import { RealUnityProvider } from '../core.js';
import { RealBlenderFinalizer, RealFbxExportService } from './real-downstream-services.js';

const now=()=>new Date().toISOString(),read=async p=>JSON.parse(await readFile(p,'utf8')),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2));
export const PRODUCTION_STATES=['PENDING','ANALYZING','WAITING_USER','STRUCTURING','REFERENCE_PROCESSING','ASSET_PROCESSING','MATERIAL_PROCESSING','QUALITY_PROCESSING','BLENDER_FINALIZING','VALIDATING','EXPORTING','UNITY_VALIDATING','READY','PARTIAL','FAILED','CANCELLED'];
export const productionFingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

// ProductionInputAdapter owns the classification decision.  Convert only its
// approved generated assets into the pre-existing orchestrator contract, while
// leaving the Phase 1 semantic map and the adapter result untouched.
const applyProductionInput=(map,productionInput,providedReferences)=>{
  if(!productionInput)return{map,referenceRequirements:providedReferences};
  const referenceRequirements=providedReferences.length?providedReferences:productionInput.reference_requirements||[];
  const asset_requirements=(productionInput.generated_assets||[]).map(asset=>{
    const reference_requirement_id=asset.reference_requirement_id||asset.reference_requirement?.reference_requirement_id||null;
    return {...asset,reference_requirement_id};
  });
  return{map:{...map,asset_requirements},referenceRequirements};
};

const hasReferenceRequirement=asset=>!!asset.reference_requirement||(Array.isArray(asset.reference_requirements)&&asset.reference_requirements.length>0);

// This is the existing Phase 2C asset pipeline composition.  Construction is
// intentionally side-effect free; provider work begins only from run().
const defaultAssetOrchestrator=project=>{
  const provider=new Hunyuan3DProvider();
  const registry=new AssetRegistry(project);
  const service=new AssetService(project,{provider});
  return new MapAssetOrchestrator(project,{registry,service,provider});
};

// Keep the normal production reference route local-first while providing the
// existing Wikimedia provider as the side-effect-free web fallback.  Tests may
// replace only its HTTP transport; no request is made until process()/run().
export const defaultReferenceOrchestrator=(project,{fetchImpl,timeoutMs,localRoots}={})=>{
  const registry=new ReferenceRegistry(project);
  const localProvider=new ConfiguredLocalReferenceProvider(registry,{roots:localRoots||[]});
  const webOptions={project};
  if(fetchImpl)webOptions.fetchImpl=fetchImpl;
  if(timeoutMs)webOptions.timeoutMs=timeoutMs;
  const webProvider=new WikimediaCommonsReferenceProvider(webOptions);
  return new ReferenceOrchestrator(project,{registry,localProvider,webProvider});
};

// QualityOrchestrator already owns quality input semantics.  This adapter only
// projects READY, validated generated-asset results into that existing contract.
export const qualityAssetsFromAssetProcessing=assetProcessing=>(assetProcessing?.assets||[]).flatMap(item=>{
  const asset=item.result?.asset,validation=item.result?.validation,metrics=validation?.metrics;
  if(item.state!=='COMPLETE'||asset?.status!=='READY'||validation?.pass!==true)return[];
  const dimensions=item.target_dimensions||metrics?.dimensions||asset.dimensions||[1,1,1];
  return [{asset_id:asset.asset_id,geometry_version:asset.active_version,geometry_fingerprint:asset.generation_fingerprint||`${asset.asset_id}:${asset.active_version}`,expected_dimensions:dimensions,actual_dimensions:metrics?.dimensions||dimensions,vertex_count:metrics?.vertex_count||0,polygon_count:metrics?.polygon_count||0,lowest_z:0,center:metrics?.origin||[0,0,0]}];
});

// Final Blender composition consumes the already-validated normalized asset;
// it must never infer a replacement candidate from an incomplete job result.
export const blenderAssetsFromAssetProcessing=(project,assetProcessing)=>(assetProcessing?.assets||[]).flatMap(item=>{
  const asset=item.result?.asset,validation=item.result?.validation;
  if(item.state!=='COMPLETE'||asset?.status!=='READY'||validation?.pass!==true||!asset.model_path)return[];
  return [{asset_id:asset.asset_id,object_ids:(item.objects||[]).map(object=>object.object_id),active_version:asset.active_version,model_path:resolve(project,asset.model_path),target_dimensions:item.target_dimensions||validation.metrics?.dimensions||asset.dimensions||[1,1,1],validation,generation_fingerprint:asset.generation_fingerprint||null}];
});

export class MapProductionService {
  constructor(project,{assetOrchestrator,unityProvider=null,materialOrchestrator=null,referenceOrchestrator=null,referenceProviderOptions=null,qualityOrchestrator=null,blenderFinalizer=null,exportService=null,stageExecutors={}}={}){Object.assign(this,{project,assets:assetOrchestrator||defaultAssetOrchestrator(project),unity:unityProvider,materials:materialOrchestrator||new MaterialOrchestrator(project),references:referenceOrchestrator||defaultReferenceOrchestrator(project,referenceProviderOptions||{}),quality:qualityOrchestrator||new QualityOrchestrator(project),blenderFinalizer,exportService,stageExecutors,checkpoint:join(project,'production_checkpoint.json')});this.stageContract=new ProductionStageContract(this.checkpoint)}
  beginStage(stage,data={}){return this.stageContract.beginStage(stage,data)}
  completeStage(stage,data={}){return this.stageContract.completeStage(stage,data)}
  skipStage(stage,data={}){return this.stageContract.skipStage(stage,data)}
  async checkpointStage(stage,data={}){const old=existsSync(this.checkpoint)?await read(this.checkpoint):{job_id:randomUUID(),completed_stages:[],created_at:now()};const next={...old,current_stage:stage,completed_stages:[...new Set([...old.completed_stages,stage])],updated_at:now(),...data};await save(this.checkpoint,next);return next}
  async manifest(files){const artifacts=[];for(const[name,path]of Object.entries(files))if(path&&existsSync(path)){const b=await readFile(path),s=await stat(path);artifacts.push({name,path,size:s.size,sha256:createHash('sha256').update(b).digest('hex')})}const out=join(this.project,'production_artifacts.json');await save(out,{created_at:now(),artifacts});return out}
  async writeFreshStageContracts({input_fingerprint,referenceProcessing=null,referenceExecuted=false,assetProcessing=null,materialProcessing=null,qualityProcessing=null,qualityProfile='Prototype',qualityAssets=[],unityValidation=null,fbxPath=null}={}){const file=x=>existsSync(x)?[x]:[],structure=join(this.project,'structure','map_structure.json'),fbx=fbxPath||join(this.project,'blender','map.fbx'),unity=join(this.project,'unity','import_validation.json'),quality=join(this.project,'quality'),materials=join(this.project,'materials');const artifacts=async paths=>Promise.all(paths.flatMap(file).map(async path=>({path,size:(await stat(path)).size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));await this.completeStage('ANALYZING',{input_fingerprint,artifacts:[],metadata:{}});await this.completeStage('STRUCTURING',{input_fingerprint,artifacts:await artifacts([structure]),metadata:{}});if(referenceExecuted&&referenceProcessing?.status==='READY')await this.completeStage('REFERENCE_PROCESSING',{input_fingerprint,artifacts:await artifacts([referenceProcessing.plan_path,referenceProcessing.report_path]),metadata:{applicable:true}});else await this.skipStage('REFERENCE_PROCESSING',{input_fingerprint,metadata:{applicable:false}});await this.completeStage('ASSET_PROCESSING',{input_fingerprint,artifacts:[],metadata:{applicable:true,state:assetProcessing?.state||'READY'}});if(materialProcessing?.pass)await this.completeStage('MATERIAL_PROCESSING',{input_fingerprint,artifacts:await artifacts([join(materials,'material_plan.json'),join(materials,'material_report.json'),join(materials,'material_validation.json')]),metadata:{applicable:true}});else await this.skipStage('MATERIAL_PROCESSING',{input_fingerprint,metadata:{applicable:false}});if(qualityAssets.length&&qualityProcessing?.report?.pass!==false)await this.completeStage('QUALITY_PROCESSING',{input_fingerprint,artifacts:await artifacts([join(quality,'quality_plan.json'),join(quality,'quality_report.json')]),metadata:{quality_profile:qualityProfile,mask_renderer_version:'target-alpha-v1',image_metric_version:'mask-alpha-v1'}});else await this.skipStage('QUALITY_PROCESSING',{input_fingerprint,metadata:{applicable:false,quality_profile:qualityProfile}});await this.completeStage('BLENDER_FINALIZING',{input_fingerprint,artifacts:[],metadata:{}});await this.completeStage('VALIDATING',{input_fingerprint,artifacts:[],metadata:{}});await this.completeStage('EXPORTING',{input_fingerprint,artifacts:await artifacts([fbx]),metadata:{}});if(unityValidation)await this.completeStage('UNITY_VALIDATING',{input_fingerprint,artifacts:await artifacts([unity]),metadata:{}});else await this.skipStage('UNITY_VALIDATING',{input_fingerprint,metadata:{applicable:false}});}
  async buildResumePlan(contexts={}){const checkpoint=existsSync(this.checkpoint)?await read(this.checkpoint):{};return new ResumePlanner(new StageCheckpointValidator()).build({checkpoint,contexts})}
  createExecutionContext(input={}){return{...input,project:this.project,outputs:{},counters:{}}}
  async hydrateStage(stage,context){context.outputs[stage]=(await this.stageContract.load()).stages?.[stage]||null;return context.outputs[stage]}
  async executeStage(stage,context){const executor=this.stageExecutors[stage];if(!executor)throw Error(`No executor for ${stage}`);const result=await executor(context);context.counters[stage]=(context.counters[stage]||0)+1;return result}
  async executeResumePlan(plan,context){const executed_stages=[];for(const stage of plan.reused_stages)await this.hydrateStage(stage,context);for(const stage of plan.stages_to_run){await this.executeStage(stage,context);executed_stages.push(stage)}return{executed_stages,final_state:executed_stages.length?'PARTIAL':'READY'}}
  async resume(input,{contexts={},service_instance_recreated=true}={}){const plan=await this.buildResumePlan(contexts),context=this.createExecutionContext(input),result=await this.executeResumePlan(plan,context),audit={resume_requested:true,service_instance_recreated,validated_stages:plan.stages,reused_stages:plan.reused_stages,invalid_stages:plan.invalid_stages,planned_stages_to_run:plan.stages_to_run,executed_stages:result.executed_stages,counters:context.counters,final_state:result.final_state,created_at:now()};await save(join(this.project,'resume_validation.json'),audit);return{...result,resumed:!result.executed_stages.length,plan,context};}
  async run({map,productionInput=null,reviewApproved=true,referenceRequirements=[],qualityAssets=[],qualityProfile='Prototype'}={}){
    const semanticMap=map,{map:productionMap,referenceRequirements:boundReferenceRequirements}=applyProductionInput(map,productionInput,referenceRequirements);map=productionMap;referenceRequirements=boundReferenceRequirements;
    const start=Date.now(),fp=productionFingerprint({map,reviewApproved});await this.checkpointStage('ANALYZING',{input_fingerprint:fp});if(!reviewApproved){await this.checkpointStage('WAITING_USER');return{final_state:'WAITING_USER'}}
    await this.checkpointStage('STRUCTURING');const structure=validateMap(semanticMap);if(!structure.valid)throw Error(structure.errors.join(';'));
    let reference={status:'READY',plan:[],report:{requirements_total:0},map},referenceExecuted=false;const referenceMap=referenceRequirements.length?{...map,asset_requirements:(map.asset_requirements||[]).map(asset=>({...asset,reference_requirements:referenceRequirements.filter(x=>(x.asset_id&&x.asset_id===asset.asset_id)||(asset.reference_requirement_id&&x.reference_requirement_id===asset.reference_requirement_id))}))}:map;if((referenceMap.asset_requirements||[]).some(hasReferenceRequirement)){
      await this.checkpointStage('REFERENCE_PROCESSING',{started_at:now()});referenceExecuted=true;reference=await this.references.process(referenceMap);await this.checkpointStage('REFERENCE_PROCESSING',{completed:reference.status==='READY',reference_plan:reference.plan_path,reference_report:reference.report_path,approved_reference_ids:reference.report.items.flatMap(x=>x.approved_references||[]),reference_fingerprints:reference.plan.filter(x=>x.reference_fingerprint).map(x=>({asset_id:x.asset_id,fingerprint:x.reference_fingerprint}))});
      if(reference.status!=='READY')return{final_state:'WAITING_USER',reference_processing:reference};
    }
    map=reference.map;await this.checkpointStage('ASSET_PROCESSING');const assets=await this.assets.run(map);if(assets.state!=='READY')return{final_state:'PARTIAL',assets,reference_processing:reference};
    let material=null,req=(map.asset_requirements||[]).filter(x=>x.material_requirement);if(req.length){await this.checkpointStage('MATERIAL_PROCESSING',{started_at:now()});material=await this.materials.run(map,req);if(!material.pass){await this.checkpointStage('PARTIAL',{material_processing:material});return{final_state:'PARTIAL',assets,material,reference_processing:reference}}await this.checkpointStage('MATERIAL_PROCESSING',{completed:true,material_plan:join(this.project,'materials','material_plan.json'),material_report:join(this.project,'materials','material_report.json'),material})}
    const qualityInputSource=qualityAssets.length?'MANUAL':'ASSET_PROCESSING';qualityAssets=qualityAssets.length?qualityAssets:qualityAssetsFromAssetProcessing(assets);
    let quality=null;if(qualityAssets.length){await this.checkpointStage('QUALITY_PROCESSING',{started_at:now(),quality_profile:qualityProfile});quality=await this.quality.run(map,{profile:qualityProfile,assets:qualityAssets});if(!quality.report.pass){await this.checkpointStage('WAITING_USER',{quality_processing:quality.report});return{final_state:'WAITING_USER',quality_processing:quality.report}}await this.checkpointStage('QUALITY_PROCESSING',{completed:true,quality_processing:quality.report})}
    const generatedAssets=blenderAssetsFromAssetProcessing(this.project,assets),realDownstream=!this.blenderFinalizer&&generatedAssets.length>0,blenderFinalizer=this.blenderFinalizer||(realDownstream?new RealBlenderFinalizer():null);await this.checkpointStage('BLENDER_FINALIZING',{material_processing:material});
    const finalized=blenderFinalizer
      ?await blenderFinalizer.run({project:this.project,map,material,assetProcessing:assets,generatedAssets})
      :{scene_measurement:await read(join(this.project,'blender','scene_measurement.json'))};
    const sceneMeasurement=finalized?.scene_measurement??finalized?.sceneMeasurement??finalized;
    const blender=validateBlenderScene(map,sceneMeasurement);if(!blender.pass)throw Error('Final Blender validation failed');
    await this.checkpointStage('VALIDATING',{blender_validation:blender});
    const exportService=this.exportService||(realDownstream?new RealFbxExportService():null),exported=exportService
      ?await exportService.run({project:this.project,map,blender_validation:blender,finalization:finalized})
      :{fbx_path:join(this.project,'blender','map.fbx')};
    const fbx=exported?.fbx_path??exported?.path??join(this.project,'blender','map.fbx');
    if(!existsSync(fbx))throw Error('Final FBX missing');await this.checkpointStage('EXPORTING',{final_fbx:fbx});let unity=null,unityProvider=this.unity||(realDownstream?new RealUnityProvider():null);if(unityProvider){await this.checkpointStage('UNITY_VALIDATING');unity=await unityProvider.exportAndValidate(this.project,map);if(!unity.pass)throw Error('Unity validation failed')}
    const report={job_id:(await read(this.checkpoint)).job_id,input_fingerprint:fp,map_id:map.project?.id||null,reference_processing:reference.report,asset_summary:assets,material_processing:material,quality_processing:quality?.report||null,quality_input_source:quality?qualityInputSource:'NONE',geometry_regenerated:false,reference_geometry_invalidated:reference.geometry_invalidated,reference_material_invalidated:reference.material_invalidated,blender_validation:blender,export_result:{path:fbx},unity_validation:unity,duration:Date.now()-start,final_state:'READY'};const rp=join(this.project,'map_production_report.json');await save(rp,report);
    const manifest=await this.manifest({map_structure:join(this.project,'structure','map_structure.json'),reference_plan:reference.plan_path,reference_report:reference.report_path,quality_plan:quality?join(this.project,'quality','quality_plan.json'):null,quality_report:quality?join(this.project,'quality','quality_report.json'):null,material_plan:join(this.project,'materials','material_plan.json'),material_report:join(this.project,'materials','material_report.json'),material_validation:join(this.project,'materials','material_validation.json'),materialized_blend:join(this.project,'blender','materialized.blend'),scene_measurement:join(this.project,'blender','scene_measurement.json'),fbx,unity_import_validation:join(this.project,'unity','import_validation.json'),production_report:rp});await this.writeFreshStageContracts({input_fingerprint:fp,referenceProcessing:reference,referenceExecuted,assetProcessing:assets,materialProcessing:material,qualityProcessing:quality,qualityProfile,qualityAssets,unityValidation:unity,fbxPath:fbx});await this.checkpointStage('READY',{report:rp,manifest});return report;
  }
}