import {randomUUID} from 'node:crypto';
import {authorize,data,response} from '../lib/shared.mjs';
import {withMailbox,syncFolder,refreshFolders,moveRemote,createRemoteFolder,archiveRemote} from '../lib/mailbox.mjs';
import {safeMailError} from '../lib/mail-security.mjs';
export async function handler(event){let account,db,lease;try{
 const authorized=await authorize(event);db=authorized.db;const {body,user}=authorized;
 account=await data(db.from('mail_accounts').select('*').eq('organization_id',body.organization_id).eq('user_id',user.id).single());if(!account.verified_at)throw Error('Verify the mailbox connection in Email settings first');
 lease=randomUUID();if(!await data(db.rpc('claim_mailbox',{p_account:account.id,p_token:lease})))throw Error('Mailbox busy');
 const secret=await data(db.from('mail_credentials').select('ciphertext').eq('account_id',account.id).single());
 const result=await withMailbox(account,secret.ciphertext,async client=>{
  if(body.action==='create_folder'){const name=String(body.name||'').trim();await createRemoteFolder(db,account,client,name);return {created:name}}
  if(body.action==='move'||body.action==='archive'){
   const location=await data(db.from('mail_locations').select('*').eq('id',body.location_id).eq('organization_id',body.organization_id).eq('account_id',account.id).eq('present',true).single());const folders=await refreshFolders(db,account,client);let destination=body.destination;
   if(body.action==='archive')return archiveRemote(db,account,client,location);
   if(!folders.some(f=>f.path===destination))throw Error('Choose an existing destination folder');
   if(destination===location.folder)return {unchanged:true};return moveRemote(db,account,client,location,destination);
  }
  if(body.action!=='sync')throw Error('Unknown mailbox action');const before=Number(body.before)||null;return syncFolder(db,account,client,String(body.folder||'INBOX'),{before});
 });return response(200,result);
 }catch(e){const error=account?safeMailError(e):'Configure and verify your own mailbox in this workspace first';if(account&&db)await db.from('mail_accounts').update({last_error:error}).eq('id',account.id);return response(400,{error})}finally{if(account&&db&&lease)await db.from('mail_accounts').update({lease_token:null,lease_until:null}).eq('id',account.id).eq('lease_token',lease)}}
