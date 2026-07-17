import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

import AppErrorFallback from "./app-error-fallback";

type FeatureErrorBoundaryProps = {
  children: ReactNode;
  featureName: string;
  /** Omit while the owning operation cannot be safely abandoned. */
  onDismiss?: () => void;
  title: string;
};

type FeatureErrorBoundaryState = {
  error: Error | null;
  recoveryKey: number;
};

/**
 * Contains one transient surface without resetting the provider that owns its
 * session. Retaining the owner is important for recovery: Create keeps its
 * local draft, Share keeps its selected entry, and Widgets keeps its slot
 * session while the user decides whether to retry or dismiss. Transient
 * surfaces mount this boundary only for an active session, so dismissing also
 * unmounts the boundary and clears its captured error.
 */
export default class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null, recoveryKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<FeatureErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep diagnostics structural: the feature name and React component stack
    // are actionable without logging journal text or media content.
    console.error("Transient feature render failure", {
      feature: this.props.featureName,
      errorName: error.name,
      componentStack: info.componentStack,
    });
  }

  private onRetry = () => {
    this.setState((state) => ({ error: null, recoveryKey: state.recoveryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <AppErrorFallback
          error={this.state.error}
          onRetry={this.onRetry}
          onDismiss={this.props.onDismiss}
          title={this.props.title}
          overlay
        />
      );
    }

    return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
  }
}
