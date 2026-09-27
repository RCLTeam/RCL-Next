import { z } from 'zod';
import { notFound } from '../../shared/app-error.js';
import { EditorialImageStore } from './editorial-image.store.js';
import type { HomeContentRepository } from './home-content.repository.js';

const imageUrl = z.union([
  z.literal(''),
  z.string().regex(/^\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/),
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
    homeOrder: z.number().int().min(0).max(9999),
    uploadedImages: z
      .array(z.string().regex(/^\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/))
      .max(100)
      .default([])
  })
  .strict()
  .refine(
    (article) => !article.coverUrl || article.coverAlt.length > 0,
    'Cover images require alternative text.'
  );
const teamInput = z
  .object({
    roundId: z.number().int().min(1).max(32767),
    label: z.string().trim().min(1).max(120),
    published: z.boolean(),
    players: z
      .array(
        z
          .object({
            role: z.enum(['top', 'jungle', 'mid', 'adc', 'support']),
            name: z.string().trim().min(1).max(80),
            team: z.string().trim().min(1).max(120),
            imageUrl,
            playerId: z.string().uuid(),
            teamId: z.string().uuid(),
            champions: z.array(z.string().max(64)).default([])
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
  constructor(
    private readonly repository: HomeContentRepository,
    private readonly images = new EditorialImageStore()
  ) {}
  listArticles(admin = false) {
    return this.repository.listArticles(admin);
  }
  async article(id: unknown) {
    const article = await this.repository.getArticle(z.string().uuid().parse(id));
    if (!article?.published) throw notFound('Article');
    return article;
  }
  async saveArticle(actor: string, id: unknown, body: unknown) {
    const articleId = id === null ? null : z.string().uuid().parse(id);
    const { uploadedImages, ...input } = articleInput.parse(body);
    const previous = articleId ? await this.repository.getArticle(articleId) : null;
    const saved = await this.repository.saveArticle(actor, articleId, input);
    await this.repository.removeUnusedImages(
      [...this.imageUrls(previous), ...uploadedImages],
      (url) => this.images.remove(url)
    );
    return saved;
  }
  async deleteArticle(actor: string, id: unknown) {
    const articleId = z.string().uuid().parse(id);
    const previous = await this.repository.getArticle(articleId);
    await this.repository.deleteArticle(actor, articleId);
    await this.repository.removeUnusedImages(this.imageUrls(previous), (url) =>
      this.images.remove(url)
    );
  }
  private imageUrls(article: { coverUrl: string; body: string } | null): string[] {
    if (!article) return [];
    return (
      `${article.coverUrl}\n${article.body}`.match(
        /\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(?:png|jpg|webp)/g
      ) ?? []
    );
  }
  weeklyCandidates(id: unknown, roundId: unknown) {
    return this.repository.weeklyCandidates(
      z.string().uuid().parse(id),
      z.coerce.number().int().min(1).max(32767).parse(roundId)
    );
  }
  listWeeklyTeams(id: unknown, admin = false) {
    return this.repository.listWeeklyTeams(z.string().uuid().parse(id), admin);
  }
  async weeklyTeam(id: unknown, admin = false) {
    return (await this.listWeeklyTeams(id, admin))[0] ?? null;
  }
  saveWeeklyTeam(actor: string, id: unknown, body: unknown) {
    return this.repository.saveWeeklyTeam(
      actor,
      z.string().uuid().parse(id),
      teamInput.parse(body)
    );
  }
}
