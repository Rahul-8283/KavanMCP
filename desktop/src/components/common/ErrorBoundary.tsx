import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error intercepted by ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="app-canvas flex min-h-screen flex-col items-center justify-center bg-canvas p-6 text-ink">
          <div className="flex w-full max-w-lg flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-crimson bg-crimson-wash text-crimson-ink">
              <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
            </div>

            <h1 className="mt-6 font-display text-[1.375rem] font-semibold tracking-[-0.01em] text-ink">Application Crashed</h1>

            <p className="mt-2 text-[0.8125rem] leading-6 text-ink-soft">
              A critical error occurred in the React rendering tree. Our global boundary intercepted the crash to prevent the window from freezing.
            </p>

            <div className="mt-6 max-h-48 w-full overflow-auto rounded-md border border-line bg-sunken p-4 text-left font-mono text-xs leading-5 text-crimson-ink">
              {this.state.error?.toString()}
            </div>

            <button onClick={() => window.location.reload()} className="btn btn-primary mt-6 h-9 px-5">
              <RefreshCw className="h-4 w-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
