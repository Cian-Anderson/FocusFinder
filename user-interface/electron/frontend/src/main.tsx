import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";

const root = document.getElementById("root");
createRoot(root!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
