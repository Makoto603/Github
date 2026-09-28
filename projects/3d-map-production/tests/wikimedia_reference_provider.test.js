import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikimediaCommonsReferenceProvider } from '../assets/wikimedia-reference-provider.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+ZyXSUwAAAABJRU5ErkJggg==','base64');
const imageInfo={query:{pages:{'1':{pageid:1,title:'File:Building.jpg',imageinfo:[{url:'https://upload.wikimedia.org/original.jpg',thumburl:'https://upload.wikimedia.org/thumb.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Building.jpg',width:1600,height:1200,mime:'image/jpeg',extmetadata:{LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'},Artist:{value:'<b>Example Author</b>'}}}]}}}};
const apiSearch={query:{search:[{title:'File:Building.jpg'}]}};
const response=(body,{status=200,headers={}}={})=>new Response(body,{status,headers});
const provider=async fetchImpl=>new WikimediaCommonsReferenceProvider({project:await mkdtemp(join(tmpdir(),'wikimedia-provider-')),fetchImpl,timeoutMs:20});

test('A/B: search converts Wikimedia API metadata into safe image candidates',async()=>{const options=[],urls=[];const p=await provider(async(url,init)=>{urls.push(String(url));options.push(init);return response(JSON.stringify(new URL(url).searchParams.get('list')==='search'?apiSearch:imageInfo),{headers:{'content-type':'application/json'}})});const results=await p.search({category:'building',purpose:'GEOMETRY',search_terms:['building','architecture','exterior']});assert.equal(results.length,1);assert.equal(results[0].source_uri,'https://commons.wikimedia.org/wiki/File:Building.jpg');assert.equal(results[0].download_url,'https://upload.wikimedia.org/thumb.jpg');assert.equal(results[0].license,'CC BY 4.0');assert.equal(results[0].author,'Example Author');assert.deepEqual(results[0].quality.resolution,[1600,1200]);assert.equal(options[0].headers['User-Agent'],'MAP-Production-Studio/0.1 (Wikimedia reference acquisition)');assert.equal(new URL(urls[0]).searchParams.get('srsearch'),'building architecture exterior');assert.equal(new URL(urls[0]).searchParams.get('srsearch').includes('GEOMETRY'),false)});
test('C: downloads a permitted image into web staging',async()=>{const p=await provider(async()=>response(png,{headers:{'content-type':'image/png','content-length':String(png.length)}}));const fetched=await p.fetch({candidate_id:'one',download_url:'https://upload.wikimedia.org/building.png',source_uri:'https://commons.wikimedia.org/wiki/File:Building.png'});assert.ok(existsSync(fetched.local_path));assert.equal(fetched.mime_type,'image/png');assert.equal((await p.normalize(fetched)).source_type,'WEB');const protocolRelative=await p.fetch({candidate_id:'two',download_url:'//upload.wikimedia.org/building.png'});assert.ok(existsSync(protocolRelative.local_path))});
test('D/E: rejects unsupported MIME and HTTP errors',async()=>{const bad=await provider(async()=>response('svg',{headers:{'content-type':'image/svg+xml'}}));await assert.rejects(bad.fetch({download_url:'https://upload.wikimedia.org/building.svg'}),/UNSUPPORTED_MIME/);const http=await provider(async()=>response('no',{status:404}));await assert.rejects(http.search({}),/WIKIMEDIA_HTTP_404/)});
test('F/G/H: rejects timeout, oversized bodies, and non-Wikimedia hosts',async()=>{
  const abortingFetch=async(_url,{signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})))});
  const timeout=await provider(abortingFetch);
  await assert.rejects(timeout.search({}),/WIKIMEDIA_TIMEOUT/);
  const large=await provider(async()=>response(png,{headers:{'content-type':'image/png','content-length':String(16*1024*1024)}}));
  await assert.rejects(large.fetch({download_url:'https://upload.wikimedia.org/building.png'}),/RESPONSE_TOO_LARGE/);
  const safe=await provider(async()=>response(png));
  await assert.rejects(safe.fetch({download_url:'https://example.invalid/building.png'}),/UNSAFE_URL/);
});