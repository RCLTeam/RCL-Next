import type { CrystalAnswers, CrystalQuestion } from '@rcl/contracts';
import { AppError } from '../../shared/app-error.js';

export function validateAnswers(
  answers: CrystalAnswers,
  questions: CrystalQuestion[],
  results = false
) {
  for (const [id, values] of Object.entries(answers)) {
    const question = questions.find((q) => q.id === id);
    if (
      !question ||
      new Set(values).size !== values.length ||
      !values.length ||
      ((!results || question.category === 'qualification') && values.length !== question.count)
    )
      throw new AppError(400, 'INVALID_ANSWER', 'Invalid question or number of selections.');
    for (const value of values) {
      if (
        question.kind === 'integer'
          ? !/^(0|[1-9]\d{0,6})$/.test(value)
          : question.kind === 'champion'
            ? !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value)
            : !question.options.some((option) => option.id === value)
      )
        throw new AppError(400, 'INVALID_ANSWER', 'Choose a valid answer.');
    }
  }
  for (const q of questions.filter((q) => q.id.startsWith('winner:'))) {
    if (answers[q.id]?.some((id) => answers[q.id.replace('winner:', 'loser:')]?.includes(id)))
      throw new AppError(400, 'DUPLICATE_TEAM', 'A team cannot enter both brackets.');
  }
}

export function crystalPoints(answers: CrystalAnswers, results: CrystalAnswers) {
  const normalizedResults = normalizeNumericAnswers(results);
  return Object.entries(normalizeNumericAnswers(answers)).reduce(
    (total, [id, values]) =>
      total +
      (id.startsWith('winner:') || id.startsWith('loser:')
        ? values.filter((value) => normalizedResults[id]?.includes(value)).length
        : Number(values.some((value) => normalizedResults[id]?.includes(value)))),
    0
  );
}

export const durationOptions = ['0–19', '20–24', '25–29', '30–34', '35–39', '40–44', '45+'].map(
  (name, index) => ({ id: String(index), name })
);
export function durationBucket(seconds: number) {
  return String(Math.max(0, Math.min(6, Math.floor(seconds / 300) - 3)));
}

export const goldOptions = [
  { id: 'gold-0', name: 'Menos de 5.000' },
  { id: 'gold-1', name: '5.000–9.999' },
  { id: 'gold-2', name: '10.000–14.999' },
  { id: 'gold-3', name: '15.000–19.999' },
  { id: 'gold-4', name: '20.000 o mas' }
];
export function goldBucket(gold: number) {
  return `gold-${Math.min(4, Math.floor(gold / 5000))}`;
}
export const pentakillOptions = ['0', '1', '2', '3', '4', '5 o mas'].map((name, index) => ({
  id: index === 5 ? '5+' : String(index),
  name
}));
export function pentakillBucket(count: number) {
  return count >= 5 ? '5+' : String(count);
}

// Keep ballots and results saved before the switch to ranges usable.
export function normalizeNumericAnswers(answers: CrystalAnswers): CrystalAnswers {
  return Object.fromEntries(
    Object.entries(answers).map(([id, values]) => [
      id,
      values.map((value) => {
        if (!/^\d+$/.test(value)) return value;
        if (id === 'gold-difference') return goldBucket(Number(value));
        if (id === 'pentakills') return pentakillBucket(Number(value));
        return value;
      })
    ])
  );
}
