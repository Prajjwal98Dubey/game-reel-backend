import { Injectable } from '@nestjs/common';
import { TokenService } from '../../common/auth/token.service';
import type { GuestResponse } from '../../shared';
import { PlayersRepository } from './players.repository';

@Injectable()
export class PlayersService {
  constructor(
    private readonly players: PlayersRepository,
    private readonly tokens: TokenService,
  ) {}

  async createOrResumeGuest(deviceId: string): Promise<GuestResponse> {
    const player = await this.players.upsertByDeviceId(deviceId);
    const { token, expiresIn } = await this.tokens.issue(player);
    return { playerId: player.id, token, expiresIn };
  }
}
