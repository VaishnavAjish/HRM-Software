import { readdirSync } from 'node:fs';
import { PrismaClient } from '../src/generated/prisma/index.js';

const db = new PrismaClient();
const onDisk = readdirSync('../salary-slip-bac/database/migrations')
  .filter((f) => f.endsWith('.php'))
  .map((f) => f.replace(/\.php$/, ''));

const rows = await db.$queryRawUnsafe<{ migration: string }[]>('select migration from migrations');
const applied = new Set(rows.map((r) => r.migration));

const pending = onDisk.filter((m) => !applied.has(m));
const foreign = [...applied].filter((m) => !onDisk.includes(m));

console.log(`  migration files in this repo : ${onDisk.length}`);
console.log(`  rows in production migrations: ${applied.size}`);
console.log(`\n  PENDING (in repo, not applied to production): ${pending.length}`);
pending.forEach((m) => console.log(`    ${m}`));
console.log(`\n  APPLIED but NOT in this repo: ${foreign.length}`);
foreign.slice(0, 15).forEach((m) => console.log(`    ${m}`));
if (foreign.length > 15) console.log(`    ... and ${foreign.length - 15} more`);
await db.$disconnect();
