import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { shadows } from '../../theme';

export function Card({ children, style, glass = false, elevated = false, ...props }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: glass ? theme.surfaceGlass : elevated ? theme.surfaceElevated : theme.surfaceCard,
          borderColor: theme.border,
        },
        elevated ? shadows.card : shadows.glass,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
