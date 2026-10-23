import { createZodDto } from 'nestjs-zod';
import { EventsBatchSchema } from '../../shared';

export class EventsBatchDto extends createZodDto(EventsBatchSchema) {}
