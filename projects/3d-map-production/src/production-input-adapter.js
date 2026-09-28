const clone=x=>structuredClone(x), finite=x=>Array.isArray(x)&&x.length===3&&x.every(Number.isFinite);
export class ProductionInputAdapter {
  build({mapStructure,bindingReview=null,assetRequirements=[],referenceRequirements=[],projectConfig={}}={}){
    const map=clone(mapStructure), assets=clone(assetRequirements), refs=clone(referenceRequirements), all=[...(map.objects||[]).map(x=>({...x,semantic_type:x.type})),...(map.buildings||[]).map(x=>({...x,semantic_type:'building'})),...(map.roads||[]).map(x=>({...x,semantic_type:'road'})),...(map.zones||[]).map(x=>({...x,semantic_type:'zone'}))], byId=new Map(all.map(x=>[x.id,x])), bound=new Set(), ids=new Set(), generated=[];
    for(const a of assets){if(a.status!=='APPROVED'&&a.review_status!=='APPROVED')continue;if(a.generation_mode!=='generated_asset')continue;if(ids.has(a.asset_id))throw Error(`duplicate asset_id: ${a.asset_id}`);ids.add(a.asset_id);if(!finite(a.target_dimensions))throw Error(`invalid target_dimensions: ${a.asset_id}`);if(!a.provider_preferences?.length)throw Error(`provider_preferences required: ${a.asset_id}`);for(const id of a.object_ids||[]){if(!byId.has(id))throw Error(`unknown object_id: ${id}`);if(bound.has(id))throw Error(`duplicate object binding: ${id}`);bound.add(id)}const ref=a.reference_requirement_id&&refs.find(x=>(x.reference_requirement_id||x.asset_id)===a.reference_requirement_id);if(a.reference_requirement_id&&!ref)throw Error(`missing reference requirement: ${a.reference_requirement_id}`);generated.push({...a,semantic_objects:a.object_ids.map(id=>byId.get(id)),reference_requirement:ref||null});}
    const decisions=bindingReview?.decisions||bindingReview?.entries||null, modes=new Map();
    if(decisions)for(const decision of decisions){const mode=String(decision.production_mode||decision.suggested_mode||'').toUpperCase();if(!byId.has(decision.object_id))throw Error(`unknown decision object_id: ${decision.object_id}`);if(!['PROCEDURAL','GENERATED_ASSET','EXISTING_ASSET','IGNORE'].includes(mode))throw Error(`undecided production_mode: ${decision.object_id}`);modes.set(decision.object_id,mode)}
    if(decisions)for(const object of all)if(!modes.has(object.id))throw Error(`undecided production_mode: ${object.id}`);
    const procedural=decisions?all.filter(x=>modes.get(x.id)==='PROCEDURAL'):all.filter(x=>!bound.has(x.id));
    const ignored=decisions?all.filter(x=>modes.get(x.id)==='IGNORE'):[];
    const existing=decisions?all.filter(x=>modes.get(x.id)==='EXISTING_ASSET'):[];
    if(existing.length)throw Error(`EXISTING_ASSET unsupported: ${existing[0].id}`);
    return {map_structure:map,project_config:clone(projectConfig),generated_assets:generated,procedural_objects:procedural,ignored_objects:ignored,existing_assets:existing,reference_requirements:refs};
  }
}