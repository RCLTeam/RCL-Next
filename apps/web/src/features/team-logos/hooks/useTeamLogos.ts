import { useEffect, useState } from 'react';
import { type Logo, teamLogosApi } from '../api/team-logos-api.js';

export function useTeamLogos() {
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
    teamLogosApi
      .list()
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

  async function upload() {
    if (!file) return;
    await run(async () => {
      if (file.name.toLowerCase() === 'placeholder.webp')
        throw new Error('El logo de reserva está protegido y no se puede modificar.');
      if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera los 5 MB.');
      const logo = await teamLogosApi.upload(file);
      setLogos((items) => [...items, logo].sort((a, b) => a.name.localeCompare(b.name)));
      setFile(null);
      setInputKey((key) => key + 1);
      setMessage(`Logo ${logo.name} subido.`);
    });
  }

  function refresh() {
    return run(async () => {
      setLogos(await teamLogosApi.list());
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await run(async () => {
      await teamLogosApi.remove(pendingDelete.name);
      setLogos((items) => items.filter((logo) => logo.name !== pendingDelete.name));
      setMessage(`Logo ${pendingDelete.name} eliminado.`);
      setPendingDelete(null);
    });
  }

  function copyUrl(logo: Logo) {
    return run(async () => {
      await navigator.clipboard.writeText(logo.url);
      setMessage('Ruta copiada.');
    });
  }

  return {
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
  };
}
