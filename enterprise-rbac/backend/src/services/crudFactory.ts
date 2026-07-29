import { ApiError } from '../utils/apiError';

interface Delegate {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
}

interface CrudFactoryOptions {
  delegate: Delegate;
  entityName: string;
  searchFields?: string[];
  include?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  filters?: Record<string, string | undefined>;
}

export function createCrudService({ delegate, entityName, searchFields = [], include, orderBy }: CrudFactoryOptions) {
  return {
    async list({ page = 1, limit = 20, search = '', filters = {} }: ListParams) {
      const skip = (page - 1) * limit;

      const where: any = {
        ...(search && searchFields.length
          ? { OR: searchFields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
          : {}),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')),
      };

      const [data, total] = await Promise.all([
        delegate.findMany({ where, skip, take: limit, include, orderBy: orderBy ?? { createdAt: 'desc' } }),
        delegate.count({ where }),
      ]);

      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } };
    },

    async getById(id: string) {
      const record = await delegate.findUnique({ where: { id }, include });
      if (!record) throw ApiError.notFound(`${entityName} not found`);
      return record;
    },

    async create(data: any) {
      return delegate.create({ data, include });
    },

    async update(id: string, data: any) {
      await this.getById(id);
      return delegate.update({ where: { id }, data, include });
    },

    async remove(id: string) {
      await this.getById(id);
      return delegate.delete({ where: { id } });
    },
  };
}
