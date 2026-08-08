import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, UserPlus, FileText as FileTextIcon, Home, Ticket, User } from 'lucide-react-native';
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
import { TicketScreen } from './src/screens/TicketScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

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
];

function MainAppContent() {
  const { theme, isDark } = useTheme();
  const { isAuthenticated, bootstrapping, role } = useAuth();
  const isAgent = role === 'agent';
  const [activeTab, setActiveTab] = useState(isAgent ? 'agent-dashboard' : 'home');

  React.useEffect(() => {
    const validTabs = (isAgent ? AGENT_TABS : EMPLOYEE_TABS).map((t) => t.id);
    if (!validTabs.includes(activeTab)) {
      setActiveTab(isAgent ? 'agent-dashboard' : 'home');
    }
  }, [role]);

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
        default:
          return <AgentDashboardScreen />;
      }
    }

    switch (activeTab) {
      case 'payslips':
        return <PayslipScreen />;
      case 'tickets':
        return <TicketScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <View style={[styles.mainWrapper, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Header onNavigateProfile={isAgent ? undefined : () => setActiveTab('profile')} />

      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      <FloatingTabBar tabs={isAgent ? AGENT_TABS : EMPLOYEE_TABS} activeTab={activeTab} onSelectTab={setActiveTab} />
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
