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
    this.useMockFallback = true;
  }

  setToken(token) {
    this.token = token;
  }

  async login(email, password, role = 'employee') {
    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.token) {
        this.setToken(data.token);
        return { success: true, user: data.user, token: data.token };
      }
    } catch (e) {
      console.log('API connection failed, falling back to instant mock demo:', e.message);
    }
    // Fallback Mock Login
    const user = role === 'agent' ? MOCK_USER_AGENT : MOCK_USER_EMPLOYEE;
    this.setToken('mock-jwt-token-123456');
    return { success: true, user, token: this.token };
  }

  async getProfile() {
    return MOCK_USER_EMPLOYEE;
  }

  async getAttendance() {
    return MOCK_ATTENDANCE;
  }

  async punchIn(location = 'HQ GPS Location') {
    MOCK_ATTENDANCE.isPunchedIn = true;
    MOCK_ATTENDANCE.punchInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { success: true, attendance: MOCK_ATTENDANCE };
  }

  async punchOut() {
    MOCK_ATTENDANCE.isPunchedIn = false;
    MOCK_ATTENDANCE.punchOutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { success: true, attendance: MOCK_ATTENDANCE };
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

  async getTickets() {
    return MOCK_TICKETS;
  }

  async createTicket(ticketData) {
    const newTicket = {
      id: `TK-${Math.floor(4100 + Math.random() * 900)}`,
      category: ticketData.category || 'General Support',
      subject: ticketData.subject,
      description: ticketData.description,
      department: ticketData.department || 'IT Infrastructure',
      priority: ticketData.priority || 'Medium',
      status: 'Open',
      assignedTo: 'Queue Assignee',
      createdDate: 'Just now',
      slaTimeRemaining: '24h remaining',
      commentsCount: 0,
      lastUpdate: 'Ticket created',
    };
    MOCK_TICKETS.unshift(newTicket);
    return { success: true, ticket: newTicket };
  }

  async getAgentTickets() {
    return MOCK_AGENT_TICKETS;
  }

  async getFieldTasks() {
    return MOCK_FIELD_TASKS;
  }

  async getPayslips() {
    return MOCK_PAYSLIPS;
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
