import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

export function Badge({ label, variant = 'primary', size = 'medium', style }) {
  const { theme } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'emerald':
      case 'Approved':
      case 'Resolved':
      case 'Present':
      case 'Low':
        return { bg: theme.emeraldBg, text: theme.emerald, border: theme.emerald + '40' };
      case 'amber':
      case 'Pending':
      case 'In Progress':
      case 'Medium':
      case 'Late Check-in':
        return { bg: theme.amberBg, text: theme.amber, border: theme.amber + '40' };
      case 'rose':
      case 'High':
      case 'Urgent':
      case 'Absent':
      case 'Escalated':
        return { bg: theme.roseBg, text: theme.rose, border: theme.rose + '40' };
      case 'violet':
      case 'Open':
      case 'Casual Leave':
        return { bg: theme.violetBg, text: theme.violet, border: theme.violet + '40' };
      case 'cyan':
      case 'Earned Leave':
        return { bg: theme.cyanBg, text: theme.cyan, border: theme.cyan + '40' };
      default:
        return { bg: theme.primary + '20', text: theme.primary, border: theme.primary + '40' };
    }
  };

  const currentVariant = getVariantStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: currentVariant.bg,
          borderColor: currentVariant.border,
          paddingHorizontal: size === 'small' ? 8 : 12,
          paddingVertical: size === 'small' ? 2 : 4,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            color: currentVariant.text,
            fontSize: size === 'small' ? 10 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
});
