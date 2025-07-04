import React, { createContext, useContext, useEffect, useState } from 'react';

// Theme types
const THEME_TYPES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

// Create context
const ThemeContext = createContext();

// Provider component
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Get theme from localStorage or default to system
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && Object.values(THEME_TYPES).includes(savedTheme)) {
      return savedTheme;
    }
    return THEME_TYPES.SYSTEM;
  });

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    return getResolvedTheme(theme);
  });

  // Get the actual theme based on system preference
  function getResolvedTheme(themeType) {
    if (themeType === THEME_TYPES.SYSTEM) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? THEME_TYPES.DARK
        : THEME_TYPES.LIGHT;
    }
    return themeType;
  }

  // Apply theme to document
  useEffect(() => {
    const resolved = getResolvedTheme(theme);
    setResolvedTheme(resolved);

    // Update document attributes
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === THEME_TYPES.DARK);

    // Save to localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme === THEME_TYPES.SYSTEM) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = () => {
        setResolvedTheme(getResolvedTheme(theme));
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Toggle between light and dark
  const toggleTheme = () => {
    setTheme(prevTheme => {
      if (prevTheme === THEME_TYPES.LIGHT) {
        return THEME_TYPES.DARK;
      } else if (prevTheme === THEME_TYPES.DARK) {
        return THEME_TYPES.SYSTEM;
      } else {
        return THEME_TYPES.LIGHT;
      }
    });
  };

  // Set specific theme
  const setThemeType = (themeType) => {
    if (Object.values(THEME_TYPES).includes(themeType)) {
      setTheme(themeType);
    }
  };

  // Check if current theme is dark
  const isDark = resolvedTheme === THEME_TYPES.DARK;

  // Check if current theme is light
  const isLight = resolvedTheme === THEME_TYPES.LIGHT;

  // Check if using system theme
  const isSystem = theme === THEME_TYPES.SYSTEM;

  // Value object
  const value = {
    theme,
    resolvedTheme,
    isDark,
    isLight,
    isSystem,
    toggleTheme,
    setTheme: setThemeType,
    THEME_TYPES,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook to use theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Custom hook for dark mode
export function useDarkMode() {
  const { isDark, toggleTheme } = useTheme();
  return { isDark, toggleTheme };
}

// Utility function to get theme color
export function getThemeColor(isDark, lightColor, darkColor) {
  return isDark ? darkColor : lightColor;
}

// Utility function to get theme class
export function getThemeClass(isDark, lightClass, darkClass) {
  return isDark ? darkClass : lightClass;
} 