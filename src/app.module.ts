import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './common/auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { playerTracker } from './common/guards/player-throttler';
import { isLoopbackCdn, LocalCdnUrlInterceptor } from './common/local-cdn/local-cdn';
import { ConfigModule } from './config/config.module';
import { AppConfig } from './config/env';
import { EventsModule } from './modules/events/events.module';
import { FeedModule } from './modules/feed/feed.module';
import { GamesModule } from './modules/games/games.module';
import { HealthModule } from './modules/health/health.module';
import { PlayersModule } from './modules/players/players.module';
import { PlaysModule } from './modules/plays/plays.module';
import { ReleasesModule } from './modules/releases/releases.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization'],
            autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
            transport:
              config.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        }),
        // In-memory counters. Move to Redis storage when running more than one instance.
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
          getTracker: playerTracker,
        }),
        PrismaModule,
        AuthModule,
        PlayersModule,
        GamesModule,
        FeedModule,
        PlaysModule,
        EventsModule,
        ReleasesModule,
        HealthModule,
      ],
      providers: [
        // Guard order matters: the throttler tracks by the player JwtAuthGuard attaches.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        ...(config.LOCAL_GAMES_DIR && isLoopbackCdn(config.CDN_BASE_URL)
          ? [{ provide: APP_INTERCEPTOR, useClass: LocalCdnUrlInterceptor }]
          : []),
      ],
    };
  }
}
