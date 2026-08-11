import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CalendarCheck } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { EmptyState } from '../../components/common/EmptyState';

// Placeholder — replaced with the monthly attendance grid later in Phase 1.
export function AdminAttendanceScreen() {
  const { theme } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Attendance</Text>
      <EmptyState icon={CalendarCheck} title="Coming soon" message="The attendance grid is being built later in this rollout." />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, paddingTop: 50 },
  title: { ...typography.h2, marginBottom: 12 },
});
