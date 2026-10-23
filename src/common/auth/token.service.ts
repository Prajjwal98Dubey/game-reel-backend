import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PlayerKind } from '../../generated/prisma/enums';

export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthenticatedPlayer {
  id: string;
  kind: PlayerKind;
}

interface TokenPayload {
  sub: string;
  kind: PlayerKind;
}

/** Issues and verifies player tokens. Guests now; registered accounts reuse the same tokens later. */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  async issue(player: AuthenticatedPlayer): Promise<{ token: string; expiresIn: number }> {
    const payload: TokenPayload = { sub: player.id, kind: player.kind };
    const token = await this.jwt.signAsync(payload, { expiresIn: TOKEN_TTL_SECONDS });
    return { token, expiresIn: TOKEN_TTL_SECONDS };
  }

  /** Returns null for any invalid, expired or malformed token. */
  async verify(token: string): Promise<AuthenticatedPlayer | null> {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token);
      if (typeof payload.sub !== 'string') return null;
      return { id: payload.sub, kind: payload.kind };
    } catch {
      return null;
    }
  }
}
