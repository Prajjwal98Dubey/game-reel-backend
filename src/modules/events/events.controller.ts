import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedPlayer } from '../../common/auth/token.service';
import { CurrentPlayer } from '../../common/decorators/current-player.decorator';
import { MAX_EVENTS_PER_BATCH } from '../../shared';
import { EventsBatchDto } from './events.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: `Batch of up to ${MAX_EVENTS_PER_BATCH} analytics events` })
  @ApiAcceptedResponse({ description: 'Stored' })
  async ingest(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Body() body: EventsBatchDto,
  ): Promise<void> {
    await this.events.ingest(player.id, body.events);
  }
}
