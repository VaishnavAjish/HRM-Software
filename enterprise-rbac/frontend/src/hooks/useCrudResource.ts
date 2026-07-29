import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PaginatedResponse } from '../types';

interface UseCrudResourceParams {
  page: number;
  limit?: number;
  search?: string;
  filters?: Record<string, string | undefined>;
}

export function useCrudResource<T>(resourceKey: string, basePath: string, params: UseCrudResourceParams) {
  const queryClient = useQueryClient();
  const { page, limit = 20, search = '', filters = {} } = params;

  const listQuery = useQuery({
    queryKey: [resourceKey, { page, limit, search, filters }],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<T>>(basePath, {
        params: { page, limit, search: search || undefined, ...filters },
      });
      return res.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [resourceKey] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(basePath, payload),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`${basePath}/${id}`, payload),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${basePath}/${id}`),
    onSuccess: invalidate,
  });

  const bulkRemoveMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.delete(`${basePath}/${id}`))),
    onSuccess: invalidate,
  });

  return { listQuery, createMutation, updateMutation, removeMutation, bulkRemoveMutation };
}
