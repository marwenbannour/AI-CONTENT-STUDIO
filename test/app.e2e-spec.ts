import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const savedEnvironment = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    DATABASE_URL: process.env.DATABASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.DATABASE_URL = '';
    process.env.RESEND_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'test@example.com';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('serves the web app at /', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect((response) => {
        expect(response.text).toContain('VOTRE ATELIER DE CONTENU');
      });
  });

  it('verifies an account and opens an HttpOnly secure session', async () => {
    let token = '';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_url: string, options: { body: string }) => {
          const message = JSON.parse(options.body) as { text: string };
          token = message.text.match(/"token":"([a-f0-9]{64})"/)?.[1] ?? '';
          return new Response(JSON.stringify({ id: 'email-1' }), {
            status: 200,
          });
        }),
    );

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'creator@example.com', password: 'StrongPassword123' })
      .expect(201);
    expect(token).toHaveLength(64);

    const verification = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(201);
    expect(verification.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(verification.headers['set-cookie'][0]).toContain('Secure');

    const cookie = verification.headers['set-cookie'][0].split(';')[0];
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe('creator@example.com');
      });
  });

  it('creates a bearer session for mobile and revokes it on logout', async () => {
    let verificationToken = '';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_url: string, options: { body: string }) => {
          const message = JSON.parse(options.body) as { text: string };
          verificationToken =
            message.text.match(/"token":"([a-f0-9]{64})"/)?.[1] ?? '';
          return new Response(JSON.stringify({ id: 'email-1' }), {
            status: 200,
          });
        }),
    );

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'mobile@example.com', password: 'StrongPassword123' })
      .expect(201);
    const verification = await request(app.getHttpServer())
      .post('/auth/mobile/verify-email')
      .send({ token: verificationToken })
      .expect(201);
    const sessionToken = verification.body.sessionToken as string;
    expect(sessionToken).toMatch(/^[a-f0-9]{64}$/);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe('mobile@example.com');
      });
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(401);
  });

  it('returns the same password-recovery response for known and unknown addresses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }),
        ),
    );
    const unknown = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(202);
    const known = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'known@example.com', password: 'StrongPassword123' })
      .expect(201);
    expect(known.status).toBe(201);
    const existing = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'known@example.com' })
      .expect(202);
    expect(existing.body).toEqual(unknown.body);
  });

  it('requires explicit confirmation and a password before deleting account data', async () => {
    let token = '';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_url: string, options: { body: string }) => {
          const message = JSON.parse(options.body) as { text: string };
          token = message.text.match(/"token":"([a-f0-9]{64})"/)?.[1] ?? '';
          return new Response(JSON.stringify({ id: 'email-1' }), {
            status: 200,
          });
        }),
    );

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'delete@example.com', password: 'StrongPassword123' })
      .expect(201);
    const verification = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(201);
    const cookie = verification.headers['set-cookie'][0].split(';')[0];

    await request(app.getHttpServer())
      .delete('/account')
      .set('Cookie', cookie)
      .send({ confirmation: 'yes', password: 'StrongPassword123' })
      .expect(409);
    await request(app.getHttpServer())
      .delete('/account')
      .set('Cookie', cookie)
      .send({ confirmation: 'DELETE', password: 'StrongPassword123' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
  });
});
