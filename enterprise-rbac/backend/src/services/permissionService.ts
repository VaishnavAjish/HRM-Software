import { prisma } from '../config/db';
import { ApiError } from '../utils/apiError';
import { createCrudService } from './crudFactory';

export const permissionGroupService = createCrudService({
  delegate: prisma.permissionGroup,
  entityName: 'Permission Group',
  searchFields: ['name', 'description'],
  include: { permissions: true },
  orderBy: { name: 'asc' },
});

export const permissionService = {
  async list({ page = 1, limit = 50, search = '', filters = {} }: { page?: number; limit?: number; search?: string; filters?: Record<string, string | undefined> }) {
    const skip = (page - 1) * limit;
    const { resource, groupId } = filters;

    const where: any = {
      ...(search && {
        OR: [{ name: { contains: search, mode: 'insensitive' } }, { resource: { contains: search, mode: 'insensitive' } }],
      }),
      ...(resource && { resource }),
      ...(groupId && { groupId }),
    };

    const [data, total] = await Promise.all([
      prisma.permission.findMany({ where, skip, take: limit, include: { group: true }, orderBy: { resource: 'asc' } }),
      prisma.permission.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } };
  },

  async getById(id: string) {
    const permission = await prisma.permission.findUnique({ where: { id }, include: { group: true } });
    if (!permission) throw ApiError.notFound('Permission not found');
    return permission;
  },

  async create(input: { name: string; resource: string; action: string; description?: string; groupId?: string }) {
    return prisma.permission.create({ data: input, include: { group: true } });
  },

  async update(id: string, input: Partial<{ name: string; resource: string; action: string; description?: string; groupId?: string }>) {
    await this.getById(id);
    return prisma.permission.update({ where: { id }, data: input, include: { group: true } });
  },

  async remove(id: string) {
    await this.getById(id);
    await prisma.permission.delete({ where: { id } });
  },
};
