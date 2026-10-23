import { EventsBatchSchema } from './events';

const ts = '2026-10-22T10:15:03.120Z';

describe('EventsBatchSchema', () => {
  it('accepts the documented example batch', () => {
    const result = EventsBatchSchema.safeParse({
      events: [
        { type: 'game_view', gameId: 'hop', clientTs: ts, props: { source: 'reels', position: 3 } },
        {
          type: 'game_skip',
          gameId: 'hop',
          clientTs: '2026-10-22T10:15:04.020Z',
          props: { dwellMs: 900 },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown event types', () => {
    const result = EventsBatchSchema.safeParse({
      events: [{ type: 'game_teleport', gameId: 'hop', clientTs: ts, props: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required props, even when props is omitted', () => {
    expect(
      EventsBatchSchema.safeParse({ events: [{ type: 'game_skip', gameId: 'hop', clientTs: ts }] })
        .success,
    ).toBe(false);
  });

  it('defaults props for events that have none and keeps extra keys', () => {
    const parsed = EventsBatchSchema.parse({
      events: [
        { type: 'game_like', gameId: 'pop', clientTs: ts },
        { type: 'tab_view', clientTs: ts, props: { tab: 'catalogue', extra: 1 } },
      ],
    });
    expect(parsed.events[0].props).toEqual({});
    expect(parsed.events[1].props).toEqual({ tab: 'catalogue', extra: 1 });
  });

  it('caps a batch at 100 events', () => {
    const event = { type: 'game_like', gameId: 'pop', clientTs: ts, props: {} };
    expect(EventsBatchSchema.safeParse({ events: Array(100).fill(event) }).success).toBe(true);
    expect(EventsBatchSchema.safeParse({ events: Array(101).fill(event) }).success).toBe(false);
    expect(EventsBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });
});
