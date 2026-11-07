import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {seedSchema} from './schema-fixture.mjs';
test('database migrations, tenant RLS, idempotent import and ordered jobs',async()=>{
const db=new PGlite();await seedSchema(db);
const org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
await db.exec(`insert into organizations(id,name) values ('${org}','Import validation'),('${other}','Other tenant');insert into organization_members values('${org}','33333333-3333-4333-8333-333333333333','owner'),('${other}','44444444-4444-4444-8444-444444444444','owner'),('${org}','55555555-5555-4555-8555-555555555555','viewer');`);
for(const file of ['202611070001_workflow_execution.sql','202611070002_spreadsheet_fields.sql']) await db.exec(await fs.readFile(new URL('../supabase/migrations/',import.meta.url).pathname+file,'utf8'));
const privateFile=new URL('../private-imports/ClientOverviewV2-import.sql',import.meta.url);
const hasWorkbook=existsSync(privateFile);
const sql=hasWorkbook?(await fs.readFile(privateFile,'utf8')).replace('REPLACE_WITH_WORKSPACE_UUID',org):`insert into contacts(organization_id,first_name,category) values('${org}','Test lead','A');`; 
await db.exec(sql);
const counts=async()=> (await db.query('select (select count(*) from import_records)::integer as source_rows,(select count(*) from companies)::integer as companies,(select count(*) from contacts)::integer as contacts,(select count(*) from activities)::integer as activities,(select count(*) from workflow_jobs)::integer as jobs')).rows[0];
const first=await counts();if(hasWorkbook){assert.equal(first.source_rows,352);assert.equal(first.jobs,0);await db.exec(sql);assert.deepEqual(await counts(),first);}
assert.equal((await db.query(`select count(*)::integer as n from contacts where organization_id='${other}'`)).rows[0].n,0);
await db.exec(`set role authenticated;set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';`);assert.equal((await db.query('select count(*)::integer as n from import_records')).rows[0].n,0);assert.equal((await db.query('select count(*)::integer as n from contacts')).rows[0].n,0);await db.exec('reset role');
await db.exec(`set role authenticated;set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';`);let rejected=false;try{await db.exec(`insert into contacts(organization_id,first_name) values('${org}','Viewer must fail')`)}catch{rejected=true}assert.equal(rejected,true);await db.exec('reset role');
const c=(await db.query(`select id from contacts where organization_id='${org}' and category='A' limit 1`)).rows[0].id;
const w=(await db.query(`insert into workflows(organization_id,name,category_code,enabled) values('${org}','Test workflow','A',true) returning id`)).rows[0].id;
await db.exec(`insert into workflow_steps(organization_id,workflow_id,step_order,kind,delay_days) values('${org}','${w}',1,'wait',0),('${org}','${w}',2,'task',0)`);
const args=`'${org}','${c}','33333333-3333-4333-8333-333333333333',false`;
const enrolled=(await db.query(`select manage_enrollment(${args}) as id`)).rows[0].id;
assert.equal((await db.query(`select manage_enrollment(${args}) as id`)).rows[0].id,enrolled);
assert.equal((await db.query('select * from claim_workflow_jobs()')).rows.length,1);
assert.equal((await db.query('select * from claim_workflow_jobs()')).rows.length,0);
await db.exec(`update workflow_jobs set status='done' where enrollment_id='${enrolled}' and status='processing'`);
assert.equal((await db.query('select * from claim_workflow_jobs()')).rows.length,1);
let stepProtected=false;try{await db.exec(`update workflow_steps set kind='wait' where workflow_id='${w}'`)}catch{stepProtected=true}assert.equal(stepProtected,true);
await db.query(`select manage_enrollment('${org}','${c}','33333333-3333-4333-8333-333333333333',true)`);
assert.equal((await db.query(`select status from workflow_enrollments where id='${enrolled}'`)).rows[0].status,'stopped');
console.log('PASS: enrollment idempotency, ordered job claiming, active-step protection, stop enrollment.');
console.log(hasWorkbook?'PASS: private workbook import is idempotent; all 352 source rows retained.':'PASS: synthetic database fixture; private workbook not present.',first);await db.close();

});
