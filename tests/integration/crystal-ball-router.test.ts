import request from 'supertest';
import { expect, test, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type { AuthOptions } from '../../apps/api/src/modules/auth/auth.router.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import type { CrystalBallRepository } from '../../apps/api/src/modules/crystal-ball/crystal-ball.repository.js';
import { AppError } from '../../apps/api/src/shared/app-error.js';

test('crystal API protects personal ballots, administrator mutations and trusted origin', async () => {
  const currentUser = vi.fn();
  const save = vi.fn();
  const configure = vi.fn();
  const resolve = vi.fn();
  const overview = vi.fn().mockResolvedValue({ status: 'open' });
  const mine = vi.fn().mockResolvedValue({});
  const auth = {
    service: { currentUser },
    secureCookies: false,
    frontendOrigin: 'http://localhost:5173'
  } as unknown as AuthOptions;
  const repository = {
    overview,
    mine,
    save,
    configure,
    resolve
  } as unknown as CrystalBallRepository;
  const app = createApp({
    repository: {} as CompetitionRepository,
    crystalBallRepository: repository,
    auth,
    checkDatabase: async () => {},
    corsOrigin: auth.frontendOrigin
  });
  const user = { discordId: '123', role: 'viewer' };
  currentUser.mockRejectedValue(new AppError(401, 'UNAUTHORIZED', 'Sign in.'));
  const publicResponse = await request(app).get('/api/v1/crystal-ball/Season').expect(200);
  expect(publicResponse.headers['cache-control']).toBe('no-store');
  await request(app).get('/api/v1/crystal-ball/Season/mine').expect(401);
  await request(app).put('/api/v1/crystal-ball/Season/mine').send({}).expect(401);
  currentUser.mockResolvedValue(user);
  await request(app).get('/api/v1/crystal-ball/Season/mine').expect(200);
  expect(mine).toHaveBeenCalledWith('Season', '123');
  await request(app).put('/api/v1/crystal-ball/Season/mine').send({}).expect(403);
  await request(app)
    .put('/api/v1/crystal-ball/Season/window')
    .set('Origin', auth.frontendOrigin)
    .send({})
    .expect(403);
  await request(app)
    .put('/api/v1/crystal-ball/Season/results')
    .set('Origin', auth.frontendOrigin)
    .send({})
    .expect(403);
  currentUser.mockResolvedValue({ ...user, role: 'admin' });
  await request(app)
    .put('/api/v1/crystal-ball/Season/results')
    .set('Origin', 'https://evil.invalid')
    .send({ answers: {}, finalize: true })
    .expect(403);
  await request(app)
    .put('/api/v1/crystal-ball/Season/window')
    .set('Origin', auth.frontendOrigin)
    .send({ opensAt: 'invalid', closesAt: 'invalid' })
    .expect(422);
  await request(app)
    .put('/api/v1/crystal-ball/Season/results')
    .set('Origin', auth.frontendOrigin)
    .send({ answers: {}, finalize: false })
    .expect(200);
  expect(resolve).toHaveBeenCalledWith('Season', '123', {}, false);
  expect(configure).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
