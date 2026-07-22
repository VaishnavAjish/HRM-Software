import apiClient from './axios';
import { User, LoginCredentials, RegisterData } from '../types/models';
import { ApiResponse } from '../types/api';

export const authApi = {
  login: (credentials: LoginCredentials) =>
    apiClient.post<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>>('/auth/login', credentials),

  register: (data: RegisterData) =>
    apiClient.post<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>>('/auth/register', data),

  logout: () =>
    apiClient.post<ApiResponse<null>>('/auth/logout'),

  getCurrentUser: () =>
    apiClient.get<ApiResponse<{ user: User }>>('/auth/me'),

  updateProfile: (data: Partial<User>) =>
    apiClient.put<ApiResponse<User>>('/auth/profile', data),

  forgotPassword: (email: string) =>
    apiClient.post<ApiResponse<null>>('/auth/forgot-password', { email }),
};
