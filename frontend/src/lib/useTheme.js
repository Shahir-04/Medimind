import { useState, useEffect } from 'react';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    const saved = sessionStorage.getItem('medimind-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return getSystemTheme(); // Initialize with system preference but lock it to light/dark
  });

  useEffect(() => {
    applyTheme(theme);
    sessionStorage.setItem('medimind-theme', theme);
  }, [theme]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
  };

  return { theme, setTheme, resolvedTheme: theme };
}
