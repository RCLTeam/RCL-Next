import type {
  EditorialArticle,
  EditorialInput,
  WeeklyCandidate,
  WeeklyTeam,
  WeeklyTeamInput
} from '@rcl/contracts';

export interface HomeContentRepository {
  removeUnusedImages(urls: string[], remove: (url: string) => Promise<void>): Promise<void>;
  listArticles(admin: boolean): Promise<EditorialArticle[]>;
  getArticle(id: string): Promise<EditorialArticle | null>;
  saveArticle(actor: string, id: string | null, input: EditorialInput): Promise<EditorialArticle>;
  deleteArticle(actor: string, id: string): Promise<void>;
  weeklyCandidates(divisionId: string, roundId: number): Promise<WeeklyCandidate[]>;
  listWeeklyTeams(divisionId: string, admin: boolean): Promise<WeeklyTeam[]>;
  getWeeklyTeam(divisionId: string): Promise<WeeklyTeam | null>;
  saveWeeklyTeam(actor: string, divisionId: string, input: WeeklyTeamInput): Promise<WeeklyTeam>;
}
