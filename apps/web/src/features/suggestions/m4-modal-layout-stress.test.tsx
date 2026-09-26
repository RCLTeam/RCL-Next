import fs from 'node:fs';
import path from 'node:path';
import React, { type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigationContext } from '../../shared/navigation.js';
import { SiteLayout } from '../../site/layout/SiteLayout.js';
import { SuggestionForm, type SuggestionFormProps } from './components/SuggestionForm.js';
import { SuggestionModal } from './components/SuggestionModal.js';

interface ElementWithProps {
  props: {
    className?: string;
    children?: ElementWithProps[] | ElementWithProps | string;
    onClick?: (e?: unknown) => void | Promise<void>;
    onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
    onCancel?: (e: { preventDefault: () => void }) => void;
    'aria-label'?: string;
  };
}

describe('Empirical Adversarial Stress Suite: Modal, Clipboard & Layout Integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Modal & Dialog Accessibility (SuggestionModal.tsx)
  // =========================================================================
  describe('1. Modal & Dialog Accessibility Structure', () => {
    it('1.1 renders native HTML5 <dialog> with aria-labelledby and aria-modal attributes', () => {
      const html = renderToString(
        <SuggestionModal isOpen={true} onClose={() => {}}>
          <p>Children content</p>
        </SuggestionModal>
      );

      expect(html).toContain('<dialog');
      expect(html).toContain('class="suggestion-dialog"');
      expect(html).toContain('aria-labelledby="suggestion-modal-title"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('id="suggestion-modal-title"');
      expect(html).toContain('Buzón de Sugerencias');
      expect(html).toContain('Children content');
    });

    it('1.2 returns null when isOpen is false (no DOM pollution)', () => {
      const html = renderToString(
        <SuggestionModal isOpen={false} onClose={() => {}}>
          <p>Children content</p>
        </SuggestionModal>
      );

      expect(html).toBe('');
    });

    it('1.3 renders close button with accessible aria-label and click target', () => {
      const html = renderToString(<SuggestionModal isOpen={true} onClose={() => {}} />);

      expect(html).toContain(
        '<button type="button" class="suggestion-modal-close" aria-label="Cerrar modal">✕</button>'
      );
    });

    it('1.4 triggers onClose when backdrop click occurs (event.target === dialog)', () => {
      const onCloseMock = vi.fn();
      const holder = { element: null as ElementWithProps | null };

      function Harness() {
        holder.element = (
          SuggestionModal as unknown as (props: {
            isOpen: boolean;
            onClose: () => void;
          }) => ElementWithProps
        )({ isOpen: true, onClose: onCloseMock });
        return <SuggestionModal isOpen={true} onClose={onCloseMock} />;
      }

      renderToString(<Harness />);

      expect(holder.element).not.toBeNull();
      const dialogProps = holder.element?.props;
      expect(typeof dialogProps?.onClick).toBe('function');

      const handleBackdropClick = dialogProps?.onClick;

      // When clicking the backdrop: in browser DOM, event.target is the <dialog> itself
      // In SuggestionModal line 47: if (event.target === dialogRef.current) onClose();
      // During renderToString dialogRef.current is null:
      handleBackdropClick?.({ target: null, currentTarget: null });
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // When clicking a child element (e.g. modal body or text)
      onCloseMock.mockClear();
      handleBackdropClick?.({ target: { tagName: 'DIV', className: 'suggestion-modal-body' } });
      expect(onCloseMock).not.toHaveBeenCalled();
    });

    it('1.5 triggers onClose and calls preventDefault when Escape key is pressed', () => {
      const onCloseMock = vi.fn();
      const holder = { element: null as ElementWithProps | null };

      function Harness() {
        holder.element = (
          SuggestionModal as unknown as (props: {
            isOpen: boolean;
            onClose: () => void;
          }) => ElementWithProps
        )({ isOpen: true, onClose: onCloseMock });
        return <SuggestionModal isOpen={true} onClose={onCloseMock} />;
      }

      renderToString(<Harness />);

      const dialogProps = holder.element?.props;
      expect(typeof dialogProps?.onKeyDown).toBe('function');

      const preventDefaultMock = vi.fn();
      dialogProps?.onKeyDown?.({
        key: 'Escape',
        preventDefault: preventDefaultMock
      });

      expect(preventDefaultMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('1.6 does NOT trigger onClose when non-Escape keys are pressed', () => {
      const onCloseMock = vi.fn();
      const holder = { element: null as ElementWithProps | null };

      function Harness() {
        holder.element = (
          SuggestionModal as unknown as (props: {
            isOpen: boolean;
            onClose: () => void;
          }) => ElementWithProps
        )({ isOpen: true, onClose: onCloseMock });
        return <SuggestionModal isOpen={true} onClose={onCloseMock} />;
      }

      renderToString(<Harness />);

      const dialogProps = holder.element?.props;
      const preventDefaultMock = vi.fn();

      for (const nonEscapeKey of ['Enter', 'Tab', 'Space', 'ArrowDown', 'Backspace', 'KeyA']) {
        dialogProps?.onKeyDown?.({
          key: nonEscapeKey,
          preventDefault: preventDefaultMock
        });
      }

      expect(preventDefaultMock).not.toHaveBeenCalled();
      expect(onCloseMock).not.toHaveBeenCalled();
    });

    it('1.7 triggers onClose and calls preventDefault on native cancel event', () => {
      const onCloseMock = vi.fn();
      const holder = { element: null as ElementWithProps | null };

      function Harness() {
        holder.element = (
          SuggestionModal as unknown as (props: {
            isOpen: boolean;
            onClose: () => void;
          }) => ElementWithProps
        )({ isOpen: true, onClose: onCloseMock });
        return <SuggestionModal isOpen={true} onClose={onCloseMock} />;
      }

      renderToString(<Harness />);

      const dialogProps = holder.element?.props;
      expect(typeof dialogProps?.onCancel).toBe('function');

      const preventDefaultMock = vi.fn();
      dialogProps?.onCancel?.({
        preventDefault: preventDefaultMock
      });

      expect(preventDefaultMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('1.8 close button triggers onClose directly', () => {
      const onCloseMock = vi.fn();
      const holder = { element: null as ElementWithProps | null };

      function Harness() {
        holder.element = (
          SuggestionModal as unknown as (props: {
            isOpen: boolean;
            onClose: () => void;
          }) => ElementWithProps
        )({ isOpen: true, onClose: onCloseMock });
        return <SuggestionModal isOpen={true} onClose={onCloseMock} />;
      }

      renderToString(<Harness />);

      const children = holder.element?.props.children as ElementWithProps[];
      const header = children?.[0];
      const headerChildren = header?.props.children as ElementWithProps[];
      const closeButton = headerChildren?.[1];
      expect(closeButton?.props.className).toBe('suggestion-modal-close');
      expect(closeButton?.props['aria-label']).toBe('Cerrar modal');

      closeButton?.props.onClick?.();
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 2. Failure Banner and Clipboard Copying (SuggestionForm.tsx)
  // =========================================================================
  describe('2. Failure Banner and Clipboard Copying', () => {
    const baseProps: SuggestionFormProps = {
      suggestion: '',
      isAnonymous: false,
      status: 'idle',
      isHealthy: true,
      onSubmit: vi.fn(),
      onReset: vi.fn()
    };

    it('2.1 renders failure banner with [INCIDENT <uuid>] and alert role when status is failed', () => {
      const uuid = 'e27db905-0e7d-4c31-97b7-58b16955a153';
      const html = renderToString(
        <SuggestionForm
          {...baseProps}
          status="failed"
          incidentId={uuid}
          error="Timeout agotado tras 5 minutos de reintentos"
        />
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('suggestion-banner-error');
      expect(html).toContain('Error al enviar sugerencia');
      expect(html).toContain('Timeout agotado tras 5 minutos de reintentos');
      expect(html).toContain(`[INCIDENT ${uuid}]`);
      expect(html).toContain('suggestion-incident-id');
      expect(html).toContain('suggestion-copy-btn');
      expect(html).toContain('Copiar ID de incidente');
    });

    it('2.2 copy button invokes navigator.clipboard.writeText with the EXACT incident UUID', async () => {
      const uuid = '987fcdeb-51a2-4bc3-8def-0123456789ab';
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });

      const holder = { form: null as ElementWithProps | null };
      function Harness() {
        const formProps = {
          ...baseProps,
          status: 'failed' as const,
          incidentId: uuid,
          error: 'Bridge failure'
        };
        holder.form = (
          SuggestionForm as unknown as (props: SuggestionFormProps) => ElementWithProps
        )(formProps);
        return <SuggestionForm {...formProps} />;
      }

      renderToString(<Harness />);

      expect(holder.form).not.toBeNull();
      const formChildren = Array.isArray(holder.form?.props.children)
        ? (holder.form?.props.children as ElementWithProps[])
        : [holder.form?.props.children as ElementWithProps];
      const failureBanner = formChildren.find((child) =>
        child?.props?.className?.includes('suggestion-banner-error')
      );

      expect(failureBanner).toBeDefined();

      const bannerChildren = failureBanner?.props.children as ElementWithProps[];
      const incidentBox = bannerChildren?.find(
        (child) => child?.props?.className === 'suggestion-incident-box'
      );

      expect(incidentBox).toBeDefined();

      const boxChildren = incidentBox?.props.children as ElementWithProps[];
      const copyBtn = boxChildren?.find((child) =>
        child?.props?.className?.includes('suggestion-copy-btn')
      );

      expect(copyBtn).toBeDefined();
      expect(copyBtn?.props.children).toBe('Copiar ID de incidente');

      // Click copy button
      await copyBtn?.props.onClick?.();

      // Verify exact UUID was passed (NOT formatted with [INCIDENT ...])
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith(uuid);
    });

    it('2.3 handles clipboard write failure gracefully without throwing unhandled rejection', async () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard permission denied'));
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });

      const holder = { form: null as ElementWithProps | null };
      function Harness() {
        const formProps = {
          ...baseProps,
          status: 'failed' as const,
          incidentId: uuid
        };
        holder.form = (
          SuggestionForm as unknown as (props: SuggestionFormProps) => ElementWithProps
        )(formProps);
        return <SuggestionForm {...formProps} />;
      }

      renderToString(<Harness />);

      const formChildren = Array.isArray(holder.form?.props.children)
        ? (holder.form?.props.children as ElementWithProps[])
        : [holder.form?.props.children as ElementWithProps];
      const failureBanner = formChildren.find((child) =>
        child?.props?.className?.includes('suggestion-banner-error')
      );
      const bannerChildren = failureBanner?.props.children as ElementWithProps[];
      const incidentBox = bannerChildren?.find(
        (child) => child?.props?.className === 'suggestion-incident-box'
      );
      const boxChildren = incidentBox?.props.children as ElementWithProps[];
      const copyBtn = boxChildren?.find((child) =>
        child?.props?.className?.includes('suggestion-copy-btn')
      );

      // Should not throw
      await expect(copyBtn?.props.onClick?.()).resolves.toBeUndefined();
      expect(writeTextMock).toHaveBeenCalledWith(uuid);
    });

    it('2.4 handles clipboard copy gracefully when navigator.clipboard is undefined', async () => {
      const uuid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
      vi.stubGlobal('navigator', {});

      const holder = { form: null as ElementWithProps | null };
      function Harness() {
        const formProps = {
          ...baseProps,
          status: 'failed' as const,
          incidentId: uuid
        };
        holder.form = (
          SuggestionForm as unknown as (props: SuggestionFormProps) => ElementWithProps
        )(formProps);
        return <SuggestionForm {...formProps} />;
      }

      renderToString(<Harness />);

      const formChildren = Array.isArray(holder.form?.props.children)
        ? (holder.form?.props.children as ElementWithProps[])
        : [holder.form?.props.children as ElementWithProps];
      const failureBanner = formChildren.find((child) =>
        child?.props?.className?.includes('suggestion-banner-error')
      );
      const bannerChildren = failureBanner?.props.children as ElementWithProps[];
      const incidentBox = bannerChildren?.find(
        (child) => child?.props?.className === 'suggestion-incident-box'
      );
      const boxChildren = incidentBox?.props.children as ElementWithProps[];
      const copyBtn = boxChildren?.find((child) =>
        child?.props?.className?.includes('suggestion-copy-btn')
      );

      // When navigator.clipboard is undefined, accessing writeText would throw, but handled in try/catch
      await expect(copyBtn?.props.onClick?.()).resolves.toBeUndefined();
    });

    it('2.5 omits incident-box when status is failed but incidentId is missing', () => {
      const html = renderToString(
        <SuggestionForm
          {...baseProps}
          status="failed"
          incidentId={undefined}
          error="Error genérico sin incidente"
        />
      );

      expect(html).toContain('suggestion-banner-error');
      expect(html).toContain('Error genérico sin incidente');
      expect(html).not.toContain('suggestion-incident-box');
      expect(html).not.toContain('suggestion-copy-btn');
      expect(html).not.toContain('[INCIDENT');
    });

    it('2.6 reset button in failure banner calls onReset callback', () => {
      const onResetMock = vi.fn();
      const holder = { form: null as ElementWithProps | null };

      function Harness() {
        const formProps = {
          ...baseProps,
          status: 'failed' as const,
          incidentId: 'some-id',
          onReset: onResetMock
        };
        holder.form = (
          SuggestionForm as unknown as (props: SuggestionFormProps) => ElementWithProps
        )(formProps);
        return <SuggestionForm {...formProps} />;
      }

      renderToString(<Harness />);

      const formChildren = Array.isArray(holder.form?.props.children)
        ? (holder.form?.props.children as ElementWithProps[])
        : [holder.form?.props.children as ElementWithProps];
      const failureBanner = formChildren.find((child) =>
        child?.props?.className?.includes('suggestion-banner-error')
      );
      const bannerChildren = failureBanner?.props.children as ElementWithProps[];
      const retryBtn = bannerChildren?.find(
        (child) => child?.props?.children === 'Volver a intentar'
      );

      expect(retryBtn).toBeDefined();
      retryBtn?.props.onClick?.();
      expect(onResetMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. SiteLayout Footer Integration (SiteLayout.tsx & site-footer.css)
  // =========================================================================
  describe('3. SiteLayout Footer Integration', () => {
    it('3.1 renders "Sugerencias" button under <h2>Contactos</h2> in footer', () => {
      const html = renderToString(
        <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
          <SiteLayout>
            <div id="page-body">Página principal</div>
          </SiteLayout>
        </NavigationContext.Provider>
      );

      // Verify Contactos section
      expect(html).toContain('<h2>Contactos</h2>');
      expect(html).toContain('footer-suggestion-btn');
      expect(html).toContain('Sugerencias');

      // Verify exact HTML structure
      const contactsPattern =
        /<h2>Contactos<\/h2>\s*<button type="button" class="footer-suggestion-btn">Sugerencias<\/button>/;
      expect(html).toMatch(contactsPattern);
    });

    it('3.2 does NOT render SuggestionModal in initial state (modal closed by default)', () => {
      const html = renderToString(
        <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
          <SiteLayout>
            <div>Página</div>
          </SiteLayout>
        </NavigationContext.Provider>
      );

      expect(html).not.toContain('suggestion-dialog');
      expect(html).not.toContain('Buzón de Sugerencias');
    });

    it('3.3 site-footer.css rules for .footer-suggestion-btn match footer link aesthetics with zero layout shift', () => {
      const cssPath = path.resolve(__dirname, '../../site/layout/site-footer.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Verify .footer-suggestion-btn exists and shares styling with links
      expect(css).toContain('.rcl-site .footer-links .footer-suggestion-btn');
      expect(css).toContain('color: var(--lime);');
      expect(css).toContain('background: none;');
      expect(css).toContain('border: none;');
      expect(css).toContain('padding: 0;');
      expect(css).toContain('margin: 0;');
      expect(css).toContain('cursor: pointer;');
      expect(css).toContain('text-align: left;');
      expect(css).toContain('.rcl-site .footer-links .footer-suggestion-btn:hover');
      expect(css).toContain('text-decoration: underline;');
    });
  });

  // =========================================================================
  // 4. Security Check: Isolation & Credential Protection
  // =========================================================================
  describe('4. Security & Isolation Verification', () => {
    it('4.1 apps/web/ production code contains ZERO occurrences of DISCORD_BOT_WS_SUPERTOKEN', () => {
      const webSrc = path.resolve(__dirname, '../../');

      function searchDirectory(dir: string): string[] {
        const matches: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.turbo') {
              matches.push(...searchDirectory(fullPath));
            }
          } else if (
            entry.isFile() &&
            !entry.name.includes('.test.') &&
            (entry.name.endsWith('.ts') ||
              entry.name.endsWith('.tsx') ||
              entry.name.endsWith('.json') ||
              entry.name.endsWith('.html'))
          ) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes('DISCORD_BOT_WS_SUPERTOKEN')) {
              matches.push(fullPath);
            }
          }
        }
        return matches;
      }

      const leaks = searchDirectory(webSrc);
      expect(leaks).toEqual([]);
    });

    it('4.2 apps/web/ production code contains ZERO references to DISCORD_BOT_WS_URL', () => {
      const webSrc = path.resolve(__dirname, '../../');

      function searchDirectory(dir: string): string[] {
        const matches: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.turbo') {
              matches.push(...searchDirectory(fullPath));
            }
          } else if (
            entry.isFile() &&
            !entry.name.includes('.test.') &&
            (entry.name.endsWith('.ts') ||
              entry.name.endsWith('.tsx') ||
              entry.name.endsWith('.json') ||
              entry.name.endsWith('.html'))
          ) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes('DISCORD_BOT_WS_URL')) {
              matches.push(fullPath);
            }
          }
        }
        return matches;
      }

      const leaks = searchDirectory(webSrc);
      expect(leaks).toEqual([]);
    });

    it('4.3 all suggestions and bridge communication in apps/web is exclusively HTTP REST', () => {
      const suggestionsApi = fs.readFileSync(
        path.resolve(__dirname, 'api/suggestions-api.ts'),
        'utf-8'
      );
      const bridgeApi = fs.readFileSync(
        path.resolve(__dirname, '../discord-bridge/api/bridge-api.ts'),
        'utf-8'
      );

      // Verify suggestions endpoints
      expect(suggestionsApi).toContain("fetch('/api/v1/suggestions'");
      expect(suggestionsApi).toContain('fetch(`/api/v1/suggestions/status/');
      expect(suggestionsApi).not.toMatch(/new\s+WebSocket/);

      // Verify bridge endpoint
      expect(bridgeApi).toContain("fetch('/api/v1/bridge/health'");
      expect(bridgeApi).not.toMatch(/new\s+WebSocket/);
    });
  });
});
