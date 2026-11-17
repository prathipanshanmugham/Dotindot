// If a screen hits a bug, show a way out instead of a blank page. Wrapped around each page (resets when you move
// to another page) and around the whole app.
import { Component } from "react";
import { BASE } from "@/lib/base";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // keep the details in the browser console for whoever fixes it
    console.error("[dotindot] screen error", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const full = this.props.full;
    return (
      <div className={`${full ? "min-h-screen" : "py-16"} flex items-center justify-center px-4 bg-transparent`} role="alert" data-testid="screen-error">
        <div className="max-w-md text-center">
          <div className="text-lg font-semibold text-gray-900">This screen hit a problem</div>
          <p className="text-sm text-gray-500 mt-1">Nothing you saved is lost. Reload to try again, or go back to the dashboard.</p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-[#F26B21] hover:bg-[#E05A10] text-white text-sm font-semibold px-4 py-2">Reload</button>
            <a href={`${BASE}/dashboard`} className="rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 px-4 py-2 hover:bg-gray-50">Dashboard</a>
          </div>
        </div>
      </div>
    );
  }
}
