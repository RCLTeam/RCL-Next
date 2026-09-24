import { z } from 'zod';
import { notFound } from '../../shared/app-error.js';
import type { HomeContentRepository } from './home-content.repository.js';

const imageUrl = z.union([
  z.literal(''),
  z
    .string()
    .url()
    .max(2000)
    .refine((url) => url.startsWith('https://'), 'Images must use HTTPS.')
]);
const articleInput = z
  .object({
    title: z.string().trim().min(1).max(180),
    excerpt: z.string().trim().max(500),
    body: z.string().trim().min(1).max(100000),
    kind: z.enum(['noticia', 'reportaje', 'entrevista', 'otro']),
    author: z.string().trim().min(1).max(120),
    coverUrl: imageUrl,
    coverAlt: z.string().trim().max(240),
    published: z.boolean(),
    showOnHome: z.boolean(),
    homeOrder: z.number().int().min(0).max(9999)
  })
  .strict()
  .refine(
    (article) => !article.coverUrl || article.coverAlt.length > 0,
    'Cover images require alternative text.'
  );
const teamInput = z
  .object({
    label: z.string().trim().min(1).max(120),
    published: z.boolean(),
    players: z
      .array(
        z
          .object({
            role: z.enum(['top', 'jungle', 'mid', 'adc', 'support']),
            name: z.string().trim().min(1).max(80),
            team: z.string().trim().min(1).max(120),
            imageUrl
          })
          .strict()
      )
      .length(5)
  })
  .strict()
  .refine(
    (team) => new Set(team.players.map((player) => player.role)).size === 5,
    'Choose one player per role.'
  );

export class HomeContentService {
  constructor(private readonly repository: HomeContentRepository) {}
  listArticles(admin = false) {
    return this.repository.listArticles(admin);
  }
  async article(id: unknown) {
    const article = await this.repository.getArticle(z.string().uuid().parse(id));
    if (!article?.published) throw notFound('Article');
    return article;
  }
  saveArticle(actor: string, id: unknown, body: unknown) {
    return this.repository.saveArticle(
      actor,
      id === null ? null : z.string().uuid().parse(id),
      articleInput.parse(body)
    );
  }
  deleteArticle(actor: string, id: unknown) {
    return this.repository.deleteArticle(actor, z.string().uuid().parse(id));
  }
  async weeklyTeam(id: unknown, admin = false) {
    const team = await this.repository.getWeeklyTeam(z.string().uuid().parse(id));
    return admin || team?.published ? team : null;
  }
  saveWeeklyTeam(actor: string, id: unknown, body: unknown) {
    return this.repository.saveWeeklyTeam(
      actor,
      z.string().uuid().parse(id),
      teamInput.parse(body)
    );
  }
}
