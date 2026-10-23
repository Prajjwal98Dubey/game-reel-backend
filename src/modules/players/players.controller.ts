import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import type { GuestResponse } from '../../shared';
import { GuestRequestDto, GuestResponseDto } from './players.dto';
import { PlayersService } from './players.service';

@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create or resume a guest player and return a token' })
  @ApiOkResponse({ type: GuestResponseDto })
  guest(@Body() body: GuestRequestDto): Promise<GuestResponse> {
    return this.players.createOrResumeGuest(body.deviceId);
  }
}
