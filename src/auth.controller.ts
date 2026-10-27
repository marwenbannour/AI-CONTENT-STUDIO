import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { bodyObject, requiredText } from './request-validation.js';

const SESSION_COOKIE_NAME = '__Host-session';
const SESSION_COOKIE_OPTIONS =
  'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/signup')
  signUp(@Body() body: unknown) {
    return this.authService.signUp(bodyObject(body));
  }

  @Post('auth/verify-email')
  async verifyEmail(
    @Body() value: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyEmail(
      requiredText(bodyObject(value), 'token', 200),
    );
    this.setSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post('auth/login')
  async signIn(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signIn(bodyObject(body));
    this.setSessionCookie(response, result.sessionToken);
    return { user: result.user };
  }

  @Post('auth/mobile/login')
  mobileSignIn(@Body() body: unknown) {
    return this.authService.signIn(bodyObject(body));
  }

  @Post('auth/mobile/verify-email')
  mobileVerifyEmail(@Body() value: unknown) {
    return this.authService.verifyEmail(
      requiredText(bodyObject(value), 'token', 200),
    );
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.signOut(request);
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    );
  }

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(@Body() body: unknown) {
    return this.authService.requestPasswordReset(bodyObject(body));
  }

  @Post('auth/reset-password')
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(bodyObject(body));
  }

  @Get('auth/me')
  async me(@Req() request: Request) {
    return { user: await this.authService.authenticate(request) };
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Req() request: Request,
    @Body() value: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const user = await this.authService.authenticate(request);
    await this.authService.deleteAccount(user, bodyObject(value));
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    );
  }

  private setSessionCookie(response: Response, token: string): void {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${token}; ${SESSION_COOKIE_OPTIONS}`,
    );
  }
}
