import React, { useEffect, useState } from 'react';
import './team-logos.css';

type Logo = { name: string; url: string };

async function logoRequest<T>(path = '', init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/team-logos/admin${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Inicia sesión de nuevo.',
      403: 'No tienes permisos para gestionar logos.',
      404: 'El logo ya no existe. Actualiza la lista.',
      409: 'Ya existe un logo con ese nombre.',
      413: 'La imagen supera los 5 MB.',
      422: 'Usa una imagen PNG, JPEG o WebP y un nombre con letras, números o guiones.'
    };
    throw new Error(
      messages[response.status] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
    );
  }
  return (await response.json()).data as T;
}

export function TeamLogosPanel() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Logo | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    let active = true;
    logoRequest<Logo[]>()
      .then((items) => {
        if (active) setLogos(items);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="team-logos-panel" aria-labelledby="team-logos-title">
      <div className="content-manager-heading">
        <div>
          <span className="eyebrow">Identidad de los equipos</span>
          <h2 id="team-logos-title">Team Logos</h2>
          <p>Sube logos y copia su ruta para asignarla al equipo desde CRUD Operations.</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!file) return;
          void run(async () => {
            if (file.name.toLowerCase() === 'placeholder.webp')
              throw new Error('El logo de reserva está protegido y no se puede modificar.');
            if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera los 5 MB.');
            const logo = await logoRequest<Logo>(`/${encodeURIComponent(file.name)}`, {
              method: 'POST',
              headers: { 'Content-Type': file.type },
              body: file
            });
            setLogos((items) => [...items, logo].sort((a, b) => a.name.localeCompare(b.name)));
            setFile(null);
            setInputKey((key) => key + 1);
            setMessage(`Logo ${logo.name} subido.`);
          });
        }}
      >
        <label htmlFor="team-logo-file">Nuevo logo</label>
        <input
          key={inputKey}
          id="team-logo-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || loading}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <small>
          PNG, JPEG o WebP · Hasta 5 MB. Nombre con letras, números o guiones. No se sobrescriben
          archivos existentes.
        </small>
        <button className="btn-primary" type="submit" disabled={!file || busy || loading}>
          Subir logo
        </button>
      </form>
      <button
        className="btn-ghost"
        type="button"
        disabled={busy || loading}
        onClick={() =>
          void run(async () => {
            setLogos(await logoRequest<Logo[]>());
          })
        }
      >
        Actualizar lista
      </button>
      {error && <p role="alert">{error}</p>}
      <output>{loading ? 'Cargando logos…' : busy ? 'Procesando…' : message}</output>
      {!loading && !error && logos.length === 0 && <p>No hay logos. Sube el primero.</p>}
      {pendingDelete && (
        <fieldset className="team-logo-confirm" aria-label="Confirmar eliminación">
          <p>
            ¿Eliminar {pendingDelete.name}? Los equipos que utilicen este logo dejarán de mostrarlo.
          </p>
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await logoRequest<null>(`/${encodeURIComponent(pendingDelete.name)}`, {
                  method: 'DELETE'
                });
                setLogos((items) => items.filter((logo) => logo.name !== pendingDelete.name));
                setMessage(`Logo ${pendingDelete.name} eliminado.`);
                setPendingDelete(null);
              })
            }
          >
            Confirmar eliminación
          </button>
          <button
            className="btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => setPendingDelete(null)}
          >
            Cancelar
          </button>
        </fieldset>
      )}
      <ul className="team-logos-grid">
        {logos.map((logo) => (
          <li key={logo.name}>
            <img src={logo.url} alt={`Logo ${logo.name}`} loading="lazy" />
            <strong>{logo.name}</strong>
            <input
              aria-label={`Ruta de ${logo.name}`}
              readOnly
              value={logo.url}
              onFocus={(event) => event.target.select()}
            />
            <button
              className="btn-ghost"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(logo.url);
                  setMessage('Ruta copiada.');
                })
              }
            >
              Copiar ruta
            </button>
            {logo.name.toLowerCase() === 'placeholder.webp' ? (
              <span className="team-logo-protected">Logo de reserva · Protegido</span>
            ) : (
              <button
                className="btn-ghost team-logo-delete"
                type="button"
                disabled={busy}
                onClick={() => setPendingDelete(logo)}
              >
                Eliminar {logo.name}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
