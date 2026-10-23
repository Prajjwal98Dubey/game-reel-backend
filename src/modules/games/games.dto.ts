import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  GameIdSchema,
  GameManifestSchema,
  ListGamesQuerySchema,
  ListGamesResponseSchema,
} from '../../shared';

export class ListGamesQueryDto extends createZodDto(ListGamesQuerySchema) {}
export class ListGamesResponseDto extends createZodDto(ListGamesResponseSchema) {}
export class GameManifestDto extends createZodDto(GameManifestSchema) {}
export class GameIdParamDto extends createZodDto(z.object({ id: GameIdSchema })) {}
