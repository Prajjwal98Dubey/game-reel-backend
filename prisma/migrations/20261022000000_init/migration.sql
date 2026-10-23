-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlayerKind" AS ENUM ('GUEST', 'REGISTERED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "kind" "PlayerKind" NOT NULL DEFAULT 'GUEST',
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "controls" TEXT[],
    "avgRoundSeconds" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameVersion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "bundleUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sdkVersion" INTEGER NOT NULL,
    "minAppVersion" TEXT NOT NULL,
    "maxScorePerSec" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Play" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "seed" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BestScore" (
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BestScore_pkey" PRIMARY KEY ("playerId","gameId")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" BIGSERIAL NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gameId" TEXT,
    "props" JSONB NOT NULL,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_deviceId_key" ON "Player"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_currentVersionId_key" ON "Game"("currentVersionId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GameVersion_gameId_version_key" ON "GameVersion"("gameId", "version");

-- CreateIndex
CREATE INDEX "Play_gameId_score_idx" ON "Play"("gameId", "score");

-- CreateIndex
CREATE INDEX "Play_playerId_createdAt_idx" ON "Play"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_playerId_createdAt_idx" ON "Event"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_gameId_type_idx" ON "Event"("gameId", "type");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "GameVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameVersion" ADD CONSTRAINT "GameVersion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BestScore" ADD CONSTRAINT "BestScore_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

