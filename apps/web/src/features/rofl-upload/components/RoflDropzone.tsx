import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState
} from 'react';

export interface RoflDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean | undefined;
  isUploading?: boolean | undefined;
  currentFileName?: string | null | undefined;
}

const styles: Record<string, CSSProperties> = {
  container: {
    border: '2px dashed rgba(123, 44, 255, 0.45)',
    borderRadius: '12px',
    padding: '3rem 2rem',
    textAlign: 'center',
    backgroundColor: '#121622',
    transition: 'all 0.2s ease-in-out',
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',
    userSelect: 'none'
  },
  containerDragOver: {
    border: '2px dashed #F4FF3A',
    backgroundColor: 'rgba(244, 255, 58, 0.05)',
    boxShadow: '0 0 20px rgba(244, 255, 58, 0.2)'
  },
  containerDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    borderColor: '#334155'
  },
  iconWrapper: {
    width: '64px',
    height: '64px',
    margin: '0 auto 1.25rem',
    borderRadius: '50%',
    backgroundColor: 'rgba(123, 44, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(123, 44, 255, 0.4)'
  },
  iconSvg: {
    width: '32px',
    height: '32px',
    stroke: '#F4FF3A',
    fill: 'none'
  },
  title: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#FFFFFF'
  },
  description: {
    margin: '0 0 1.25rem 0',
    fontSize: '0.9rem',
    color: '#94A3B8'
  },
  badgeGroup: {
    display: 'inline-flex',
    gap: '0.5rem',
    alignItems: 'center'
  },
  formatBadge: {
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    padding: '0.25rem 0.6rem',
    borderRadius: '4px',
    backgroundColor: '#1E2538',
    color: '#F4FF3A',
    border: '1px solid rgba(244, 255, 58, 0.25)'
  },
  hiddenInput: {
    display: 'none'
  }
};

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
      style={{
        ...styles.container,
        width: '100%',
        font: 'inherit',
        color: 'inherit',
        ...(isDragOver ? styles.containerDragOver : {}),
        ...(disabled || isUploading ? styles.containerDisabled : {})
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".rofl,.zip"
        tabIndex={-1}
        style={styles.hiddenInput}
        onChange={handleInputChange}
        disabled={disabled || isUploading}
      />
      <div style={styles.iconWrapper}>
        <svg
          style={styles.iconSvg}
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
      <h2 style={styles.title}>
        {isUploading
          ? `Uploading ${currentFileName ?? 'replay file'}...`
          : isDragOver
            ? 'Release file to begin ingestion'
            : 'Select or drop League of Legends replays'}
      </h2>
      <p style={styles.description}>
        Drag and drop a single match replay or a batch ZIP archive here, or click to browse.
      </p>
      <div style={styles.badgeGroup}>
        <span style={styles.formatBadge}>.ROFL (Single Replay)</span>
        <span style={styles.formatBadge}>.ZIP (Batch Archive)</span>
      </div>
    </button>
  );
}
