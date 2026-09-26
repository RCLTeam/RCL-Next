import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SuggestionModal } from './SuggestionModal.js';

describe('SuggestionModal', () => {
  it('renders native dialog with accessible title when isOpen is true', () => {
    const html = renderToString(
      <SuggestionModal isOpen={true} onClose={() => {}}>
        <p>Contenido del formulario de prueba</p>
      </SuggestionModal>
    );

    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="suggestion-modal-title"');
    expect(html).toContain('Buzón de Sugerencias');
    expect(html).toContain('Contenido del formulario de prueba');
  });

  it('does not render dialog content when isOpen is false', () => {
    const html = renderToString(
      <SuggestionModal isOpen={false} onClose={() => {}}>
        <p>Contenido del formulario</p>
      </SuggestionModal>
    );

    expect(html).not.toContain('<dialog');
    expect(html).not.toContain('Contenido del formulario');
  });

  it('renders accessible close button with aria-label', () => {
    const html = renderToString(
      <SuggestionModal isOpen={true} onClose={() => {}}>
        <div>Modal</div>
      </SuggestionModal>
    );

    expect(html).toContain('aria-label="Cerrar modal"');
    expect(html).toContain('suggestion-modal-close');
  });

  it('renders default SuggestionForm when children are omitted', () => {
    const html = renderToString(<SuggestionModal isOpen={true} onClose={() => {}} />);

    expect(html).toContain('Tu sugerencia');
    expect(html).toContain('Enviar sugerencia');
    expect(html).toContain('Enviar de forma anónima');
  });
});
