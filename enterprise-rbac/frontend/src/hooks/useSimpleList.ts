import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PaginatedResponse } from '../types';

export function useSimpleList<T>(basePath: string, enabled = true) {
  return useQuery({
    queryKey: [basePath, 'simple-list'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<T>>(basePath, { params: { limit: 200 } });
      return res.data.data;
    },
    enabled,
  });
}
