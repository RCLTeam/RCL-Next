import http from 'node:http';
import { authSessions, createDatabase, oauthStates, seasons } from '@rcl/database';
import { createApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { AuthService } from './modules/auth/auth.service.js';
import { DiscordOAuthClient } from './modules/auth/discord.client.js';
import { PostgresAuthRepository } from './modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from './modules/competition/postgres-competition.repository.js';
import { PostgresCrudOperationsRepository } from './modules/crud-operations/postgres-crud-operations.repository.js';
import { NativePostgresBackupTools } from './modules/database-transfer/postgres-backup-tools.js';
import { PostgresDatabaseTransferRepository } from './modules/database-transfer/postgres-database-transfer.repository.js';
import { PostgresHomeContentRepository } from './modules/home-content/postgres-home-content.repository.js';
import { PostgresMemberRolesRepository } from './modules/member-roles/postgres-member-roles.repository.js';
import { PostgresRoflUploadRepository } from './modules/rofl-upload/persistence/postgres-rofl-upload.repository.js';
import { attachRoflUploadGateway } from './modules/rofl-upload/websocket/rofl-upload.gateway.js';

const env = loadEnvironment();
const connection = createDatabase(env.DATABASE_URL);
connection.pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
async function checkDatabase() {
  await connection.db.select({ name: seasons.name }).from(seasons).limit(1);
  if (env.DISCORD_CLIENT_ID) {
    await connection.db.select({ tokenHash: authSessions.tokenHash }).from(authSessions).limit(1);
    await connection.db.select({ tokenHash: oauthStates.tokenHash }).from(oauthStates).limit(1);
  }
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
const authService = env.DISCORD_CLIENT_ID
  ? new AuthService(
      new PostgresAuthRepository(connection.db),
      new DiscordOAuthClient({
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        redirectUri: env.DISCORD_REDIRECT_URI
      })
    )
  : undefined;

const app = createApp({
  homeContentRepository: new PostgresHomeContentRepository(connection.db),
  databaseTransferRepository: new PostgresDatabaseTransferRepository(
    connection.db,
    new NativePostgresBackupTools(env.DATABASE_URL, env.POSTGRES_BIN_DIR)
  ),
  memberRolesRepository: new PostgresMemberRolesRepository(connection.db),
  crudOperationsRepository: new PostgresCrudOperationsRepository(connection.db),
  repository: new PostgresCompetitionRepository(connection.db),
  checkDatabase,
  corsOrigin: env.CORS_ORIGIN,
  ...(authService
    ? {
        auth: {
          service: authService,
          secureCookies: new URL(env.DISCORD_REDIRECT_URI).protocol === 'https:',
          frontendOrigin: env.CORS_ORIGIN
        }
      }
    : {})
});
const server = http.createServer(app);
const roflUploadRepo = new PostgresRoflUploadRepository(connection.db);
const roflUploadGateway = attachRoflUploadGateway(server, roflUploadRepo, { authService });

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
