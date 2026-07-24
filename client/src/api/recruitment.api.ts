import apiClient from './axios';
import { Job, Candidate } from '../types/models';
import { ApiResponse, PaginatedResponse, QueryParams } from '../types/api';

export const recruitmentApi = {
  getJobs: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Job>>('/recruitment/jobs', { params }),

  createJob: (data: Partial<Job>) =>
    apiClient.post<ApiResponse<Job>>('/recruitment/jobs', data),

  getCandidates: (params?: QueryParams) =>
    apiClient.get<PaginatedResponse<Candidate>>('/recruitment/candidates', { params }),

  createCandidate: (data: Partial<Candidate>) =>
    apiClient.post<ApiResponse<Candidate>>('/recruitment/candidates', data),

  updateCandidateStatus: (id: string, status: Candidate['status']) =>
    apiClient.patch<ApiResponse<Candidate>>(`/recruitment/candidates/${id}/status`, { status }),
};
