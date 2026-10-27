import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { ContentItem } from './api';

export const colors = {
  paper: '#f6f5f0',
  white: '#fffefa',
  ink: '#1f2824',
  muted: '#788079',
  line: '#e8e8df',
  green: '#2a473b',
  sage: '#e7eee6',
  red: '#9c3934',
  amber: '#8b6941',
};

const statusLabels: Record<ContentItem['status'], string> = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  published: 'Publié',
  archived: 'Archivé',
};

export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Heading({ eyebrow, title, subtitle }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionHeading}>{title}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {disabled ? (
        <ActivityIndicator color={secondary ? colors.green : colors.white} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({
  title,
  onPress,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButtonTouch}>
      <Text style={[styles.textButton, danger && styles.textButtonDanger]}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  keyboardType,
  autoCapitalize = 'sentences',
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={!secureTextEntry && keyboardType !== 'email-address'}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#a8aea7"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.textArea]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

export function Choice({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceList({ children }: { children: ReactNode }) {
  return <View style={styles.choiceWrap}>{children}</View>;
}

export function ContentCard({ content }: { content: ContentItem }) {
  return (
    <Link
      href={{ pathname: '/(tabs)/create', params: { id: content.id } }}
      style={styles.contentCard}
    >
      <View style={styles.cardMetaRow}>
        <Text style={styles.formatBadge}>{content.format}</Text>
        <Text style={[styles.statusText, content.status === 'scheduled' && styles.statusScheduled]}>
          {statusLabels[content.status]}
        </Text>
      </View>
      <Text style={styles.cardTitle}>{content.subject}</Text>
      <Text numberOfLines={3} style={styles.cardExcerpt}>{content.hook || content.script}</Text>
      <Text style={styles.cardDate}>
        {content.targetPlatform || 'Sans plateforme'} · {localDate(content.scheduledAt || content.createdAt)}
      </Text>
      <Text style={styles.editLink}>Ouvrir et modifier ↗</Text>
    </Link>
  );
}

export function EmptyState({
  title,
  body,
  action,
  onPress,
}: {
  title: string;
  body: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>✳</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.subtitle}>{body}</Text>
      <Button title={action} onPress={onPress} secondary />
    </View>
  );
}

export function ErrorMessage({ children }: { children: string }) {
  return children ? <Text accessibilityRole="alert" style={styles.errorText}>{children}</Text> : null;
}

export function Notice({ children }: { children: string }) {
  return children ? <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{children}</Text> : null;
}

export function localDate(value?: string | null): string {
  if (!value) return 'Sans date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sans date';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, gap: 12, padding: 16, paddingBottom: 30, backgroundColor: colors.paper },
  heading: { gap: 7, marginBottom: 4 },
  eyebrow: { color: '#899289', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: '#7e877e', fontSize: 11, lineHeight: 17 },
  panel: { gap: 8, marginTop: 4, padding: 17, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.white },
  sectionTitle: { gap: 5, marginTop: 5, marginBottom: 5 },
  sectionHeading: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, borderRadius: 9, backgroundColor: colors.green },
  buttonSecondary: { backgroundColor: colors.sage },
  buttonDanger: { backgroundColor: colors.red },
  buttonDisabled: { opacity: 0.6 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: colors.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  buttonTextSecondary: { color: colors.green },
  textButtonTouch: { alignSelf: 'flex-start', paddingVertical: 8 },
  textButton: { color: '#4f6b56', fontSize: 11, fontWeight: '700' },
  textButtonDanger: { color: '#a15a54' },
  field: { gap: 7, marginBottom: 5 },
  fieldLabel: { color: '#3a453d', fontSize: 11, fontWeight: '700' },
  input: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: '#e3e6de', borderRadius: 8, color: colors.ink, backgroundColor: '#fff', fontSize: 13 },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 7 },
  choice: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#e5e8e0', borderRadius: 20, backgroundColor: '#fff' },
  choiceActive: { borderColor: colors.green, backgroundColor: '#eaf0e9' },
  choiceText: { color: '#6f796f', fontSize: 10, fontWeight: '600' },
  choiceTextActive: { color: colors.green, fontWeight: '800' },
  contentCard: { gap: 8, marginBottom: 2, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formatBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5, color: '#617767', backgroundColor: '#edf2eb', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statusText: { color: '#727d73', fontSize: 9, fontWeight: '700' },
  statusScheduled: { color: colors.amber },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  cardExcerpt: { color: '#818a81', fontSize: 11, lineHeight: 17 },
  cardDate: { color: '#939b93', fontSize: 9 },
  editLink: { color: '#4f6b56', fontSize: 10, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: 9, padding: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: '#dfe2d9', borderRadius: 12, backgroundColor: colors.white },
  emptyIcon: { width: 46, height: 46, overflow: 'hidden', paddingTop: 9, borderRadius: 14, color: '#78937d', backgroundColor: '#e9efe7', textAlign: 'center', fontSize: 22 },
  errorText: { color: '#a13d37', fontSize: 11, lineHeight: 17 },
  noticeText: { color: '#526e5a', fontSize: 11, lineHeight: 17 },
});
