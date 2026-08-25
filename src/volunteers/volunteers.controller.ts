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
import { VolunteersService } from './volunteers.service';
import { UpdateVolunteerDto } from './dto/update-volunteer.dto';
import { CreateVolunteerDto } from './dto/create-volunteer.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('volunteers')
@ApiBearerAuth()
@Controller('volunteers')
export class VolunteersController {
  constructor(private readonly volunteersService: VolunteersService) {}

  @Roles(Role.VOLUNTEER)
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.volunteersService.getMe(user.id);
  }

  @Roles(Role.VOLUNTEER)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateVolunteerDto) {
    return this.volunteersService.updateMe(user.id, dto);
  }

  @Roles(Role.VOLUNTEER)
  @Get('me/passport')
  getPassport(@CurrentUser() user: AuthUser) {
    return this.volunteersService.getPassport(user.id);
  }

  // ───────── Disponibilidad declarada por el propio voluntario ─────────
  // El voluntario dice cuándo puede venir (días fijos u días sueltos). Es lo que
  // responde "¿con qué voluntarios cuento hoy?" en el panel del organizador.

  @Roles(Role.VOLUNTEER)
  @Get('me/schedule')
  listMySchedules(@CurrentUser() user: AuthUser) {
    return this.volunteersService.listMySchedules(user.id);
  }

  @Roles(Role.VOLUNTEER)
  @Post('me/schedule')
  addMySchedule(@CurrentUser() user: AuthUser, @Body() dto: CreateScheduleDto) {
    return this.volunteersService.addMySchedule(user.id, dto);
  }

  @Roles(Role.VOLUNTEER)
  @Delete('me/schedule/:scheduleId')
  removeMySchedule(
    @CurrentUser() user: AuthUser,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.volunteersService.removeMySchedule(user.id, scheduleId);
  }

  // ───────── Gestión por el gestor ─────────

  @Roles(Role.MANAGER, Role.ADMIN)
  @Get()
  list(@Query('q') q?: string) {
    return this.volunteersService.listAll(q);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateVolunteerDto, @CurrentUser() user: AuthUser) {
    return this.volunteersService.createByManager(dto, user.id);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Get(':id/schedule')
  listSchedules(@Param('id') id: string) {
    return this.volunteersService.listSchedules(id);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/schedule')
  addSchedule(
    @Param('id') id: string,
    @Body() dto: CreateScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteersService.addSchedule(id, dto, user.id);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete(':id/schedule/:scheduleId')
  removeSchedule(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.volunteersService.removeSchedule(id, scheduleId, user.id);
  }
}
