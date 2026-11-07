export function parseCard(text) {
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'';
 const phone=text.match(/\+?\d[\d ().-]{7,}\d/)?.[0]||'';
 const name=lines.find(s=>!s.includes('@')&&!/\d/.test(s))||'';
 const [first_name='',...rest]=name.split(/\s+/);
 return {first_name,last_name:rest.join(' '),email,phone,notes:text};
}
export function renderTemplate(text,contact) {
 return text.replace(/\{\{\s*(first_name|last_name)\s*\}\}/g,(_,key)=>contact[key]||'');
}
export const fields={companies:['name','website','industry','notes'],events:['name','location','starts_at','ends_at','notes'],deals:['title','value','currency','stage','contact_id','company_id','notes'],tasks:['title','due_at','status','contact_id','notes'],email_templates:['name','subject','body'],workflows:['name','category_code','enabled'],categories:['code','name','reminder_days']};
