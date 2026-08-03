import { db } from '../src/db/client.js';

const rows = await db.$queryRawUnsafe<{ bucket_name: string | null; upload_status: string; scan_status: string; n: bigint }[]>(
  `select coalesce(bucket_name,'<null>') as bucket_name, upload_status, scan_status, count(*)::bigint as n
   from document_versions group by 1,2,3 order by 4 desc`);
console.log('  version storage / status:');
rows.forEach((r) => console.log(`    bucket=${r.bucket_name.padEnd(38)} ${r.upload_status.padEnd(16)} ${r.scan_status.padEnd(12)} ${r.n}`));

const folder = await db.document_versions.findFirst({
  select: { folder_path: true, file_extension: true, mime_type: true, checksum: true, version: true },
  orderBy: { id: 'desc' },
});
if (folder) {
  // Show the folder scheme, not the reference itself.
  const parts = String(folder.folder_path ?? '').split('/');
  console.log(`\n  folder scheme    : ${parts.map((p) => (p.startsWith('AADHAAR_') ? 'AADHAAR_<hmac>' : p)).join('/')}`);
  console.log(`  ext / mime       : ${folder.file_extension} / ${folder.mime_type}`);
  console.log(`  checksum present : ${folder.checksum ? 'yes (' + folder.checksum.length + ' hex)' : 'no'}`);
  console.log(`  version          : ${folder.version}`);
}

const audit = await db.$queryRawUnsafe<{ action: string; n: bigint }[]>(
  `select action, count(*)::bigint as n from document_audit_logs group by 1 order by 2 desc limit 8`);
console.log('\n  audit actions:');
audit.forEach((r) => console.log(`    ${r.action.padEnd(34)} ${r.n}`));
await db.$disconnect();
