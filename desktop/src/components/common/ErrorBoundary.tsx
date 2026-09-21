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
        <div className="flex flex-col items-center justify-center min-h-screen bg-bg-primary text-text-primary p-6 selection:bg-accent selection:text-white">
          <div className="flex flex-col items-center max-w-xl text-center space-y-6">
            <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight text-white">Application Crashed</h1>
            
            <p className="text-text-secondary text-base">
              A critical error occurred in the React rendering tree. Our global boundary intercepted the crash to prevent the window from freezing.
            </p>
            
            <div className="w-full text-left bg-[#111111] p-4 rounded-md border border-white/10 overflow-auto max-h-48 text-sm font-mono text-red-400">
              {this.state.error?.toString()}
            </div>
            
            <button
              onClick={() => window.location.reload()}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-md transition-colors border border-white/10 mt-4 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
