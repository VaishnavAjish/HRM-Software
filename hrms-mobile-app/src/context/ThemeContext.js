import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { colors } from '../theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const themeColors = isDark ? colors.dark : colors.light;

  // Keeps the Android system navigation bar in sync with the app's theme —
  // left unset it renders as a hard black strip beneath our floating tab bar.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync(themeColors.background).catch(() => {});
    NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, theme: themeColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
