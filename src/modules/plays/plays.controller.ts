import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedPlayer } from '../../common/auth/token.service';
import { CurrentPlayer } from '../../common/decorators/current-player.decorator';
import { ThrottleByBodyField } from '../../common/guards/player-throttler';
import type { SubmitPlayResponse } from '../../shared';
import { SubmitPlayRequestDto, SubmitPlayResponseDto } from './plays.dto';
import { PlaysService } from './plays.service';

@ApiTags('plays')
@ApiBearerAuth()
@Controller('plays')
export class PlaysController {
  constructor(private readonly plays: PlaysService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 3_000 } })
  @ThrottleByBodyField('gameId')
  @ApiOperation({ summary: "Submit a finished round; returns the player's best" })
  @ApiOkResponse({ type: SubmitPlayResponseDto })
  submit(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Body() body: SubmitPlayRequestDto,
  ): Promise<SubmitPlayResponse> {
    return this.plays.submit(player.id, body);
  }
}
