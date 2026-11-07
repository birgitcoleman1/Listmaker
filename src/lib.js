export function parseCard(text) {
 const cleaned=text.replace(/[ \t]*@[ \t]*/g,'@').replace(/([\w])[ \t]+\.[ \t]*(?=[a-z]{2,}\b)/gi,'$1.');
 const lines=cleaned.split('\n').map(s=>s.trim()).filter(Boolean);
 const email=cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||'';
 const phone=cleaned.match(/\+?\d[\d ().-]{7,}\d/)?.[0]||'';
 const role=/\b(founder|co-founder|president|director|manager|consultant|partner|engineer|designer|chief|ceo|cfo|coo|cto|sales|marketing)\b/i;
 const company=/\b(inc|llc|ltd|corp|corporation|company|studio|agency|solutions|group|www|street|avenue|road)\b/i;
 const candidates=lines.map((line,index)=>({name:line.split(/[,|]/)[0].trim(),index})).filter(({name})=>!/[\d@:/]/.test(name)&&!role.test(name)&&!company.test(name)&&/^[\p{L} .’'-]+$/u.test(name)&&name.split(/\s+/).length>=2&&name.split(/\s+/).length<=4);
 const local=email.split('@')[0].toLowerCase();
 const score=({name,index})=>name.toLowerCase().split(/[ .'-]+/).filter(t=>t.length>1&&local.includes(t)).length*10+(/^[A-ZÀ-Ý][a-zà-ÿ]/.test(name)?2:0)-index*.01;
 const name=candidates.sort((a,b)=>score(b)-score(a))[0]?.name||'';
 const [first_name='',...rest]=name.split(/\s+/);
 return {first_name,last_name:rest.join(' '),email,phone,job_title:lines.find(line=>role.test(line)&&!line.includes('@'))||'',notes:text};
}
export function renderTemplate(text,contact) {
 return text.replace(/\{\{\s*(first_name|last_name)\s*\}\}/g,(_,key)=>contact[key]||'');
}
export const fields={companies:['name','website','industry','notes'],events:['name','location','starts_at','ends_at','notes'],deals:['title','value','currency','stage','contact_id','company_id','notes'],tasks:['title','due_at','status','contact_id','notes'],email_templates:['name','subject','body'],workflows:['name','category_code','enabled'],categories:['code','name','reminder_days']};
