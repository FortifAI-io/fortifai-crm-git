import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fortifai Scale render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-sm space-y-4">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Fortifai Scale encountered a display error
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {this.state.error.message || 'An unexpected runtime error occurred.'}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-xs font-medium bg-[#0D1520] text-white rounded-md hover:bg-slate-800"
              >
                Reload App
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('fortifai_live_cms_v1');
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E2E8F0] text-slate-700 rounded-md hover:bg-slate-50"
              >
                Reset Live CMS Cache &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
