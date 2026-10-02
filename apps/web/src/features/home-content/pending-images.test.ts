import { expect, test, vi } from 'vitest';
import { PendingImages } from './pending-images.js';

test('discard cleans uploads once, including an upload that finishes after leaving', () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const images = new PendingImages(remove);
  images.add('cover');
  images.add('cover');
  images.dispose();
  images.dispose();
  images.add('late-upload');
  expect(remove.mock.calls).toEqual([[['cover']], [['late-upload']]]);
});

test('successful save retains images when the new article remounts the editor', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const images = new PendingImages(remove);
  images.add('cover');
  await images.save(async (urls) => {
    expect(urls).toEqual(['cover']);
    images.dispose();
    expect(remove).not.toHaveBeenCalled();
    return 'saved';
  });
  images.dispose();
  expect(remove).not.toHaveBeenCalled();
});

test('failed save keeps uploads for retry, or cleans them if the editor was closed', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const images = new PendingImages(remove);
  images.add('cover');
  await expect(
    images.save(async () => {
      throw new Error('offline');
    })
  ).rejects.toThrow('offline');
  expect(remove).not.toHaveBeenCalled();
  await expect(
    images.save(async (urls) => {
      expect(urls).toEqual(['cover']);
      images.dispose();
      expect(remove).not.toHaveBeenCalled();
      throw new Error('failed');
    })
  ).rejects.toThrow('failed');
  expect(remove).toHaveBeenCalledWith(['cover']);
});

test('strict-mode setup after cleanup can track new uploads', () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const images = new PendingImages(remove);
  images.dispose();
  images.resume();
  images.add('cover');
  expect(remove).not.toHaveBeenCalled();
  images.dispose();
  expect(remove).toHaveBeenCalledWith(['cover']);
});
