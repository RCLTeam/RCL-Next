import React from 'react';
import { useTeamLogos } from './hooks/useTeamLogos.js';
import './team-logos.css';

export function TeamLogosPanel() {
  const {
    logos,
    loading,
    busy,
    error,
    message,
    file,
    setFile,
    pendingDelete,
    setPendingDelete,
    inputKey,
    upload,
    refresh,
    confirmDelete,
    copyUrl
  } = useTeamLogos();

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
          void upload();
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
        onClick={() => void refresh()}
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
            onClick={() => void confirmDelete()}
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
              onClick={() => void copyUrl(logo)}
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
