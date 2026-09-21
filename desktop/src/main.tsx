import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ConfigProvider } from "./context/ConfigContext";
import { MetricsProvider } from "./context/MetricsContext";
import { ProcessProvider } from "./context/ProcessContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <MetricsProvider>
          <ProcessProvider>
            <App />
          </ProcessProvider>
        </MetricsProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
