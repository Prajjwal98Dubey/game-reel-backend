import { createZodDto } from 'nestjs-zod';
import { SubmitPlayRequestSchema, SubmitPlayResponseSchema } from '../../shared';

export class SubmitPlayRequestDto extends createZodDto(SubmitPlayRequestSchema) {}
export class SubmitPlayResponseDto extends createZodDto(SubmitPlayResponseSchema) {}
