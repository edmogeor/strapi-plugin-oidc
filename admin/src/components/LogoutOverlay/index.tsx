import { useEffect, useState } from 'react';
import { DesignSystemProvider, Loader, darkTheme, lightTheme } from '@strapi/design-system';

export const LOGOUT_EVENT = 'strapi-oidc:logout';

function Overlay({ bg }: { bg: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handler = () => setActive(true);
    window.addEventListener(LOGOUT_EVENT, handler);
    return () => window.removeEventListener(LOGOUT_EVENT, handler);
  }, []);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        backdropFilter: 'blur(2px)',
      }}
    >
      <Loader />
    </div>
  );
}

function resolveTheme() {
  const stored = window.localStorage.getItem('STRAPI_THEME') ?? 'system';
  const isDark =
    stored === 'dark' ||
    (stored === 'system' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
  return isDark ? darkTheme : lightTheme;
}

export function LogoutOverlay() {
  const theme = resolveTheme();
  const bg = theme === darkTheme ? 'rgba(24, 24, 38, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  return (
    <DesignSystemProvider theme={theme}>
      <Overlay bg={bg} />
    </DesignSystemProvider>
  );
}
