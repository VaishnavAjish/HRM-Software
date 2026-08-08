import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

export function LoadingView({ label = 'Loading…', fullscreen = false }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, fullscreen && { flex: 1, backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  label: {
    ...typography.body,
    marginTop: 12,
  },
});
