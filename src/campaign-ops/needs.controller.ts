import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NeedsService } from './needs.service';
import {
  CreateCampaignNeedDto,
  UpdateCampaignNeedDto,
} from './dto/create-campaign-need.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('campaign-goals')
@Controller()
export class NeedsController {
  constructor(private readonly needs: NeedsService) {}

  /** Tablero de metas: dinero, voluntarios y especies. Lo ve también el donante. */
  @Public()
  @Get('campaigns/:idOrSlug/goals')
  goals(@Param('idOrSlug') idOrSlug: string, @Query('date') date?: string) {
    return this.needs.goals(idOrSlug, date);
  }

  @Public()
  @Get('campaigns/:campaignId/needs')
  list(@Param('campaignId') campaignId: string) {
    return this.needs.listByCampaign(campaignId);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('campaigns/:campaignId/needs')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCampaignNeedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.needs.create(campaignId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch('needs/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignNeedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.needs.update(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete('needs/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.needs.remove(id, user);
  }
}
