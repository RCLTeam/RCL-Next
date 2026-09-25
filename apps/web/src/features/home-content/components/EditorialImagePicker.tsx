import React, { useId, useState } from 'react';
import { contentRequest } from '../home-content-api.js';

export function EditorialImagePicker({
  label,
  description: controlledDescription,
  onDescriptionChange,
  descriptionRequired = false,
  onUploaded,
  onBusy
}: {
  label: string;
  description?: string;
  onDescriptionChange?: (value: string) => void;
  descriptionRequired?: boolean;
  onUploaded: (url: string, description: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const [localDescription, setLocalDescription] = useState('');
  const description = controlledDescription ?? localDescription;
  const setDescription = onDescriptionChange ?? setLocalDescription;
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  return (
    <div className="content-field">
      <label htmlFor={`${id}-description`}>Descripción · {label}</label>
      <input
        id={`${id}-description`}
        value={description}
        maxLength={240}
        required={descriptionRequired}
        onChange={(event) => setDescription(event.target.value)}
      />
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setError('');
          if (!description.trim()) {
            setError('Escribe una descripción antes de seleccionar la imagen.');
            return;
          }
          if (
            !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            setError('Elige un archivo PNG, JPEG o WebP de hasta 5 MB.');
            return;
          }
          setUploading(true);
          onBusy(true);
          try {
            const result = await contentRequest<{ url: string }>('admin/images', {
              method: 'POST',
              headers: { 'Content-Type': file.type },
              body: file
            });
            onUploaded(result.url, description.trim());
            if (controlledDescription === undefined) setLocalDescription('');
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'No se pudo subir la imagen.');
          } finally {
            setUploading(false);
            onBusy(false);
          }
        }}
      />
      <small>{uploading ? 'Subiendo imagen…' : 'PNG, JPEG o WebP · Hasta 5 MB.'}</small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
