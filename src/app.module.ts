import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { CreatorController } from './creator.controller.js';
import { CreatorService } from './creator.service.js';
import { DatabaseService } from './database.service.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    CreatorController,
    BillingController,
  ],
  providers: [
    AppService,
    DatabaseService,
    AuthService,
    CreatorService,
    BillingService,
  ],
})
export class AppModule {}
