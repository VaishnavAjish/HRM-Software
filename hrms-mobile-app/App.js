import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, UserPlus, FileText as FileTextIcon, Home, Ticket, User, Users, CalendarCheck, Grid3x3 } from 'lucide-react-native';
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
import { AdminAttendanceScreen } from './src/screens/admin/AdminAttendanceScreen';
import { AdminMoreScreen } from './src/screens/admin/AdminMoreScreen';
import { TicketScreen } from './src/screens/TicketScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { computeProfileCompletion } from './src/utils/profileCompletion';

const EMPLOYEE_TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'payslips', label: 'Payslips', icon: FileTextIcon },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'profile', label: 'Profile', icon: User },
];

// Profile is a tab for agents too: logout lives on that screen now, so without
// it an agent would have no way to sign out.
const AGENT_TABS = [
  { id: 'agent-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agent-appointments', label: 'Appointment', icon: UserPlus },
  { id: 'agent-trial', label: 'Trial Form', icon: FileTextIcon },
  { id: 'profile', label: 'Profile', icon: User },
];

// Web's admin nav has ~12 destinations across Dashboard/Employees/Salary/
// Attendance/Appointments/Trial Form/Tickets/admin accounts — a phone tab bar
// only fits ~5, so only the two highest-frequency actions (Employees,
// Attendance) get their own tab; everything else collapses into "More".
const ADMIN_TABS = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'admin-employees', label: 'Employees', icon: Users },
  { id: 'admin-attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'admin-more', label: 'More', icon: Grid3x3 },
  { id: 'profile', label: 'Profile', icon: User },
];

function MainAppContent() {
  const { theme } = useTheme();
  const { isAuthenticated, bootstrapping, role, user } = useAuth();
  const isAgent = role === 'agent';
  const isAdmin = role === 'admin';
  const [activeTab, setActiveTab] = useState(isAgent ? 'agent-dashboard' : isAdmin ? 'admin-dashboard' : 'home');
  // A ticket conversation takes over the whole screen, WhatsApp-style, so the
  // app chrome gets out of the way while one is open.
  const [immersive, setImmersive] = useState(false);

  React.useEffect(() => { setImmersive(false); }, [activeTab]);

  // Employees must finish their profile before they can use anything else —
  // mirrors the web's ProtectedRoute redirect-to-profile-until-100% behavior.
  // Agents and admins skip this gate entirely, same as agents already did.
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

  // Once a previously-incomplete profile crosses 100%, jump straight to Home
  // instead of leaving the employee stranded on the Profile tab.
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
        case 'admin-attendance':
          return <AdminAttendanceScreen />;
        case 'admin-more':
          return <AdminMoreScreen />;
        case 'profile':
          return <ProfileScreen />;
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
