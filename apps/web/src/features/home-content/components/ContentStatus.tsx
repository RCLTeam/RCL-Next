import React from 'react';

export function ContentStatus({
  loading,
  error,
  retry
}: { loading: boolean; error: string | undefined; retry: () => void }) {
  if (loading) return <output>Cargando contenido…</output>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  return null;
}
