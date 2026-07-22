import apiClient from './axios';
import { PerformanceReview } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const performanceApi = {
  getReviews: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<PerformanceReview>>('/performance/reviews', { params }),

  createReview: (data: Partial<PerformanceReview>) =>
    apiClient.post<ApiResponse<PerformanceReview>>('/performance/reviews', data),

  updateReview: (id: string, data: Partial<PerformanceReview>) =>
    apiClient.put<ApiResponse<PerformanceReview>>(`/performance/reviews/${id}`, data),
};
