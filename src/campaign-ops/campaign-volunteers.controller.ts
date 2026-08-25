import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CampaignVolunteersService } from './campaign-volunteers.service';
import {
  AddCampaignVolunteerDto,
  EnrollVolunteerDto,
} from './dto/enroll-volunteer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('campaign-volunteers')
@ApiBearerAuth()
@Controller()
export class CampaignVolunteersController {
  constructor(private readonly volunteers: CampaignVolunteersService) {}

  // ── Voluntario ──
  @Get('campaigns/:campaignId/volunteers/me')
  mine(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthUser) {
    return this.volunteers.mine(campaignId, user);
  }

  @Post('campaigns/:campaignId/volunteers/me')
  enroll(
    @Param('campaignId') campaignId: string,
    @Body() dto: EnrollVolunteerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteers.enroll(campaignId, dto, user);
  }

  @Delete('campaigns/:campaignId/volunteers/me')
  leave(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthUser) {
    return this.volunteers.leave(campaignId, user);
  }

  // ── Organizador ──
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('campaigns/:campaignId/volunteers')
  list(@Param('campaignId') campaignId: string, @CurrentUser() user: AuthUser) {
    return this.volunteers.list(campaignId, user);
  }

  /** Con qué voluntarios se cuenta un día concreto (por defecto, hoy). */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('campaigns/:campaignId/volunteers/availability')
  availability(
    @Param('campaignId') campaignId: string,
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.volunteers.availability(campaignId, user, date);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('campaigns/:campaignId/volunteers')
  add(
    @Param('campaignId') campaignId: string,
    @Body() dto: AddCampaignVolunteerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteers.add(campaignId, dto, user);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete('campaigns/:campaignId/volunteers/:volunteerId')
  remove(
    @Param('campaignId') campaignId: string,
    @Param('volunteerId') volunteerId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteers.remove(campaignId, volunteerId, user);
  }
}
