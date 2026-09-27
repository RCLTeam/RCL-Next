import React, { type ReactNode } from 'react';

interface PageLayoutProps {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function PageLayout({
  id,
  number,
  title,
  subtitle,
  description,
  toolbar,
  children
}: PageLayoutProps) {
  return (
    <section className="page-layout" id={id} aria-labelledby={`${id}-title`}>
      <div className="page-hud" aria-hidden="true">
        <span>
          <i />
          {number} · {title}
        </span>
        <span>{subtitle}</span>
      </div>
      <header className="page-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {number} · {subtitle}
            </span>
            <h1 id={`${id}-title`}>{title}</h1>
          </div>
          <span className="section-cross" aria-hidden="true">
            ×
          </span>
        </div>
        <p className="page-description">{description}</p>
      </header>
      {toolbar && <div className="page-toolbar">{toolbar}</div>}
      <div className="page-content">{children}</div>
    </section>
  );
}
