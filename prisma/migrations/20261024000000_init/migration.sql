-- CreateTable
CREATE TABLE `Player` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('GUEST', 'REGISTERED') NOT NULL DEFAULT 'GUEST',
    `deviceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Player_deviceId_key`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Game` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `controls` JSON NOT NULL,
    `avgRoundSeconds` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'DISABLED') NOT NULL DEFAULT 'DRAFT',
    `currentVersionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Game_currentVersionId_key`(`currentVersionId`),
    INDEX `Game_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GameVersion` (
    `id` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `bundleUrl` VARCHAR(512) NOT NULL,
    `thumbnailUrl` VARCHAR(512) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sdkVersion` INTEGER NOT NULL,
    `minAppVersion` VARCHAR(191) NOT NULL,
    `maxScorePerSec` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GameVersion_gameId_version_key`(`gameId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Play` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `gameVersion` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `seed` INTEGER NULL,
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Play_gameId_score_idx`(`gameId`, `score`),
    INDEX `Play_playerId_createdAt_idx`(`playerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BestScore` (
    `playerId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`playerId`, `gameId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `playerId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NULL,
    `props` JSON NOT NULL,
    `clientTs` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Event_playerId_createdAt_idx`(`playerId`, `createdAt`),
    INDEX `Event_gameId_type_idx`(`gameId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_currentVersionId_fkey` FOREIGN KEY (`currentVersionId`) REFERENCES `GameVersion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameVersion` ADD CONSTRAINT `GameVersion_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Play` ADD CONSTRAINT `Play_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BestScore` ADD CONSTRAINT `BestScore_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

