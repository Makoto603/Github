import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const now=()=>new Date().toISOString();
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2));
const imageExtensions=new Set(['.png','.jpg','.jpeg','.webp']);
export const REFERENCE_TYPES=['GEOMETRY','MATERIAL','TEXTURE','GENERAL'];
export const REFERENCE_SOURCE_TYPES=['LOCAL','CACHE','WEB','GENERATED'];
export const REFERENCE_STATUS=['CANDIDATE','APPROVED','REJECTED','UNAVAILABLE','INVALID'];

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const imageInfo=bytes=>{
  if(bytes.length<12)return null;
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mime_type:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),alpha:true};
  if(bytes.subarray(0,3).equals(Buffer.from([255,216,255]))){for(let i=2;i+9<bytes.length;){if(bytes[i]!==255){i++;continue}const marker=bytes[i+1],len=bytes.readUInt16BE(i+2);if(marker>=192&&marker<=195)return {mime_type:'image/jpeg',width:bytes.readUInt16BE(i+7),height:bytes.readUInt16BE(i+5),alpha:false};i+=2+len}return null}
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return {mime_type:'image/webp',width:null,height:null,alpha:null};
  return null;
};
export const referenceFingerprint=references=>createHash('sha256').update(JSON.stringify([...references].map(x=>({hash:x.content_hash,purpose:x.purpose||x.reference_type,status:x.status,provenance:x.provenance})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex');
export const qualityFor=(info,bytes)=>({valid:!!info,resolution:info?.width&&info?.height?[info.width,info.height]:null,aspect_ratio:info?.width&&info?.height?Number((info.width/info.height).toFixed(6)):null,blur_estimate:null,contrast:null,foreground_coverage:null,file_size:bytes.length});

export class ReferenceRegistry {
  constructor(project){this.project=resolve(project);this.root=join(this.project,'references');this.file=join(this.root,'registry.json');this.setFile=join(this.root,'reference_sets.json');}
  async init(){await mkdir(join(this.root,'cache'),{recursive:true});if(!existsSync(this.file))await save(this.file,{version:'2F',references:[],updated_at:now()});if(!existsSync(this.setFile))await save(this.setFile,{reference_sets:[],updated_at:now()});return this}
  async data(){await this.init();return read(this.file)}
  async list(){return (await this.data()).references}
  async get(id){return (await this.list()).find(x=>x.reference_id===id)||null}
  async byHash(hash){return (await this.list()).find(x=>x.content_hash===hash)||null}
  async upsert(item){const d=await this.data(),i=d.references.findIndex(x=>x.reference_id===item.reference_id),next={...item,updated_at:now()};if(i<0)d.references.push(next);else d.references[i]=next;d.updated_at=now();await save(this.file,d);return next}
  async ingest(file,{reference_type='GENERAL',source_type='LOCAL',source_uri=null,title=null,description=null,source_domain=null,author=null,license=null,license_url=null,provenance='CONFIRMED',status='CANDIDATE',category=null,purpose=null,relevance=null}={}){
    await this.init(); const ext=extname(file).toLowerCase(); if(!imageExtensions.has(ext)||!existsSync(file))throw Error('INVALID_REFERENCE');
    const bytes=await readFile(file),info=imageInfo(bytes); if(!info||!bytes.length)throw Error('INVALID_REFERENCE'); const content_hash=sha256(bytes),existing=await this.byHash(content_hash);
    if(existing)return {...existing,deduplicated:true};
    const dir=join(this.root,'cache',content_hash);await mkdir(dir,{recursive:true});const original=join(dir,'original'+ext);if(!existsSync(original))await copyFile(file,original);
    const reference={reference_id:randomUUID(),reference_type,source_type,source_uri:source_uri||file,local_path:original,content_hash,mime_type:info.mime_type,width:info.width,height:info.height,file_size:bytes.length,title:title||basename(file),description,source_domain,author,license,license_url,retrieved_at:now(),provenance,status,category,purpose,quality:qualityFor(info,bytes),relevance:relevance||null};
    await save(join(dir,'metadata.json'),reference); return this.upsert(reference);
  }
  async review(id,{action='APPROVE',purpose=null,reviewed_by='human-review',reason=null}={}){const old=await this.get(id);if(!old)throw Error('Reference not found');const type=action==='APPROVE_AS_GEOMETRY'?'GEOMETRY':action==='APPROVE_AS_MATERIAL'?'MATERIAL':action==='APPROVE_AS_TEXTURE'?'TEXTURE':old.reference_type;const status=action==='REJECT'?'REJECTED':'APPROVED';return this.upsert({...old,reference_type:type,purpose:purpose||type,status,review:{action,reviewed_by,reason,at:now()},provenance:status==='APPROVED'?'CONFIRMED':old.provenance})}
  async createSet(asset_id,references,{coverage=[]}={}){const approved=references.filter(x=>x.status==='APPROVED');if(approved.length!==references.length)throw Error('Reference set requires approved references');const d=await read(this.setFile),fingerprint=referenceFingerprint(approved),old=d.reference_sets.find(x=>x.asset_id===asset_id&&x.fingerprint===fingerprint&&x.status==='APPROVED');if(old)return old;const set={reference_set_id:randomUUID(),asset_id,references:approved.map(x=>({reference_id:x.reference_id,purpose:x.purpose||x.reference_type,content_hash:x.content_hash})),coverage,status:'APPROVED',fingerprint,created_at:now()};d.reference_sets.push(set);await save(this.setFile,d);return set}
  async sets(asset_id){const d=await read(this.setFile);return d.reference_sets.filter(x=>x.asset_id===asset_id)}
}

export class ConfiguredLocalReferenceProvider {
  constructor(registry,{roots=[]}={}){this.registry=registry;this.roots=roots.map(path=>resolve(path));this.searches=0;}
  async files(root){const out=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())out.push(...await this.files(path));else if(imageExtensions.has(extname(path).toLowerCase()))out.push(path)}return out}
  async search(requirement={}){this.searches++;const terms=[requirement.category,requirement.purpose,...(requirement.search_terms||[])].filter(Boolean).map(x=>String(x).toLowerCase());const all=await this.registry.list(),registered=all.filter(x=>x.status==='APPROVED'&&(!requirement.category||!x.category||x.category===requirement.category));const candidates=[...registered.map(x=>({...x,source:'registry',action:'REUSE'}))];for(const root of this.roots){if(!existsSync(root))continue;for(const path of await this.files(root)){const key=basename(path).toLowerCase();if(!terms.length||terms.some(t=>key.includes(t))){const bytes=await readFile(path),info=imageInfo(bytes);if(info)candidates.push({candidate_id:sha256(bytes),local_path:path,source:'local',reference_type:requirement.purpose||'GENERAL',category:requirement.category,quality:qualityFor(info,bytes),title:basename(path),provenance:'GENERATED',status:'CANDIDATE'})}}}
    return candidates;
  }
  async fetch(candidate){return candidate}
  async normalize(candidate){return candidate}
  async store(candidate){return this.registry.ingest(candidate.local_path,{reference_type:candidate.reference_type||'GENERAL',source_type:'LOCAL',title:candidate.title,category:candidate.category,purpose:candidate.purpose,provenance:candidate.provenance||'GENERATED',status:candidate.status||'CANDIDATE'})}
}

export class FakeWebReferenceProvider {
  constructor({available=true}={}){this.available=available;this.searches=0;}
  async search(requirement){this.searches++;if(!this.available)return [];return [{candidate_id:'fake-valid',source_uri:'https://example.invalid/reference.png',source_domain:'example.invalid',title:`${requirement.category||'asset'} reference`,license:null,license_unknown:true,reference_type:requirement.purpose||'GENERAL',provenance:'GENERATED',status:'CANDIDATE'},{candidate_id:'fake-invalid',source_uri:'https://example.invalid/bad.bin',source_domain:'example.invalid',title:'invalid',license:null,license_unknown:true,status:'INVALID'}]}
  async fetch(){throw Error('Web fetch is disabled for deterministic provider')}
  async normalize(candidate){return candidate}
}

const requirementsFor=map=>(map.asset_requirements||[]).flatMap(asset=>{const raw=asset.reference_requirements||asset.reference_requirement||[];return (Array.isArray(raw)?raw:[raw]).filter(Boolean).map(r=>({asset_id:asset.asset_id,reference_requirement_id:r.reference_requirement_id||null,mode:r.mode||'USER_REVIEW',category:r.category||asset.category,purpose:r.purpose||'GEOMETRY',search_terms:r.search_terms||[],desired_views:r.desired_views||[],minimum_resolution:r.minimum_resolution||null,preferred_aspect:r.preferred_aspect||null,reference_count:r.reference_count||1,required:r.required!==false,explicit_reference:asset.reference_image||null,material_requirement:asset.material_requirement||null}))});

export class ReferenceOrchestrator {
  constructor(project,{registry=new ReferenceRegistry(project),localProvider=null,webProvider=null}={}){this.project=resolve(project);this.registry=registry;this.local=localProvider||new ConfiguredLocalReferenceProvider(registry);this.web=webProvider;this.checkpoint=join(this.project,'reference_checkpoint.json');}
  async process(map){await this.registry.init();const previous=existsSync(this.checkpoint)?await read(this.checkpoint):null;const start=Date.now(),requirements=requirementsFor(map),plan=[],approved=[],errors=[],warnings=[];for(const requirement of requirements){let selected=[];
      if(requirement.explicit_reference&&existsSync(requirement.explicit_reference)){const r=await this.registry.ingest(requirement.explicit_reference,{reference_type:requirement.purpose,source_type:'LOCAL',category:requirement.category,purpose:requirement.purpose,provenance:'CONFIRMED',status:'APPROVED'});selected=[{...r,purpose:requirement.purpose}];}
      else {
        const existing=(await this.registry.sets(requirement.asset_id)).filter(x=>x.status==='APPROVED'&&x.references.some(r=>r.purpose===requirement.purpose)).at(-1);
        if(existing) selected=(await Promise.all(existing.references.map(x=>this.registry.get(x.reference_id)))).map(x=>({...x,purpose:requirement.purpose}));
        else {
          const local=await this.local.search(requirement);
          const valid=local.filter(x=>x.status!=='INVALID'&&(!requirement.minimum_resolution||!x.quality?.resolution||(x.quality.resolution[0]>=requirement.minimum_resolution[0]&&x.quality.resolution[1]>=requirement.minimum_resolution[1])));
          const approve=async(candidate,reviewed_by)=>{const stored=await this.registry.ingest(candidate.local_path,{reference_type:candidate.reference_type||requirement.purpose,source_type:candidate.source_type||'LOCAL',source_uri:candidate.source_uri||candidate.local_path,source_domain:candidate.source_domain||null,title:candidate.title,description:candidate.description||null,author:candidate.author||null,license:candidate.license||null,license_url:candidate.license_url||null,category:requirement.category,purpose:requirement.purpose,provenance:candidate.provenance||'GENERATED',status:'CANDIDATE'});const approved=stored.status==='APPROVED'?stored:await this.registry.review(stored.reference_id,{action:requirement.purpose==='MATERIAL'?'APPROVE_AS_MATERIAL':requirement.purpose==='TEXTURE'?'APPROVE_AS_TEXTURE':'APPROVE_AS_GEOMETRY',reviewed_by});return{...approved,purpose:requirement.purpose}};
          const count=Math.max(1,Number(requirement.reference_count)||1);
          let webCandidates=[];
          if(requirement.mode==='AUTO_ACQUIRE'&&valid.length) selected=await Promise.all(valid.filter(x=>x.local_path).slice(0,count).map(candidate=>approve({...candidate,source_type:'LOCAL'},'auto-acquire')));
          else if(requirement.mode==='AUTO_ACQUIRE'&&!valid.length&&this.web){
            try{webCandidates=await this.web.search(requirement)}catch(error){errors.push(`Web search failed for ${requirement.asset_id}: ${error.message}`)}
            for(const candidate of webCandidates.filter(x=>x.status!=='INVALID')){try{const fetched=await this.web.fetch(candidate),normalized=await this.web.normalize(fetched);if(!normalized?.local_path)throw Error('WEB_REFERENCE_OUTPUT_MISSING');const stored=await approve({...candidate,...normalized,source_type:'WEB'},'auto-acquire-web');const resolution=stored.quality?.resolution;if(requirement.minimum_resolution&&(!resolution||resolution[0]<requirement.minimum_resolution[0]||resolution[1]<requirement.minimum_resolution[1])){await this.registry.review(stored.reference_id,{action:'REJECT',reviewed_by:'auto-acquire-web',reason:'minimum_resolution'});warnings.push(`Web candidate below minimum resolution: ${requirement.asset_id}`);continue}selected.push(stored);if(selected.length>=count)break}catch(error){errors.push(`Web candidate rejected for ${requirement.asset_id}: ${error.message}`)}}
            if(!selected.length){plan.push({asset_id:requirement.asset_id,requirement,local_candidates:[],web_candidates:webCandidates,approved_references:[],action:requirement.required?'WAITING_USER':'SKIP',status:'UNAVAILABLE'});continue;}
          }
          else {
            for(const candidate of valid.filter(x=>x.local_path))await this.local.store(candidate);
            const candidates=await this.local.search(requirement);
            if(!valid.length&&this.web)try{webCandidates=await this.web.search(requirement)}catch(error){errors.push(`Web search failed for ${requirement.asset_id}: ${error.message}`)}
            plan.push({asset_id:requirement.asset_id,requirement,local_candidates:candidates,web_candidates:webCandidates,approved_references:[],action:valid.length?'WAITING_USER':requirement.required?'WAITING_USER':'SKIP',status:valid.length?'CANDIDATE':'UNAVAILABLE'});
            if(webCandidates.length)warnings.push(`Web candidates require review: ${requirement.asset_id}`);
            continue;
          }
        }
      }
      const set=await this.registry.createSet(requirement.asset_id,selected,{coverage:requirement.desired_views});approved.push(...selected);plan.push({asset_id:requirement.asset_id,requirement,local_candidates:selected.filter(x=>x.source_type!=='WEB'),web_candidates:selected.filter(x=>x.source_type==='WEB'),approved_references:selected.map(x=>x.reference_id),reference_set_id:set.reference_set_id,reference_fingerprint:set.fingerprint,action:'APPROVED',status:'APPROVED'});
  }
    const fingerprints=plan.filter(x=>x.reference_fingerprint).map(x=>({asset_id:x.asset_id,fingerprint:x.reference_fingerprint,purpose:x.requirement.purpose}));const old=new Map((previous?.reference_fingerprints||[]).map(x=>[`${x.asset_id}:${x.purpose||'GEOMETRY'}`,x.fingerprint]));const geometry_invalidated=fingerprints.some(x=>x.purpose==='GEOMETRY'&&old.get(`${x.asset_id}:${x.purpose}`)&&old.get(`${x.asset_id}:${x.purpose}`)!==x.fingerprint),material_invalidated=fingerprints.some(x=>(x.purpose==='MATERIAL'||x.purpose==='TEXTURE')&&old.get(`${x.asset_id}:${x.purpose}`)&&old.get(`${x.asset_id}:${x.purpose}`)!==x.fingerprint);const status=plan.some(x=>x.status==='CANDIDATE'||(x.status==='UNAVAILABLE'&&x.requirement.required))?'WAITING_USER':'READY';const report={requirements_total:requirements.length,local_hits:plan.reduce((n,x)=>n+x.local_candidates.length,0),web_hits:plan.reduce((n,x)=>n+x.web_candidates.length,0),approved:approved.length,rejected:(await this.registry.list()).filter(x=>x.status==='REJECTED').length,downloaded:approved.length,deduplicated:approved.filter(x=>x.deduplicated).length,license_unknown:approved.filter(x=>!x.license).length,errors,warnings,duration:Date.now()-start,items:plan,status,geometry_invalidated,material_invalidated};await mkdir(join(this.project,'references'),{recursive:true});const planPath=join(this.project,'references','reference_plan.json'),reportPath=join(this.project,'references','reference_report.json');await save(planPath,{created_at:now(),items:plan});await save(reportPath,report);await save(this.checkpoint,{status,requirements,reference_plan:planPath,reference_report:reportPath,approved_reference_ids:approved.map(x=>x.reference_id),reference_fingerprints:fingerprints,local_searches:this.local.searches,web_searches:this.web?.searches||0,updated_at:now()});
    const bound=structuredClone(map);for(const item of plan.filter(x=>x.status==='APPROVED')){const asset=bound.asset_requirements?.find(x=>x.asset_id===item.asset_id);if(asset){const first=await this.registry.get(item.approved_references[0]);if(item.requirement.purpose==='GEOMETRY'||item.requirement.purpose==='GENERAL'){asset.reference_image=first.local_path;asset.reference_set=item.approved_references;asset.reference_fingerprint=item.reference_fingerprint}else{asset.material_requirement={...(asset.material_requirement||{}),texture_reference:first.local_path,reference_set:item.approved_references,reference_fingerprint:item.reference_fingerprint}}}}
    return {status,plan,report,plan_path:planPath,report_path:reportPath,map:bound,geometry_invalidated,material_invalidated};
  }
}