import type { EditorialArticle, EditorialInput, EditorialKind } from '@rcl/contracts';
import React, { useState } from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { deleteArticle, saveArticle } from '../home-content-api.js';
import { useHomeContent } from '../useHomeContent.js';
import { ArticleView } from './ArticleView.js';
import { ContentField } from './ContentField.js';
import { ContentStatus } from './ContentStatus.js';
import type { EditorStateProps } from './HomeContentPanel.js';

const emptyArticle: EditorialInput = {
  title: '',
  excerpt: '',
  body: '',
  kind: 'noticia',
  author: '',
  coverUrl: '',
  coverAlt: '',
  published: false,
  showOnHome: false,
  homeOrder: 0
};

export function EditorialManager(props: EditorStateProps) {
  const content = useHomeContent<EditorialArticle[]>('admin/articles');
  const [selected, setSelected] = useState<EditorialArticle | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  function select(article: EditorialArticle | 'new' | null) {
    if (props.dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    props.onDirty(false);
    setSelected(article);
  }
  return (
    <section aria-label="Gestionar editorial">
      <div className="content-manager-heading">
        <div>
          <h3>Historias de la liga</h3>
          <p>
            El orden más bajo ocupa la portada. Solo aparecen en la home los artículos publicados y
            marcados para mostrar.
          </p>
        </div>
        <button
          type="button"
          className="content-primary"
          disabled={busy}
          onClick={() => select('new')}
        >
          + Nuevo artículo
        </button>
      </div>
      <div className="editorial-manager-grid">
        <aside className="content-article-list" aria-label="Artículos">
          <ContentStatus {...content} />
          {content.data?.length === 0 && <p>Aún no hay artículos. Crea la primera historia.</p>}
          {content.data?.map((article) => (
            <button
              type="button"
              disabled={busy}
              className="content-article-row"
              aria-pressed={selected !== 'new' && selected?.id === article.id}
              key={article.id}
              onClick={() => select(article)}
            >
              <span className="meta">
                {article.kind} · {article.published ? 'Publicado' : 'Borrador'}
              </span>
              <strong>{article.title}</strong>
              <span>
                {article.showOnHome ? `Home · Orden ${article.homeOrder}` : 'Fuera de la home'}
              </span>
            </button>
          ))}
        </aside>
        {selected ? (
          <ArticleForm
            key={selected === 'new' ? 'new' : selected.id}
            initial={selected === 'new' ? null : selected}
            {...props}
            onBusy={(value) => {
              setBusy(value);
              props.onBusy(value);
            }}
            onSaved={(article) => {
              props.onDirty(false);
              setSelected(article);
              content.retry();
            }}
            onDeleted={() => {
              props.onDirty(false);
              setSelected(null);
              content.retry();
            }}
          />
        ) : (
          <div className="content-editor-empty">
            <span className="eyebrow">Editorial</span>
            <h3>Una historia merece su espacio.</h3>
            <p>
              Selecciona un artículo para editarlo o crea una noticia, un reportaje o una
              entrevista.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ArticleForm({
  initial,
  onDirty,
  onBusy,
  onSaved,
  onDeleted
}: EditorStateProps & {
  initial: EditorialArticle | null;
  onSaved: (article: EditorialArticle) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<EditorialInput>(() =>
    initial
      ? {
          title: initial.title,
          excerpt: initial.excerpt,
          body: initial.body,
          kind: initial.kind,
          author: initial.author,
          coverUrl: initial.coverUrl,
          coverAlt: initial.coverAlt,
          published: initial.published,
          showOnHome: initial.showOnHome,
          homeOrder: initial.homeOrder
        }
      : { ...emptyArticle }
  );
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function update(value: Partial<EditorialInput>) {
    setForm((current) => ({ ...current, ...value }));
    onDirty(true);
    setMessage('');
  }
  async function remove() {
    if (!initial || !window.confirm(`¿Eliminar definitivamente «${initial.title}»?`)) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      await deleteArticle(initial.id);
      onDeleted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo eliminar.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="content-editor">
      <div className="content-actions">
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? 'Volver al editor' : 'Vista previa'}
        </button>
        {initial?.published && (
          <SiteLink href={`/editorial/${initial.id}`}>Ver publicado ↗</SiteLink>
        )}
      </div>
      {preview && (
        <div className="content-preview">
          <ArticleView article={form} publishedAt={initial?.publishedAt} />
        </div>
      )}
      <form
        hidden={preview}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          onBusy(true);
          setError('');
          setMessage('');
          try {
            const article = await saveArticle(initial?.id ?? null, form);
            onSaved(article);
            setMessage(article.published ? 'Artículo publicado.' : 'Borrador guardado.');
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
          } finally {
            setBusy(false);
            onBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>{initial ? 'Editar artículo' : 'Nuevo artículo'}</legend>
          <ContentField
            label="Título"
            value={form.title}
            onChange={(title) => update({ title })}
            maxLength={180}
          />
          <div className="content-field">
            <label htmlFor="editorial-kind">Tipo de publicación</label>
            <select
              id="editorial-kind"
              value={form.kind}
              onChange={(event) => update({ kind: event.target.value as EditorialKind })}
            >
              <option value="noticia">Noticia</option>
              <option value="reportaje">Reportaje</option>
              <option value="entrevista">Entrevista</option>
              <option value="otro">Otro tema</option>
            </select>
          </div>
          <ContentField
            label="Autor"
            value={form.author}
            onChange={(author) => update({ author })}
            maxLength={120}
          />
          <ContentField
            label="Subtítulo (opcional)"
            value={form.excerpt}
            onChange={(excerpt) => update({ excerpt })}
            maxLength={500}
            required={false}
            multiline
          />
          <ContentField
            label="URL de portada"
            value={form.coverUrl}
            onChange={(coverUrl) => update({ coverUrl })}
            maxLength={2000}
            type="url"
            required={false}
            hint="Imagen pública con HTTPS (opcional)."
          />
          <ContentField
            label="Descripción de la imagen"
            value={form.coverAlt}
            onChange={(coverAlt) => update({ coverAlt })}
            maxLength={240}
            required={!!form.coverUrl}
          />
          <ContentField
            label="Contenido"
            value={form.body}
            onChange={(body) => update({ body })}
            maxLength={100000}
            multiline
            hint="Separa párrafos con una línea en blanco. Usa ## al inicio de un bloque para un subtítulo y > para una cita. No se admite HTML."
          />
          <div className="content-publication">
            <label className="content-check">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(event) => update({ published: event.target.checked })}
              />
              Publicado
            </label>
            <label className="content-check">
              <input
                type="checkbox"
                checked={form.showOnHome}
                onChange={(event) => update({ showOnHome: event.target.checked })}
              />
              Mostrar en la editorial de la home
            </label>
            <div className="content-field">
              <label htmlFor="editorial-order">Orden en la home (0 primero)</label>
              <input
                id="editorial-order"
                type="number"
                min={0}
                max={9999}
                step={1}
                required
                value={form.homeOrder}
                onChange={(event) => update({ homeOrder: Number(event.target.value) })}
              />
            </div>
          </div>
          <div className="content-actions">
            <button type="submit" className="content-primary">
              {busy ? 'Guardando…' : 'Guardar artículo'}
            </button>
            {initial && (
              <button type="button" className="content-danger" onClick={remove}>
                Eliminar artículo
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
