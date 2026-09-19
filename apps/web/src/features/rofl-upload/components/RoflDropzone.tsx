import { type ChangeEvent, type DragEvent, type KeyboardEvent, useRef, useState } from 'react';

export interface RoflDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean | undefined;
  isUploading?: boolean | undefined;
  currentFileName?: string | null | undefined;
}

export function RoflDropzone({
  onFileSelected,
  disabled = false,
  isUploading = false,
  currentFileName
}: RoflDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || isUploading) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || isUploading) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0]) {
      onFileSelected(files[0]);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      onFileSelected(files[0]);
    }
    // Reset value so selecting the same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <button
      type="button"
      aria-label="Dropzone for ROFL and ZIP files"
      disabled={disabled || isUploading}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`admin-rofl-dropzone-container ${isDragOver ? 'admin-rofl-dropzone-container-drag-over' : ''} ${disabled || isUploading ? 'admin-rofl-dropzone-container-disabled' : ''}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".rofl,.zip"
        tabIndex={-1}
        className="admin-rofl-dropzone-hidden-input"
        onChange={handleInputChange}
        disabled={disabled || isUploading}
      />
      <div className="admin-rofl-dropzone-icon-wrapper">
        <svg
          className="admin-rofl-dropzone-icon-svg"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h2 className="admin-rofl-dropzone-title">
        {isUploading
          ? `Uploading ${currentFileName ?? 'replay file'}...`
          : isDragOver
            ? 'Release file to begin ingestion'
            : 'Select or drop League of Legends replays'}
      </h2>
      <p className="admin-rofl-dropzone-description">
        Drag and drop a single match replay or a batch ZIP archive here, or click to browse.
      </p>
      <div className="admin-rofl-dropzone-badge-group">
        <span className="admin-rofl-dropzone-format-badge">.ROFL (Single Replay)</span>
        <span className="admin-rofl-dropzone-format-badge">.ZIP (Batch Archive)</span>
      </div>
    </button>
  );
}
