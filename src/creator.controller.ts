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
  getProfile(@Req() request: Request) {
    return this.creatorService.getProfile(
      this.authService.authenticate(request),
    );
  }

  @Put('profile')
  saveProfile(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.saveProfile(
      this.authService.authenticate(request),
      body,
    );
  }

  @Post('projects')
  createProject(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.createProject(
      this.authService.authenticate(request),
      body,
    );
  }

  @Get('projects')
  listProjects(@Req() request: Request) {
    return this.creatorService.listProjects(
      this.authService.authenticate(request),
    );
  }

  @Delete('projects/:id')
  deleteProject(@Req() request: Request, @Param('id') id: string) {
    this.creatorService.deleteProject(
      this.authService.authenticate(request),
      id,
    );
    return { deleted: true };
  }

  @Post('content/generate')
  generate(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.generate(
      this.authService.authenticate(request),
      body,
    );
  }

  @Post('content')
  saveContent(@Req() request: Request, @Body() body: unknown) {
    return this.creatorService.saveContent(
      this.authService.authenticate(request),
      body,
    );
  }

  @Get('content')
  listContent(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ) {
    return this.creatorService.listContent(
      this.authService.authenticate(request),
      query,
    );
  }

  @Get('calendar')
  getCalendar(
    @Req() request: Request,
    @Query() query: Record<string, unknown>,
  ) {
    return this.creatorService.getCalendar(
      this.authService.authenticate(request),
      query,
    );
  }

  @Patch('content/:id')
  updateContent(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.creatorService.updateContent(
      this.authService.authenticate(request),
      id,
      body,
    );
  }

  @Delete('content/:id')
  deleteContent(@Req() request: Request, @Param('id') id: string) {
    this.creatorService.deleteContent(
      this.authService.authenticate(request),
      id,
    );
    return { deleted: true };
  }

  @Get('quota')
  getQuota(@Req() request: Request) {
    return this.creatorService.quota(this.authService.authenticate(request));
  }
}
