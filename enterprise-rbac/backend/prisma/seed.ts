import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RESOURCES = [
  'users',
  'roles',
  'permissions',
  'permission_groups',
  'companies',
  'branches',
  'locations',
  'departments',
  'teams',
  'designations',
  'audit_logs',
  'sessions',
] as const;

const ACTIONS = ['read', 'create', 'edit', 'delete'] as const;

async function seedPermissionGroupsAndPermissions() {
  const groupDefs = [
    { name: 'User Management', resources: ['users', 'roles', 'permissions', 'permission_groups'] },
    { name: 'Organization', resources: ['companies', 'branches', 'locations', 'departments', 'teams', 'designations'] },
    { name: 'Security & Audit', resources: ['audit_logs', 'sessions'] },
  ];

  const groups: Record<string, string> = {};
  for (const g of groupDefs) {
    const group = await prisma.permissionGroup.upsert({
      where: { name: g.name },
      update: {},
      create: { name: g.name, description: `${g.name} permissions` },
    });
    groups[g.name] = group.id;
    for (const resource of g.resources) {
      for (const action of ACTIONS) {
        await prisma.permission.upsert({
          where: { name: `${resource}.${action}` },
          update: {},
          create: {
            name: `${resource}.${action}`,
            resource,
            action,
            description: `${action} access on ${resource}`,
            groupId: group.id,
          },
        });
      }
    }
  }
}

async function seedRoles() {
  const superAdmin = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full unrestricted system access', isSystem: true },
  });

  const companyAdmin = await prisma.role.upsert({
    where: { name: 'Company Admin' },
    update: {},
    create: { name: 'Company Admin', description: 'Manages users and org structure for their company', isSystem: true },
  });

  await prisma.role.upsert({
    where: { name: 'HR Manager' },
    update: {},
    create: { name: 'HR Manager', description: 'Manages employee records and departments', isSystem: false },
  });

  const viewer = await prisma.role.upsert({
    where: { name: 'Viewer' },
    update: {},
    create: { name: 'Viewer', description: 'Read-only access across modules', isSystem: true },
  });

  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  const companyAdminPermissions = allPermissions.filter((p) =>
    ['users', 'departments', 'teams', 'designations', 'branches', 'locations'].includes(p.resource)
  );
  await prisma.rolePermission.createMany({
    data: companyAdminPermissions.map((p) => ({ roleId: companyAdmin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  const readOnlyPermissions = allPermissions.filter((p) => p.action === 'read');
  await prisma.rolePermission.createMany({
    data: readOnlyPermissions.map((p) => ({ roleId: viewer.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  return { superAdmin };
}

async function seedOrganization() {
  const company = await prisma.company.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'Enterprise HQ', code: 'HQ', currency: 'USD' },
  });

  const branch = await prisma.branch.upsert({
    where: { code: 'HQ-MAIN' },
    update: {},
    create: { companyId: company.id, name: 'Main Branch', code: 'HQ-MAIN' },
  });

  const location = await prisma.location.findFirst({ where: { branchId: branch.id, name: 'Head Office' } });
  const resolvedLocation =
    location ??
    (await prisma.location.create({
      data: { branchId: branch.id, name: 'Head Office', type: 'Office', country: 'USA', city: 'New York' },
    }));

  const department = await prisma.department.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: { name: 'Administration', code: 'ADMIN' },
  });

  const team = await prisma.team.findFirst({ where: { departmentId: department.id, name: 'Core Admin' } });
  const resolvedTeam =
    team ??
    (await prisma.team.create({ data: { departmentId: department.id, name: 'Core Admin' } }));

  const designation = await prisma.designation.findFirst({ where: { title: 'System Administrator' } });
  const resolvedDesignation =
    designation ?? (await prisma.designation.create({ data: { title: 'System Administrator', level: 10 } }));

  return { company, branch, location: resolvedLocation, department, team: resolvedTeam, designation: resolvedDesignation };
}

async function seedSuperAdminUser(superAdminRoleId: string, org: Awaited<ReturnType<typeof seedOrganization>>) {
  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@enterprise-rbac.local',
      fullName: 'System Administrator',
      passwordHash,
      status: 'ACTIVE',
      companyId: org.company.id,
      branchId: org.branch.id,
      locationId: org.location.id,
      departmentId: org.department.id,
      teamId: org.team.id,
      designationId: org.designation.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRoleId } },
    update: {},
    create: { userId: user.id, roleId: superAdminRoleId },
  });
}

async function main() {
  await seedPermissionGroupsAndPermissions();
  const { superAdmin } = await seedRoles();
  const org = await seedOrganization();
  await seedSuperAdminUser(superAdmin.id, org);

  console.log('Seed complete. Login with username "admin" / password "Admin@123".');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
