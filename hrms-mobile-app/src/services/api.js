import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://192.168.1.53:8000/api';

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

class ApiService {
  constructor() {
    this.token = null;
    this.tokenType = 'Bearer';
  }

  setToken(token, tokenType = 'Bearer') {
    this.token = token;
    this.tokenType = tokenType || 'Bearer';
  }

  clearToken() {
    this.token = null;
  }

  async request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (auth && this.token) {
      headers.Authorization = `${this.tokenType} ${this.token}`;
    }

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError('Could not reach the server. Check that you are on the office network.', 0, null);
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // No JSON body (e.g. 204/empty response) — fine.
    }

    if (!response.ok) {
      const message = data?.message || `Request failed (${response.status})`;
      throw new ApiError(message, response.status, data);
    }

    return data;
  }

  // ----- Auth -----
  login(email, password) {
    return this.request('/login', { method: 'POST', body: { email, password }, auth: false });
  }

  logout() {
    return this.request('/logout', { method: 'POST' }).catch(() => null);
  }

  getProfile() {
    return this.request('/profile');
  }

  updateProfile(payload) {
    const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
    return this.request('/profile-update', { method: 'POST', body: payload, isForm });
  }

  changePassword(payload) {
    return this.request('/change-password', { method: 'POST', body: payload });
  }

  // ----- Employee -----
  getDashboard() {
    return this.request('/dashboard');
  }

  getPayslips(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/salary-slip/get${qs ? `?${qs}` : ''}`);
  }

  getPayslipDetail(id) {
    return this.request(`/salary-slip/show/${id}`);
  }

  // ----- Agent -----
  getAgentCandidates() {
    return this.request('/agent/candidates');
  }

  // ----- Tickets (shared, any role) -----
  getTicketCategories() {
    return this.request('/tickets/categories');
  }

  getTickets(params = {}) {
    const qs = new URLSearchParams({ mine: 'true', ...params }).toString();
    return this.request(`/tickets/get${qs ? `?${qs}` : ''}`);
  }

  getTicket(id) {
    return this.request(`/tickets/show/${id}`);
  }

  createTicket(payload) {
    return this.request('/tickets/store', { method: 'POST', body: payload });
  }

  replyTicket(id, message) {
    return this.request(`/tickets/${id}/reply`, { method: 'POST', body: { message } });
  }

  reopenTicket(id, reason) {
    return this.request(`/tickets/${id}/reopen`, { method: 'POST', body: { reason } });
  }
}

export const api = new ApiService();

export const TOKEN_STORAGE_KEY = 'hrms_auth_session';

export async function persistSession(session) {
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(session));
}

export async function loadPersistedSession() {
  const raw = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearPersistedSession() {
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}
