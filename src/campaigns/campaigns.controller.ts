import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { CreateCampaignUpdateDto } from './dto/create-update.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // Las campañas las organiza el gestor / ONG.
  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaignsService.create(dto, user);
  }

  @Public()
  @Get()
  findAll(@Query() query: QueryCampaignsDto) {
    return this.campaignsService.findAll(query);
  }

  // Campañas del organizador autenticado (incluye borradores).
  @ApiBearerAuth()
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.campaignsService.mine(user);
  }

  @Public()
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.campaignsService.findOne(idOrSlug);
  }

  @ApiBearerAuth()
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaignsService.update(id, dto, user);
  }

  @ApiBearerAuth()
  @Post(':id/updates')
  addUpdate(
    @Param('id') id: string,
    @Body() dto: CreateCampaignUpdateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaignsService.addUpdate(id, dto, user);
  }
}
