import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { resolve } from 'node:path';

@Controller()
export class AppController {
  @Get()
  getApp(@Res() response: Response): void {
    response.sendFile(resolve(process.cwd(), 'public', 'index.html'));
  }
}
