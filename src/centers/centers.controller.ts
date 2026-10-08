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
import { CentersService } from './centers.service';
import { CreateCenterDto } from './dto/create-center.dto';
import { UpdateCenterDto } from './dto/update-center.dto';
import { QueryCentersDto } from './dto/query-centers.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { DispatchItemDto } from './dto/dispatch-item.dto';
import { TransferDto } from './dto/transfer.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('centers')
@Controller('centers')
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

  // Rutas públicas con auth opcional: el personal (token válido) ve también el
  // almacén central interno; el público, solo los centros que acopian.
  @Public()
  @Get()
  findAll(@Query() query: QueryCentersDto, @CurrentUser() user?: AuthUser) {
    return this.centersService.findAll(query, user);
  }

  // Resumen global de inventario (acopio vs almacén central, contra metas).
  // Va antes de ':id' para que "summary" no se interprete como un id.
  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN, Role.REGISTRAR)
  @Get('summary')
  summary(@Query('campaignId') campaignId?: string) {
    return this.centersService.summary(campaignId || undefined);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.centersService.findOne(id, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCenterDto, @CurrentUser() user: AuthUser) {
    return this.centersService.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCenterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.centersService.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Get(':id/inventory')
  getInventory(@Param('id') id: string) {
    return this.centersService.getInventory(id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.REGISTRAR)
  @Post(':id/inventory')
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.centersService.createItem(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.REGISTRAR)
  @Patch(':id/inventory/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.centersService.updateItem(id, itemId, dto, user.id);
  }

  @ApiBearerAuth()
  @Get(':id/movements')
  getMovements(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.centersService.getMovements(id, Number(limit) || 100);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.REGISTRAR)
  @Post(':id/dispatch')
  dispatchItem(
    @Param('id') id: string,
    @Body() dto: DispatchItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.centersService.dispatchItem(id, dto, user.id);
  }

  // Transferencia al almacén central: el acopio entrega lo recaudado.
  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.REGISTRAR)
  @Post(':id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.centersService.transfer(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Get(':id/transfers')
  listTransfers(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.centersService.listTransfers(id, Number(limit) || 50);
  }
}
