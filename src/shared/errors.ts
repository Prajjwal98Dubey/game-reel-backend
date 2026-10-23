import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'INVALID_CURSOR',
  'INVALID_APP_VERSION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'GAME_NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string(),
});
export type ErrorIssue = z.infer<typeof ErrorIssueSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.array(ErrorIssueSchema).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
