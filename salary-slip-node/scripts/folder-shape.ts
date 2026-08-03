/** Shapes only. No folder value is ever printed. */
import { db } from '../src/db/client.js';

const rows = await db.document_versions.findMany({ select: { folder_path: true } });
const shape = (p: string) =>
  p.split('/').map((seg) =>
    /^\d{12}$/.test(seg) ? 'TWELVE_DIGITS'
    : /^AADHAAR_[0-9a-f]{16}$/.test(seg) ? 'AADHAAR_HMAC'
    : /^\d+$/.test(seg) ? 'NUMERIC'
    : 'WORD').join('/');

const counts = new Map<string, number>();
for (const r of rows) {
  const s = shape(String(r.folder_path ?? ''));
  counts.set(s, (counts.get(s) ?? 0) + 1);
}
console.log('  folder_path shapes across all versions:');
[...counts].sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`    ${s.padEnd(40)} ${n}`));

// Does the first segment match an Aadhaar actually on the owning user?
const joined = await db.$queryRawUnsafe<{ n: bigint }[]>(`
  select count(*)::bigint as n
  from document_versions v
  join documents d on d.id = v.document_id
  join users u on u.id = d.user_id
  where split_part(v.folder_path, '/', 1) = u.aadhar_card_no`);
console.log(`\n  versions whose folder's first segment equals the owner's stored Aadhaar: ${joined[0]?.n}/${rows.length}`);
await db.$disconnect();
