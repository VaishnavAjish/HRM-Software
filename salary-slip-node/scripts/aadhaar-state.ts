/** Counts only — no Aadhaar value is read into a variable or printed. */
import { db } from '../src/db/client.js';

const [total, plaintext, encrypted, lastFour, reference] = await Promise.all([
  db.users.count(),
  db.users.count({ where: { NOT: [{ aadhar_card_no: null }, { aadhar_card_no: '' }] } }),
  db.users.count({ where: { encrypted_aadhaar_number: { not: null } } }),
  db.users.count({ where: { aadhaar_last_four: { not: null } } }),
  db.users.count({ where: { aadhaar_secure_reference: { not: null } } }),
]);

console.log(`  users total                     : ${total}`);
console.log(`  aadhar_card_no populated        : ${plaintext}   (legacy plaintext column)`);
console.log(`  encrypted_aadhaar_number        : ${encrypted}`);
console.log(`  aadhaar_last_four               : ${lastFour}`);
console.log(`  aadhaar_secure_reference        : ${reference}`);
await db.$disconnect();
