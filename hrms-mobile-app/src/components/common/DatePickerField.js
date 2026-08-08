import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Calendar } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

function parseValue(value) {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Value/onChange use plain 'YYYY-MM-DD' strings throughout the app, matching
// what the backend's date columns expect — this just wraps the native picker
// dialog around that same string contract.
export function DatePickerField({ label, value, onChange, disabled, helperText }) {
  const { theme } = useTheme();
  const [iosPickerOpen, setIosPickerOpen] = React.useState(false);

  const open = () => {
    if (disabled) return;
    const current = parseValue(value);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            onChange(toIsoDate(selectedDate));
          }
        },
      });
    } else {
      setIosPickerOpen(true);
    }
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text> : null}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={open}
        style={[
          styles.field,
          { borderColor: theme.border, backgroundColor: disabled ? theme.border : theme.surfaceElevated },
        ]}
      >
        <Calendar size={16} color={theme.textMuted} style={styles.icon} />
        <Text style={[styles.value, { color: value ? theme.textPrimary : theme.textMuted }]}>
          {value || 'Select date'}
        </Text>
      </TouchableOpacity>
      {helperText ? <Text style={[styles.helper, { color: theme.textMuted }]}>{helperText}</Text> : null}

      {Platform.OS === 'ios' && iosPickerOpen ? (
        <DateTimePicker
          value={parseValue(value)}
          mode="date"
          display="spinner"
          onChange={(event, selectedDate) => {
            setIosPickerOpen(false);
            if (event.type === 'set' && selectedDate) onChange(toIsoDate(selectedDate));
          }}
        />
      ) : null}
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  icon: {
    marginRight: 8,
  },
  value: {
    fontSize: 14,
  },
  helper: {
    ...typography.micro,
    marginTop: 4,
  },
});
