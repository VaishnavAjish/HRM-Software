import React, { useState } from 'react';
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

import { AdminTicketsScreen } from './src/screens/admin/AdminTicketsScreen';

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
  { id: 'admin-tickets', label: 'Tickets', icon: Ticket },
];

function MainAppContent() {
  const { theme } = useTheme();
  const { isAuthenticated, bootstrapping, role, user } = useAuth();
  const isAgent = role === 'agent';
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState(isAgent ? 'agent-dashboard' : isAdmin ? 'admin-dashboard' : 'home');
  const [immersive, setImmersive] = useState(false);

  React.useEffect(() => {
    setImmersive(false);
  }, [activeTab]);

  const profileComplete = isAgent || isAdmin || computeProfileCompletion(user).isComplete;

  React.useEffect(() => {
    const tabsForRole = isAgent ? AGENT_TABS : isAdmin ? ADMIN_TABS : EMPLOYEE_TABS;
    const validTabs = tabsForRole.map((t) => t.id);
    if (!validTabs.includes(activeTab)) {
      setActiveTab(isAgent ? 'agent-dashboard' : isAdmin ? 'admin-dashboard' : 'home');
    }
  }, [role]);

  React.useEffect(() => {
    if (!isAgent && !isAdmin && !profileComplete && activeTab !== 'profile') {
      setActiveTab('profile');
    }
  }, [isAgent, isAdmin, profileComplete, activeTab]);

  const prevProfileCompleteRef = React.useRef(profileComplete);
  React.useEffect(() => {
    if (!isAgent && !isAdmin && !prevProfileCompleteRef.current && profileComplete) {
      setActiveTab('home');
    }
    prevProfileCompleteRef.current = profileComplete;
  }, [isAgent, isAdmin, profileComplete]);

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
          return <ProfileScreen />;
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
          return <AdminTicketsScreen onImmersiveChange={setImmersive} />;
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
        return <ProfileScreen />;
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

      {!immersive ? <Header onNavigateProfile={() => setActiveTab('profile')} /> : null}

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
