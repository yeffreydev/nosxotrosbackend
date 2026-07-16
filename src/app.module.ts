import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DonationsModule } from './donations/donations.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CampaignOpsModule } from './campaign-ops/campaign-ops.module';
import { EmergenciesModule } from './emergencies/emergencies.module';
import { CentersModule } from './centers/centers.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { ShiftsModule } from './shifts/shifts.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { DispatchesModule } from './dispatches/dispatches.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SurveysModule } from './surveys/surveys.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    DonationsModule,
    CampaignsModule,
    CampaignOpsModule,
    EmergenciesModule,
    CentersModule,
    VolunteersModule,
    ShiftsModule,
    BeneficiariesModule,
    DispatchesModule,
    OrganizationsModule,
    DashboardModule,
    SuperadminModule,
    NotificationsModule,
    SurveysModule,
    UploadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
