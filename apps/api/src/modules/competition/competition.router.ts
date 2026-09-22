import { Router } from 'express';
import type { CompetitionController } from './competition.controller.js';

export function competitionRouter(controller: CompetitionController): Router {
  const router = Router();
  router.get('/matches/:matchId', controller.matchDetail);
  router.get('/players', controller.players);
  router.get('/players/:playerId', controller.playerDetail);
  router.get('/teams/:teamId', controller.teamDetail);
  router.get('/seasons', controller.seasons);
  router.get('/seasons/:seasonId/divisions', controller.divisions);
  router.get('/divisions/:divisionId/teams', controller.teams);
  router.get('/divisions/:divisionId/rounds', controller.rounds);
  router.get('/divisions/:divisionId/calendar', controller.calendar);
  router.get('/divisions/:divisionId/standings', controller.standings);
  return router;
}
