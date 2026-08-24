import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

// options: [{ value, label }] or plain strings (used as both value+label)
export function FormSelect({ label, value, onChange, options, disabled }) {
  const { theme } = useTheme();
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text> : null}
      <View style={styles.chipRow}>
        {normalized.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              disabled={disabled}
              style={[
                styles.chip,
                { borderColor: theme.border },
                active && { backgroundColor: theme.primary, borderColor: theme.primary },
                disabled && { opacity: 0.5 },
              ]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.textPrimary }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    ...typography.caption,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
