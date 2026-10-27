import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View, StyleSheet } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { api, apiUrl } from './api';
import { useSession } from './session';
import { Button, colors, ErrorMessage, Field, Notice, Page, Panel, TextButton } from './ui';

type AuthMode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

const copy: Record<AuthMode, { title: string; description: string; button: string }> = {
  login: {
    title: 'Ravi de vous retrouver.',
    description: 'Reconnectez-vous à votre espace créatif.',
    button: 'Entrer dans mon studio ↗',
  },
  signup: {
    title: 'Un espace à votre image.',
    description: 'Créez un compte pour retrouver vos projets et vos idées.',
    button: 'Créer mon espace ↗',
  },
  verify: {
    title: 'Confirmez votre adresse.',
    description: 'Saisissez le jeton reçu par e-mail pour ouvrir votre session.',
    button: 'Vérifier mon adresse ↗',
  },
  forgot: {
    title: 'Retrouvons le fil.',
    description: 'Indiquez votre adresse. La réponse ne révèle pas si un compte existe.',
    button: 'Envoyer les instructions ↗',
  },
  reset: {
    title: 'Un nouveau départ.',
    description: 'Saisissez le jeton de réinitialisation reçu par e-mail.',
    button: 'Réinitialiser mon mot de passe ↗',
  },
};

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const { signIn, verifyEmail, initializationError } = useSession();
  const params = useLocalSearchParams<{ email?: string | string[]; notice?: string | string[] }>();
  const initialEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const routeNotice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(routeNotice || '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signup') {
        const result = await api<{ message: string }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        router.replace({ pathname: '/verify', params: { email, notice: result.message } });
        return;
      }
      if (mode === 'verify') {
        await verifyEmail(token.trim());
        router.replace('/');
        return;
      }
      if (mode === 'forgot') {
        const result = await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setNotice(result.message);
        return;
      }
      if (mode === 'reset') {
        const result = await api<{ message: string }>('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: token.trim(), password }),
        });
        router.replace({ pathname: '/sign-in', params: { notice: result.message } });
        return;
      }
      await signIn(email, password);
      router.replace('/');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Une erreur inattendue est survenue.',
      );
    } finally {
      setBusy(false);
    }
  };

  const needsEmail = mode === 'login' || mode === 'signup' || mode === 'forgot';
  const needsPassword = mode === 'login' || mode === 'signup' || mode === 'reset';
  const details = copy[mode];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <Page>
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>s.</Text></View>
          <Text style={styles.brandName}>studio<Text style={styles.dot}>.</Text></Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>VOTRE ATELIER DE CONTENU</Text>
          <Text style={styles.heroTitle}>De l’idée{'\n'}à l’impact.</Text>
          <Text style={styles.heroBody}>
            Votre univers de marque, vos idées, un studio pour les transformer en contenus qui vous ressemblent.
          </Text>
        </View>
        <Panel>
          <Text style={styles.title}>{details.title}</Text>
          <Text style={styles.description}>{details.description}</Text>
          {(mode === 'login' && initializationError) ? <ErrorMessage>{initializationError}</ErrorMessage> : null}
          {needsEmail ? (
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              label="Adresse e-mail"
              onChangeText={setEmail}
              placeholder="vous@exemple.com"
              value={email}
            />
          ) : null}
          {mode === 'verify' || mode === 'reset' ? (
            <Field
              autoCapitalize="none"
              label="Jeton reçu par e-mail"
              maxLength={200}
              onChangeText={setToken}
              placeholder="Collez votre jeton ici"
              value={token}
            />
          ) : null}
          {needsPassword ? (
            <Field
              label={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
              onChangeText={setPassword}
              placeholder="12 caractères minimum"
              secureTextEntry
              value={password}
            />
          ) : null}
          {mode === 'signup' ? (
            <Text style={styles.helper}>
              12 à 128 caractères, une minuscule, une majuscule et un chiffre.
            </Text>
          ) : null}
          <ErrorMessage>{error}</ErrorMessage>
          <Notice>{notice}</Notice>
          <Button title={details.button} disabled={busy} onPress={() => void submit()} />
          <View style={styles.links}>
            {mode === 'login' ? (
              <>
                <Link href="/forgot-password" asChild><TextButton title="Mot de passe oublié ?" onPress={() => undefined} /></Link>
                <Link href="/sign-up" asChild><TextButton title="Créer mon espace" onPress={() => undefined} /></Link>
              </>
            ) : null}
            {mode === 'signup' ? (
              <Link href="/sign-in" asChild><TextButton title="J’ai déjà un compte" onPress={() => undefined} /></Link>
            ) : null}
            {mode === 'verify' ? (
              <Link href={{ pathname: '/sign-up', params: { email } }} asChild>
                <TextButton title="Recommencer l’inscription" onPress={() => undefined} />
              </Link>
            ) : null}
            {(mode === 'forgot' || mode === 'reset') ? (
              <Link href="/sign-in" asChild><TextButton title="Retour à la connexion" onPress={() => undefined} /></Link>
            ) : null}
          </View>
          <Text style={styles.serverAddress}>API : {apiUrl()}</Text>
        </Panel>
      </Page>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1, backgroundColor: colors.green },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16 },
  mark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 4, backgroundColor: '#d7e4d7' },
  markText: { color: colors.green, fontSize: 20, fontWeight: '800' },
  brandName: { color: colors.white, fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  dot: { color: '#a4c29f' },
  hero: { paddingTop: 35, paddingBottom: 25 },
  eyebrow: { color: '#bdcdbd', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  heroTitle: { marginTop: 13, color: colors.white, fontSize: 44, fontWeight: '800', lineHeight: 48, letterSpacing: -2 },
  heroBody: { maxWidth: 350, marginTop: 11, color: '#d0dad0', fontSize: 13, lineHeight: 20 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  description: { marginTop: 7, marginBottom: 12, color: colors.muted, fontSize: 12, lineHeight: 18 },
  helper: { marginBottom: 11, color: '#929990', fontSize: 10, lineHeight: 15 },
  links: { alignItems: 'center', gap: 5, marginTop: 8 },
  serverAddress: { marginTop: 10, color: '#9aa198', textAlign: 'center', fontSize: 9 },
});
