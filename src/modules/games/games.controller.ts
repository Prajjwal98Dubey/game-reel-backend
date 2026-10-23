import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPlayer } from '../../common/auth/token.service';
import { AppVersion } from '../../common/decorators/app-version.decorator';
import { CurrentPlayer } from '../../common/decorators/current-player.decorator';
import type { GameManifest, ListGamesResponse } from '../../shared';
import {
  GameIdParamDto,
  GameManifestDto,
  ListGamesQueryDto,
  ListGamesResponseDto,
} from './games.dto';
import { GamesService } from './games.service';

@ApiTags('games')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-App-Version',
  required: false,
  description: 'Hides games this build cannot run',
})
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  @ApiOperation({ summary: 'Catalogue of published games (paginated, filter by tag)' })
  @ApiOkResponse({ type: ListGamesResponseDto })
  list(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Query() query: ListGamesQueryDto,
    @AppVersion() appVersion: string | null,
  ): Promise<ListGamesResponse> {
    return this.games.listCatalogue(player.id, query, appVersion);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One game manifest' })
  @ApiOkResponse({ type: GameManifestDto })
  get(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Param() params: GameIdParamDto,
  ): Promise<GameManifest> {
    return this.games.getManifest(player.id, params.id);
  }
}
