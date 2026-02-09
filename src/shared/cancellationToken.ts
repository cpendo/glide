// Cancellation Token - Allows cancelling long-running operations

export class CancellationToken {
  private _isCancelled = false;
  private _onCancel?: () => void;

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    this._onCancel?.();
  }

  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new CancellationError('Operation was cancelled');
    }
  }

  onCancel(callback: () => void): void {
    this._onCancel = callback;
  }
}

export class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationError';
  }
}

export function createCancellationToken(): CancellationToken {
  return new CancellationToken();
}
