import React, { useState } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { Header } from './src/components/common/Header';
import { FloatingTabBar } from './src/components/common/FloatingTabBar';
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { HomeScreen } from './src/screens/employee/HomeScreen';
import { AttendanceScreen } from './src/screens/employee/AttendanceScreen';
import { LeaveScreen } from './src/screens/employee/LeaveScreen';
import { TicketScreen } from './src/screens/employee/TicketScreen';
import { PayslipScreen } from './src/screens/employee/PayslipScreen';
import { ProfileScreen } from './src/screens/employee/ProfileScreen';
import { AgentDashboardScreen } from './src/screens/agent/AgentDashboardScreen';
import { AgentTicketsScreen } from './src/screens/agent/AgentTicketsScreen';
import { FieldTaskScreen } from './src/screens/agent/FieldTaskScreen';
import { NotificationCenterScreen } from './src/screens/notifications/NotificationCenterScreen';

function MainAppContent() {
  const { theme, isDark } = useTheme();
  const { isAuthenticated, role } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [notificationsVisible, setNotificationsVisible] = useState(false);

  // Auto-switch tab if role changes
  React.useEffect(() => {
    if (role === 'agent' && !['agent-dashboard', 'agent-tickets', 'field-tasks', 'profile'].includes(activeTab)) {
      setActiveTab('agent-dashboard');
    } else if (role === 'employee' && !['home', 'attendance', 'leave', 'tickets', 'payslips', 'profile'].includes(activeTab)) {
      setActiveTab('home');
    }
  }, [role]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      // Employee Screens
      case 'home':
        return <HomeScreen onNavigateTab={setActiveTab} />;
      case 'attendance':
        return <AttendanceScreen />;
      case 'leave':
        return <LeaveScreen />;
      case 'tickets':
        return <TicketScreen />;
      case 'payslips':
        return <PayslipScreen />;

      // Agent Screens
      case 'agent-dashboard':
        return <AgentDashboardScreen onNavigateTab={setActiveTab} />;
      case 'agent-tickets':
        return <AgentTicketsScreen />;
      case 'field-tasks':
        return <FieldTaskScreen />;

      // Shared Screen
      case 'profile':
        return <ProfileScreen />;

      default:
        return <HomeScreen onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <View style={[styles.mainWrapper, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Main Header */}
      <Header
        onOpenNotifications={() => setNotificationsVisible(true)}
        onNavigateProfile={() => setActiveTab('profile')}
      />

      {/* Screen Body */}
      <View style={styles.screenContainer}>
        {renderActiveScreen()}
      </View>

      {/* Floating Bottom Tab Bar */}
      <FloatingTabBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Notification Center Modal Overlay */}
      <Modal
        visible={notificationsVisible}
        animationType="slide"
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <NotificationCenterScreen onClose={() => setNotificationsVisible(false)} />
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <NotificationProvider>
          <MainAppContent />
        </NotificationProvider>
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
