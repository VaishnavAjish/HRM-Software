import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, UserPlus, FileText as FileTextIcon, Home, Ticket, User, Users, CalendarCheck, Wallet, FileCheck } from 'lucide-react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { Header } from './src/components/common/Header';
import { FloatingTabBar } from './src/components/common/FloatingTabBar';
import { LoadingView } from './src/components/common/LoadingView';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { HomeScreen } from './src/screens/employee/HomeScreen';
import { PayslipScreen } from './src/screens/employee/PayslipScreen';
import { AgentDashboardScreen } from './src/screens/agent/AgentDashboardScreen';
import { AgentAppointmentsScreen } from './src/screens/agent/AgentAppointmentsScreen';
import { AgentTrialScreen } from './src/screens/agent/AgentTrialScreen';
import { AdminDashboardScreen } from './src/screens/admin/AdminDashboardScreen';
import { AdminEmployeesScreen } from './src/screens/admin/AdminEmployeesScreen';
import { AdminSalaryScreen } from './src/screens/admin/AdminSalaryScreen';
import { AdminFormsScreen } from './src/screens/admin/AdminFormsScreen';
import { AdminMoreScreen } from './src/screens/admin/AdminMoreScreen';
import { AdminTicketsScreen } from './src/screens/admin/AdminTicketsScreen';
import { AdminAttendanceScreen } from './src/screens/admin/AdminAttendanceScreen';
import { AdminShiftsScreen } from './src/screens/admin/AdminShiftsScreen';
import { AdminAccountsScreen } from './src/screens/admin/AdminAccountsScreen';
import { AdminTdsScreen } from './src/screens/admin/AdminTdsScreen';
import { AdminHrScreen } from './src/screens/admin/AdminHrScreen';
import { TicketScreen } from './src/screens/TicketScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { computeProfileCompletion } from './src/utils/profileCompletion';

function MoreIcon({ size = 20, color = '#64748B' }) {
  const s = Math.round(size * 0.32);
  const g = Math.round(size * 0.16);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: g }}>
        <View style={{ width: s, height: s, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: s, height: s, borderRadius: 2, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', gap: g, marginTop: g }}>
        <View style={{ width: s, height: s, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: s, height: s, borderRadius: 2, backgroundColor: color }} />
      </View>
    </View>
  );
}

const EMPLOYEE_TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'payslips', label: 'Payslips', icon: FileTextIcon },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'profile', label: 'Profile', icon: User },
];

const AGENT_TABS = [
  { id: 'agent-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agent-appointments', label: 'Appointment', icon: UserPlus },
  { id: 'agent-trial', label: 'Trial Form', icon: FileTextIcon },
  { id: 'profile', label: 'Profile', icon: User },
];

const ADMIN_TABS = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin-employees', label: 'Employees', icon: Users },
  { id: 'admin-salary', label: 'Salary', icon: Wallet },
  { id: 'admin-forms', label: 'Forms', icon: FileCheck },
  { id: 'admin-more', label: 'More', icon: MoreIcon },
];

function MainAppContent() {
  const { theme } = useTheme();
  const { isAuthenticated, bootstrapping, role, user } = useAuth();
  const isAgent = role === 'agent';
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState(isAgent ? 'agent-dashboard' : isAdmin ? 'admin-dashboard' : 'home');
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    setImmersive(false);
  }, [activeTab]);

  const profileComplete = isAgent || isAdmin || computeProfileCompletion(user).isComplete;

  // Force Admin to land directly on Dashboard on login or role load
  const hasInitializedRole = useRef(false);
  useEffect(() => {
    if (isAuthenticated && role) {
      if (isAdmin && !hasInitializedRole.current) {
        setActiveTab('admin-dashboard');
        hasInitializedRole.current = true;
      } else if (isAgent && !hasInitializedRole.current) {
        setActiveTab('agent-dashboard');
        hasInitializedRole.current = true;
      }
    }
  }, [isAuthenticated, role, isAdmin, isAgent]);

  useEffect(() => {
    if (!isAgent && !isAdmin && !profileComplete && activeTab !== 'profile') {
      setActiveTab('profile');
    }
  }, [isAgent, isAdmin, profileComplete, activeTab]);

  if (bootstrapping) {
    return <LoadingView fullscreen label="Signing you in…" />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderActiveScreen = () => {
    if (isAgent) {
      switch (activeTab) {
        case 'agent-appointments':
          return <AgentAppointmentsScreen />;
        case 'agent-trial':
          return <AgentTrialScreen />;
        case 'profile':
          return <ProfileScreen onBack={() => setActiveTab('agent-dashboard')} />;
        default:
          return <AgentDashboardScreen />;
      }
    }

    if (isAdmin) {
      switch (activeTab) {
        case 'admin-employees':
          return <AdminEmployeesScreen />;
        case 'admin-salary':
          return <AdminSalaryScreen />;
        case 'admin-forms':
          return <AdminFormsScreen onImmersiveChange={setImmersive} />;
        case 'admin-tickets':
          return <AdminTicketsScreen onImmersiveChange={setImmersive} onBack={() => setActiveTab('admin-more')} />;
        case 'admin-attendance':
          return <AdminAttendanceScreen onBack={() => setActiveTab('admin-more')} />;
        case 'admin-shifts':
          return <AdminShiftsScreen onBack={() => setActiveTab('admin-more')} />;
        case 'admin-accounts':
          return <AdminAccountsScreen onBack={() => setActiveTab('admin-more')} />;
        case 'admin-tds':
          return <AdminTdsScreen onBack={() => setActiveTab('admin-more')} />;
        case 'admin-hr':
          return <AdminHrScreen onBack={() => setActiveTab('admin-more')} onNavigateTab={setActiveTab} />;
        case 'admin-more':
          return <AdminMoreScreen onNavigateTab={setActiveTab} />;
        case 'profile':
          return <ProfileScreen onBack={() => setActiveTab('admin-dashboard')} />;
        case 'admin-dashboard':
        default:
          return <AdminDashboardScreen />;
      }
    }

    if (!profileComplete) {
      return <ProfileScreen requireCompletion />;
    }

    switch (activeTab) {
      case 'payslips':
        return <PayslipScreen />;
      case 'tickets':
        return <TicketScreen onImmersiveChange={setImmersive} />;
      case 'profile':
        return <ProfileScreen onBack={() => setActiveTab('home')} />;
      default:
        return <HomeScreen onNavigateTab={setActiveTab} />;
    }
  };

  const handleSelectTab = (tabId) => {
    if (!isAgent && !isAdmin && !profileComplete && tabId !== 'profile') return;
    setActiveTab(tabId);
  };

  return (
    <View style={[styles.mainWrapper, { backgroundColor: theme.background }]}>
      <StatusBar style="dark" />

      {!immersive ? (
        <Header
          onNavigateProfile={() => setActiveTab('profile')}
        />
      ) : null}

      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {!immersive ? (
        <FloatingTabBar
          tabs={isAgent ? AGENT_TABS : isAdmin ? ADMIN_TABS : EMPLOYEE_TABS}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
        />
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainAppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
});
