/** Shapes and counts only. */
import { db } from '../src/db/client.js';

const q = (sql: string) => db.$queryRawUnsafe<{ n: bigint }[]>(sql);

const [orphan] = await q(`select count(*)::bigint as n from documents where user_id is null`);
console.log(`  documents with no user_id            : ${orphan?.n}`);

const [matchAny] = await q(`
  select count(*)::bigint as n from document_versions v
  where exists (select 1 from users u where u.aadhar_card_no = split_part(v.folder_path,'/',1))`);
console.log(`  first segment matches SOME user's aadhaar: ${matchAny?.n}/38`);

const [matchEmp] = await q(`
  select count(*)::bigint as n from document_versions v
  where exists (select 1 from users u where u.emp_code = split_part(v.folder_path,'/',1))`);
console.log(`  first segment matches SOME emp_code      : ${matchEmp?.n}/38`);

// Second segment looked numeric — is it the user id?
const [seg2] = await q(`
  select count(*)::bigint as n from document_versions v
  join documents d on d.id = v.document_id
  where split_part(v.folder_path,'/',2) = d.user_id::text`);
console.log(`  second segment equals documents.user_id  : ${seg2?.n}/38`);

const [thirdIsType] = await q(`
  select count(*)::bigint as n from document_versions v
  join documents d on d.id = v.document_id
  where split_part(v.folder_path,'/',3) = d.document_type`);
console.log(`  third segment equals document_type       : ${thirdIsType?.n}/38`);
await db.$disconnect();
