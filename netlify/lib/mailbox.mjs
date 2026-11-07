import {ImapFlow} from 'imapflow';
import nodemailer from 'nodemailer';
import PostalMime from 'postal-mime';
import {createHash} from 'node:crypto';
import {data} from './shared.mjs';
import {decryptSecret,migadu} from './mail-security.mjs';
export function imapClient(email,password){const client=new ImapFlow({...migadu.imap,auth:{user:email,pass:password},logger:false,disableAutoIdle:true,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,maxLiteralSize:3*1024*1024});client.on('error',()=>{});return client}
export async function withMailbox(account,secret,fn,factory=imapClient){const client=factory(account.email,decryptSecret(secret));try{await client.connect();return await fn(client)}finally{try{await client.logout()}catch{client.close()}}}
export async function verifyMailbox(account,secret){await withMailbox(account,secret,async()=>{});const smtp=nodemailer.createTransport({...migadu.smtp,auth:{user:account.email,pass:decryptSecret(secret)},logger:false,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000});try{await smtp.verify()}finally{smtp.close()}}
export async function refreshFolders(db,account,client){const folders=(await client.list()).filter(f=>!f.flags?.has('\\Noselect'));for(const folder of folders)await data(db.from('mail_folders').upsert({organization_id:account.organization_id,account_id:account.id,path:folder.path,special_use:folder.specialUse||null},{onConflict:'account_id,path'}));const known=await data(db.from('mail_folders').select('id,path').eq('account_id',account.id));for(const old of known)if(!folders.some(f=>f.path===old.path)){await data(db.from('mail_locations').update({present:false}).eq('account_id',account.id).eq('folder',old.path));await data(db.from('mail_folders').delete().eq('id',old.id))}return folders}
export function messageIdentity(message,parsed,folder,validity){return (parsed.messageId||message.envelope?.messageId||'').trim()||`sha256:${parsed.contentHash||createHash('sha256').update(JSON.stringify({envelope:message.envelope,size:message.size})).digest('hex')}`}
export function messageContent(parsed){return (parsed.text||String(parsed.html||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ')).slice(0,200000)}
export async function syncFolder(db,account,client,path,{before=null}={}){
 const folders=await refreshFolders(db,account,client);if(!folders.some(f=>f.path===path))throw Error('Folder no longer exists; choose another folder');
 const lock=await client.getMailboxLock(path);let synced=0,last=null;const deadline=Date.now()+20000;try{
 const validity=String(client.mailbox.uidValidity);const all=(await client.search({all:true},{uid:true}))||[];const sorted=all.filter(uid=>!before||uid<before).sort((a,b)=>b-a);const selected=sorted.slice(0,10);
 // Reconcile remote moves/deletes for all already-cached messages in this folder.
 const cached=await data(db.from('mail_locations').select('id,uid,uid_validity').eq('account_id',account.id).eq('folder',path).eq('present',true).limit(10000));const present=new Set(all.map(String));for(const location of cached)if(location.uid_validity!==validity||!present.has(String(location.uid)))await data(db.from('mail_locations').update({present:false}).eq('id',location.id));
 for(const uid of selected){
  if(Date.now()>deadline)break;
  const envelope=await client.fetchOne(uid,{uid:true,envelope:true,size:true,internalDate:true},{uid:true});if(!envelope)continue;
  let parsed={};if(envelope.size<=2*1024*1024){const full=await client.fetchOne(uid,{source:true},{uid:true});parsed=await PostalMime.parse(full.source);parsed.contentHash=createHash('sha256').update(full.source).digest('hex')}else parsed.text='Message exceeds the 2 MB preview limit. Open it in your email client to read the full message and attachments.';
  const sender=envelope.envelope?.from?.[0]?.address||parsed.from?.address||'';const recipients=(envelope.envelope?.to||parsed.to||[]).map(v=>v.address).filter(Boolean);const outgoing=sender.toLowerCase()===account.email.toLowerCase();
  const addresses=(outgoing?recipients:[sender]).map(e=>e.toLowerCase().trim());const contactId=await data(db.rpc('find_mail_contact',{p_org:account.organization_id,p_emails:addresses}));
  const identity=messageIdentity(envelope,parsed,path,validity);let existing=await data(db.from('email_messages').select('id').eq('mail_account_id',account.id).eq('internet_message_id',identity).maybeSingle());
  const record={organization_id:account.organization_id,mail_account_id:account.id,contact_id:contactId,direction:outgoing?'outbound':'inbound',sender_email:sender,recipient_email:recipients.join(', '),subject:parsed.subject||envelope.envelope?.subject||'(No subject)',body:messageContent(parsed),status:outgoing?'sent':'received',message_at:new Date(envelope.internalDate||Date.now()).toISOString(),internet_message_id:identity};
  // Unique message identity gives an idempotent message even across folder moves and repeat syncs.
  if(!existing){const created=await db.from('email_messages').insert(record).select('id').single();if(created.error?.code==='23505')existing=await data(db.from('email_messages').select('id').eq('mail_account_id',account.id).eq('internet_message_id',identity).single());else {if(created.error)throw created.error;existing=created.data}}
  else await data(db.from('email_messages').update({contact_id:contactId}).eq('id',existing.id));
  await data(db.from('mail_locations').upsert({organization_id:account.organization_id,account_id:account.id,folder:path,uid_validity:validity,uid,message_id:existing.id,present:true},{onConflict:'account_id,folder,uid_validity,uid'}));synced++;last=uid;
 }
 await data(db.from('mail_accounts').update({last_synced_at:new Date().toISOString(),last_error:null}).eq('id',account.id));
 return {synced,before:last,hasMore:sorted.length>synced};
 }finally{lock.release()}
}
export async function moveRemote(db,account,client,location,destination){
 if(location.account_id!==account.id)throw Error('Message access denied');
 const lock=await client.getMailboxLock(location.folder);try{if(String(client.mailbox.uidValidity)!==location.uid_validity)throw Error('Mailbox changed. Sync before moving.');const found=await client.fetchOne(location.uid,{uid:true},{uid:true});if(!found)throw Error('Message moved elsewhere. Sync before moving.');const moved=await client.messageMove(location.uid,destination,{uid:true});if(!moved)throw Error('Mailbox did not confirm the move');await data(db.from('mail_locations').update({present:false}).eq('id',location.id));}finally{lock.release()}
 // Read the destination to learn new UIDs; stable Message-ID preserves the timeline entry.
 return syncFolder(db,account,client,destination);
}

export async function createRemoteFolder(db,account,client,name){if(!name||name.length>100||/[\x00-\x1f]/.test(name))throw Error('Folder name must be 1–100 characters');await client.mailboxCreate(name);return refreshFolders(db,account,client)}
export async function archiveRemote(db,account,client,location){const folders=await refreshFolders(db,account,client);const destination=folders.find(f=>f.specialUse==='\\Archive')?.path||'Archive';if(!folders.some(f=>f.path===destination))await client.mailboxCreate(destination);if(location.folder===destination)return {unchanged:true};return moveRemote(db,account,client,location,destination)}
