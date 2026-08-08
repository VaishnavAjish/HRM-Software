import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

// Sits clear of the floating tab bar (bottom:16 + ~64px tall + breathing room).
const TAB_BAR_CLEARANCE = 96;

export function Fab({ onPress, icon: Icon = Plus, accessibilityLabel = 'Create new' }) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.wrap}
    >
      <LinearGradient
        colors={theme.primaryGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fab, { shadowColor: theme.primary }]}
      >
        <Icon size={26} color="#FFFFFF" strokeWidth={2.4} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: TAB_BAR_CLEARANCE,
    borderRadius: 19,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
});
