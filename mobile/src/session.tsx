import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError, clearSessionToken, saveSessionToken, User } from './api';

interface SessionContextValue {
  user: User | null;
  loading: boolean;
  initializationError: string;
  signIn(email: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  signOut(): Promise<void>;
  clearLocalSession(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await api<{ user: User }>('/auth/me');
        if (active) setUser(result.user);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearSessionToken();
        } else if (active) {
          setInitializationError(messageOf(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User; sessionToken: string }>('/auth/mobile/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveSessionToken(result.sessionToken);
    setUser(result.user);
    setInitializationError('');
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    const result = await api<{ user: User; sessionToken: string }>('/auth/mobile/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    await saveSessionToken(result.sessionToken);
    setUser(result.user);
    setInitializationError('');
  }, []);

  const clearLocalSession = useCallback(async () => {
    await clearSessionToken();
    setUser(null);
  }, []);

  const signOut = useCallback(async () => {
    let logoutError: unknown;
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      logoutError = error;
    }
    await clearLocalSession();
    if (logoutError) throw logoutError;
  }, [clearLocalSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      initializationError,
      signIn,
      verifyEmail,
      signOut,
      clearLocalSession,
    }),
    [user, loading, initializationError, signIn, verifyEmail, signOut, clearLocalSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession doit être utilisé dans SessionProvider.');
  return context;
}
