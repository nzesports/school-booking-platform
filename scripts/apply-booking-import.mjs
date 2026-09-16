import fs from 'node:fs';
import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const [reportPath, siteUrl] = process.argv.slice(2);
if (!reportPath || !siteUrl) throw new Error('Usage: node --env-file=.env.local scripts/apply-booking-import.mjs RECONCILIATION.json LIVE_SITE_URL');
if (!reportPath.endsWith('.json')) throw new Error('Use a .json path for the report or snapshot.');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const endpoint=new URL('/api/booking-import/readiness',siteUrl);
if(endpoint.protocol!=='https:')throw new Error('The live HTTPS deployment is required.');
const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Live email safeguards are not ready. Nothing imported.');
const readiness=await response.json();
if(!readiness.ready||readiness.policyVersion!==1||readiness.databaseFingerprint!==crypto.createHash('sha256').update(process.env.NEXT_PUBLIC_SUPABASE_URL).digest('hex'))throw new Error('Live email safeguards are not ready. Nothing imported.');
// Fail before any mutation if data changed while the plan was being reviewed.
// New migration columns are allowed; every original column must still match.
const snapshot=JSON.parse(fs.readFileSync(report.snapshotPath,'utf8'));
const {data:priorRun,error:runError}=await admin.from('booking_import_runs').select('plan_sha256').eq('batch_id',report.batchId).maybeSingle();
if(runError)throw new Error(`Import migration is unavailable: ${runError.message}`);
if(!priorRun){
  for(const table of ['booking_requests','booking_sessions','school_contacts','schools']){
    const live=[];
    for(let start=0;;start+=1000){
      const {data,error}=await admin.from(table).select('*').order('id').range(start,start+999);
      if(error)throw new Error(error.message);live.push(...data);if(data.length<1000)break;
    }
    const original=snapshot.tables[table];
    if(live.length!==original.length)throw new Error(`${table} changed since export; export and reconcile again.`);
    for(const row of original){
      const current=live.find(r=>r.id===row.id);
      if(!current||Object.entries(row).some(([key,value])=>JSON.stringify(current[key])!==JSON.stringify(value)))
        throw new Error(`${table} record ${row.id} changed since export; reconcile again.`);
    }
  }
}
const startedAt=new Date().toISOString();
const hash=crypto.createHash('sha256').update(JSON.stringify(report.operations)).digest('hex');
const {data,error}=await admin.rpc('apply_silent_booking_import',{batch:report.batchId,plan_sha256:hash,operations:report.operations});
if(error)throw new Error(`Import transaction failed: ${error.message}`);
const ids=report.operations.map(x=>x.bookingId);
const saved=[];
for(let i=0;i<ids.length;i+=50){
  const {data:records,error:readError}=await admin.from('booking_requests').select('*,booking_sessions(*)').in('id',ids.slice(i,i+50));
  if(readError)throw new Error(readError.message);saved.push(...records);
}
const problems=[];
for(const op of report.operations){
  const booking=saved.find(b=>b.id===op.bookingId);
  if(!booking||!booking.manual_email_only||booking.import_source_code!==op.code||booking.import_batch_id!==report.batchId)problems.push({id:op.bookingId,reason:'Missing record, provenance or email policy'});
  if(op.kind==='match'&&booking){
    const original=snapshot.tables.booking_requests.find(b=>b.id===op.bookingId);
    const sessionRows=snapshot.tables.booking_sessions.filter(s=>s.booking_request_id===op.bookingId);
    if(booking.reference_code!==original.reference_code||booking.status!==original.status||booking.primary_contact_id!==original.primary_contact_id)
      problems.push({id:op.bookingId,reason:'Existing booking details changed unexpectedly'});
    for(const originalSession of sessionRows){
      const current=booking.booking_sessions.find(s=>s.id===originalSession.id);
      if(!current||['status','presentation_type_id','assigned_ambassador_id','starts_at','ends_at','report_status','payment_status'].some(key=>current[key]!==originalSession[key]))
        problems.push({id:originalSession.id,reason:'Existing session details changed unexpectedly'});
    }
  }
  if(op.kind==='add'&&(!booking?.booking_sessions.some(s=>s.id===op.session.id&&s.status===op.session.status&&Date.parse(s.starts_at)===Date.parse(op.session.starts_at))))problems.push({id:op.bookingId,reason:'New session does not match plan'});
}
const {data:emails,error:emailError}=await admin.from('email_logs').select('id,status,related_booking_request_id,related_booking_session_id').gte('created_at',startedAt).eq('status','sent');
if(emailError)throw new Error(`Could not verify email log: ${emailError.message}`);
const sessionIds=new Set(saved.flatMap(b=>b.booking_sessions.map(s=>s.id)));
const unexpectedEmails=(emails||[]).filter(e=>ids.includes(e.related_booking_request_id)||sessionIds.has(e.related_booking_session_id));
const {data:manualSends,error:manualError}=await admin.from('booking_email_sends').select('id,booking_request_id').gte('sent_at',startedAt).eq('status','sent');
if(manualError)throw new Error(`Could not verify manual email log: ${manualError.message}`);
unexpectedEmails.push(...(manualSends||[]).filter(e=>ids.includes(e.booking_request_id)));
const verification={startedAt,completedAt:new Date().toISOString(),imported:data,problems,unexpectedEmails,saved};
fs.writeFileSync(reportPath.replace(/\.json$/,'.verification.json'),JSON.stringify(verification,null,2),{mode:0o600});
console.log(JSON.stringify({imported:data,problems:problems.length,unexpectedEmails:unexpectedEmails.length}));
if(problems.length||unexpectedEmails.length)throw new Error('Import verification needs review. See verification report.');
