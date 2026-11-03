import { useEffect, useState } from 'react';
import { type GameCatalog, defaultGameCatalog, loadGameCatalog } from './riot-assets.service.js';

export function useGameCatalogState() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<GameCatalog>(defaultGameCatalog);
  useEffect(() => {
    let active = true;
    void loadGameCatalog().then(
      (data) => {
        if (active) {
          setCatalog(data);
          setStatus(
            Object.keys(data).some((key) => key.startsWith('champion:')) ? 'ready' : 'error'
          );
        }
      },
      () => {
        if (active) {
          setCatalog(defaultGameCatalog);
          setStatus('error');
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);
  return { catalog, status };
}

export function useGameCatalog() {
  return useGameCatalogState().catalog;
}
