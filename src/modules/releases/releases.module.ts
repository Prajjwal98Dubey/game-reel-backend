import { Module } from '@nestjs/common';
import { ApkMirror } from './apk-mirror';
import { EasSignatureGuard } from './eas-signature.guard';
import { ReleasesController } from './releases.controller';
import { ReleasesRepository } from './releases.repository';
import { ReleasesService } from './releases.service';

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService, ReleasesRepository, ApkMirror, EasSignatureGuard],
})
export class ReleasesModule {}
