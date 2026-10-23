import { z } from 'zod';

export const GuestRequestSchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
});
export type GuestRequest = z.infer<typeof GuestRequestSchema>;

export const GuestResponseSchema = z.object({
  playerId: z.uuid(),
  token: z.string(),
  /** Seconds until the token expires. */
  expiresIn: z.int().positive(),
});
export type GuestResponse = z.infer<typeof GuestResponseSchema>;
