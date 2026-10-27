import { Controller, Get, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly authService: AuthService,
    private readonly billingService: BillingService,
  ) {}

  @Post('checkout')
  async createCheckout(@Req() request: Request) {
    return this.billingService.createCheckout(
      await this.authService.authenticate(request),
    );
  }

  @Get('subscription')
  async subscription(@Req() request: Request) {
    return this.billingService.subscription(
      await this.authService.authenticate(request),
    );
  }

  @Post('portal')
  async createPortal(@Req() request: Request) {
    return this.billingService.createPortal(
      await this.authService.authenticate(request),
    );
  }

  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billingService.handleWebhook(request.rawBody, signature);
  }
}
