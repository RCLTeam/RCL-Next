// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, onTestFinished, test, vi } from 'vitest';
import { ChampionArt } from './ChampionArt.js';
import type { ChampionArtVariant, GameAsset } from './riot-assets.service.js';

let nextId = 1000;

function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const asset: GameAsset = {
    name: 'Champion',
    championId: nextId++,
    splashImage: 'https://ddragon.example/splash.jpg',
    image: 'https://ddragon.example/icon.png'
  };
  onTestFinished(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(variant: ChampionArtVariant, skinId?: number, nextAsset = asset) {
    await act(async () =>
      root.render(
        <div>
          <span>Initials</span>
          <ChampionArt
            asset={nextAsset}
            variant={variant}
            {...(skinId === undefined ? {} : { skinId })}
            alt="Champion"
            className="splash"
          />
        </div>
      )
    );
  }
  async function failImage() {
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    await act(async () => image?.dispatchEvent(new Event('error')));
  }
  return { asset, container, fetch, render, failImage };
}

function metadata(id: number) {
  return {
    skins: [
      {
        id: id * 1000,
        name: 'Base',
        isBase: true,
        splashPath: '/lol-game-data/assets/ASSETS/BaseCentered.jpg',
        uncenteredSplashPath: '/lol-game-data/assets/ASSETS/BaseOriginal.jpg',
        loadScreenPath: '/lol-game-data/assets/ASSETS/BasePortrait.jpg',
        tilePath: '/lol-game-data/assets/ASSETS/BaseTile.jpg'
      },
      {
        id: id * 1000 + 1,
        name: 'Skin',
        isBase: false,
        splashPath: '/lol-game-data/assets/ASSETS/SkinCentered.jpg',
        uncenteredSplashPath: '/lol-game-data/assets/ASSETS/SkinOriginal.jpg'
      }
    ]
  };
}

test('Original base splash renders immediately without any metadata request', async () => {
  const { container, fetch, render, asset } = setup();
  await render('original');
  expect(container.querySelector('img')?.src).toBe(asset.splashImage);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(['centered', 'portrait', 'tile'] as const)(
  '%s waits for metadata before mounting an image and reuses cached metadata',
  async (variant) => {
    const { container, fetch, render, asset } = setup();
    let resolve!: (response: Response) => void;
    fetch.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      })
    );
    await render(variant);
    expect(container.querySelector('img')).toBeNull();
    await act(async () => resolve(Response.json(metadata(asset.championId ?? 0))));
    expect(container.querySelector('img')?.src).toContain(`base${variant}.jpg`);
    const node = container.querySelector('img');
    await render('original');
    await render(variant);
    expect(container.querySelector('img')).toBe(node);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
);

test('A selected skin uses metadata and changes source without replacing the image node', async () => {
  const { container, fetch, render, asset } = setup();
  fetch.mockResolvedValue(Response.json(metadata(asset.championId ?? 0)));
  await render('original');
  const node = container.querySelector('img');
  await render('original', (asset.championId ?? 0) * 1000 + 1);
  expect(container.querySelector('img')?.src).toContain('skinoriginal.jpg');
  // Metadata-dependent selections wait before loading their image.
  const skinNode = container.querySelector('img');
  expect(node).not.toBeNull();
  await render('centered', (asset.championId ?? 0) * 1000 + 1);
  expect(container.querySelector('img')).toBe(skinNode);
  expect(skinNode?.src).toContain('skincentered.jpg');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('Image errors advance portrait, centered and splash sources on the same node, then reveal initials', async () => {
  const { container, fetch, render, failImage, asset } = setup();
  fetch.mockResolvedValue(Response.json(metadata(asset.championId ?? 0)));
  await render('portrait');
  const node = container.querySelector('img');
  expect(node?.src).toContain('baseportrait.jpg');
  await failImage();
  expect(container.querySelector('img')).toBe(node);
  expect(node?.src).toContain('basecentered.jpg');
  await failImage();
  expect(container.querySelector('img')).toBe(node);
  expect(node?.src).toBe(asset.splashImage);
  await failImage();
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe('Initials');
  expect(container.innerHTML).not.toContain('icon.png');
});

test('Metadata failure resolves to the splash fallback', async () => {
  const { container, fetch, render, asset } = setup();
  fetch.mockRejectedValue(new Error('Offline'));
  await render('centered');
  expect(container.querySelector('img')?.src).toBe(asset.splashImage);
});

test('Missing champion IDs use the splash and never stretch the square icon', async () => {
  const { container, fetch, render } = setup();
  await render('centered', undefined, { name: 'Unknown', image: 'icon.png' });
  expect(container.querySelector('img')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test('A slow previous champion response does not overwrite the current champion', async () => {
  const { container, fetch, render, asset } = setup();
  let resolve!: (response: Response) => void;
  fetch.mockReturnValueOnce(
    new Promise<Response>((done) => {
      resolve = done;
    })
  );
  await render('centered');
  const nextAsset = { ...asset, championId: nextId++ };
  fetch.mockResolvedValue(
    Response.json({
      skins: [
        {
          id: nextAsset.championId * 1000,
          name: 'Next',
          isBase: true,
          splashPath: '/lol-game-data/assets/ASSETS/Next.jpg'
        }
      ]
    })
  );
  await render('centered', undefined, nextAsset);
  expect(container.querySelector('img')?.src).toContain('/next.jpg');
  await act(async () => resolve(Response.json(metadata(asset.championId ?? 0))));
  expect(container.querySelector('img')?.src).toContain('/next.jpg');
});
