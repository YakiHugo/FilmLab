import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional fallback UI. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Generic React error boundary.
 *
 * Catches render-time errors in its subtree and shows a fallback UI
 * with a retry button. If no custom `fallback` is provided, a minimal
 * default is rendered.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center text-slate-300">
        <p className="text-lg font-medium text-red-400">出现了意外错误</p>
        <p className="max-w-md text-sm text-slate-400">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }
}
