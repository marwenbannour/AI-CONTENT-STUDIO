import {
  ConflictException,
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request } from 'express';
import { DatabaseService } from './database.service.js';
import { JsonObject, validEmail } from './request-validation.js';

const deriveKey = promisify(scrypt);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly database: DatabaseService) {}

  async signUp(body: JsonObject): Promise<{ message: string }> {
    this.requireMailer();
    const email = body.email;
    if (!validEmail(email)) {
      throw new BadRequestException('Saisissez une adresse e-mail valide.');
    }
    const password = this.password(body.password);
    const userId = randomUUID();
    const now = new Date();
    const token = this.newToken();
    const passwordHash = await this.hashPassword(password);

    try {
      this.database.connection
        .prepare(
          `INSERT INTO users (id, email, password_hash, email_verified, created_at)
           VALUES (?, ?, ?, 0, ?)`,
        )
        .run(
          userId,
          email.trim().toLowerCase(),
          passwordHash,
          now.toISOString(),
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: users.email')
      ) {
        throw new ConflictException(
          'Cette adresse e-mail ne peut pas être utilisée pour créer un compte.',
        );
      }
      throw error;
    }

    this.saveEmailToken(userId, token, 'verify', now);
    try {
      await this.sendEmail(
        email.trim(),
        'Confirmez votre adresse e-mail',
        `Pour vérifier votre compte, envoyez une requête POST à /auth/verify-email avec le JSON {"token":"${token}"}.`,
      );
    } catch (error) {
      this.database.connection
        .prepare('DELETE FROM users WHERE id = ?')
        .run(userId);
      throw error;
    }
    return {
      message: 'Consultez votre boîte e-mail pour vérifier votre compte.',
    };
  }

  async verifyEmail(token: string): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
  }> {
    const tokenHash = this.hashToken(token);
    const database = this.database.connection;
    database.exec('BEGIN IMMEDIATE');
    try {
      const emailToken = database
        .prepare(
          `SELECT user_id FROM email_tokens
           WHERE token_hash = ? AND purpose = 'verify' AND expires_at > ?`,
        )
        .get(tokenHash, new Date().toISOString());
      if (!emailToken || typeof emailToken.user_id !== 'string') {
        throw new UnauthorizedException(
          'Le lien de vérification est invalide ou expiré.',
        );
      }
      const user = database
        .prepare('SELECT id, email FROM users WHERE id = ?')
        .get(emailToken.user_id);
      if (
        !user ||
        typeof user.id !== 'string' ||
        typeof user.email !== 'string'
      ) {
        throw new UnauthorizedException(
          'Le compte associé à ce lien est indisponible.',
        );
      }
      database
        .prepare('UPDATE users SET email_verified = 1 WHERE id = ?')
        .run(user.id);
      database
        .prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?')
        .run(user.id, 'verify');
      const sessionToken = this.createSession(user.id);
      database.exec('COMMIT');
      return {
        user: { id: user.id, email: user.email },
        sessionToken,
      };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  async signIn(body: JsonObject): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
  }> {
    const email = body.email;
    if (!validEmail(email) || typeof body.password !== 'string') {
      throw new UnauthorizedException(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    }
    const user = this.database.connection
      .prepare(
        `SELECT id, email, password_hash, email_verified
         FROM users WHERE email = ? COLLATE NOCASE`,
      )
      .get(email.trim());
    if (
      !user ||
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.password_hash !== 'string' ||
      !(await this.passwordMatches(body.password, user.password_hash))
    ) {
      throw new UnauthorizedException(
        'Adresse e-mail ou mot de passe incorrect.',
      );
    }
    if (user.email_verified !== 1) {
      throw new UnauthorizedException(
        'Vérifiez votre adresse e-mail avant de vous connecter.',
      );
    }
    return {
      user: { id: user.id, email: user.email },
      sessionToken: this.createSession(user.id),
    };
  }

  async requestPasswordReset(body: JsonObject): Promise<{ message: string }> {
    this.requireMailer();
    const email = body.email;
    if (validEmail(email)) {
      const user = this.database.connection
        .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
        .get(email.trim());
      if (user && typeof user.id === 'string') {
        const now = new Date();
        const token = this.newToken();
        this.saveEmailToken(user.id, token, 'reset', now);
        await this.sendEmail(
          email.trim(),
          'Réinitialisez votre mot de passe',
          `Pour choisir un nouveau mot de passe, envoyez une requête POST à /auth/reset-password avec le JSON {"token":"${token}","password":"..."}.`,
        );
      }
    }
    return {
      message:
        'Si cette adresse peut être utilisée, un message de réinitialisation a été envoyé.',
    };
  }

  async resetPassword(body: JsonObject): Promise<{ message: string }> {
    const token = body.token;
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      throw new UnauthorizedException(
        'Le lien de réinitialisation est invalide ou expiré.',
      );
    }
    const password = this.password(body.password);
    const passwordHash = await this.hashPassword(password);
    const database = this.database.connection;
    database.exec('BEGIN IMMEDIATE');
    try {
      const emailToken = database
        .prepare(
          `SELECT user_id FROM email_tokens
           WHERE token_hash = ? AND purpose = 'reset' AND expires_at > ?`,
        )
        .get(this.hashToken(token), new Date().toISOString());
      if (!emailToken || typeof emailToken.user_id !== 'string') {
        throw new UnauthorizedException(
          'Le lien de réinitialisation est invalide ou expiré.',
        );
      }
      database
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(passwordHash, emailToken.user_id);
      database
        .prepare('DELETE FROM email_tokens WHERE user_id = ?')
        .run(emailToken.user_id);
      database
        .prepare('DELETE FROM sessions WHERE user_id = ?')
        .run(emailToken.user_id);
      database.exec('COMMIT');
      return {
        message: 'Le mot de passe a été modifié. Connectez-vous à nouveau.',
      };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  authenticate(request: Request): AuthenticatedUser {
    const token = this.readSessionToken(request);
    if (!token)
      throw new UnauthorizedException('Une session valide est requise.');
    const user = this.database.connection
      .prepare(
        `SELECT users.id, users.email
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?
           AND users.email_verified = 1`,
      )
      .get(this.hashToken(token), new Date().toISOString());
    if (
      !user ||
      typeof user.id !== 'string' ||
      typeof user.email !== 'string'
    ) {
      throw new UnauthorizedException('La session est invalide ou expirée.');
    }
    return { id: user.id, email: user.email };
  }

  signOut(request: Request): void {
    const token = this.readSessionToken(request);
    if (token) {
      this.database.connection
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .run(this.hashToken(token));
    }
  }

  async deleteAccount(
    user: AuthenticatedUser,
    body: JsonObject,
  ): Promise<void> {
    if (body.confirmation !== 'DELETE') {
      throw new ConflictException(
        'Confirmez explicitement la suppression en envoyant confirmation: "DELETE".',
      );
    }
    if (typeof body.password !== 'string') {
      throw new UnauthorizedException('Le mot de passe actuel est requis.');
    }
    const row = this.database.connection
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(user.id);
    if (
      !row ||
      typeof row.password_hash !== 'string' ||
      !(await this.passwordMatches(body.password, row.password_hash))
    ) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    }
    this.database.connection
      .prepare('DELETE FROM users WHERE id = ?')
      .run(user.id);
  }

  createSession(userId: string): string {
    const token = this.newToken();
    this.database.connection
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(new Date().toISOString());
    this.database.connection
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      )
      .run(
        this.hashToken(token),
        userId,
        new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      );
    return token;
  }

  private password(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length < 12 ||
      value.length > 128 ||
      !/[a-z]/.test(value) ||
      !/[A-Z]/.test(value) ||
      !/\d/.test(value)
    ) {
      throw new ConflictException(
        'Le mot de passe doit contenir 12 à 128 caractères, une minuscule, une majuscule et un chiffre.',
      );
    }
    return value;
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await deriveKey(password, salt, 64)) as Buffer;
    return `${salt.toString('hex')}:${derived.toString('hex')}`;
  }

  private async passwordMatches(
    password: string,
    savedHash: string,
  ): Promise<boolean> {
    const [saltHex, keyHex] = savedHash.split(':');
    if (!saltHex || !keyHex || !/^[a-f0-9]+$/i.test(saltHex + keyHex)) {
      return false;
    }
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = (await deriveKey(password, salt, expected.length)) as Buffer;
    return actual.length === expected.length && actual.equals(expected);
  }

  private saveEmailToken(
    userId: string,
    token: string,
    purpose: 'verify' | 'reset',
    now: Date,
  ): void {
    this.database.connection
      .prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?')
      .run(userId, purpose);
    this.database.connection
      .prepare(
        'INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        this.hashToken(token),
        userId,
        purpose,
        new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
      );
  }

  private newToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private readSessionCookie(request: Request): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;
    const value = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('__Host-session='))
      ?.slice('__Host-session='.length);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  }

  private readSessionToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (authorization) {
      const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
      return match?.[1] ?? null;
    }
    return this.readSessionCookie(request);
  }

  private requireMailer(): void {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      throw new ServiceUnavailableException(
        'La vérification par e-mail est indisponible : configurez RESEND_API_KEY et EMAIL_FROM.',
      );
    }
  }

  private async sendEmail(
    recipient: string,
    subject: string,
    text: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [recipient],
          subject,
          text,
        }),
      });
    } catch (error) {
      this.logger.error(
        'The email provider request failed.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Le service d’e-mail est temporairement indisponible. Réessayez plus tard.',
      );
    }
    if (!response.ok) {
      this.logger.error(`E-mail provider returned HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Le service d’e-mail est temporairement indisponible. Réessayez plus tard.',
      );
    }
  }
}
