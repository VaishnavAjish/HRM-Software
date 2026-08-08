import {
  MOCK_USER_EMPLOYEE,
  MOCK_USER_AGENT,
  MOCK_ATTENDANCE,
  MOCK_LEAVES,
  MOCK_TICKETS,
  MOCK_AGENT_TICKETS,
  MOCK_FIELD_TASKS,
  MOCK_PAYSLIPS,
  MOCK_NOTIFICATIONS,
} from './mockData';

const BASE_URL = 'http://192.168.1.53:8000/api';

class ApiService {
  constructor() {
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async login(email, password, role = 'employee') {
    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.token || data.status) {
        const jwtToken = data.token;
        this.setToken(jwtToken);
        const userRole = (data.user?.role || role).toLowerCase();
        return {
          success: true,
          user: {
            ...data.user,
            role: userRole,
          },
          token: jwtToken,
          message: data.message || 'Login successful',
        };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid credentials',
        };
      }
    } catch (e) {
      console.log('Real backend connection warning, using demo auth mode:', e.message);
    }
    // Fallback Mock Login for testing & offline mode
    const user = role === 'agent' ? MOCK_USER_AGENT : MOCK_USER_EMPLOYEE;
    this.setToken('mock-jwt-token-123456');
    return { success: true, user: { ...user, role }, token: this.token };
  }

  async getProfile() {
    try {
      const res = await fetch(`${BASE_URL}/profile`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && data.user) {
        return data.user;
      } else if (data.id || data.emp_code) {
        return data;
      }
    } catch (e) {
      console.log('Profile API error, fallback to mock profile:', e.message);
    }
    return MOCK_USER_EMPLOYEE;
  }

  async updateProfile(profileData) {
    try {
      const res = await fetch(`${BASE_URL}/profile-update`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      return { success: data.status || true, data };
    } catch (e) {
      console.log('Update profile error:', e.message);
      return { success: true, data: profileData };
    }
  }

  async getAttendance() {
    try {
      const res = await fetch(`${BASE_URL}/dashboard`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.attendance) {
        return data.attendance;
      }
    } catch (e) {
      console.log('Attendance dashboard API error:', e.message);
    }
    return MOCK_ATTENDANCE;
  }

  async punchIn(location = 'Verified GPS - NISS HQ') {
    try {
      const res = await fetch(`${BASE_URL}/attendance/cell`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ status: 'P', location }),
      });
      const data = await res.json();
      MOCK_ATTENDANCE.isPunchedIn = true;
      MOCK_ATTENDANCE.punchInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, attendance: MOCK_ATTENDANCE, data };
    } catch (e) {
      MOCK_ATTENDANCE.isPunchedIn = true;
      MOCK_ATTENDANCE.punchInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, attendance: MOCK_ATTENDANCE };
    }
  }

  async punchOut() {
    try {
      const res = await fetch(`${BASE_URL}/attendance/cell`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ status: 'A' }),
      });
      const data = await res.json();
      MOCK_ATTENDANCE.isPunchedIn = false;
      MOCK_ATTENDANCE.punchOutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, attendance: MOCK_ATTENDANCE, data };
    } catch (e) {
      MOCK_ATTENDANCE.isPunchedIn = false;
      MOCK_ATTENDANCE.punchOutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { success: true, attendance: MOCK_ATTENDANCE };
    }
  }

  async getPayslips() {
    try {
      const res = await fetch(`${BASE_URL}/salary-slip/get`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && Array.isArray(data.data)) {
        return data.data;
      }
    } catch (e) {
      console.log('Payslip API fetch error:', e.message);
    }
    return MOCK_PAYSLIPS;
  }

  async getPayslipDetail(id) {
    try {
      const res = await fetch(`${BASE_URL}/salary-slip/show/${id}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && data.data) {
        return data.data;
      }
    } catch (e) {
      console.log('Payslip detail error:', e.message);
    }
    return MOCK_PAYSLIPS.find(p => p.id === id) || MOCK_PAYSLIPS[0];
  }

  async getTickets() {
    try {
      const res = await fetch(`${BASE_URL}/tickets/get`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && Array.isArray(data.data)) {
        return data.data;
      }
    } catch (e) {
      console.log('Tickets API fetch error:', e.message);
    }
    return MOCK_TICKETS;
  }

  async createTicket(ticketData) {
    try {
      const res = await fetch(`${BASE_URL}/tickets/store`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(ticketData),
      });
      const data = await res.json();
      if (data.status) {
        return { success: true, ticket: data.data };
      }
    } catch (e) {
      console.log('Create ticket error:', e.message);
    }
    const newTicket = {
      id: `TK-${Math.floor(4100 + Math.random() * 900)}`,
      category: ticketData.category || 'General Support',
      subject: ticketData.subject,
      description: ticketData.description,
      department: ticketData.department || 'IT Infrastructure',
      priority: ticketData.priority || 'Medium',
      status: 'Open',
      createdDate: 'Just now',
      commentsCount: 0,
    };
    MOCK_TICKETS.unshift(newTicket);
    return { success: true, ticket: newTicket };
  }

  async replyTicket(ticketId, message) {
    try {
      const res = await fetch(`${BASE_URL}/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      return { success: data.status || true, data };
    } catch (e) {
      return { success: true };
    }
  }

  async getAgentCandidates() {
    try {
      const res = await fetch(`${BASE_URL}/agent/candidates`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && Array.isArray(data.data)) {
        return data.data;
      }
    } catch (e) {
      console.log('Agent candidates API fetch error:', e.message);
    }
    return MOCK_AGENT_TICKETS;
  }

  async createAppointment(appointmentData) {
    try {
      const res = await fetch(`${BASE_URL}/appointment`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(appointmentData),
      });
      const data = await res.json();
      return { success: data.status || true, data };
    } catch (e) {
      console.log('Create appointment error:', e.message);
      return { success: true, data: appointmentData };
    }
  }

  async getTrialForms() {
    try {
      const res = await fetch(`${BASE_URL}/trial-form/list`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.status && Array.isArray(data.data)) {
        return data.data;
      }
    } catch (e) {
      console.log('Trial form API fetch error:', e.message);
    }
    return MOCK_FIELD_TASKS;
  }

  async createTrialForm(trialData) {
    try {
      const res = await fetch(`${BASE_URL}/trial-form/store`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(trialData),
      });
      const data = await res.json();
      return { success: data.status || true, data };
    } catch (e) {
      console.log('Create trial form error:', e.message);
      return { success: true, data: trialData };
    }
  }

  async getLeaves() {
    return MOCK_LEAVES;
  }

  async applyLeave(leaveData) {
    const newLeave = {
      id: `LV-${Math.floor(100 + Math.random() * 900)}`,
      type: leaveData.type || 'Casual Leave',
      dates: `${leaveData.startDate} - ${leaveData.endDate}`,
      reason: leaveData.reason,
      status: 'Pending Approval',
      approvedBy: 'HR Manager',
      appliedOn: 'Today',
    };
    MOCK_LEAVES.applications.unshift(newLeave);
    return { success: true, leave: newLeave };
  }

  async getNotifications() {
    return MOCK_NOTIFICATIONS;
  }

  async markNotificationRead(id) {
    const notif = MOCK_NOTIFICATIONS.find((n) => n.id === id);
    if (notif) notif.read = true;
    return { success: true };
  }
}

export const api = new ApiService();
