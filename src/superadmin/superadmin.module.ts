import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { SuperadminGuard } from './superadmin.guard';
import { DonationsModule } from '../donations/donations.module';

@Module({
  imports: [
    DonationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'change_me',
      }),
    }),
  ],
  controllers: [SuperadminController],
  providers: [SuperadminService, SuperadminGuard],
})
export class SuperadminModule {}
