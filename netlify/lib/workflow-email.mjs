import {data} from './shared.mjs';
import {renderTemplate} from '../../src/lib.js';
export async function sendWorkflowEmail(db,{job,enrollment,workflow,contact,step},send=fetch){
 const draft={organization_id:job.organization_id,contact_id:contact.id,direction:'outbound',workflow_id:workflow.id,workflow_job_id:job.id,recipient_email:contact.email,subject:`${workflow.name} — email step`,body:'',status:'draft',message_at:new Date().toISOString()};
 let message=await data(db.from('email_messages').select('*').eq('workflow_job_id',job.id).maybeSingle());
 if(message?.status==='sent'||message?.status==='delivered')return;
 if(!message)message=await data(db.from('email_messages').insert(draft).select('*').single());
 try{
  if(!process.env.POSTMARK_SERVER_TOKEN)throw Error('POSTMARK_SERVER_TOKEN is not configured');if(!contact.email)throw Error('Contact has no email address');
  const identity=await data(db.from('sending_identities').select('*').eq('organization_id',job.organization_id).eq('verified',true).eq('sending_enabled',true).single());
  const template=await data(db.from('email_templates').select('*').eq('id',step.template_id).eq('organization_id',job.organization_id).single());const subject=renderTemplate(template.subject,contact),body=renderTemplate(template.body,contact);
  await data(db.from('email_messages').update({sender_email:identity.from_email,subject,body,status:'queued',error_details:null}).eq('id',message.id));
  const claimed=await data(db.rpc('claim_email_send',{p_job:job.id}));if(!claimed)throw Error('A previous send attempt exists. Check Postmark before any manual retry; automatic resend is blocked.');
  let res;try{res=await send('https://api.postmarkapp.com/email',{method:'POST',headers:{'X-Postmark-Server-Token':process.env.POSTMARK_SERVER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({From:identity.from_email,To:contact.email,Subject:subject,TextBody:body,MessageStream:'outbound',Metadata:{job_id:job.id}}),signal:AbortSignal.timeout(15000)})}catch{throw Error('Sending outcome unknown after network failure. Check Postmark using job '+job.id+'. Automatic resend is blocked.')}
  const result=await res.json();if(!res.ok||result.ErrorCode!==0)throw Error('Postmark rejected email: '+String(result.Message||res.status).slice(0,500));
  await data(db.from('email_messages').update({status:'sent',provider_message_id:result.MessageID,sent_at:result.SubmittedAt||new Date().toISOString(),message_at:result.SubmittedAt||new Date().toISOString(),error_details:null}).eq('id',message.id));
 }catch(e){await data(db.from('email_messages').update({status:'failed',error_details:e.message}).eq('id',message.id));throw e}
}
