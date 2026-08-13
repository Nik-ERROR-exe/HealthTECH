import { lazy, ComponentType } from 'react';

/**
 * Wraps React.lazy with automatic single-reload recovery when a Vite chunk fails to load
 * due to a deployment version mismatch (stale index.html requesting an old hashed chunk).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await factory();
      // Clear chunk reload tracking flag on successful import
      sessionStorage.removeItem('carenetra_chunk_reload');
      return module;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isChunkError =
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('ChunkLoadError') ||
        errorMsg.includes('Loading chunk failed') ||
        errorMsg.includes('text/html');

      if (isChunkError) {
        const hasReloaded = sessionStorage.getItem('carenetra_chunk_reload');
        if (!hasReloaded) {
          sessionStorage.setItem('carenetra_chunk_reload', 'true');
          window.location.reload();
          // Return pending promise during page reload
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
}

export default lazyWithRetry;
