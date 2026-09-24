import { useEffect, useState } from 'react';
import { type GameCatalog, defaultGameCatalog, loadGameCatalog } from './riot-assets.service.js';

export function useGameCatalog() {
  const [catalog, setCatalog] = useState<GameCatalog>(defaultGameCatalog);
  useEffect(() => {
    let active = true;
    void loadGameCatalog().then(
      (data) => {
        if (active) setCatalog(data);
      },
      () => {
        if (active) setCatalog(defaultGameCatalog);
      }
    );
    return () => {
      active = false;
    };
  }, []);
  return catalog;
}
