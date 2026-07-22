import apiClient from './axios';
import { ApiResponse } from '../types/api';

export interface HRDashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  newHiresThisMonth: number;
  turnoverRate: number;
  attendanceRate: number;
  pendingLeaves: number;
  openPositions: number;
  payrollSummary: {
    totalGross: number;
    totalNet: number;
    month: string;
  };
  departmentHeadcounts: Array<{ name: string; count: number }>;
  monthlyAttendance: Array<{ month: string; present: number; absent: number; late: number }>;
}

export const reportsApi = {
  getDashboardMetrics: () =>
    apiClient.get<ApiResponse<HRDashboardMetrics>>('/reports/dashboard'),

  exportReport: (reportType: string, format: 'csv' | 'pdf' = 'csv') =>
    apiClient.get<Blob>(`/reports/export`, { params: { reportType, format }, responseType: 'blob' }),
};
