import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { QueryShiftsDto } from './dto/query-shifts.dto';
import { CheckinDto } from './dto/checkin.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryShiftsDto, @CurrentUser() user?: AuthUser) {
    return this.shiftsService.findAll(query, user);
  }

  @ApiBearerAuth()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateShiftDto, @CurrentUser() user: AuthUser) {
    return this.shiftsService.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.VOLUNTEER)
  @Post(':id/enroll')
  enroll(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shiftsService.enroll(id, user);
  }

  @ApiBearerAuth()
  @Roles(Role.VOLUNTEER)
  @Post(':id/checkin')
  checkin(
    @Param('id') id: string,
    @Body() dto: CheckinDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shiftsService.checkin(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.VOLUNTEER)
  @Post(':id/checkout')
  checkout(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shiftsService.checkout(id, user);
  }
}
