import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { APP_CONFIG, AppConfig } from '../../config/env';
import type { AppReleaseResponse } from '../../shared';
import { EasSignatureGuard } from './eas-signature.guard';
import { AppReleaseResponseDto, EasBuildWebhookDto, type EasWebhookResponse } from './releases.dto';
import { ReleasesService } from './releases.service';

@ApiTags('releases')
@Public()
@Controller()
export class ReleasesController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly releases: ReleasesService,
  ) {}

  @Post('webhooks/eas')
  @UseGuards(EasSignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EAS build webhook: saves finished release builds' })
  @ApiHeader({
    name: 'expo-signature',
    required: true,
    description: 'sha1=<HMAC-SHA1 of the body>',
  })
  @ApiOkResponse({
    description: '`{ saved: true, version }`, or `{ ignored: true }` for other builds',
  })
  easWebhook(@Body() body: EasBuildWebhookDto): Promise<EasWebhookResponse> {
    return this.releases.handleBuildEvent(body);
  }

  @Get('app/latest')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'The newest installable Android build' })
  @ApiOkResponse({ type: AppReleaseResponseDto })
  @ApiNotFoundResponse({ description: 'No release yet' })
  latest(@Req() request: FastifyRequest): Promise<AppReleaseResponse> {
    return this.releases.latest(this.origin(request));
  }

  @Get('app/download')
  @Header('Cache-Control', 'no-store')
  @Redirect()
  @ApiOperation({
    summary: 'Redirects to the newest APK. This URL never changes, so QR codes can use it',
  })
  @ApiFoundResponse({ description: 'Location: the newest APK' })
  @ApiNotFoundResponse({ description: 'No release yet' })
  async download(@Req() request: FastifyRequest): Promise<{ url: string }> {
    return { url: await this.releases.latestApkUrl(this.origin(request)) };
  }

  private origin(request: FastifyRequest): string {
    return this.config.PUBLIC_API_URL ?? `${request.protocol}://${request.host}`;
  }
}
