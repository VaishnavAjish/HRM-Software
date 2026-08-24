import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export function SearchField({ value, onChangeText, placeholder = 'Search…', style }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }, style]}>
      <Search size={16} color={theme.textMuted} style={styles.icon} />
      <TextInput
        style={[styles.input, { color: theme.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <X size={16} color={theme.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
});
