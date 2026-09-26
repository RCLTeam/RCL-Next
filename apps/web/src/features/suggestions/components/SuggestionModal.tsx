import type React from 'react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBridgeHealth } from '../../discord-bridge/hooks/useBridgeHealth.js';
import { useSuggestion } from '../hooks/useSuggestion.js';
import { SuggestionForm } from './SuggestionForm.js';
import './suggestions.css';

export interface SuggestionModalProps {
  isOpen?: boolean;
  onClose: () => void;
  children?: ReactNode;
}

export function SuggestionModal({ isOpen = true, onClose, children }: SuggestionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [suggestion, setSuggestion] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const { data: healthData, isHealthy } = useBridgeHealth();
  const { status, incidentId, error, countdown, isSubmitting, submitSuggestion, reset } =
    useSuggestion();

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus = document.activeElement;
    if (!dialog.open) {
      dialog.showModal?.();
    }

    return () => {
      if (dialog.open) {
        dialog.close?.();
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) {
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    event.preventDefault();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitSuggestion({
      suggestion,
      isAnonymous
    });
  };

  const handleReset = () => {
    reset();
    setSuggestion('');
    setIsAnonymous(false);
  };

  return (
    <dialog
      ref={dialogRef}
      className="suggestion-dialog"
      aria-labelledby="suggestion-modal-title"
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onCancel={handleCancel}
    >
      <div className="suggestion-modal-header">
        <h2 id="suggestion-modal-title">Buzón de Sugerencias</h2>
        <button
          type="button"
          className="suggestion-modal-close"
          onClick={onClose}
          aria-label="Cerrar modal"
        >
          ✕
        </button>
      </div>

      <div className="suggestion-modal-body">
        {children ?? (
          <SuggestionForm
            suggestion={suggestion}
            isAnonymous={isAnonymous}
            onSuggestionChange={setSuggestion}
            onAnonymousChange={setIsAnonymous}
            status={status}
            isHealthy={isHealthy}
            bridgeMessage={healthData?.message}
            bridgeDetails={healthData?.details}
            nextRetryInSeconds={countdown}
            incidentId={incidentId}
            error={error}
            onSubmit={handleSubmit}
            onReset={handleReset}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </dialog>
  );
}
