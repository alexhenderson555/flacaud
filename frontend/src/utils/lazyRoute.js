import React from 'react';
import { importRouteModule } from './chunkRecovery';

/** Lazy route with chunk-mismatch retries + one auto-reload per session. */
export function lazyRoute(importer) {
  return React.lazy(() => importRouteModule(importer));
}
