import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AlertHistoryProvider } from "./context/AlertHistoryContext";
import { ConfigProvider } from "./context/ConfigContext";
import { MetricsProvider } from "./context/MetricsContext";
import { ProcessProvider } from "./context/ProcessContext";
import { ToastProvider } from "./context/ToastContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <ToastProvider>
          <MetricsProvider>
            <AlertHistoryProvider>
              <ProcessProvider>
                <App />
              </ProcessProvider>
            </AlertHistoryProvider>
          </MetricsProvider>
        </ToastProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
