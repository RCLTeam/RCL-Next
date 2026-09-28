import type { EditorialArticle } from '@rcl/contracts';
import React from 'react';
import { ArticleView } from '../../../features/home-content/components/ArticleView.js';
import { ContentStatus } from '../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../features/home-content/useHomeContent.js';
import { Modal } from '../../../shared/components/Modal/Modal.js';
import { useNavigate } from '../../../shared/navigation.js';

export function EditorialPage({ articleId }: { articleId: string }) {
  const content = useHomeContent<EditorialArticle>(`articles/${encodeURIComponent(articleId)}`);
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/');
  };
  const modalTitle = (
    <span className="editorial-dialog-label">Editorial · Crónica de la Rebelión</span>
  );

  return (
    <Modal title={modalTitle} onClose={handleClose} maxWidth="1000px">
      <div className="editorial-modal-content">
        <ContentStatus {...content} />
        {content.data && (
          <ArticleView article={content.data} publishedAt={content.data.publishedAt} />
        )}
      </div>
    </Modal>
  );
}
