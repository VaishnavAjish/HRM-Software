import React, { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { colors } from '../theme';

const ThemeContext = createContext();

// Light mode only — the app doesn't offer a dark theme.
export function ThemeProvider({ children }) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync(colors.light.background).catch(() => {});
    NavigationBar.setButtonStyleAsync('dark').catch(() => {});
  }, []);

  return <ThemeContext.Provider value={{ theme: colors.light }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
