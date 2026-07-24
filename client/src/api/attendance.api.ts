import apiClient from './axios';
import { Attendance } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const attendanceApi = {
  getAll: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Attendance>>('/attendance', { params }),

  getTodayStatus: () =>
    apiClient.get<ApiResponse<Attendance | null>>('/attendance/today'),

  checkIn: (data?: { notes?: string; location?: string }) =>
    apiClient.post<ApiResponse<Attendance>>('/attendance/check-in', data),

  checkOut: (data?: { notes?: string }) =>
    apiClient.post<ApiResponse<Attendance>>('/attendance/check-out', data),

  getEmployeeStats: (employeeId?: string) =>
    apiClient.get<ApiResponse<{ totalDays: number; presentDays: number; absentDays: number; lateDays: number }>>(
      '/attendance/stats',
      { params: { employeeId } }
    ),
};
