import React, { Component, ReactNode } from 'react';
import { RefreshCw, Home, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CARENETRA ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    sessionStorage.removeItem('carenetra_chunk_reload');
    window.location.reload();
  };

  handleGoHome = () => {
    sessionStorage.removeItem('carenetra_chunk_reload');
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMsg = this.state.error?.message || '';
      const isChunkError =
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('ChunkLoadError') ||
        errorMsg.includes('Loading chunk failed') ||
        errorMsg.includes('text/html');

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
          <div className="max-w-md w-full glass-card p-8 rounded-3xl text-center space-y-6 border border-border shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                {isChunkError ? 'Application Update Available' : 'Something Went Wrong'}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isChunkError
                  ? 'A new version of CARENETRA has been deployed. Please refresh the page to load the latest features.'
                  : 'An unexpected application error occurred. You can refresh the page or return to home.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
              >
                <RefreshCw size={16} />
                Refresh Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors"
              >
                <Home size={16} />
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;