import React, { useEffect, useState } from 'react';
import { ChampionArt } from '../../../../../shared/components/ChampionArt.js';
import { getGameAsset } from '../../../../../shared/riot/riot-assets.service.js';
import { useGameCatalog } from '../../../../../shared/riot/useGameCatalog.js';

export function WeeklyChampionBackground({ champions }: { champions: string[] }) {
  const catalog = useGameCatalog();
  const sequence = [...new Set(champions)].join('|');
  return <ChampionSlides key={sequence} champions={champions} catalog={catalog} />;
}

function ChampionSlides({
  champions,
  catalog
}: {
  champions: string[];
  catalog: ReturnType<typeof useGameCatalog>;
}) {
  const [active, setActive] = useState(0);
  const slides = [...new Set(champions)].flatMap((id) => {
    const asset = getGameAsset('champion', id, catalog);
    return asset?.splashImage ? [{ id, asset }] : [];
  });
  useEffect(() => {
    if (slides.length < 2) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | undefined;
    function configure() {
      clearInterval(timer);
      if (!motion.matches)
        timer = setInterval(() => setActive((index) => (index + 1) % slides.length), 4500);
    }
    configure();
    motion.addEventListener('change', configure);
    return () => {
      clearInterval(timer);
      motion.removeEventListener('change', configure);
    };
  }, [slides.length]);
  return (
    <div className="totw-slides" aria-hidden="true">
      {slides.map((slide, index) => (
        <ChampionArt
          key={slide.id}
          className={`totw-splash${index === active % slides.length ? ' is-active' : ''}`}
          asset={slide.asset}
          variant="portrait"
          alt=""
        />
      ))}
    </div>
  );
}
