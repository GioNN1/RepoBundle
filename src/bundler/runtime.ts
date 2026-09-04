import { BundlerCancelledError, BundlerRuntime } from './types';

export function checkCancelled(runtime: BundlerRuntime): void {
  if (runtime.isCancellationRequested?.()) {
    throw new BundlerCancelledError();
  }
}

export function log(runtime: BundlerRuntime, message: string): void {
  runtime.log?.(message);
}
