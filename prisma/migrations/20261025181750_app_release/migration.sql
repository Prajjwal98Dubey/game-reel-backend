-- CreateTable
CREATE TABLE `AppRelease` (
    `id` VARCHAR(191) NOT NULL,
    `easBuildId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `buildProfile` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `buildNumber` VARCHAR(191) NOT NULL,
    `apkUrl` VARCHAR(1024) NOT NULL,
    `buildPageUrl` VARCHAR(512) NULL,
    `gitCommit` VARCHAR(191) NULL,
    `mirroredFile` VARCHAR(191) NULL,
    `withdrawn` BOOLEAN NOT NULL DEFAULT false,
    `completedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AppRelease_easBuildId_key`(`easBuildId`),
    INDEX `AppRelease_platform_withdrawn_completedAt_idx`(`platform`, `withdrawn`, `completedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
