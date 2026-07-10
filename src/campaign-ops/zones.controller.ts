import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ZonesService } from './zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateNeedDto } from '../emergencies/dto/create-need.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('zones')
@Controller()
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Public()
  @Get('campaigns/:campaignId/zones')
  list(@Param('campaignId') campaignId: string) {
    return this.zones.listByCampaign(campaignId);
  }

  @Public()
  @Get('campaigns/:idOrSlug/operations')
  operations(@Param('idOrSlug') idOrSlug: string) {
    return this.zones.operations(idOrSlug);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('campaigns/:campaignId/zones')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateZoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.zones.create(campaignId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch('zones/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.zones.update(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete('zones/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.zones.remove(id, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('zones/:id/needs')
  addNeed(
    @Param('id') id: string,
    @Body() dto: CreateNeedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.zones.addNeed(id, dto, user);
  }
}
