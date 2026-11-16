import { Component, ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Catches render errors and failed lazy-chunk loads so one broken page doesn't blank the whole app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-lg p-8">
        <Alert
          tone="error"
          title="This page failed to load"
          action={
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        >
          Something went wrong while rendering this screen. Reloading usually fixes it.
        </Alert>
      </div>
    );
  }
}
