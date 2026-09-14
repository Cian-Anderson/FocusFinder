export const darkChartColors = {
  productive: "#38BDF8",
  neutral: "#C4B5FD",
  distracting: "#F43F5E",
  axis: "#94A3B8",
  grid: "#1f2937",
  tooltipBg: "#0b1220",
  tooltipBorder: "#1f2937",
};

const lightChartPalettes = {
  behavioralHierarchy: {
    productive: "#356B40",
    neutral: "#B8C2CF",
    distracting: "#C13F2B",
    axis: "#5f6552",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  behavioralHierarchySoft: {
    productive: "#356B40",
    neutral: "#C2CBD6",
    distracting: "#BE4735",
    axis: "#5f6552",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  slateTerracotta: {
    productive: "#3F7F4C",
    neutral: "#6E86B3",
    distracting: "#C65A3D",
    axis: "#5f6552",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  contrastFirst: {
    productive: "#3A7D44",
    neutral: "#7A6FA3",
    distracting: "#C44536",
    axis: "#5f6552",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  solarpunkBloom: {
    productive: "#58a85a",
    neutral: "#e8c95d",
    distracting: "#dc7a5c",
    axis: "#6a7156",
    grid: "#d9debf",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  solarpunkCanopy: {
    productive: "#4f9b57",
    neutral: "#dcbf54",
    distracting: "#cf6d4f",
    axis: "#6a7156",
    grid: "#d9debf",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  solarpunkSunrise: {
    productive: "#63b26a",
    neutral: "#f0d76e",
    distracting: "#d96a55",
    axis: "#6a7156",
    grid: "#d9debf",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  darkTransposed: {
    productive: "#38BDF8",
    neutral: "#C4B5FD",
    distracting: "#F43F5E",
    axis: "#66705a",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  sageStone: {
    productive: "#4f9b57",
    neutral: "#8a816f",
    distracting: "#c2573f",
    axis: "#66705a",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  sagePlum: {
    productive: "#4f9d5d",
    neutral: "#8a78b6",
    distracting: "#c65343",
    axis: "#66705a",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  mossMulberry: {
    productive: "#5b9a50",
    neutral: "#9a6fa7",
    distracting: "#bf4b3f",
    axis: "#66705a",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
  leafSlate: {
    productive: "#4c9a61",
    neutral: "#6f7ea8",
    distracting: "#c4513d",
    axis: "#66705a",
    grid: "#d7ddc3",
    tooltipBg: "#fff8eb",
    tooltipBorder: "#d6dcb3",
  },
} as const;

const activeLightChartPalette = "behavioralHierarchy" satisfies keyof typeof lightChartPalettes;

export const lightChartColors = lightChartPalettes[activeLightChartPalette];

/** @deprecated use useChartColors() from ThemeContext */
export const chartColors = darkChartColors;

export type ChartColors = typeof darkChartColors;
