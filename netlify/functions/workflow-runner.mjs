import{admin,data}from'../lib/shared.mjs';
import{renderTemplate}from'../../src/lib.js';
export async function handler(){
 const db=admin();const jobs=await data(db.rpc('claim_workflow_jobs'));
 for(const job of jobs){try{
 const enrollment=await data(db.from('workflow_enrollments').select('*').eq('id',job.enrollment_id).eq('organization_id',job.organization_id).single());
 const workflow=await data(db.from('workflows').select('*').eq('id',enrollment.workflow_id).eq('organization_id',job.organization_id).single());
 if(enrollment.status!=='active'||!workflow.enabled){await data(db.from('workflow_enrollments').update({status:'stopped'}).eq('id',enrollment.id));await data(db.from('workflow_jobs').update({status:'cancelled'}).eq('enrollment_id',enrollment.id).in('status',['pending','processing']));continue}
 const step=await data(db.from('workflow_steps').select('*').eq('id',job.step_id).eq('organization_id',job.organization_id).single());
 const contact=await data(db.from('contacts').select('*').eq('id',enrollment.contact_id).eq('organization_id',job.organization_id).single());
 if(step.kind==='task')await data(db.from('tasks').insert({organization_id:job.organization_id,contact_id:contact.id,title:`Follow up with ${contact.first_name}`,due_at:new Date().toISOString()}));
 if(step.kind==='email'){
 if(!process.env.POSTMARK_SERVER_TOKEN)throw Error('Postmark not configured');
 if(!contact.email)throw Error('Contact has no email');
 const identity=await data(db.from('sending_identities').select('*').eq('organization_id',job.organization_id).eq('verified',true).eq('sending_enabled',true).single());
 const template=await data(db.from('email_templates').select('*').eq('id',step.template_id).eq('organization_id',job.organization_id).single());
 const subject=renderTemplate(template.subject,contact),body=renderTemplate(template.body,contact);
 const message=await data(db.from('email_messages').insert({organization_id:job.organization_id,contact_id:contact.id,direction:'outbound',sender_email:identity.from_email,recipient_email:contact.email,subject,body,status:'queued'}).select('id').single());
 const res=await fetch('https://api.postmarkapp.com/email',{method:'POST',headers:{'X-Postmark-Server-Token':process.env.POSTMARK_SERVER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({From:identity.from_email,To:contact.email,Subject:subject,TextBody:body,MessageStream:'outbound',Metadata:{job_id:job.id}}),signal:AbortSignal.timeout(15000)});
 if(!res.ok){await data(db.from('email_messages').update({status:'failed'}).eq('id',message.id));throw Error('Email provider rejected request')}
 const result=await res.json();if(result.ErrorCode!==0)throw Error('Email provider rejected request');
 await data(db.from('email_messages').update({status:'sent',provider_message_id:result.MessageID}).eq('id',message.id));
 }
 await data(db.from('activities').insert({organization_id:job.organization_id,contact_id:contact.id,kind:'workflow_'+step.kind,description:`${workflow.name}: ${step.kind} completed`}));
 await data(db.from('workflow_jobs').update({status:'done'}).eq('id',job.id));
 const remaining=await data(db.from('workflow_jobs').select('id').eq('enrollment_id',enrollment.id).in('status',['pending','processing','failed']));
 if(!remaining.length)await data(db.from('workflow_enrollments').update({status:'completed'}).eq('id',enrollment.id));
 }catch(e){console.error('Workflow job failed',job.id,e.message);await data(db.from('workflow_jobs').update({status:'failed'}).eq('id',job.id));}}
 return {statusCode:200,body:JSON.stringify({processed:jobs.length})};
}
