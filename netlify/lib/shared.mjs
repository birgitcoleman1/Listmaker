import {createClient} from '@supabase/supabase-js';
export const admin=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
export async function data(q){const{data,error}=await q;if(error)throw error;return data}
export const response=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
export async function authorize(event){
 if(event.httpMethod!=='POST')throw Error('POST required');
 const token=(event.headers.authorization||'').replace(/^Bearer /,'');
 const db=admin();const{data:user,error}=await db.auth.getUser(token);if(error||!user.user)throw Error('Authentication required');
 const body=JSON.parse(event.body||'{}');
 const membership=await data(db.from('organization_members').select('role').eq('organization_id',body.organization_id).eq('user_id',user.user.id).single());
 if(!['owner','admin','member'].includes(membership.role))throw Error('Write access required');
 return {db,body,user:user.user};
}
