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

function MainAppContent() {
  const { theme } = useTheme();
  const { isAuthenticated, bootstrapping, role, user } = useAuth();
  const isAgent = role === 'agent';
  const [activeTab, setActiveTab] = useState(isAgent ? 'agent-dashboard' : 'home');

  // Employees must finish their profile before they can use anything else —
  // mirrors the web's ProtectedRoute redirect-to-profile-until-100% behavior.
  const profileComplete = isAgent || computeProfileCompletion(user).isComplete;

  React.useEffect(() => {
    const validTabs = (isAgent ? AGENT_TABS : EMPLOYEE_TABS).map((t) => t.id);
    if (!validTabs.includes(activeTab)) {
      setActiveTab(isAgent ? 'agent-dashboard' : 'home');
    }
  }, [role]);

  React.useEffect(() => {
    if (!isAgent && !profileComplete && activeTab !== 'profile') {
      setActiveTab('profile');
    }
  }, [isAgent, profileComplete, activeTab]);

  // Once a previously-incomplete profile crosses 100%, jump straight to Home
  // instead of leaving the employee stranded on the Profile tab.
  const prevProfileCompleteRef = React.useRef(profileComplete);
  React.useEffect(() => {
    if (!isAgent && !prevProfileCompleteRef.current && profileComplete) {
      setActiveTab('home');
    }
    prevProfileCompleteRef.current = profileComplete;
  }, [isAgent, profileComplete]);

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

    if (!profileComplete) {
      return <ProfileScreen requireCompletion />;
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

  const handleSelectTab = (tabId) => {
    if (!isAgent && !profileComplete && tabId !== 'profile') return;
    setActiveTab(tabId);
  };

  return (
    <View style={[styles.mainWrapper, { backgroundColor: theme.background }]}>
      <StatusBar style="dark" />

      <Header onNavigateProfile={() => setActiveTab('profile')} />

      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      <FloatingTabBar tabs={isAgent ? AGENT_TABS : EMPLOYEE_TABS} activeTab={activeTab} onSelectTab={handleSelectTab} />
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
