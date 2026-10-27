import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

export interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface DatabaseExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<QueryResult<Row>>;
}

type PostgreSqlClient = {
  query: (sql: string, parameters?: unknown[]) => Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }>;
  release: () => void;
};

const sqliteSchema = `
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_tokens_user_id ON email_tokens(user_id);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS brand_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL,
    niche TEXT NOT NULL,
    audience TEXT NOT NULL,
    tone TEXT NOT NULL,
    language TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_user_id ON projects(user_id);
  CREATE TABLE IF NOT EXISTS contents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    format TEXT NOT NULL,
    hook TEXT NOT NULL,
    script TEXT NOT NULL,
    cta TEXT NOT NULL,
    captions TEXT NOT NULL,
    target_platform TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    scheduled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS contents_user_created ON contents(user_id, created_at);
  CREATE INDEX IF NOT EXISTS contents_project ON contents(project_id);
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS generations_user_created
    ON generations(user_id, created_at);
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL,
    current_period_end TEXT,
    last_event_created INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified SMALLINT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_tokens_user_id ON email_tokens(user_id);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS brand_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL,
    niche TEXT NOT NULL,
    audience TEXT NOT NULL,
    tone TEXT NOT NULL,
    language TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_user_id ON projects(user_id);
  CREATE TABLE IF NOT EXISTS contents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    format TEXT NOT NULL,
    hook TEXT NOT NULL,
    script TEXT NOT NULL,
    cta TEXT NOT NULL,
    captions TEXT NOT NULL,
    target_platform TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    scheduled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS contents_user_created ON contents(user_id, created_at);
  CREATE INDEX IF NOT EXISTS contents_project ON contents(project_id);
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS generations_user_created
    ON generations(user_id, created_at);
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL,
    current_period_end TEXT,
    last_event_created BIGINT NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    received_at TEXT NOT NULL
  );
`;

function postgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function sqlitePlaceholders(
  sql: string,
  parameters: unknown[],
): { sql: string; parameters: unknown[] } {
  const ordered: unknown[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    if (index < 0 || index >= parameters.length) {
      throw new Error('SQL parameter index is out of range.');
    }
    ordered.push(parameters[index]);
    return '?';
  });
  return { sql: converted, parameters: ordered };
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly sqlite: DatabaseSync | null;
  private readonly pool: Pool | null;
  private initialized = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      neonConfig.webSocketConstructor = ws;
      this.pool = new Pool({ connectionString: databaseUrl, max: 1 });
      this.sqlite = null;
    } else {
      this.pool = null;
      const configuredPath = process.env.DATABASE_PATH ?? './data/app.sqlite';
      const databasePath =
        configuredPath === ':memory:' ? configuredPath : resolve(configuredPath);
      if (databasePath !== ':memory:') {
        mkdirSync(dirname(databasePath), { recursive: true });
      }
      this.sqlite = new DatabaseSync(databasePath);
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.initialized) return;
    if (this.sqlite) {
      this.sqlite.exec(sqliteSchema);
    } else {
      for (const statement of postgresSchema
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean)) {
        await this.pool!.query(statement);
      }
    }
    this.initialized = true;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (!this.initialized) await this.onModuleInit();
    if (this.sqlite) {
      const converted = sqlitePlaceholders(postgresPlaceholders(sql), parameters);
      const statement = this.sqlite.prepare(converted.sql);
      const normalizedSql = converted.sql.trimStart().toUpperCase();
      if (/^(SELECT|PRAGMA|WITH)\b/.test(normalizedSql)) {
        const rows = statement.all(
          ...(converted.parameters as SQLInputValue[]),
        ) as Row[];
        return { rows, rowCount: rows.length };
      }
      const result = statement.run(
        ...(converted.parameters as SQLInputValue[]),
      );
      return { rows: [], rowCount: Number(result.changes) };
    }

    const result = await this.pool!.query<Row>(
      postgresPlaceholders(sql),
      parameters,
    );
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  }

  async transaction<T>(
    callback: (executor: DatabaseExecutor) => Promise<T>,
  ): Promise<T> {
    if (!this.initialized) await this.onModuleInit();
    if (this.sqlite) {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(this);
        this.sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        this.sqlite.exec('ROLLBACK');
        throw error;
      }
    }

    const client = (await this.pool!.connect()) as unknown as PostgreSqlClient;
    const executor: DatabaseExecutor = {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        parameters: unknown[] = [],
      ) => {
        const result = await client.query(postgresPlaceholders(sql), parameters);
        return {
          rows: result.rows as Row[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      },
    };
    try {
      await client.query('BEGIN');
      const result = await callback(executor);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) await this.pool.end();
    if (this.sqlite) this.sqlite.close();
  }
}
