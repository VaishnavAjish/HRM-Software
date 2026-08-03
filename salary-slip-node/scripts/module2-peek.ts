import { PrismaClient } from '../src/generated/prisma/index.js';
const db = new PrismaClient();
const counts = {
  locations: await db.locations.count(),
  branches: await db.branches.count(),
  teams: await db.teams.count(),
  approval_levels: await db.approval_levels.count(),
  shifts: await db.shifts.count(),
  settings: await db.settings.count(),
  departments: await db.departments.count(),
};
console.log('  row counts:', JSON.stringify(counts));

const shift = await db.shifts.findFirst({ select: { start_time: true, end_time: true } });
console.log('  prisma start_time :', shift?.start_time, '(' + typeof shift?.start_time + ')');
console.log('  toISOString       :', shift?.start_time?.toISOString());

// What the raw driver hands back, i.e. what PHP/PDO sees.
const raw = await db.$queryRawUnsafe<{ start_time: unknown }[]>(
  'select start_time::text as start_time from shifts limit 1',
);
console.log('  postgres ::text   :', JSON.stringify(raw[0]?.start_time));
await db.$disconnect();
