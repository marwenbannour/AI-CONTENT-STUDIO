import { createHmac } from 'node:crypto';
import { BillingService } from './billing.service.js';
import { DatabaseService } from './database.service.js';

function signedHeader(rawBody: Buffer): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', 'test-webhook-secret')
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('BillingService webhooks', () => {
  let database: DatabaseService;
  let service: BillingService;
  const savedEnvironment = {
    DATABASE_PATH: process.env.DATABASE_PATH,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  };

  beforeEach(() => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret';
    database = new DatabaseService();
    service = new BillingService(database);
    database.connection
      .prepare(
        `INSERT INTO users (id, email, password_hash, email_verified, created_at)
         VALUES ('user-1', 'user@example.com', 'test-hash', 1, ?)`,
      )
      .run(new Date().toISOString());
  });

  afterEach(() => {
    database.onModuleDestroy();
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('verifies signatures, synchronizes status, and processes an event once', () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_subscription_1',
        created: 1_798_000_000,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            current_period_end: 1_798_000_000,
            metadata: { user_id: 'user-1' },
          },
        },
      }),
    );
    const header = signedHeader(rawBody);

    expect(service.handleWebhook(rawBody, header)).toEqual({
      received: true,
      duplicate: false,
    });
    expect(service.handleWebhook(rawBody, header)).toEqual({
      received: true,
      duplicate: true,
    });
    expect(
      service.subscription({ id: 'user-1', email: 'user@example.com' }),
    ).toMatchObject({
      status: 'active',
      currentPeriodEnd: new Date(1_798_000_000 * 1000).toISOString(),
    });
    expect(
      database.connection
        .prepare(
          'SELECT COUNT(*) AS count FROM stripe_events WHERE event_id = ?',
        )
        .get('evt_subscription_1')?.count,
    ).toBe(1);
  });

  it('does not overwrite a newer active subscription with a late event', () => {
    const event = {
      id: 'evt_late',
      created: 1_797_999_999,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'past_due',
          metadata: { user_id: 'user-1' },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const currentEvent = {
      ...event,
      id: 'evt_current',
      created: 1_798_000_000,
      data: {
        object: {
          ...event.data.object,
          status: 'active',
        },
      },
    };
    const currentBody = Buffer.from(JSON.stringify(currentEvent));

    service.handleWebhook(currentBody, signedHeader(currentBody));
    service.handleWebhook(rawBody, signedHeader(rawBody));

    expect(
      service.subscription({ id: 'user-1', email: 'user@example.com' }),
    ).toMatchObject({ status: 'active' });
  });

  it('rejects invalid signatures without recording the event', () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        id: 'evt_invalid',
        type: 'invoice.paid',
        data: { object: {} },
      }),
    );

    expect(() => service.handleWebhook(rawBody, 't=1,v1=invalid')).toThrow();
    expect(
      database.connection
        .prepare('SELECT COUNT(*) AS count FROM stripe_events')
        .get()?.count,
    ).toBe(0);
  });
});
