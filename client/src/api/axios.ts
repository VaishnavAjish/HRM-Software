import axios, { AxiosError, AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                return this.client(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const response = await this.client.post('/auth/refresh');
            const { accessToken } = response.data.data;

            localStorage.setItem('accessToken', accessToken);
            this.client.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

            this.processQueue(null, accessToken);

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            }

            return this.client(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError, null);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: unknown, token: string | null = null): void {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token);
      }
    });
    this.failedQueue = [];
  }

  get<T = unknown>(url: string, config?: object): Promise<T> {
    return this.client.get<T>(url, config).then((res) => res.data);
  }

  post<T = unknown>(url: string, data?: object, config?: object): Promise<T> {
    return this.client.post<T>(url, data, config).then((res) => res.data);
  }

  put<T = unknown>(url: string, data?: object, config?: object): Promise<T> {
    return this.client.put<T>(url, data, config).then((res) => res.data);
  }

  patch<T = unknown>(url: string, data?: object, config?: object): Promise<T> {
    return this.client.patch<T>(url, data, config).then((res) => res.data);
  }

  delete<T = unknown>(url: string, config?: object): Promise<T> {
    return this.client.delete<T>(url, config).then((res) => res.data);
  }

  setAuthToken(token: string | null): void {
    if (token) {
      this.client.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem('accessToken', token);
    } else {
      delete this.client.defaults.headers.common.Authorization;
      localStorage.removeItem('accessToken');
    }
  }

  getAuthToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  clearAuth(): void {
    this.client.defaults.headers.common.Authorization = undefined;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

export const apiClient = new ApiClient();
export default apiClient;