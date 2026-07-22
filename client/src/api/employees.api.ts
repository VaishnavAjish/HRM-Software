import apiClient from './axios';
import { Employee } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const employeesApi = {
  getAll: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Employee>>('/employees', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Employee>>(`/employees/${id}`),

  create: (data: Partial<Employee>) =>
    apiClient.post<ApiResponse<Employee>>('/employees', data),

  update: (id: string, data: Partial<Employee>) =>
    apiClient.put<ApiResponse<Employee>>(`/employees/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<null>>(`/employees/${id}`),
};
