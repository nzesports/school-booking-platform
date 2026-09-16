import fs from 'node:fs';
import XLSX from 'xlsx';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const out = process.argv[2];
if (!out) throw new Error('Usage: node --env-file=.env.local scripts/export-bookings.mjs OUTPUT.json');
if (!out.endsWith('.json')) throw new Error('Use a .json path for the report or snapshot.');
const snapshot = { exportedAt: new Date().toISOString(), tables: {} };
for (const table of ['booking_requests','booking_sessions','school_contacts','schools','regions','presentation_types','booking_status_history','booking_activity_logs','ambassador_reports','email_logs']) {
  const rows=[];
  for(let start=0;;start+=1000){
    const {data,error}=await admin.from(table).select('*').order('id').range(start,start+999);
    if(error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);if(data.length<1000)break;
  }
  snapshot.tables[table]=rows;
}
fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});
fs.writeFileSync(out,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
const workbook=XLSX.utils.book_new();
for(const table of ['booking_requests','booking_sessions','school_contacts','schools']) {
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(snapshot.tables[table]),table);
}
const spreadsheetPath=out.replace(/\.json$/,'.xlsx');
XLSX.writeFile(workbook,spreadsheetPath);fs.chmodSync(spreadsheetPath,0o600);
console.log(JSON.stringify({path:out,counts:Object.fromEntries(Object.entries(snapshot.tables).map(([k,v])=>[k,v.length]))},null,2));
