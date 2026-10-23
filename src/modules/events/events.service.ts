import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AnalyticsEvent } from '../../shared';
import { EventsRepository } from './events.repository';

@Injectable()
export class EventsService {
  constructor(private readonly events: EventsRepository) {}

  /** Stores a validated batch. Every interaction is kept, even ones the MVP does not use yet. */
  async ingest(playerId: string, events: AnalyticsEvent[]): Promise<number> {
    return this.events.createMany(
      events.map((e) => ({
        playerId,
        type: e.type,
        gameId: 'gameId' in e ? e.gameId : null,
        // Validated by the shared schema, so it is plain JSON.
        props: e.props as Prisma.InputJsonObject,
        clientTs: new Date(e.clientTs),
      })),
    );
  }
}
