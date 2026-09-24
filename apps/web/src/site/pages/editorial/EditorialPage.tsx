import type { EditorialArticle } from '@rcl/contracts';
import React, { useEffect, useRef } from 'react';
import { ArticleView } from '../../../features/home-content/components/ArticleView.js';
import { ContentStatus } from '../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../features/home-content/useHomeContent.js';
import { useNavigate } from '../../../shared/navigation.js';

export function EditorialPage({ articleId }: { articleId: string }) {
  const content = useHomeContent<EditorialArticle>(`articles/${encodeURIComponent(articleId)}`);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editorial-modal"
      aria-label={content.data?.title ?? 'Editorial'}
      onCancel={(event) => {
        event.preventDefault();
        navigate('/');
      }}
    >
      <div className="editorial-modal-toolbar">
        <span className="eyebrow">Editorial RCL</span>
        <button type="button" onClick={() => navigate('/')} aria-label="Cerrar artículo">
          Cerrar ×
        </button>
      </div>
      <div className="editorial-modal-content">
        <ContentStatus {...content} />
        {content.data && (
          <ArticleView article={content.data} publishedAt={content.data.publishedAt} />
        )}
      </div>
    </dialog>
  );
}
