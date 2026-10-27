import { BadRequestException } from '@nestjs/common';

export type JsonObject = Record<string, unknown>;

export function bodyObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(
      'Le corps de la requête doit être un objet JSON.',
    );
  }
  return value as JsonObject;
}

export function requiredText(
  body: JsonObject,
  field: string,
  maxLength = 4000,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`Le champ "${field}" est obligatoire.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new BadRequestException(
      `Le champ "${field}" ne peut pas dépasser ${maxLength} caractères.`,
    );
  }
  return normalized;
}

export function optionalText(
  body: JsonObject,
  field: string,
  maxLength = 4000,
): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new BadRequestException(
      `Le champ "${field}" doit être un texte de ${maxLength} caractères maximum.`,
    );
  }
  return value.trim();
}

export function validEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  const normalized = value.includes('.')
    ? value.replace(
        /\.(\d{1,3})Z$/,
        (_match, fraction: string) => `.${fraction.padEnd(3, '0')}Z`,
      )
    : value.replace(/Z$/, '.000Z');
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) && date.toISOString() === normalized;
}
