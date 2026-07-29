import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { ApiError } from '../utils/apiError';
import { ListParams } from './crudFactory';

const userInclude = {
  roles: { include: { role: true } },
  permissions: { include: { permission: true } },
  designation: true,
  department: true,
  team: true,
  company: true,
  branch: true,
  location: true,
  manager: { select: { id: true, fullName: true, username: true } },
} as const;

function sanitize(user: any) {
  if (!user) return user;
  const { passwordHash, mfaSecret, ...rest } = user;
  return rest;
}

export const userService = {
  async list({ page = 1, limit = 20, search = '', filters = {} }: ListParams) {
    const skip = (page - 1) * limit;
    const { roleId, departmentId, locationId, companyId, branchId, status } = filters;

    const where: any = {
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { empCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(roleId && { roles: { some: { roleId } } }),
      ...(departmentId && { departmentId }),
      ...(locationId && { locationId }),
      ...(companyId && { companyId }),
      ...(branchId && { branchId }),
      ...(status && { status }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: userInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users.map(sanitize),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw ApiError.notFound('User not found');
    return sanitize(user);
  },

  async create(input: any) {
    const { password, roleIds, ...rest } = input;
    if (!password) throw ApiError.badRequest('Password is required');

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username: rest.username }, { email: rest.email }] },
    });
    if (existing) throw ApiError.conflict('Username or email already in use');

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        ...rest,
        passwordHash,
        roles: roleIds?.length ? { create: roleIds.map((roleId: string) => ({ roleId })) } : undefined,
      },
      include: userInclude,
    });

    return sanitize(user);
  },

  async update(id: string, input: any) {
    const { password, roleIds, ...rest } = input;
    await this.getById(id);

    const data: any = { ...rest };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 12);
    }

    if (roleIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } });
      data.roles = { create: roleIds.map((roleId: string) => ({ roleId })) };
    }

    const user = await prisma.user.update({ where: { id }, data, include: userInclude });
    return sanitize(user);
  },

  async remove(id: string) {
    await this.getById(id);
    await prisma.user.delete({ where: { id } });
  },

  async setPermissionOverrides(id: string, overrides: { permissionId: string; isRevoked: boolean }[]) {
    await this.getById(id);
    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId: id } }),
      prisma.userPermission.createMany({
        data: overrides.map((o) => ({ userId: id, permissionId: o.permissionId, isRevoked: o.isRevoked })),
      }),
    ]);
    return this.getById(id);
  },

  async unlockAccount(id: string) {
    await this.getById(id);
    await prisma.user.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: null } });
    return this.getById(id);
  },
};
