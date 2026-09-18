import React from 'react';
import { SiteLink } from '../../navigation.js';
import './not-found.css';

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <section className="empty-state not-found">
        <h1>404 — Not Found</h1>
        <p>La página que buscas no existe.</p>
        <SiteLink className="btn-primary" href="/">
          Volver al inicio
        </SiteLink>
      </section>
    </div>
  );
}
