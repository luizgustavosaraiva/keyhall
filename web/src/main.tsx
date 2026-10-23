import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { ConfirmProvider } from "@/components/confirm"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { I18nProvider } from "@/lib/i18n"
import App from "./App.tsx"

const root = document.getElementById("root")
if (!root) throw new Error("#root not found")

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
)
