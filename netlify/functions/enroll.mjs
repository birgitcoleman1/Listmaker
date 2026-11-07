import{authorize,data,response}from'../lib/shared.mjs';
export async function handler(event){try{const{db,body,user}=await authorize(event);const id=await data(db.rpc('manage_enrollment',{p_org:body.organization_id,p_contact:body.contact_id,p_user:user.id,p_stop:!!body.stop}));return response(200,{id})}catch(e){return response(400,{error:e.message})}}
