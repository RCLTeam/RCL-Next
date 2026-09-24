import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { CompetitionService } from './competition.service.js';

export class CompetitionController {
  constructor(private readonly service: CompetitionService) {}
  matchDetail: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.matchDetail(
        z
          .string()
          .min(1)
          .max(400)
          .regex(/^[\p{L}\p{N}-]+$/u)
          .parse(req.params.matchId)
      )
    });
  };
  players: RequestHandler = async (_req, res) => {
    res.json({ data: await this.service.players() });
  };
  playerDetail: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.playerDetail(
        z
          .string()
          .min(1)
          .max(400)
          .regex(/^[\p{L}\p{N}-]+$/u)
          .parse(req.params.playerId)
      )
    });
  };
  teamDetail: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.teamDetail(
        z
          .string()
          .min(1)
          .max(400)
          .regex(/^[\p{L}\p{N}-]+$/u)
          .parse(req.params.teamId)
      )
    });
  };
  seasons: RequestHandler = async (_req, res) => {
    res.json({ data: await this.service.seasons() });
  };
  divisions: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.divisions(z.string().min(1).max(120).parse(req.params.seasonId))
    });
  };
  teams: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.teams(z.string().uuid().parse(req.params.divisionId)) });
  };
  rounds: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.rounds(z.string().uuid().parse(req.params.divisionId)) });
  };
  calendar: RequestHandler = async (req, res) => {
    const id = z.string().uuid().parse(req.params.divisionId);
    const query = z
      .object({
        roundId: z
          .string()
          .regex(/^-?\d+$/)
          .refine((value) => Number(value) >= -32768 && Number(value) <= 32767)
          .optional()
      })
      .strict()
      .parse(req.query);
    res.json({ data: await this.service.calendar(id, query.roundId) });
  };
  champions: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.champions(z.string().uuid().parse(req.params.divisionId))
    });
  };
  standings: RequestHandler = async (req, res) => {
    const id = z.string().uuid().parse(req.params.divisionId);
    const query = z
      .object({ stage: z.string().trim().min(1).max(64).default('regular') })
      .strict()
      .parse(req.query);
    res.json({ data: await this.service.standings(id, query.stage) });
  };
}
