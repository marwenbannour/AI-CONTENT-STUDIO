import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { CreatorService } from './creator.service.js';

@Controller()
export class CreatorController {
  constructor(
    private readonly authService: AuthService,
    private readonly creatorService: CreatorService,
  ) {}

  @Get('profile')
  async getProfile(@Req() request: Request) {
    return this.creatorService.getProfile(
      await this.authService.authenticate(request),
    );
  }

  @Put('profile')
  async saveProfile(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.saveProfile(
      await this.authService.authenticate(request),
      body,
    );
  }

  @Post('projects')
  async createProject(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.createProject(
      await this.authService.authenticate(request),
      body,
    );
  }

  @Get('projects')
  async listProjects(@Req() request: Request) {
    return this.creatorService.listProjects(
      await this.authService.authenticate(request),
    );
  }

  @Delete('projects/:id')
  async deleteProject(@Req() request: Request, @Param('id') id: string) {
    await this.creatorService.deleteProject(
      await this.authService.authenticate(request),
      id,
    );
    return { deleted: true };
  }

  @Post('content/generate')
  async generate(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.generate(
      await this.authService.authenticate(request),
      body,
    );
  }

  @Post('content')
  async saveContent(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.saveContent(
      await this.authService.authenticate(request),
      body,
    );
  }

  @Get('content')
  async listContent(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ) {
    return this.creatorService.listContent(
      await this.authService.authenticate(request),
      query,
    );
  }

  @Get('calendar')
  async getCalendar(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ) {
    return this.creatorService.getCalendar(
      await this.authService.authenticate(request),
      query,
    );
  }

  @Patch('content/:id')
  async updateContent(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.creatorService.updateContent(
      await this.authService.authenticate(request),
      id,
      body,
    );
  }

  @Delete('content/:id')
  async deleteContent(@Req() request: Request, @Param('id') id: string) {
    await this.creatorService.deleteContent(
      await this.authService.authenticate(request),
      id,
    );
    return { deleted: true };
  }

  @Get('quota')
  async getQuota(@Req() request: Request) {
    return this.creatorService.quota(
      await this.authService.authenticate(request),
    );
  }
}
