import { createZodDto } from 'nestjs-zod';
import { GuestRequestSchema, GuestResponseSchema } from '../../shared';

export class GuestRequestDto extends createZodDto(GuestRequestSchema) {}
export class GuestResponseDto extends createZodDto(GuestResponseSchema) {}
