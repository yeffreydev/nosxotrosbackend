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
import { EmergenciesService } from './emergencies.service';
import { CreateEmergencyDto } from './dto/create-emergency.dto';
import { UpdateEmergencyDto } from './dto/update-emergency.dto';
import { QueryEmergenciesDto } from './dto/query-emergencies.dto';
import { CreateNeedDto } from './dto/create-need.dto';
import { UpdateNeedDto } from './dto/update-need.dto';
import { CreateEmergencyReportDto } from './dto/create-emergency-report.dto';
import { UpdateEmergencyReportDto } from './dto/update-emergency-report.dto';
import { QueryEmergencyReportsDto } from './dto/query-emergency-reports.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('emergencies')
@Controller('emergencies')
export class EmergenciesController {
  constructor(private readonly emergenciesService: EmergenciesService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryEmergenciesDto) {
    return this.emergenciesService.findAll(query);
  }

  @Public()
  @Get('map')
  map() {
    return this.emergenciesService.map();
  }

  @Public()
  @Post('report')
  createReport(@Body() dto: CreateEmergencyReportDto) {
    return this.emergenciesService.createReport(dto);
  }

  @Public()
  @Get('report/:code')
  trackReport(@Param('code') code: string) {
    return this.emergenciesService.trackReport(code);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get('reports')
  listReports(@Query() query: QueryEmergencyReportsDto) {
    return this.emergenciesService.listReports(query);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch('reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.emergenciesService.updateReport(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('reports/:id/convert')
  convertReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.emergenciesService.convertReport(id, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/campaign')
  createCampaign(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.emergenciesService.createCampaignFromEmergency(id, user);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emergenciesService.findOne(id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateEmergencyDto, @CurrentUser() user: AuthUser) {
    return this.emergenciesService.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmergencyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.emergenciesService.update(id, dto, user.id);
  }

  @Public()
  @Get(':id/needs')
  listNeeds(@Param('id') id: string) {
    return this.emergenciesService.listNeeds(id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/needs')
  createNeed(
    @Param('id') id: string,
    @Body() dto: CreateNeedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.emergenciesService.createNeed(id, dto, user.id);
  }
}
