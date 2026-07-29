import { prisma } from '../config/db';
import { ApiError } from '../utils/apiError';
import { ListParams } from './crudFactory';

const roleInclude = {
  permissions: { include: { permission: true } },
  users: { include: { user: { select: { id: true, fullName: true, username: true, email: true } } } },
  pagePermissions: true,
} as const;

export const roleService = {
  async list({ page = 1, limit = 20, search = '' }: ListParams) {
    const skip = (page - 1) * limit;
    const where: any = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] }
      : {};

    const [roles, total] = await Promise.all([
      prisma.role.findMany({ where, skip, take: limit, include: roleInclude, orderBy: { createdAt: 'desc' } }),
      prisma.role.count({ where }),
    ]);

    return { data: roles, meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } };
  },

  async getById(id: string) {
    const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw ApiError.notFound('Role not found');
    return role;
  },

  async create(input: { name: string; description?: string; permissionIds?: string[] }) {
    const { permissionIds, ...rest } = input;
    const role = await prisma.role.create({
      data: {
        ...rest,
        permissions: permissionIds?.length ? { create: permissionIds.map((permissionId) => ({ permissionId })) } : undefined,
      },
      include: roleInclude,
    });
    return role;
  },

  async update(id: string, input: { name?: string; description?: string; permissionIds?: string[] }) {
    const existing = await this.getById(id);
    if (existing.isSystem && input.name && input.name !== existing.name) {
      throw ApiError.forbidden('Cannot rename a system role');
    }

    const { permissionIds, ...rest } = input;
    const data: any = { ...rest };

    if (permissionIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      data.permissions = { create: permissionIds.map((permissionId) => ({ permissionId })) };
    }

    return prisma.role.update({ where: { id }, data, include: roleInclude });
  },

  async remove(id: string) {
    const existing = await this.getById(id);
    if (existing.isSystem) throw ApiError.forbidden('Cannot delete a system role');
    if (existing.users.length > 0) throw ApiError.conflict('Cannot delete a role that is still assigned to users');
    await prisma.role.delete({ where: { id } });
  },
};
