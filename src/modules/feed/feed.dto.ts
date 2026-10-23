import { createZodDto } from 'nestjs-zod';
import { FeedQuerySchema, FeedResponseSchema } from '../../shared';

export class FeedQueryDto extends createZodDto(FeedQuerySchema) {}
export class FeedResponseDto extends createZodDto(FeedResponseSchema) {}
