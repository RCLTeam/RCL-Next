import type { BridgeHealthMessage, BridgeHealthStatus, SuggestionStatus } from '@rcl/contracts';
import type React from 'react';
import { useState } from 'react';

export interface SuggestionFormProps {
  suggestion?: string;
  isAnonymous?: boolean;
  onSuggestionChange?: (value: string) => void;
  onAnonymousChange?: (value: boolean) => void;
  status?: SuggestionStatus | 'idle';
  isHealthy?: boolean;
  bridgeMessage?: string | undefined;
  bridgeDetails?: string | undefined;
  healthStatus?: BridgeHealthStatus;
  healthMessage?: BridgeHealthMessage | string | null | undefined;
  healthDetails?: string | null | undefined;
  nextRetryInSeconds?: number | null | undefined;
  countdown?: number | undefined;
  incidentId?: string | null | undefined;
  error?: string | null | undefined;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onReset?: () => void;
  isSubmitting?: boolean;
  initialText?: string;
  initialAnonymous?: boolean;
}

export function SuggestionForm({
  suggestion,
  isAnonymous,
  onSuggestionChange,
  onAnonymousChange,
  status = 'idle',
  isHealthy = true,
  bridgeMessage,
  bridgeDetails,
  healthMessage,
  healthDetails,
  nextRetryInSeconds,
  countdown,
  incidentId,
  error,
  onSubmit,
  onReset,
  isSubmitting = false,
  initialText = '',
  initialAnonymous = false
}: SuggestionFormProps) {
  const [localText, setLocalText] = useState(initialText);
  const [localAnonymous, setLocalAnonymous] = useState(initialAnonymous);
  const [copied, setCopied] = useState(false);

  const currentText = suggestion !== undefined ? suggestion : localText;
  const currentAnonymous = isAnonymous !== undefined ? isAnonymous : localAnonymous;

  const handleTextChange = (val: string) => {
    setLocalText(val);
    onSuggestionChange?.(val);
  };

  const handleAnonChange = (val: boolean) => {
    setLocalAnonymous(val);
    onAnonymousChange?.(val);
  };

  const charCount = currentText.length;
  const trimmedLength = currentText.trim().length;
  const isLengthValid = trimmedLength >= 10 && trimmedLength <= 1000;
  const isInProgress =
    status === 'queued' ||
    status === 'sending' ||
    status === 'processing' ||
    status === 'retrying' ||
    isSubmitting;
  const isSubmitDisabled = !isHealthy || !isLengthValid || isInProgress;

  const resolvedMessage = bridgeMessage ?? healthMessage ?? 'Servicio de sugerencias no disponible';
  const resolvedDetails = bridgeDetails ?? healthDetails;
  const retryRemaining = nextRetryInSeconds ?? countdown ?? 0;

  const handleCopyIncident = async () => {
    if (!incidentId) return;
    try {
      await navigator.clipboard.writeText(incidentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback si no está disponible el portapapeles
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    onSubmit?.(e);
  };

  if (status === 'confirmed') {
    return (
      <output className="suggestion-banner suggestion-banner-success">
        <div className="suggestion-banner-icon" aria-hidden="true">
          ✓
        </div>
        <h3>¡Sugerencia enviada!</h3>
        <p>Tu sugerencia ha sido tramitada y publicada con éxito en el canal de Discord.</p>
        <button type="button" className="btn-primary" onClick={onReset}>
          Enviar otra sugerencia
        </button>
      </output>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="suggestion-form">
      {!isHealthy && (
        <div className="suggestion-alert suggestion-alert-warning" role="alert">
          <span className="suggestion-alert-icon" aria-hidden="true">
            ⚠️
          </span>
          <div className="suggestion-alert-content">
            <strong>{resolvedMessage}</strong>
            {resolvedDetails && <p>{resolvedDetails}</p>}
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="suggestion-banner suggestion-banner-error" role="alert">
          <h3>Error al enviar sugerencia</h3>
          <p>{error || 'Ha ocurrido un error inesperado al tramitar tu sugerencia.'}</p>
          {incidentId && (
            <div className="suggestion-incident-box">
              <span className="suggestion-incident-label">Código de incidencia:</span>
              <code className="suggestion-incident-id">{`[INCIDENT ${incidentId}]`}</code>
              <button
                type="button"
                className="btn-ghost suggestion-copy-btn"
                onClick={handleCopyIncident}
              >
                {copied ? '¡Copiado!' : 'Copiar ID de incidente'}
              </button>
            </div>
          )}
          <button type="button" className="btn-ghost" onClick={onReset}>
            Volver a intentar
          </button>
        </div>
      )}

      {isInProgress && (
        <output className="suggestion-status-indicator" aria-live="polite">
          <span className="suggestion-spinner" aria-hidden="true" />
          <span className="suggestion-status-text">
            {status === 'queued' && 'En cola...'}
            {status === 'sending' && 'Enviando...'}
            {status === 'processing' && 'Procesando en Discord...'}
            {status === 'retrying' && `Reintentando en ${retryRemaining} segundos...`}
          </span>
        </output>
      )}

      <div className="content-field">
        <div className="suggestion-field-header">
          <label htmlFor="suggestion-textarea">Tu sugerencia</label>
          <span
            className={`suggestion-counter ${charCount > 1000 ? 'is-overflow' : ''}`}
            aria-live="polite"
          >
            {`${charCount} / 1000`}
          </span>
        </div>
        <textarea
          id="suggestion-textarea"
          name="suggestion"
          rows={5}
          maxLength={1000}
          value={currentText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Escribe tu sugerencia (entre 10 y 1000 caracteres)..."
          disabled={!isHealthy || isInProgress}
          required
        />
        {charCount > 0 && trimmedLength < 10 && (
          <small className="suggestion-hint">
            Mínimo 10 caracteres (faltan {10 - trimmedLength})
          </small>
        )}
      </div>

      <label className="content-check suggestion-anonymous-check">
        <input
          type="checkbox"
          name="isAnonymous"
          checked={currentAnonymous}
          onChange={(e) => handleAnonChange(e.target.checked)}
          disabled={!isHealthy || isInProgress}
        />
        <span>Enviar de forma anónima</span>
      </label>

      <div className="suggestion-actions">
        <button type="submit" className="btn-primary" disabled={isSubmitDisabled}>
          {isSubmitting ? 'Enviando...' : 'Enviar sugerencia'}
        </button>
      </div>
    </form>
  );
}
