import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseExecutor, DatabaseService } from './database.service.js';
import { AuthenticatedUser } from './auth.service.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly database: DatabaseService) {}

  async createCheckout(user: AuthenticatedUser) {
    const secret = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;
    const baseUrl = process.env.APP_BASE_URL;
    if (!secret || !priceId || !baseUrl) {
      throw new ServiceUnavailableException(
        'La gestion des abonnements est indisponible : configurez STRIPE_SECRET_KEY, STRIPE_PRICE_ID et APP_BASE_URL.',
      );
    }
    const body = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${baseUrl.replace(/\/+$/, '')}/billing/success`,
      cancel_url: `${baseUrl.replace(/\/+$/, '')}/billing/cancel`,
      'subscription_data[metadata][user_id]': user.id,
    });
    const result = await this.postStripe('/checkout/sessions', secret, body);
    if (typeof result.url !== 'string') {
      throw new ServiceUnavailableException(
        'Le prestataire de paiement n’a pas fourni de lien de paiement.',
      );
    }
    return { checkoutUrl: result.url };
  }

  async createPortal(user: AuthenticatedUser) {
    const secret = process.env.STRIPE_SECRET_KEY;
    const baseUrl = process.env.APP_BASE_URL;
    const { rows: [subscription] } = await this.database.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?',
      [user.id],
    );
    if (typeof subscription?.stripe_customer_id !== 'string') {
      throw new BadRequestException('Aucun abonnement à gérer pour ce compte.');
    }
    if (!secret || !baseUrl) {
      throw new ServiceUnavailableException(
        'Le portail client est indisponible : configurez STRIPE_SECRET_KEY et APP_BASE_URL.',
      );
    }
    const result = await this.postStripe(
      '/billing_portal/sessions',
      secret,
      new URLSearchParams({
        customer: subscription.stripe_customer_id,
        return_url: `${baseUrl.replace(/\/+$/, '')}/billing`,
      }),
    );
    if (typeof result.url !== 'string') {
      throw new ServiceUnavailableException(
        'Le prestataire de paiement n’a pas fourni de lien de gestion.',
      );
    }
    return { portalUrl: result.url };
  }

  async subscription(user: AuthenticatedUser) {
    const { rows: [subscription] } = await this.database.query(
        `SELECT status, current_period_end AS currentPeriodEnd
         FROM subscriptions WHERE user_id = ?`,
        [user.id],
      );
    return subscription ?? { status: 'none', currentPeriodEnd: null };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Le traitement des webhooks est indisponible : configurez STRIPE_WEBHOOK_SECRET.',
      );
    }
    if (
      !rawBody ||
      !signature ||
      !this.validSignature(rawBody, signature, webhookSecret)
    ) {
      throw new BadRequestException('La signature du webhook est invalide.');
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException(
        'Le corps du webhook n’est pas un JSON valide.',
      );
    }
    if (
      !this.isObject(event) ||
      typeof event.id !== 'string' ||
      typeof event.type !== 'string' ||
      typeof event.created !== 'number' ||
      !Number.isSafeInteger(event.created) ||
      event.created <= 0
    ) {
      throw new BadRequestException(
        'Le webhook ne contient pas les champs requis.',
      );
    }
    const eventId = event.id;
    const eventType = event.type;
    const eventCreated = event.created;

    return this.database.transaction(async (database) => {
      const inserted = await database.query(
        'INSERT INTO stripe_events (event_id, received_at) VALUES (?, ?) ON CONFLICT (event_id) DO NOTHING',
        [eventId, new Date().toISOString()],
      );
      if (inserted.rowCount === 0) {
        return { received: true, duplicate: true };
      }

      const data = this.isObject(event.data) ? event.data : null;
      const object = data && this.isObject(data.object) ? data.object : null;
      if (object && eventType === 'checkout.session.completed') {
        await this.processCheckoutCompleted(
          database,
          object,
          eventCreated,
        );
      } else if (
        object &&
        (eventType === 'customer.subscription.created' ||
          eventType === 'customer.subscription.updated' ||
          eventType === 'customer.subscription.deleted')
      ) {
        await this.processSubscriptionUpdate(
          database,
          object,
          eventType,
          eventCreated,
        );
      }
      return { received: true, duplicate: false };
    });
  }

  private async processCheckoutCompleted(
    database: DatabaseExecutor,
    object: Record<string, unknown>,
    eventCreated: number,
  ): Promise<void> {
    const userId =
      typeof object.client_reference_id === 'string'
        ? object.client_reference_id
        : this.metadataUserId(object.subscription_data);
    const customerId = this.stripeId(object.customer);
    const subscriptionId = this.stripeId(object.subscription);
    if (!userId || !customerId || !subscriptionId) {
      throw new BadRequestException(
        'La session de paiement ne contient pas les identifiants attendus.',
      );
    }
    const { rows: [existing] } = await database.query(
        `SELECT stripe_subscription_id, status, current_period_end
         FROM subscriptions WHERE user_id = ?`,
        [userId],
      );
    const alreadySynchronized =
      existing?.stripe_subscription_id === subscriptionId &&
      typeof existing.status === 'string' &&
      ['active', 'trialing', 'past_due', 'unpaid', 'canceled'].includes(
        existing.status,
      );
    await this.saveSubscription(database, {
      userId,
      customerId,
      subscriptionId,
      status:
        alreadySynchronized && typeof existing.status === 'string'
          ? existing.status
          : 'pending',
      currentPeriodEnd:
        alreadySynchronized && typeof existing.current_period_end === 'string'
          ? existing.current_period_end
          : null,
      eventCreated,
    });
  }

  private async processSubscriptionUpdate(
    database: DatabaseExecutor,
    object: Record<string, unknown>,
    eventType: string,
    eventCreated: number,
  ): Promise<void> {
    const customerId = this.stripeId(object.customer);
    const subscriptionId = this.stripeId(object.id);
    const { rows: [subscriptionRow] } = customerId
      ? await database.query(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?',
          [customerId],
        )
      : { rows: [] };
    const userId =
      this.metadataUserId(object.metadata) ??
      (typeof subscriptionRow?.user_id === 'string'
        ? subscriptionRow.user_id
        : undefined);
    if (!userId || !customerId || !subscriptionId) {
      throw new BadRequestException(
        'L’abonnement reçu ne peut pas être associé à un compte.',
      );
    }
    const status =
      eventType === 'customer.subscription.deleted'
        ? 'canceled'
        : typeof object.status === 'string'
          ? object.status
          : null;
    if (!status) {
      throw new BadRequestException('Le statut de l’abonnement est absent.');
    }
    if (
      ![
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
      ].includes(status)
    ) {
      throw new BadRequestException('Le statut de l’abonnement est invalide.');
    }
    const currentPeriodEnd =
      typeof object.current_period_end === 'number' &&
      Number.isFinite(object.current_period_end)
        ? new Date(object.current_period_end * 1000).toISOString()
        : null;
    await this.saveSubscription(database, {
      userId,
      customerId,
      subscriptionId,
      status,
      currentPeriodEnd,
      eventCreated,
    });
  }

  private async saveSubscription(
    database: DatabaseExecutor,
    subscription: {
      userId: string;
      customerId: string;
      subscriptionId: string;
      status: string;
      currentPeriodEnd: string | null;
      eventCreated: number;
    },
  ): Promise<void> {
    const { rows: [user] } = await database.query(
      'SELECT id FROM users WHERE id = ?',
      [subscription.userId],
    );
    if (!user) {
      throw new BadRequestException(
        'L’abonnement reçu ne correspond à aucun compte actif.',
      );
    }
    await database.query(
        `INSERT INTO subscriptions
          (user_id, stripe_customer_id, stripe_subscription_id, status,
           current_period_end, last_event_created)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
          stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          last_event_created = excluded.last_event_created
         WHERE excluded.last_event_created >= subscriptions.last_event_created`,
        [
        subscription.userId,
        subscription.customerId,
        subscription.subscriptionId,
        subscription.status,
        subscription.currentPeriodEnd,
        subscription.eventCreated,
        ],
      );
  }

  private async postStripe(
    endpoint: string,
    secret: string,
    body: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (error) {
      this.logger.error(
        'The Stripe API request failed.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Le prestataire de paiement est temporairement indisponible. Réessayez.',
      );
    }
    if (!response.ok) {
      this.logger.error(`Stripe API returned HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Le prestataire de paiement est temporairement indisponible. Réessayez.',
      );
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Le prestataire de paiement a renvoyé une réponse illisible.',
      );
    }
    if (!this.isObject(result)) {
      throw new ServiceUnavailableException(
        'Le prestataire de paiement a renvoyé une réponse invalide.',
      );
    }
    return result;
  }

  private validSignature(
    rawBody: Buffer,
    header: string,
    secret: string,
  ): boolean {
    const parts = header.split(',').map((part) => part.trim().split('='));
    const timestamp = parts.find(([key]) => key === 't')?.[1];
    const signatures = parts
      .filter(([key]) => key === 'v1')
      .map(([, value]) => value);
    if (
      !timestamp ||
      !/^\d+$/.test(timestamp) ||
      signatures.length === 0 ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    ) {
      return false;
    }
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest();
    return signatures.some((signature) => {
      if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
      const supplied = Buffer.from(signature, 'hex');
      return (
        supplied.length === expected.length &&
        timingSafeEqual(supplied, expected)
      );
    });
  }

  private stripeId(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (this.isObject(value) && typeof value.id === 'string') return value.id;
    return null;
  }

  private metadataUserId(value: unknown): string | null {
    const metadata =
      this.isObject(value) && this.isObject(value.metadata)
        ? value.metadata
        : value;
    if (this.isObject(metadata) && typeof metadata.user_id === 'string') {
      return metadata.user_id;
    }
    return null;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
