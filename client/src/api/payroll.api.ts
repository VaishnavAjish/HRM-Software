import apiClient from './axios';
import { Payroll } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const payrollApi = {
  getAll: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Payroll>>('/payroll', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Payroll>>(`/payroll/${id}`),

  generatePayroll: (data: { periodStart: string; periodEnd: string; departmentId?: string }) =>
    apiClient.post<ApiResponse<Payroll[]>>('/payroll/generate', data),

  processPayroll: (id: string) =>
    apiClient.post<ApiResponse<Payroll>>(`/payroll/${id}/process`),

  markPaid: (id: string) =>
    apiClient.post<ApiResponse<Payroll>>(`/payroll/${id}/pay`),

  getForm16: (employeeId: string, year: number) =>
    apiClient.get<ApiResponse<{ url: string; year: number; employeeName: string; totalTax: number }>>(
      `/payroll/form16/${employeeId}`,
      { params: { year } }
    ),
};
