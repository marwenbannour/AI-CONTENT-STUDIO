import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import type { Response } from 'express';
import { resolve } from 'node:path';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('serves the web app entry point', () => {
      const response = { sendFile: vi.fn() };
      appController.getApp(response as unknown as Response);
      expect(response.sendFile).toHaveBeenCalledWith(
        resolve(process.cwd(), 'public', 'index.html'),
      );
    });
  });
});
