import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import XLSX from 'xlsx';

// Offline reconciliation. Never contacts the database or any notification service.
const [snapshotPath, workbookPath, transcriptPath, outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: reconcile-booking-import.mjs SNAPSHOT XLS TRANSCRIPT OUTPUT.json');
if (!outputPath.endsWith('.json')) throw new Error('Use a .json path for the report or snapshot.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath));
const t = snapshot.tables;
const workbook = XLSX.readFile(workbookPath);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {range:2,defval:''});
const transcriptLines=fs.readFileSync(transcriptPath,'utf8').trim().split('\n');
const workbookHash=crypto.createHash('sha256').update(fs.readFileSync(workbookPath)).digest('hex');
if(transcriptLines.shift()!==`# workbook-sha256:${workbookHash}`)throw new Error('Screenshot transcript is not tied to this exact workbook.');
const transcripts = new Map(transcriptLines.map(line => {
  const [index,code,status,school,position]=line.split('|');
  return [Number(index),{code,status,school,position}];
}));
const norm = value => String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const id = value => { const h=crypto.createHash('sha256').update(`booking-import-v2:${value}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
function dateTime(date,time) {
  const m=date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d+) (\d{4})/);
  if(!m || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`Invalid source date/time: ${date} ${time}`);
  const month='Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(m[1]);
  const wall=Date.UTC(+m[3],month,+m[2],...time.split(':').map(Number));
  let instant=wall;
  for(let i=0;i<3;i++){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
    const observed=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);
    instant+=wall-observed;
  }
  return new Date(instant).toISOString();
}
const sourceCode = booking => booking.import_source_code || booking.internal_notes?.match(/SimplyBook code: (\w+)/)?.[1];
const requestsByCode = new Map();
for(const b of t.booking_requests) {const c=sourceCode(b);if(c){const items=requestsByCode.get(c)||[];items.push(b);requestsByCode.set(c,items);}}
const digital = t.presentation_types.find(p=>p.slug==='digital-wellbeing');
if(!digital)throw new Error('Digital Wellbeing presentation is missing.');
const regionSlugs={'Auckland Region':'auckland-central','Wellington Region':'wellington','Waikato Region':'hamilton','Canterbury Region':'christchurch','Bay of Plenty Region':'tauranga','Auckland - South':'south-auckland','Auckland - North Shore':'north-shore','Auckland - West':'west-auckland','Auckland - East':'east-auckland','Auckland - Central':'auckland-central'};
const report={batchId:'simplybook-2026-09-16',createdAt:new Date().toISOString(),snapshotPath,sourcePath:workbookPath,
  workbookSha256:crypto.createHash('sha256').update(fs.readFileSync(workbookPath)).digest('hex'),
  sourceRows:rows.length, additions:[],matches:[],conflicts:[],unresolved:[],excluded:[],operations:[]};
const seen=new Set();
for(let index=0;index<rows.length;index++){
  const row=rows[index], source=transcripts.get(index);
  if(!source){report.unresolved.push({row:index+4,name:row['Client name'],date:row.Date,time:row.Time,reason:'Not visible in the supplied screenshots; school, code, position and status unverified.'});continue;}
  if(seen.has(source.code))throw new Error(`Duplicate screenshot code: ${source.code}`);seen.add(source.code);
  if(norm(source.school)==='school of wizardry'){report.excluded.push({code:source.code,reason:'Test booking'});continue;}
  const [start,end]=row.Time.split(' - ');const startsAt=dateTime(row.Date,start),endsAt=dateTime(row.Date,end);
  if(endsAt<=startsAt)throw new Error(`Invalid duration on row ${index+4}`);
  const sourceRecordedAt=dateTime(row['Record date'],row['Record date'].slice(-5));
  const email=norm(row['Client email']); const phone=String(row['Client phone']).replace(/^'+/,'').trim();
  const desiredStatus={active:'confirmed',pending:'requested',cancelled:'cancelled'}[source.status];
  if(!desiredStatus || !email.includes('@'))throw new Error(`Invalid source row ${index+4}`);
  let candidates=requestsByCode.get(source.code)||[];
  if(!candidates.length)candidates=t.booking_requests.filter(b=>{
    const c=t.school_contacts.find(c=>c.id===b.primary_contact_id),school=t.schools.find(s=>s.id===b.school_id);
    return norm(c?.email)===email && norm(school?.name)===norm(source.school) && t.booking_sessions.some(s=>s.booking_request_id===b.id&&Date.parse(s.starts_at)===Date.parse(startsAt));
  });
  if(candidates.length>1){report.unresolved.push({code:source.code,reason:'Multiple platform bookings match',ids:candidates.map(b=>b.id)});continue;}
  const existing=candidates[0];
  const summary={row:index+4,code:source.code,school:source.school,name:row['Client name'],position:source.position,status:desiredStatus,startsAt,endsAt,sourceRecordedAt};
  if(existing){
    const contact=t.school_contacts.find(c=>c.id===existing.primary_contact_id);
    const sessions=t.booking_sessions.filter(s=>s.booking_request_id===existing.id);
    const school=t.schools.find(s=>s.id===existing.school_id);
    // A source code is strongest, but inconsistent identity/date needs review, never a merge.
    if(norm(contact?.email)!==email || Date.parse(existing.created_at)!==Date.parse(sourceRecordedAt) || !sessions.some(s=>Date.parse(s.starts_at)===Date.parse(startsAt))){report.unresolved.push({...summary,id:existing.id,reason:'Source code matches but contact, creation time or session time differs.'});continue;}
    const changes=[];
    if(norm(contact?.full_name)!==norm(row['Client name']))changes.push({field:'contactName',platform:contact?.full_name,source:row['Client name']});
    if(String(contact?.phone||'').replace(/^'+/,'').replace(/\s+/g,'')!==phone.replace(/\s+/g,''))changes.push({field:'phone',platform:contact?.phone,source:phone});
    if(existing.status!==desiredStatus)changes.push({field:'status',platform:existing.status,source:desiredStatus});
    if(norm(school?.name)!==norm(source.school))changes.push({field:'schoolName',platform:school?.name,source:source.school});
    if(contact?.position&&norm(contact.position)!==norm(source.position))changes.push({field:'position',platform:contact.position,source:source.position});
    for(const s of sessions){if(s.status!==desiredStatus)changes.push({field:'sessionStatus',sessionId:s.id,platform:s.status,source:desiredStatus});if(Date.parse(s.ends_at)!==Date.parse(endsAt))changes.push({field:'endsAt',sessionId:s.id,platform:s.ends_at,source:endsAt});}
    if(changes.length)report.conflicts.push({...summary,id:existing.id,changes,resolution:'Preserve platform values; store source position/status separately.'});
    report.matches.push({...summary,id:existing.id,reference:existing.reference_code});
    report.operations.push({kind:'match',bookingId:existing.id,expectedUpdatedAt:existing.updated_at,code:source.code,sourceStatus:source.status,position:source.position,contactId:contact.id,sourceRecordedAt,sourceRaw:row});
  }else{
    const schools=t.schools.filter(s=>norm(s.name)===norm(source.school));
    if(schools.length>1){report.unresolved.push({...summary,reason:'Multiple schools have the same name'});continue;}
    const school=schools[0];
    const region=t.regions.find(r=>r.slug===regionSlugs[row.Service]);
    if(!school&&!region){report.unresolved.push({...summary,reason:'New school region needs review'});continue;}
    const schoolId=school?.id||id(`school:${norm(source.school)}`);
    const contacts=t.school_contacts.filter(c=>c.school_id===schoolId&&norm(c.email)===email);
    if(contacts.length>1){report.unresolved.push({...summary,reason:'Multiple matching school contacts'});continue;}
    const contact=contacts[0];const bookingId=id(`booking:${source.code}`);
    report.additions.push({...summary,id:bookingId});
    report.operations.push({kind:'add',bookingId,code:source.code,sourceStatus:source.status,position:source.position,sourceRecordedAt,sourceRaw:row,
      school:{id:schoolId,name:source.school,region_id:school?.region_id||region?.id},
      contact:{id:contact?.id||id(`contact:${schoolId}:${email}`),school_id:schoolId,full_name:row['Client name'],email,phone,position:source.position},
      session:{id:id(`session:${source.code}`),starts_at:startsAt,ends_at:endsAt,status:desiredStatus,presentation_type_id:digital.id}});
  }
}
// Screenshot-only tests are deliberately not imported (not present in this XLS).
for(const code of ['qfi149io','qfi17t2t','qfi3a8s','qfi4g3x','qfiitc','qfi03kd','qfi1f6q8','qfi15lvo'])report.excluded.push({code,school:'School of Wizardry',reason:'Screenshot-only test booking'});
report.counts={sourceRows:rows.length,additions:report.additions.length,matches:report.matches.length,conflicts:report.conflicts.length,unresolved:report.unresolved.length,excludedScreenshotTests:report.excluded.length};
fs.mkdirSync(path.dirname(outputPath),{recursive:true,mode:0o700});fs.writeFileSync(outputPath,JSON.stringify(report,null,2),{mode:0o600});
const wb=XLSX.utils.book_new();
for(const key of ['additions','matches','conflicts','unresolved','excluded'])XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(report[key].map(r=>({...r,...(r.changes?{changes:JSON.stringify(r.changes)}:{})}))),key);
XLSX.writeFile(wb,outputPath.replace(/\.json$/,'.xlsx'));
fs.chmodSync(outputPath.replace(/\.json$/,'.xlsx'),0o600);
console.log(JSON.stringify(report.counts,null,2));
