import { expect, test } from 'vitest';
import { displayName } from './display-name.js';

test('renders decorative fonts as ordinary letters', () => {
  expect(displayName('𝑶𝒛𝒂𝒓𝒖')).toBe('Ozaru');
  expect(displayName('𝓞𝔃𝓪𝓻𝓾 ℋℯℓℓℴ ＡＢＣ１２')).toBe('Ozaru Hello ABC12');
});

test('preserves accents, languages, symbols and combining marks', () => {
  const original = 'José Muñoz 日本語 Ελληνικά العربية ★ 🎮 ① ² e\u0301';
  expect(displayName(original)).toBe(original);
});
