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
  return Object.entries(answers).reduce(
    (total, [id, values]) =>
      total +
      (id.startsWith('winner:') || id.startsWith('loser:')
        ? values.filter((value) => results[id]?.includes(value)).length
        : Number(values.some((value) => results[id]?.includes(value)))),
    0
  );
}

export const durationOptions = [
  '0–19 min',
  '20–24 min',
  '25–29 min',
  '30–34 min',
  '35–39 min',
  '40–44 min',
  '45+ min'
].map((name, index) => ({ id: String(index), name }));
export function durationBucket(seconds: number) {
  return String(Math.max(0, Math.min(6, Math.floor(seconds / 300) - 3)));
}
