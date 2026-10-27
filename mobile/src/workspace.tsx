import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, BrandProfile, ContentItem, Project, Quota } from './api';
import { useSession } from './session';

interface WorkspaceContextValue {
  contents: ContentItem[];
  projects: Project[];
  quota: Quota | null;
  profile: BrandProfile;
  error: string;
  loading: boolean;
  setProfile(profile: BrandProfile): void;
  loadWorkspace(): Promise<void>;
}

const emptyProfile: BrandProfile = {
  brandName: '',
  niche: '',
  audience: '',
  tone: '',
  language: 'Français',
  instructions: '',
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [profile, setProfile] = useState<BrandProfile>(emptyProfile);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [library, userProjects, usage, brand] = await Promise.all([
        api<ContentItem[]>('/content'),
        api<Project[]>('/projects'),
        api<Quota>('/quota'),
        api<BrandProfile | null>('/profile'),
      ]);
      setContents(library);
      setProjects(userProjects);
      setQuota(usage);
      setProfile(brand || emptyProfile);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger votre espace.');
      throw loadError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void Promise.resolve().then(loadWorkspace).catch(() => undefined);
  }, [user, loadWorkspace]);

  const value = useMemo(
    () => ({ contents, projects, quota, profile, error, loading, setProfile, loadWorkspace }),
    [contents, projects, quota, profile, error, loading, loadWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace doit être utilisé dans WorkspaceProvider.');
  return context;
}
