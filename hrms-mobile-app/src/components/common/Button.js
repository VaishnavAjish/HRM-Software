import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';

export function Button({
  title,
  onPress,
  variant = 'gradient', // 'gradient', 'emerald', 'rose', 'outline', 'ghost'
  size = 'medium',
  icon: IconComponent,
  loading = false,
  disabled = false,
  style,
}) {
  const { theme } = useTheme();

  const getGradientColors = () => {
    switch (variant) {
      case 'emerald':
        return theme.emeraldGradient;
      case 'amber':
        return theme.amberGradient;
      case 'rose':
        return theme.roseGradient;
      case 'accent':
        return theme.accentGradient;
      default:
        return theme.primaryGradient;
    }
  };

  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';

  const content = (
    <View style={styles.innerRow}>
      {loading ? (
        <ActivityIndicator color={isOutline || isGhost ? theme.primary : '#FFFFFF'} size="small" />
      ) : (
        <>
          {IconComponent && <IconComponent size={18} color={isOutline || isGhost ? theme.primary : '#FFFFFF'} style={styles.icon} />}
          <Text
            style={[
              styles.buttonText,
              { color: isOutline || isGhost ? theme.textPrimary : '#FFFFFF' },
              size === 'small' && styles.smallText,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (isOutline || isGhost) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
        style={[
          styles.buttonBase,
          styles[size],
          isOutline && { borderColor: theme.border, borderWidth: 1.5, backgroundColor: theme.surfaceElevated },
          disabled && { opacity: 0.5 },
          style,
        ]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.gradientContainer, disabled && { opacity: 0.5 }, style]}
    >
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.buttonBase, styles[size], shadows.glow(getGradientColors()[0])]}
      >
        {content}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonBase: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  large: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: 8,
  },
  buttonText: {
    ...typography.h4,
    fontWeight: '600',
  },
  smallText: {
    fontSize: 13,
  },
});
