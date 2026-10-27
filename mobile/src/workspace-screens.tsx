import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useRouter } from 'expo-router';
import {
  api,
  BrandProfile,
  ContentItem,
  GeneratedContent,
  Project,
  Quota,
} from './api';
import { useSession } from './session';
import { useWorkspace } from './workspace';
import {
  Button,
  Choice,
  ChoiceList,
  ContentCard,
  EmptyState,
  ErrorMessage,
  Field,
  Heading,
  localDate,
  Notice,
  Page,
  Panel,
  SectionTitle,
  TextButton,
} from './ui';

const formats = [
  { value: 'reel', label: 'Reel / TikTok' },
  { value: 'video', label: 'Vidéo courte' },
  { value: 'carousel', label: 'Carrousel' },
  { value: 'post', label: 'Post statique' },
  { value: 'story', label: 'Stories' },
  { value: 'newsletter', label: 'Newsletter' },
];

const statusLabels: Record<ContentItem['status'], string> = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  published: 'Publié',
  archived: 'Archivé',
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function monthRange(date = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function HomeScreen() {
  const { user } = useSession();
  const { contents, profile, quota, error } = useWorkspace();
  const scheduled = contents.filter((item) => item.status === 'scheduled').length;
  const router = useRouter();

  return (
    <Page>
      <Heading
        eyebrow="VOTRE STUDIO, VOTRE RYTHME"
        title={`Bonjour, ${profile.brandName || user?.email.split('@')[0]} ✳`}
        subtitle="Une bonne idée mérite un contenu à sa hauteur."
      />
      <ErrorMessage>{error}</ErrorMessage>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Metric value={String(contents.length)} label="contenus" />
        <Metric value={String(scheduled)} label="planifiés" />
        <Metric value={quota ? String(quota.remaining) : '—'} label="restants" />
      </View>
      <Button title="✳  Créer un contenu" onPress={() => router.push('/(tabs)/create')} />
      <SectionTitle eyebrow="REPRENDRE LE FIL" title="Récemment sauvegardés" />
      {contents.slice(0, 4).map((content) => <ContentCard content={content} key={content.id} />)}
      {contents.length === 0 ? (
        <EmptyState
          title="Tout commence par une idée."
          body="Créez votre premier contenu et retrouvez-le ici."
          action="Imaginer un contenu"
          onPress={() => router.push('/(tabs)/create')}
        />
      ) : null}
    </Page>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, padding: 14, borderWidth: 1, borderColor: '#e8e8df', borderRadius: 10, backgroundColor: '#fffefa' }}>
      <Text style={{ color: '#1f2824', fontSize: 24, fontWeight: '800' }}>{value}</Text>
      <Text style={{ marginTop: 2, color: '#788079', fontSize: 9 }}>{label}</Text>
    </View>
  );
}

export function CreateScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { contents, loading, error: workspaceError } = useWorkspace();
  const item = id ? contents.find((content) => content.id === id) : undefined;
  if (id && !item && loading) {
    return <Page><ActivityIndicator color="#2a473b" size="large" /></Page>;
  }
  if (id && !item) {
    return <Page><ErrorMessage>{workspaceError || 'Ce contenu est introuvable ou n’est plus accessible.'}</ErrorMessage></Page>;
  }
  return <CreateEditor key={id || 'new'} id={id} item={item} workspaceError={workspaceError} />;
}

function CreateEditor({
  id,
  item,
  workspaceError,
}: {
  id?: string;
  item?: ContentItem;
  workspaceError: string;
}) {
  const { projects, loadWorkspace } = useWorkspace();
  const [subject, setSubject] = useState(item?.subject || '');
  const [format, setFormat] = useState(item?.format || 'reel');
  const [projectId, setProjectId] = useState(item?.projectId || '');
  const [editor, setEditor] = useState<GeneratedContent | null>(
    item
      ? {
          subject: item.subject,
          format: item.format,
          hook: item.hook,
          script: item.script,
          cta: item.cta,
          captions: item.captions,
        }
      : null,
  );
  const [captions, setCaptions] = useState<string[]>(item?.captions || []);
  const [scheduled, setScheduled] = useState(item?.status === 'scheduled');
  const [scheduledAt, setScheduledAt] = useState(item?.scheduledAt || '');
  const [platform, setPlatform] = useState(item?.targetPlatform || 'Instagram');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const generate = async () => {
    if (!subject.trim() || !format) {
      setError('Ajoutez une idée et choisissez un format.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setEditor(null);
    try {
      const result = await api<{ content: GeneratedContent; quota: Quota }>('/content/generate', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), format, projectId: projectId || undefined }),
      });
      setEditor(result.content);
      setCaptions(result.content.captions);
      setNotice('Votre idée a pris forme. Relisez-la avant de sauvegarder.');
      void loadWorkspace().catch(() => undefined);
    } catch (generateError) {
      setError(messageOf(generateError));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editor) return;
    if (scheduled && (!scheduledAt || !platform)) {
      setError('Pour planifier, choisissez une plateforme et une date UTC.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(id ? `/content/${encodeURIComponent(id)}` : '/content', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...editor,
          subject: subject.trim(),
          projectId: projectId || null,
          captions: captions.map((caption) => caption.trim()).filter(Boolean),
          status: scheduled ? 'scheduled' : 'draft',
          scheduledAt: scheduled ? scheduledAt : null,
          targetPlatform: scheduled ? platform : null,
        }),
      });
      setNotice(id ? 'Vos modifications sont enregistrées.' : 'Contenu sauvegardé.');
      void loadWorkspace().catch(() => undefined);
      if (!id) {
        setEditor(null);
        setSubject('');
      }
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Heading
        eyebrow="LE LABORATOIRE À IDÉES"
        title={id ? 'Modifier le contenu' : 'Donnez vie à votre idée.'}
        subtitle="Votre profil de marque inspire chaque génération."
      />
      <Panel>
        <SectionTitle eyebrow="01 · POINT DE DÉPART" title="Le brief" />
        <Field
          label="Votre idée"
          maxLength={1000}
          multiline
          onChangeText={setSubject}
          placeholder="Ex. Les 3 erreurs à éviter quand on aménage un petit salon…"
          value={subject}
        />
        <Text style={{ color: '#929a91', textAlign: 'right', fontSize: 9 }}>{subject.length} / 1000</Text>
        <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Format souhaité</Text>
        <ChoiceList>
          {formats.map((item) => (
            <Choice active={format === item.value} key={item.value} label={item.label} onPress={() => setFormat(item.value)} />
          ))}
        </ChoiceList>
        {projects.length ? (
          <>
            <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Projet</Text>
            <ChoiceList>
              <Choice active={!projectId} label="Sans projet" onPress={() => setProjectId('')} />
              {projects.map((project) => (
                <Choice active={projectId === project.id} key={project.id} label={project.name} onPress={() => setProjectId(project.id)} />
              ))}
            </ChoiceList>
          </>
        ) : null}
        {id ? (
          <TextButton
            title="Repartir d’une nouvelle idée"
            onPress={() => {
              router.replace('/(tabs)/create');
              setSubject('');
              setFormat('reel');
              setProjectId('');
              setEditor(null);
              setCaptions([]);
              setScheduled(false);
              setScheduledAt('');
            }}
          />
        ) : (
          <Button title="✳  Générer mon contenu" disabled={busy} onPress={() => void generate()} />
        )}
        {busy && !editor ? <ActivityIndicator color="#2a473b" size="large" /> : null}
        <ErrorMessage>{error}</ErrorMessage>
        <ErrorMessage>{workspaceError}</ErrorMessage>
        <Notice>{notice}</Notice>
      </Panel>
      {editor ? (
        <Panel>
          <SectionTitle eyebrow="VOTRE CONTENU, À VOUS" title={id ? 'Relire et modifier' : 'Une première version'} />
          <Field label="Hook" maxLength={4000} multiline onChangeText={(hook) => setEditor((current) => current && { ...current, hook })} value={editor.hook} />
          <Field label="Script" maxLength={10000} multiline onChangeText={(script) => setEditor((current) => current && { ...current, script })} value={editor.script} />
          <Field label="Appel à l’action" maxLength={2000} multiline onChangeText={(cta) => setEditor((current) => current && { ...current, cta })} value={editor.cta} />
          <SectionTitle eyebrow="AU CHOIX" title="Captions" />
          {captions.map((caption, index) => (
            <Field
              key={`caption-${index}`}
              label={`Suggestion ${index + 1}`}
              maxLength={2000}
              multiline
              onChangeText={(value) => setCaptions((current) => current.map((item, i) => i === index ? value : item))}
              value={caption}
            />
          ))}
          {captions.length < 5 ? <TextButton title="＋ Ajouter une caption" onPress={() => setCaptions((current) => [...current, ''])} /> : null}
          <View style={{ height: 1, marginVertical: 7, backgroundColor: '#e8e8df' }} />
          <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Planification — facultative</Text>
          <Text style={{ color: '#929990', fontSize: 10, lineHeight: 15 }}>Planifier ne déclenche aucune publication externe.</Text>
          <ChoiceList>
            <Choice active={!scheduled} label="Brouillon" onPress={() => setScheduled(false)} />
            <Choice active={scheduled} label="Planifier" onPress={() => setScheduled(true)} />
          </ChoiceList>
          {scheduled ? (
            <>
              <ChoiceList>
                {['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Pinterest', 'Facebook'].map((name) => (
                  <Choice active={platform === name} key={name} label={name} onPress={() => setPlatform(name)} />
                ))}
              </ChoiceList>
              <Field
                autoCapitalize="none"
                label="Date/heure ISO UTC"
                onChangeText={setScheduledAt}
                placeholder="2026-12-01T10:00:00Z"
                value={scheduledAt}
              />
            </>
          ) : null}
          <Button
            title={id ? 'Enregistrer les modifications ↗' : scheduled ? 'Planifier le contenu ↗' : 'Sauvegarder le brouillon ↗'}
            disabled={busy}
            onPress={() => void save()}
          />
        </Panel>
      ) : null}
    </Page>
  );
}

export function LibraryScreen() {
  const { contents, projects, loadWorkspace, error: workspaceError } = useWorkspace();
  const [status, setStatus] = useState<ContentItem['status'] | 'all'>('all');
  const [projectId, setProjectId] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => contents.filter((item) => {
    const created = new Date(item.createdAt).getTime();
    const lower = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const upper = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (status === 'all' || item.status === status)
      && (projectId === 'all' || item.projectId === projectId)
      && (platform === 'all' || item.targetPlatform === platform)
      && created >= lower && created <= upper;
  }), [contents, status, projectId, platform, from, to]);

  const remove = (content: ContentItem) => Alert.alert('Supprimer ce contenu ?', 'Cette action est irréversible.', [
    { text: 'Annuler', style: 'cancel' },
    {
      text: 'Supprimer',
      style: 'destructive',
      onPress: () => {
        void api(`/content/${encodeURIComponent(content.id)}`, { method: 'DELETE' })
          .then(() => {
            setNotice('Contenu supprimé.');
            void loadWorkspace().catch(() => undefined);
          })
          .catch((deleteError: unknown) => setError(messageOf(deleteError)));
      },
    },
  ]);

  return (
    <Page>
      <Heading eyebrow="VOTRE BANQUE D’IDÉES" title="La bibliothèque." subtitle={`${contents.length} contenus sauvegardés.`} />
      <Panel>
        <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Statut</Text>
        <ChoiceList>
          {(['all', 'draft', 'scheduled', 'published', 'archived'] as const).map((value) => (
            <Choice active={status === value} key={value} label={value === 'all' ? 'Tous' : statusLabels[value]} onPress={() => setStatus(value)} />
          ))}
        </ChoiceList>
        <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Projet</Text>
        <ChoiceList>
          <Choice active={projectId === 'all'} label="Tous" onPress={() => setProjectId('all')} />
          {projects.map((project) => <Choice active={projectId === project.id} key={project.id} label={project.name} onPress={() => setProjectId(project.id)} />)}
        </ChoiceList>
        <Text style={{ color: '#3a453d', fontSize: 11, fontWeight: '700' }}>Plateforme</Text>
        <ChoiceList>
          {['all', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Pinterest', 'Facebook'].map((value) => (
            <Choice active={platform === value} key={value} label={value === 'all' ? 'Toutes' : value} onPress={() => setPlatform(value)} />
          ))}
        </ChoiceList>
        <Field autoCapitalize="none" label="Créé à partir du (AAAA-MM-JJ)" onChangeText={setFrom} placeholder="2026-01-01" value={from} />
        <Field autoCapitalize="none" label="Créé jusqu’au (AAAA-MM-JJ)" onChangeText={setTo} placeholder="2026-12-31" value={to} />
      </Panel>
      <ErrorMessage>{error}</ErrorMessage>
      <ErrorMessage>{workspaceError}</ErrorMessage>
      <Notice>{notice}</Notice>
      {filtered.map((content) => (
        <View key={content.id} style={{ gap: 2 }}>
          <ContentCard content={content} />
          <TextButton danger title="Supprimer" onPress={() => remove(content)} />
        </View>
      ))}
      {filtered.length === 0 ? (
        <EmptyState
          title="La page est encore blanche."
          body="Créez un contenu ou choisissez un autre filtre."
          action="Créer un contenu"
          onPress={() => router.push('/(tabs)/create')}
        />
      ) : null}
    </Page>
  );
}

export function CalendarScreen() {
  const { contents, error: workspaceError } = useWorkspace();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadCalendar = async () => {
    const range = monthRange();
    const result = await api<ContentItem[]>(
      `/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    );
    setItems(result);
  };
  useEffect(() => {
    let active = true;
    const range = monthRange();
    void api<ContentItem[]>(
      `/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    )
      .then((result) => {
        if (active) {
          setItems(result);
          setError('');
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageOf(loadError));
      });
    return () => {
      active = false;
    };
  }, [contents]);

  const refresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      await loadCalendar();
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Page>
      <Heading
        eyebrow="LE TEMPS BIEN EMPLOYÉ"
        title="Votre agenda."
        subtitle="Les contenus planifiés ce mois-ci. Aucune publication automatique."
      />
      {refreshing ? <ActivityIndicator color="#2a473b" /> : <Button title="Actualiser" secondary onPress={() => void refresh()} />}
      <ErrorMessage>{error}</ErrorMessage>
      <ErrorMessage>{workspaceError}</ErrorMessage>
      {items.map((content) => <ContentCard content={content} key={content.id} />)}
      {items.length === 0 ? (
        <EmptyState
          title="Votre agenda respire."
          body="Planifiez un contenu dans l’éditeur pour le retrouver ici."
          action="Créer ou planifier"
          onPress={() => router.push('/(tabs)/create')}
        />
      ) : null}
    </Page>
  );
}

export function BrandScreen() {
  const { profile, setProfile, projects, loadWorkspace, error: workspaceError } = useWorkspace();
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const update = (key: keyof BrandProfile, value: string) => setProfile({ ...profile, [key]: value });
  const saveBrand = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<BrandProfile>('/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      setProfile(saved);
      setNotice('Profil de marque enregistré.');
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  };

  const addProject = async () => {
    if (!projectName.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({ name: projectName.trim() }) });
      setProjectName('');
      setNotice('Projet ajouté.');
      void loadWorkspace().catch(() => undefined);
    } catch (projectError) {
      setError(messageOf(projectError));
    } finally {
      setBusy(false);
    }
  };

  const removeProject = (project: Project) => Alert.alert(
    'Supprimer le projet ?',
    'Les contenus associés restent dans la bibliothèque, sans projet.',
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void api(`/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' })
            .then(() => {
              setNotice('Projet supprimé.');
              void loadWorkspace().catch(() => undefined);
            })
            .catch((projectError: unknown) => setError(messageOf(projectError)));
        },
      },
    ],
  );

  return (
    <Page>
      <Heading eyebrow="VOTRE SIGNATURE CRÉATIVE" title="Ma marque." subtitle="Quelques repères pour que chaque génération vous ressemble." />
      <Panel>
        <Field label="Nom de marque" maxLength={120} onChangeText={(value) => update('brandName', value)} placeholder="Ex. Atelier Nord" value={profile.brandName} />
        <Field label="Niche" maxLength={200} onChangeText={(value) => update('niche', value)} placeholder="Ex. décoration responsable" value={profile.niche} />
        <Field label="Audience" maxLength={500} onChangeText={(value) => update('audience', value)} placeholder="À qui vous adressez-vous ?" value={profile.audience} />
        <Field label="Ton" maxLength={200} onChangeText={(value) => update('tone', value)} placeholder="Ex. chaleureux, direct, expert" value={profile.tone} />
        <Field label="Langue" maxLength={80} onChangeText={(value) => update('language', value)} placeholder="Français" value={profile.language} />
        <Field label="Consignes réutilisées aux prochaines générations" maxLength={4000} multiline onChangeText={(value) => update('instructions', value)} placeholder="Mots à privilégier, sujets à éviter, style…" value={profile.instructions} />
        <ErrorMessage>{error}</ErrorMessage>
        <ErrorMessage>{workspaceError}</ErrorMessage>
        <Notice>{notice}</Notice>
        <Button disabled={busy} onPress={() => void saveBrand()} title="Enregistrer mon profil ↗" />
      </Panel>
      <Panel>
        <SectionTitle eyebrow="ORGANISATION" title="Mes projets" />
        <Field label="Nom du nouveau projet" onChangeText={setProjectName} placeholder="Ex. Campagne de printemps" value={projectName} />
        <Button disabled={busy} onPress={() => void addProject()} title="Ajouter un projet" secondary />
        {projects.map((project) => (
          <View key={project.id} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f0f0eb' }}>
            <Text style={{ flex: 1, color: '#1f2824', fontSize: 12, fontWeight: '700' }}>{project.name}</Text>
            <TextButton title="Supprimer" danger onPress={() => removeProject(project)} />
          </View>
        ))}
        {projects.length === 0 ? <Text style={{ color: '#929990', fontSize: 10 }}>Aucun projet pour le moment.</Text> : null}
      </Panel>
    </Page>
  );
}

export function SettingsScreen() {
  const { user, signOut, clearLocalSession } = useSession();
  const { quota, error: workspaceError } = useWorkspace();
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startBilling = async (portal = false) => {
    setError('');
    try {
      const result = await api<{ checkoutUrl?: string; portalUrl?: string }>(
        portal ? '/billing/portal' : '/billing/checkout',
        { method: 'POST' },
      );
      const url = result.portalUrl || result.checkoutUrl;
      if (!url) throw new Error('Le prestataire de paiement n’a pas renvoyé de lien.');
      await Linking.openURL(url);
    } catch (billingError) {
      setError(messageOf(billingError));
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation, password }),
      });
      await clearLocalSession();
      router.replace('/sign-in');
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = () => Alert.alert(
    'Supprimer votre compte ?',
    'Cette action est irréversible. Les données applicatives seront supprimées.',
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: 'destructive', onPress: () => void deleteAccount() },
    ],
  );

  const logout = async () => {
    setError('');
    try {
      await signOut();
    } catch (logoutError) {
      Alert.alert(
        'Session fermée sur cet appareil',
        `La révocation côté serveur a échoué : ${messageOf(logoutError)}`,
      );
    }
  };

  return (
    <Page>
      <Heading eyebrow="VOTRE ESPACE, VOS RÈGLES" title="Mon compte." />
      <Panel>
        <SectionTitle eyebrow="VOTRE FORMULE" title="Quota de générations" />
        <ErrorMessage>{workspaceError}</ErrorMessage>
        <Text style={{ color: '#2a473b', fontSize: 27, fontWeight: '800' }}>
          {quota?.remaining ?? '—'} <Text style={{ color: '#788079', fontSize: 11, fontWeight: '500' }}>restantes sur {quota?.limit ?? '—'}</Text>
        </Text>
        {quota ? <Text style={{ color: '#939b93', fontSize: 9 }}>{quota.used} utilisées · renouvellement le {localDate(quota.resetsAt)}</Text> : null}
        <QuotaBar quota={quota} />
        <Button title="Découvrir les offres ↗" onPress={() => void startBilling()} />
        <Button title="Ouvrir mon portail client" onPress={() => void startBilling(true)} secondary />
      </Panel>
      <Panel>
        <SectionTitle eyebrow="VOTRE SESSION" title={user?.email || 'Mon compte'} />
        <ErrorMessage>{error}</ErrorMessage>
        <Button title="Se déconnecter" onPress={() => void logout()} secondary />
      </Panel>
      <Panel>
        <SectionTitle eyebrow="ZONE DE SUPPRESSION" title="Supprimer mon compte" />
        <Text style={{ color: '#7e877e', fontSize: 11, lineHeight: 17 }}>
          La suppression efface le profil, les projets et les contenus. Cette action est irréversible.
        </Text>
        {!deleteMode ? (
          <Button title="Supprimer mon compte" danger onPress={() => setDeleteMode(true)} />
        ) : (
          <>
            <Field label='Saisissez "DELETE" pour confirmer' onChangeText={setConfirmation} value={confirmation} />
            <Field label="Mot de passe actuel" onChangeText={setPassword} secureTextEntry value={password} />
            <Button title="Supprimer définitivement" danger disabled={busy} onPress={requestDeletion} />
            <TextButton title="Annuler" onPress={() => setDeleteMode(false)} />
          </>
        )}
      </Panel>
    </Page>
  );
}

function QuotaBar({ quota }: { quota: Quota | null }) {
  const percentage = quota && quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  return (
    <View style={{ height: 5, overflow: 'hidden', marginVertical: 8, borderRadius: 5, backgroundColor: '#dfe4da' }}>
      <View style={{ width: `${percentage}%`, height: '100%', borderRadius: 5, backgroundColor: '#709077' }} />
    </View>
  );
}
