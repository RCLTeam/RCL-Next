import React, { type CSSProperties } from 'react';
import { RoflUploadPage } from './features/rofl-upload/pages/RoflUploadPage.js';

export interface AppProps {
  initialPath?: string | undefined;
  wsUrl?: string | undefined;
}

const styles: Record<string, CSSProperties> = {
  appContainer: {
    minHeight: '100vh',
    backgroundColor: '#0B0E14',
    color: '#F1F5F9',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid rgba(123, 44, 255, 0.3)',
    backgroundColor: '#111520'
  },
  brandGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  badge: {
    backgroundColor: '#7B2CFF',
    color: '#FFFFFF',
    fontWeight: 700,
    fontSize: '0.75rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '4px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase'
  },
  accentTag: {
    color: '#F4FF3A',
    fontWeight: 600,
    fontSize: '0.85rem'
  },
  main: {
    flex: 1,
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box'
  },
  titleCard: {
    backgroundColor: '#151A26',
    border: '1px solid rgba(123, 44, 255, 0.4)',
    borderLeft: '4px solid #F4FF3A',
    borderRadius: '8px',
    padding: '1.5rem 2rem',
    marginBottom: '2rem'
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.02em'
  },
  subtitle: {
    marginTop: '0.5rem',
    marginBottom: 0,
    color: '#94A3B8',
    fontSize: '0.95rem'
  },
  contentPlaceholder: {
    backgroundColor: '#121622',
    border: '1px dashed rgba(244, 255, 58, 0.3)',
    borderRadius: '8px',
    padding: '3rem 2rem',
    textAlign: 'center',
    color: '#94A3B8'
  },
  footer: {
    textAlign: 'center',
    padding: '1rem',
    fontSize: '0.8rem',
    color: '#64748B',
    borderTop: '1px solid #1E293B'
  }
};

export function App({ initialPath, wsUrl }: AppProps) {
  const [currentPath, setCurrentPath] = React.useState<string>(() => {
    if (initialPath) return initialPath;
    if (typeof window !== 'undefined') return window.location.pathname;
    return '/admin/rofl/upload';
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  };

  const isRoflUploadRoute = currentPath === '/admin/rofl/upload' || currentPath === '/';

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.brandGroup}>
          <span style={styles.badge}>RCL Admin</span>
          <span style={styles.accentTag}>League Replay Console</span>
        </div>
        <nav>
          <button
            type="button"
            onClick={() => navigate('/admin/rofl/upload')}
            style={{
              backgroundColor: isRoflUploadRoute ? 'rgba(123, 44, 255, 0.2)' : 'transparent',
              color: isRoflUploadRoute ? '#F4FF3A' : '#94A3B8',
              border: '1px solid',
              borderColor: isRoflUploadRoute ? '#7B2CFF' : 'transparent',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem'
            }}
          >
            ROFL Upload
          </button>
        </nav>
      </header>

      <main style={styles.main}>
        {isRoflUploadRoute ? (
          <RoflUploadPage wsUrl={wsUrl} />
        ) : (
          <div style={styles.titleCard}>
            <h1 style={styles.title}>404 — Not Found</h1>
            <p style={styles.subtitle}>The requested administrative view does not exist.</p>
            <button
              type="button"
              onClick={() => navigate('/admin/rofl/upload')}
              style={{
                marginTop: '1rem',
                backgroundColor: '#7B2CFF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Go to ROFL Upload
            </button>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        RCL Administrative Platform &bull; Real-Time Replay Parser
      </footer>
    </div>
  );
}
