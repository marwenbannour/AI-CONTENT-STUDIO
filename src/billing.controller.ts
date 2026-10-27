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
  createCheckout(@Req() request: Request) {
    return this.billingService.createCheckout(
      this.authService.authenticate(request),
    );
  }

  @Get('subscription')
  subscription(@Req() request: Request) {
    return this.billingService.subscription(
      this.authService.authenticate(request),
    );
  }

  @Post('portal')
  createPortal(@Req() request: Request) {
    return this.billingService.createPortal(
      this.authService.authenticate(request),
    );
  }

  @Post('webhook')
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.billingService.handleWebhook(request.rawBody, signature);
  }
}
