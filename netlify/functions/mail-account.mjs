import {authorize,data,response} from '../lib/shared.mjs';
import {encryptSecret,safeMailError} from '../lib/mail-security.mjs';
import {verifyMailbox} from '../lib/mailbox.mjs';
export async function handler(event){try{
 const {db,body,user}=await authorize(event);if(!['save','verify'].includes(body.action))throw Error('Unknown account action');
 let account=await data(db.from('mail_accounts').select('*').eq('organization_id',body.organization_id).eq('user_id',user.id).maybeSingle());
 if(body.action==='save'){
  const email=String(body.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid Migadu mailbox email');if(typeof body.password!=='string'||!body.password||body.password.length>1000)throw Error('Enter the mailbox password');
  const ciphertext=encryptSecret(body.password);
  // Preserve identity of cached messages; changing accounts requires an explicit separate workspace/account.
  if(account&&account.email!==email)throw Error('This workspace connection is already bound to another mailbox. Use its original address.');
  account=await data(db.rpc('save_mail_account',{p_org:body.organization_id,p_user:user.id,p_email:email,p_ciphertext:ciphertext}));return response(200,{account});
 }
 if(!account)throw Error('Configure an account first');const secret=await data(db.from('mail_credentials').select('ciphertext').eq('account_id',account.id).single());
 try{await verifyMailbox(account,secret.ciphertext);account=await data(db.from('mail_accounts').update({verified_at:new Date().toISOString(),last_error:null}).eq('id',account.id).eq('configured_at',account.configured_at).select('*').single());return response(200,{account})}catch(e){const error=safeMailError(e);await data(db.from('mail_accounts').update({verified_at:null,last_error:error}).eq('id',account.id));return response(400,{error})}
 }catch(e){return response(400,{error:e.message})}}
