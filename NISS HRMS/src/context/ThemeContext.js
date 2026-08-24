import React, { createContext, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import { colors } from '../theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      const NavigationBar = require('expo-navigation-bar');
      if (NavigationBar && NavigationBar.setBackgroundColorAsync) {
        NavigationBar.setBackgroundColorAsync(colors.light.background).catch(() => {});
        NavigationBar.setButtonStyleAsync('dark').catch(() => {});
      }
    } catch (e) {
      /* Native module not present in standalone build */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme: colors.light }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
