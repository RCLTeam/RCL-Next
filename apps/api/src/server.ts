import http from 'node:http';
import { createDatabase, seasons } from '@rcl/database';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { PostgresCompetitionRepository } from './modules/competition/postgres-competition.repository.js';
import { PostgresRoflUploadRepository } from './modules/rofl-upload/persistence/postgresRoflUpload.repository.js';
import { attachRoflUploadGateway } from './modules/rofl-upload/websocket/roflUploadGateway.js';

const env = loadEnvironment();
const connection = createDatabase(env.DATABASE_URL);
connection.pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
async function checkDatabase() {
  await connection.db.select({ name: seasons.name }).from(seasons).limit(1);
}
try {
  await checkDatabase();
} catch {
  await connection.close();
  console.error(
    'PostgreSQL is unavailable or not migrated. Run pnpm db:check and pnpm db:migrate.'
  );
  process.exit(1);
}
const app = createApp({
  repository: new PostgresCompetitionRepository(connection.db),
  checkDatabase,
  corsOrigin: env.CORS_ORIGIN
});
const server = http.createServer(app);
const roflUploadRepo = new PostgresRoflUploadRepository(connection.db);
const roflUploadGateway = attachRoflUploadGateway(server, roflUploadRepo);

server.listen(env.PORT, env.HOST, () => {
  console.info(`RCL API: http://${env.HOST}:${env.PORT}/api/v1/seasons`);
  console.info(`RCL ROFL Upload WS: ws://${env.HOST}:${env.PORT}/ws/rofl-upload`);
});
server.on('error', async () => {
  console.error('API could not listen on the configured address.');
  await connection.close();
  process.exitCode = 1;
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  roflUploadGateway.close(() => {
    server.close(async () => {
      await connection.close();
      clearTimeout(timeout);
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
