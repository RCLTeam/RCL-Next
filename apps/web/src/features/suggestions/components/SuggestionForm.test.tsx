import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestionForm, type SuggestionFormProps } from './SuggestionForm.js';

const baseProps: SuggestionFormProps = {
  suggestion: '',
  isAnonymous: false,
  onSuggestionChange: vi.fn(),
  onAnonymousChange: vi.fn(),
  status: 'idle',
  isHealthy: true,
  bridgeMessage: undefined,
  bridgeDetails: undefined,
  nextRetryInSeconds: undefined,
  incidentId: undefined,
  error: undefined,
  onSubmit: vi.fn(),
  onReset: vi.fn(),
  isSubmitting: false
};

describe('SuggestionForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders textarea, character counter, anonymous checkbox and submit button', () => {
    const html = renderToString(<SuggestionForm {...baseProps} suggestion="Hola mundo!" />);
    expect(html).toContain('Tu sugerencia');
    expect(html).toContain('11 / 1000');
    expect(html).toContain('Enviar de forma anónima');
    expect(html).toContain('Enviar sugerencia');
  });

  it('disables submit button when trimmed length is under 10 chars', () => {
    const htmlEmpty = renderToString(<SuggestionForm {...baseProps} suggestion="" />);
    expect(htmlEmpty).toMatch(/disabled=""[^>]*>Enviar sugerencia/);

    const htmlShort = renderToString(<SuggestionForm {...baseProps} suggestion="Corto" />);
    expect(htmlShort).toMatch(/disabled=""[^>]*>Enviar sugerencia/);
    expect(htmlShort).toContain('Mínimo 10 caracteres');
  });

  it('disables submit button when length exceeds 1000 characters', () => {
    const htmlValid = renderToString(
      <SuggestionForm {...baseProps} suggestion={'a'.repeat(1000)} />
    );
    expect(htmlValid).not.toMatch(/disabled=""[^>]*>Enviar sugerencia/);

    const htmlOver = renderToString(
      <SuggestionForm {...baseProps} suggestion={'a'.repeat(1001)} />
    );
    expect(htmlOver).toMatch(/disabled=""[^>]*>Enviar sugerencia/);
  });

  it('disables submit button and shows diagnostic alert when isHealthy is false', () => {
    const html = renderToString(
      <SuggestionForm
        {...baseProps}
        isHealthy={false}
        bridgeMessage="No se puede llegar a él"
        bridgeDetails="El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta"
        suggestion="Sugerencia con suficiente longitud para ser válida"
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('No se puede llegar a él');
    expect(html).toContain('El websocket no pudo iniciarse');
    expect(html).toMatch(/disabled=""[^>]*>Enviar sugerencia/);
  });

  it('renders in-progress indicator for queued, sending, and processing states', () => {
    const htmlQueued = renderToString(<SuggestionForm {...baseProps} status="queued" />);
    expect(htmlQueued).toContain('En cola...');

    const htmlSending = renderToString(<SuggestionForm {...baseProps} status="sending" />);
    expect(htmlSending).toContain('Enviando...');

    const htmlProcessing = renderToString(<SuggestionForm {...baseProps} status="processing" />);
    expect(htmlProcessing).toContain('Procesando en Discord...');
  });

  it('renders anti-stampede countdown during retrying status', () => {
    const html = renderToString(
      <SuggestionForm {...baseProps} status="retrying" nextRetryInSeconds={24} />
    );
    expect(html).toContain('Reintentando en 24 segundos...');
  });

  it('renders success confirmation banner with reset button when confirmed', () => {
    const html = renderToString(<SuggestionForm {...baseProps} status="confirmed" />);
    expect(html).toContain('¡Sugerencia enviada!');
    expect(html).toContain('Enviar otra sugerencia');
    expect(html).not.toContain('<textarea');
  });

  it('renders failure banner with incident code and copy button on failed status', () => {
    const uuid = 'c4b8e219-3351-4ef4-8c81-fb264f331cf1';
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });

    const html = renderToString(
      <SuggestionForm
        {...baseProps}
        status="failed"
        error="Fallo terminal en el bridge"
        incidentId={uuid}
      />
    );
    expect(html).toContain('Error al enviar sugerencia');
    expect(html).toContain('Fallo terminal en el bridge');
    expect(html).toContain(`[INCIDENT ${uuid}]`);
    expect(html).toContain('Copiar ID de incidente');
  });

  it('renders anonymous checkbox toggle properly', () => {
    const htmlOff = renderToString(<SuggestionForm {...baseProps} isAnonymous={false} />);
    expect(htmlOff).not.toMatch(/<input[^>]*checked=""[^>]*name="isAnonymous"/);

    const htmlOn = renderToString(<SuggestionForm {...baseProps} isAnonymous={true} />);
    expect(htmlOn).toMatch(/<input[^>]*name="isAnonymous"[^>]*checked=""/);
  });
});
