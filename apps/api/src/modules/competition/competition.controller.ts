import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { CompetitionService } from './competition.service.js';

export class CompetitionController {
  constructor(private readonly service: CompetitionService) {}
  seasons: RequestHandler = async (_req, res) => { res.json({ data: await this.service.seasons() }); };
  divisions: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.divisions(z.string().uuid().parse(req.params.seasonId)) });
  };
  teams: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.teams(z.string().uuid().parse(req.params.divisionId)) });
  };
  rounds: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.rounds(z.string().uuid().parse(req.params.divisionId)) });
  };
  calendar: RequestHandler = async (req, res) => {
    const id = z.string().uuid().parse(req.params.divisionId);
    const query = z.object({ roundId: z.string().uuid().optional() }).strict().parse(req.query);
    res.json({ data: await this.service.calendar(id, query.roundId) });
  };
  standings: RequestHandler = async (req, res) => {
    const id = z.string().uuid().parse(req.params.divisionId);
    const query = z.object({ stage: z.string().trim().min(1).max(64).default('regular') }).strict().parse(req.query);
    res.json({ data: await this.service.standings(id, query.stage) });
  };
}
