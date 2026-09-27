import React, { useEffect, useRef } from 'react';
import './modal.css';

export interface ModalProps {
  isOpen?: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ title, onClose, children, maxWidth }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  // Cerrar al hacer clic fuera del contenido del modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    const isClickOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (isClickOutside) {
      onClose();
    }
  };

  useEffect(() => {
    const element = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;

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
      ref={dialogRef}
      className="base-dialog"
      style={maxWidth ? ({ '--dialog-max-width': maxWidth } as React.CSSProperties) : undefined}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="base-dialog-toolbar">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar modal">
          Cerrar ×
        </button>
      </div>
      <div className="base-dialog-content">{children}</div>
    </dialog>
  );
}
