import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Button } from './Button';

export function EmptyState({ icon: IconComponent, title, message, actionLabel, onAction, tone = 'default' }) {
  const { theme } = useTheme();
  const iconColor = tone === 'error' ? theme.rose : theme.textMuted;
  const iconBg = tone === 'error' ? theme.roseBg : theme.surfaceElevated;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        {IconComponent && <IconComponent size={28} color={iconColor} />}
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="outline" size="small" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    ...typography.h4,
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
  },
  action: {
    marginTop: 16,
  },
});
