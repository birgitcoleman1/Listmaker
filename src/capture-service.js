export function capturePayload(org,values) {
 const payload={p_organization_id:org};
 for(const key of ['first_name','last_name','email','phone','job_title','category','event_id','notes']) payload['p_'+key]=values[key]?.trim()||null;
 return payload;
}
export async function saveCapturedContact(db,org,values,image) {
 const {data:id,error}=await db.rpc('capture_contact',capturePayload(org,values));
 if(error)throw error;
 let warning='';
 if(image){
  try{const {error:uploadError}=await db.storage.from('business-cards').upload(`${org}/${id}/${crypto.randomUUID()}.${image.type.split('/')[1]}`,image);if(uploadError)warning='Contact saved, but the card photo could not be uploaded.';}
  catch{warning='Contact saved, but the card photo could not be uploaded.';}
 }
 return {id,warning};
}
