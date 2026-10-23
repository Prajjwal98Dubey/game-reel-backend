import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPlayer } from '../../common/auth/token.service';
import { AppVersion } from '../../common/decorators/app-version.decorator';
import { CurrentPlayer } from '../../common/decorators/current-player.decorator';
import type { FeedResponse } from '../../shared';
import { FeedQueryDto, FeedResponseDto } from './feed.dto';
import { FeedService } from './feed.service';

@ApiTags('feed')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-App-Version',
  required: false,
  description: 'Hides games this build cannot run',
})
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @ApiOperation({ summary: 'Next page of the Reels feed (endless; pass back nextCursor)' })
  @ApiOkResponse({ type: FeedResponseDto })
  next(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Query() query: FeedQueryDto,
    @AppVersion() appVersion: string | null,
  ): Promise<FeedResponse> {
    return this.feed.next(player.id, query, appVersion);
  }
}
