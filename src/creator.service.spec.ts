import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from './auth.service.js';
import { CreatorService } from './creator.service.js';
import { DatabaseService } from './database.service.js';

describe('CreatorService', () => {
  let database: DatabaseService;
  let service: CreatorService;
  const user: AuthenticatedUser = {
    id: 'user-a',
    email: 'creator@example.com',
  };
  const otherUser: AuthenticatedUser = {
    id: 'user-b',
    email: 'other@example.com',
  };
  const savedEnvironment = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    DATABASE_URL: process.env.DATABASE_URL,
    MONTHLY_GENERATION_LIMIT: process.env.MONTHLY_GENERATION_LIMIT,
    PAID_MONTHLY_GENERATION_LIMIT: process.env.PAID_MONTHLY_GENERATION_LIMIT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  beforeEach(async () => {
    process.env.DATABASE_URL = '';
    process.env.DATABASE_PATH = ':memory:';
    database = new DatabaseService();
    await database.onModuleInit();
    service = new CreatorService(database);
    for (const account of [user, otherUser]) {
      await database.query(
        `INSERT INTO users (id, email, password_hash, email_verified, created_at)
         VALUES (?, ?, 'test-hash', 1, ?)`,
        [account.id, account.email, new Date().toISOString()],
      );
    }
  });

  afterEach(async () => {
    await database.onModuleDestroy();
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
  });

  it('saves and reuses brand profile instructions on later generations', async () => {
    await service.saveProfile(user, {
      brandName: 'Atelier Nord',
      niche: 'Décoration',
      audience: 'Locataires urbains',
      tone: 'Chaleureux',
      language: 'français',
      instructions: 'Éviter le jargon.',
    });
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  hook: 'Un espace transformé.',
                  script: 'Trois idées simples.',
                  cta: 'Enregistrez cette astuce.',
                  captions: [
                    'Une pièce plus agréable.',
                    'Changez votre intérieur.',
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.generate(user, {
      subject: 'Optimiser un petit salon',
      format: 'reel',
    });

    expect(result.content).toMatchObject({
      subject: 'Optimiser un petit salon',
      format: 'reel',
      hook: 'Un espace transformé.',
      cta: 'Enregistrez cette astuce.',
    });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.messages[1].content).toContain('Éviter le jargon.');
    expect(result.quota.used).toBe(1);
  });

  it('does not count failed generations against the quota', async () => {
    process.env.MONTHLY_GENERATION_LIMIT = '1';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('provider error', { status: 503 })),
    );

    await expect(
      service.generate(user, { subject: 'Un sujet', format: 'vidéo' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(await service.quota(user)).toMatchObject({
      used: 0,
      remaining: 1,
    });
  });

  it('enforces quota only after a successful provider response', async () => {
    process.env.MONTHLY_GENERATION_LIMIT = '1';
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    hook: 'Accroche',
                    script: 'Script',
                    cta: 'CTA',
                    captions: ['Caption'],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await service.generate(user, { subject: 'Un sujet', format: 'vidéo' });
    await expect(
      service.generate(user, { subject: 'Autre sujet', format: 'vidéo' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(await service.quota(user)).toMatchObject({
      used: 1,
      remaining: 0,
    });
  });

  it('keeps content and project access scoped to their owner', async () => {
    const project = await service.createProject(user, { name: 'Lancement' });
    const content = await service.saveContent(user, {
      projectId: project.id,
      subject: 'Première idée',
      format: 'reel',
      hook: 'Accroche',
      script: 'Script modifiable',
      cta: 'Enregistrez',
      captions: ['Une proposition'],
      targetPlatform: 'instagram',
      status: 'scheduled',
      scheduledAt: '2026-10-28T10:00:00Z',
    });

    await expect(
      service.listContent(otherUser, { projectId: project.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.deleteContent(otherUser, content.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await service.getCalendar(user, {
        from: '2026-10-28T00:00:00Z',
        to: '2026-10-28T23:59:59Z',
      }),
    ).toHaveLength(1);
    expect(
      (await service.updateContent(user, content.id, {
        scheduledAt: '2026-10-29T10:00:00.1Z',
      })).scheduledAt,
    ).toBe('2026-10-29T10:00:00.100Z');
    await expect(
      service.saveContent(user, {
        subject: 'Date invalide',
        format: 'reel',
        hook: 'Accroche',
        script: 'Script',
        cta: 'CTA',
        captions: ['Une proposition'],
        targetPlatform: 'instagram',
        status: 'scheduled',
        scheduledAt: '2026-02-31T10:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
