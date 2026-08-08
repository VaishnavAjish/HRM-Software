import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

export function FormInput({ label, value, onChangeText, multiline, disabled, helperText, ...rest }) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text> : null}
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: disabled ? theme.textMuted : theme.textPrimary,
            backgroundColor: disabled ? theme.border : theme.surfaceElevated,
            borderColor: theme.border,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        editable={!disabled}
        {...rest}
      />
      {helperText ? <Text style={[styles.helper, { color: theme.textMuted }]}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    ...typography.caption,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  helper: {
    ...typography.micro,
    marginTop: 4,
  },
});
