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
import { DispatchesService } from './dispatches.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDispatchStatusDto } from './dto/update-dispatch-status.dto';
import { QueryDispatchesDto } from './dto/query-dispatches.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('dispatches')
@ApiBearerAuth()
@Controller('dispatches')
export class DispatchesController {
  constructor(private readonly dispatchesService: DispatchesService) {}

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateDispatchDto, @CurrentUser() user: AuthUser) {
    return this.dispatchesService.create(dto, user.id);
  }

  @Roles(Role.MANAGER)
  @Get()
  findAll(@Query() query: QueryDispatchesDto) {
    return this.dispatchesService.findAll(query);
  }

  @Roles(Role.MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDispatchStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatchesService.updateStatus(id, dto, user.id);
  }
}
