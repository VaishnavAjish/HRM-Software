import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Card } from './Card';

export function StatCard({ icon: IconComponent, label, value, tint = 'primary', style }) {
  const { theme } = useTheme();
  const tintColor = theme[tint] || theme.primary;
  const tintBg = theme[`${tint}Bg`] || tintColor + '20';

  return (
    <Card style={[styles.card, style]} elevated>
      <View style={[styles.iconWrap, { backgroundColor: tintBg }]}>
        {IconComponent && <IconComponent size={18} color={tintColor} />}
      </View>
      <Text style={[styles.value, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  value: {
    ...typography.h2,
    marginBottom: 2,
  },
  label: {
    ...typography.caption,
  },
});
