import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && (
      <Agentation endpoint={import.meta.env.VITE_AGENTATION_ENDPOINT ?? "http://localhost:4747"} />
    )}
  </StrictMode>
);
