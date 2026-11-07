import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCard} from '../src/lib.js';
import {chooseRecognition,readCard} from '../src/card-reader.js';
import {capturePayload,saveCapturedContact} from '../src/capture-service.js';

test('card parsing prefers a person to company and role headings, preserving Unicode',()=>{
 const result=parseCard('ACORN STUDIO\nDesign Director\nMaya Chen\nmaya.chen @ example . com\n+1 415 555 0148');
 assert.equal(result.first_name,'Maya');assert.equal(result.last_name,'Chen');assert.equal(result.job_title,'Design Director');assert.equal(result.email,'maya.chen@example.com');
 assert.equal(parseCard('Zoë Martínez\nzoe@example.com').last_name,'Martínez');
 assert.equal(parseCard('ACORN STUDIO\nDesign Director\nwww.example.com').first_name,'');
});
test('two OCR layouts are compared instead of overwriting a useful reading with empty text',async()=>{
 const options=[];const results=[{text:'Maya Chen\nmaya@example.com',confidence:82},{text:'',confidence:0}];
 const worker={async setParameters(p){options.push(p)},async recognize(){return {data:results.shift()}}};
 const result=await readCard(worker,'original','enhanced');
 assert.match(result.text,/maya@example.com/);assert.equal(options[0].tessedit_pageseg_mode,'11');assert.equal(options[1].tessedit_pageseg_mode,'3');
 assert.equal(chooseRecognition([{text:'',confidence:0}]).text,'');
});
test('capture RPC gets only schema-supported fields, never workflow or UI controls',()=>{
 const payload=capturePayload('org',{first_name:' Maya ',email:'',category:'B',event_id:'event',start_workflow:'true',company_id:'not-an-rpc-parameter'});
 assert.equal(payload.p_first_name,'Maya');assert.equal(payload.p_email,null);assert.equal(payload.p_event_id,'event');assert.equal(payload.p_start_workflow,undefined);assert.equal(payload.p_company_id,undefined);
});
test('a photo upload failure preserves the saved contact ID and reports partial success',async()=>{
 let calls=0;const db={async rpc(){calls++;return {data:'saved-contact',error:null}},storage:{from(){return {async upload(){throw Error('offline')}}}}};
 const result=await saveCapturedContact(db,'org',{first_name:'Maya',category:'B'},{type:'image/jpeg'});
 assert.equal(result.id,'saved-contact');assert.match(result.warning,/Contact saved/);assert.equal(calls,1);
});
test('a failed capture never uploads an orphaned card',async()=>{
 const db={async rpc(){return {data:null,error:Error('No access')}},storage:{from(){throw Error('must not upload')}}};
 await assert.rejects(()=>saveCapturedContact(db,'org',{first_name:'Maya'},{}),/No access/);
});
