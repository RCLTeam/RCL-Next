import type { EditorialArticle, EditorialInput, WeeklyTeam, WeeklyTeamInput } from '@rcl/contracts';

export interface HomeContentRepository {
  listArticles(admin: boolean): Promise<EditorialArticle[]>;
  getArticle(id: string): Promise<EditorialArticle | null>;
  saveArticle(actor: string, id: string | null, input: EditorialInput): Promise<EditorialArticle>;
  deleteArticle(actor: string, id: string): Promise<void>;
  getWeeklyTeam(divisionId: string): Promise<WeeklyTeam | null>;
  saveWeeklyTeam(actor: string, divisionId: string, input: WeeklyTeamInput): Promise<WeeklyTeam>;
}
