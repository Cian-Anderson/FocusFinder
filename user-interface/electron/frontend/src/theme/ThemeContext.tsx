import React, { createContext, useContext, useState, useEffect } from "react";
import { darkChartColors, lightChartColors } from "./chartColors";
import type { ChartColors } from "./chartColors";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  chartColors: ChartColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  chartColors: darkChartColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("appTheme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("appTheme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        chartColors: theme === "dark" ? darkChartColors : lightChartColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useChartColors() {
  return useContext(ThemeContext).chartColors;
}
