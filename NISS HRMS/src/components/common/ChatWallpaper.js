import React from 'react';
import { ImageBackground, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const LIGHT_WALLPAPER = require('../../../assets/whatsapp_bg.png');
const DARK_WALLPAPER = require('../../../assets/whatsapp_bg_dark.png');

export function ChatWallpaper({ children, style }) {
  const { isDark } = useTheme();
  const source = isDark ? DARK_WALLPAPER : LIGHT_WALLPAPER;

  return (
    <ImageBackground
      source={source}
      resizeMode="cover"
      style={[styles.container, style]}
    >
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
