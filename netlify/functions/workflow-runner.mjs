import{admin,data}from'../lib/shared.mjs';
import{sendWorkflowEmail}from'../lib/workflow-email.mjs';
export async function handler(){
 const db=admin();const jobs=await data(db.rpc('claim_workflow_jobs'));
 for(const job of jobs){try{
 const enrollment=await data(db.from('workflow_enrollments').select('*').eq('id',job.enrollment_id).eq('organization_id',job.organization_id).single());
 const workflow=await data(db.from('workflows').select('*').eq('id',enrollment.workflow_id).eq('organization_id',job.organization_id).single());
 if(enrollment.status!=='active'||!workflow.enabled){await data(db.from('workflow_enrollments').update({status:'stopped'}).eq('id',enrollment.id));await data(db.from('workflow_jobs').update({status:'cancelled'}).eq('enrollment_id',enrollment.id).in('status',['pending','processing']));continue}
 const step=await data(db.from('workflow_steps').select('*').eq('id',job.step_id).eq('organization_id',job.organization_id).single());
 const contact=await data(db.from('contacts').select('*').eq('id',enrollment.contact_id).eq('organization_id',job.organization_id).single());
 if(step.kind==='task')await data(db.from('tasks').insert({organization_id:job.organization_id,contact_id:contact.id,title:`Follow up with ${contact.first_name}`,due_at:new Date().toISOString()}));
 if(step.kind==='email')await sendWorkflowEmail(db,{job,enrollment,workflow,contact,step});
 await data(db.from('activities').insert({organization_id:job.organization_id,contact_id:contact.id,kind:'workflow_'+step.kind,description:`${workflow.name}: ${step.kind} completed`}));
 await data(db.from('workflow_jobs').update({status:'done'}).eq('id',job.id));
 const remaining=await data(db.from('workflow_jobs').select('id').eq('enrollment_id',enrollment.id).in('status',['pending','processing','failed']));
 if(!remaining.length)await data(db.from('workflow_enrollments').update({status:'completed'}).eq('id',enrollment.id));
 }catch(e){console.error('Workflow job failed',job.id,e.message);await data(db.from('workflow_jobs').update({status:'failed',error_details:e.message}).eq('id',job.id));}}
 return {statusCode:200,body:JSON.stringify({processed:jobs.length})};
}
