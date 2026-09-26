import crypto from 'node:crypto';
import type {
  AuthUser,
  CreateSuggestionRequest,
  CreateSuggestionResponse,
  SuggestionStatusResponse
} from '@rcl/contracts';
import { AppError } from '../../shared/app-error.js';
import {
  BridgeRateLimitTimeoutError,
  type DiscordBridgeClient
} from '../discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from './incident-logger.js';
import { SuggestionStore } from './suggestion.store.js';

export interface SuggestionsServiceOptions {
  store?: SuggestionStore | undefined;
  bridgeClient: DiscordBridgeClient;
  logger?: IncidentLogger | undefined;
}

export interface SubmitSuggestionOptions {
  suggestion: string;
  isAnonymous?: boolean | undefined;
  user?: AuthUser | null | undefined;
}

interface ResolvedAuthor {
  author_id: string;
  author_username: string;
  author_avatar: string | null;
  avatar_url: string | null;
}

export class SuggestionsService {
  private readonly store: SuggestionStore;
  private readonly bridgeClient: DiscordBridgeClient;
  private readonly logger: IncidentLogger;

  constructor(
    optionsOrStore: SuggestionStore | SuggestionsServiceOptions,
    bridgeClient?: DiscordBridgeClient,
    logger?: IncidentLogger
  ) {
    if ('bridgeClient' in optionsOrStore) {
      this.store = optionsOrStore.store ?? new SuggestionStore();
      this.bridgeClient = optionsOrStore.bridgeClient;
      this.logger = optionsOrStore.logger ?? new IncidentLogger();
    } else {
      if (!bridgeClient) {
        throw new Error('DiscordBridgeClient must be provided to SuggestionsService');
      }
      this.store = optionsOrStore;
      this.bridgeClient = bridgeClient;
      this.logger = logger ?? new IncidentLogger();
    }

    if (typeof this.bridgeClient?.on === 'function') {
      this.bridgeClient.on('frame:sending', (event: { type: string; id: string }) => {
        if (event?.type === 'SUGGESTION_CREATED' && event?.id) {
          const record = this.store.get(event.id);
          if (record && record.status !== 'confirmed' && record.status !== 'failed') {
            this.store.update(event.id, {
              status: 'sending'
            });
          }
        }
      });

      this.bridgeClient.on(
        'frame:retrying',
        (event: { type: string; id: string; nextRetryInSeconds: number }) => {
          if (event?.type === 'SUGGESTION_CREATED' && event?.id) {
            const record = this.store.get(event.id);
            if (record && record.status !== 'confirmed' && record.status !== 'failed') {
              this.store.update(event.id, {
                status: 'retrying',
                nextRetryInSeconds: event.nextRetryInSeconds
              });
            }
          }
        }
      );

      this.bridgeClient.on(
        'SUGGESTION_CONFIRMED',
        (data: {
          id: string;
          channel_id?: string | number | undefined;
          message_id?: string | number | undefined;
          thread_id?: string | number | undefined;
        }) => {
          if (data?.id) {
            this.store.update(data.id, {
              status: 'confirmed',
              channelId: data.channel_id,
              messageId: data.message_id,
              threadId: data.thread_id
            });
          }
        }
      );

      this.bridgeClient.on(
        'SUGGESTION_FAILED',
        (data: {
          id: string;
          reason?: string | undefined;
          message?: string | undefined;
          incident_id?: string | undefined;
        }) => {
          if (data?.id) {
            const errorMsg = data.reason ?? data.message ?? 'Suggestion failed in Discord';
            const incidentId =
              data.incident_id ?? this.logger.log('DISCORD_DELIVERY_FAILED', errorMsg);
            this.store.update(data.id, {
              status: 'failed',
              incidentId,
              error: errorMsg
            });
          }
        }
      );
    }
  }

  public async submit(
    request: CreateSuggestionRequest,
    user?: AuthUser | null
  ): Promise<CreateSuggestionResponse> {
    const rawText = request?.suggestion;
    if (typeof rawText !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Suggestion text is required.');
    }

    const text = rawText.trim();
    if (text.length < 10 || text.length > 1000) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Suggestion text must be between 10 and 1000 characters.'
      );
    }

    const author = this.resolveAuthor(user, request.isAnonymous);
    const id = crypto.randomUUID();

    this.store.set({
      id,
      status: 'queued',
      suggestion: text,
      authorId: author.author_id,
      authorUsername: author.author_username
    });

    // Asynchronously dispatch to bridge (non-blocking for HTTP 202 response)
    void this.dispatchToBridge(id, text, author);

    return {
      id,
      status: 'queued'
    };
  }

  public async submitSuggestion(
    options: SubmitSuggestionOptions
  ): Promise<CreateSuggestionResponse> {
    return this.submit(
      {
        suggestion: options.suggestion,
        isAnonymous: options.isAnonymous
      },
      options.user
    );
  }

  public async createSuggestion(
    request: CreateSuggestionRequest,
    user?: AuthUser | null
  ): Promise<CreateSuggestionResponse> {
    return this.submit(request, user);
  }

  public getStatus(id: string): SuggestionStatusResponse | null {
    const record = this.store.get(id);
    if (!record) {
      return null;
    }

    const response: SuggestionStatusResponse = {
      id: record.id,
      status: record.status
    };

    if (record.status === 'retrying' && record.nextRetryInSeconds !== undefined) {
      response.nextRetryInSeconds = record.nextRetryInSeconds;
    }

    if (record.status === 'failed') {
      if (record.incidentId) {
        response.incidentId = record.incidentId;
      }
      if (record.error) {
        response.error = record.error;
      }
    }

    return response;
  }

  private resolveAuthor(user?: AuthUser | null, isAnonymous?: boolean): ResolvedAuthor {
    if (user && isAnonymous !== true) {
      const authorId = user.discordId;
      const username = user.globalName || user.username || 'Usuario';
      let avatar: string | null = null;
      let avatarUrl: string | null = null;

      if (user.avatarHash) {
        avatar = user.avatarHash;
        if (user.avatarHash.startsWith('http://') || user.avatarHash.startsWith('https://')) {
          avatarUrl = user.avatarHash;
        } else {
          avatarUrl = `https://cdn.discordapp.com/avatars/${authorId}/${user.avatarHash}.png`;
        }
      }

      return {
        author_id: authorId,
        author_username: username,
        author_avatar: avatar,
        avatar_url: avatarUrl
      };
    }

    return {
      author_id: '0',
      author_username: 'Anónimo',
      author_avatar: null,
      avatar_url: null
    };
  }

  private async dispatchToBridge(id: string, text: string, author: ResolvedAuthor): Promise<void> {
    try {
      await this.bridgeClient.send({
        type: 'SUGGESTION_CREATED',
        data: {
          id,
          suggestion: text,
          author_id: author.author_id,
          author_username: author.author_username,
          author_avatar: author.author_avatar,
          avatar_url: author.avatar_url,
          content: {
            suggestion: text,
            author_id: author.author_id,
            author_username: author.author_username,
            avatar_url: author.avatar_url ?? author.author_avatar ?? null,
            created_at: new Date().toISOString()
          }
        }
      });

      // When send resolves, Phase 1 QUEUED frame was received from bridge
      const current = this.store.get(id);
      if (current && current.status !== 'confirmed' && current.status !== 'failed') {
        this.store.update(id, { status: 'processing' });
      }
    } catch (err: unknown) {
      let incidentId: string;
      let errorMessage: string;

      if (err instanceof BridgeRateLimitTimeoutError) {
        incidentId = err.incidentId;
        errorMessage = err.message;
        this.logger.log('RATE_LIMIT_TIMEOUT', errorMessage, incidentId);
      } else {
        errorMessage = err instanceof Error ? err.message : String(err);
        incidentId = this.logger.log('BRIDGE_SEND_FAILED', errorMessage);
      }

      this.store.update(id, {
        status: 'failed',
        incidentId,
        error: errorMessage
      });
    }
  }
}
