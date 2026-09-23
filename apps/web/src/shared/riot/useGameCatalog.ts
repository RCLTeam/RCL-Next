import { useEffect, useState } from 'react';
import { type GameCatalog, loadGameCatalog } from './data-dragon.service.js';

export function useGameCatalog() {
  const [catalog, setCatalog] = useState<GameCatalog>({});
  useEffect(() => {
    let active = true;
    void loadGameCatalog().then(
      (data) => {
        if (active) setCatalog(data);
      },
      () => {
        if (active) setCatalog({});
      }
    );
    return () => {
      active = false;
    };
  }, []);
  return catalog;
}
