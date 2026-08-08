import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { Header } from './src/components/common/Header';
import { FloatingTabBar } from './src/components/common/FloatingTabBar';
import { LoadingView } from './src/components/common/LoadingView';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { HomeScreen } from './src/screens/employee/HomeScreen';
import { PayslipScreen } from './src/screens/employee/PayslipScreen';
import { AgentDashboardScreen } from './src/screens/agent/AgentDashboardScreen';
import { TicketScreen } from './src/screens/TicketScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

function MainAppContent() {
  const { theme, isDark } = useTheme();
  const { isAuthenticated, bootstrapping, role } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const isAgent = role === 'agent';

  React.useEffect(() => {
    if (!isAgent && !['home', 'payslips', 'tickets', 'profile'].includes(activeTab)) {
      setActiveTab('home');
    }
  }, [role]);

  if (bootstrapping) {
    return <LoadingView fullscreen label="Signing you in…" />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Agents get a single, self-contained screen (candidates + appointment/trial
  // forms) — there's no ticket or profile module for this role, so no tab bar.
  const renderActiveScreen = () => {
    if (isAgent) return <AgentDashboardScreen />;

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

      {!isAgent && <FloatingTabBar activeTab={activeTab} onSelectTab={setActiveTab} />}
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
