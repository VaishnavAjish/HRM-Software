import apiClient from './axios';
import { Leave, LeaveType } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const leaveApi = {
  getAll: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Leave>>('/leaves', { params }),

  getLeaveTypes: () =>
    apiClient.get<ApiResponse<LeaveType[]>>('/leaves/types'),

  applyLeave: (data: Partial<Leave>) =>
    apiClient.post<ApiResponse<Leave>>('/leaves', data),

  approveLeave: (id: string, notes?: string) =>
    apiClient.post<ApiResponse<Leave>>(`/leaves/${id}/approve`, { notes }),

  rejectLeave: (id: string, reason: string) =>
    apiClient.post<ApiResponse<Leave>>(`/leaves/${id}/reject`, { reason }),

  getBalances: (employeeId?: string) =>
    apiClient.get<ApiResponse<Array<{ leaveType: LeaveType; used: number; remaining: number }>>>(
      '/leaves/balances',
      { params: { employeeId } }
    ),
};
