import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface User {
  id: string;
  email: string;
}

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface BrandProfile {
  brandName: string;
  niche: string;
  audience: string;
  tone: string;
  language: string;
  instructions: string;
}

export interface ContentItem {
  id: string;
  projectId: string | null;
  subject: string;
  format: string;
  hook: string;
  script: string;
  cta: string;
  captions: string[];
  targetPlatform: string | null;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedContent {
  subject: string;
  format: string;
  hook: string;
  script: string;
  cta: string;
  captions: string[];
}

const defaultApiUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || defaultApiUrl
).replace(/\/+$/, '');
const TOKEN_KEY = 'studio-session-token';
let webSessionToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function saveSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSessionToken = token;
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webSessionToken = null;
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = Platform.OS === 'web'
    ? webSessionToken
    : await SecureStore.getItemAsync(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      `Impossible de joindre le serveur à ${API_URL}. Vérifiez l’adresse de l’API et votre connexion.`,
    );
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  let payload: unknown;
  try {
    payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  } catch {
    throw new ApiError('Le serveur a renvoyé une réponse illisible.', response.status);
  }
  if (!response.ok) {
    const body = payload as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(' ')
      : body?.message || (typeof payload === 'string' ? payload : null);
    throw new ApiError(message || `Erreur serveur (${response.status}).`, response.status, payload);
  }
  return payload as T;
}

export function apiUrl(): string {
  return API_URL;
}
