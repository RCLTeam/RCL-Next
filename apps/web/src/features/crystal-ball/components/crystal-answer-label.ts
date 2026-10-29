import type { CrystalQuestion } from '@rcl/contracts';

export function crystalAnswerLabel(question: CrystalQuestion, id: string) {
  const option = question.options.find((candidate) => candidate.id === id);
  const name = option?.name ?? id;
  if (question.id === 'pentakills') return `${name} pentakill`;
  if (question.id === 'gold-difference') return `${name} oro`;
  if (question.id === 'shortest-game') return `${name} minutos`;
  return question.kind === 'team' ? option?.shortName || name : name;
}
