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
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { SyncBeneficiariesDto } from './dto/sync-beneficiaries.dto';
import { QueryBeneficiariesDto } from './dto/query-beneficiaries.dto';
import { UpdateBeneficiaryStatusDto } from './dto/update-status.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  @Roles(Role.REGISTRAR, Role.MANAGER)
  @Post()
  create(@Body() dto: CreateBeneficiaryDto, @CurrentUser() user: AuthUser) {
    return this.beneficiariesService.create(dto, user.id);
  }

  @Roles(Role.REGISTRAR)
  @Post('sync')
  sync(@Body() dto: SyncBeneficiariesDto, @CurrentUser() user: AuthUser) {
    return this.beneficiariesService.sync(dto, user.id);
  }

  @Roles(Role.REGISTRAR, Role.MANAGER)
  @Get()
  findAll(@Query() query: QueryBeneficiariesDto) {
    return this.beneficiariesService.findAll(query);
  }

  @Roles(Role.REGISTRAR, Role.MANAGER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.beneficiariesService.update(id, dto, user.id);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.beneficiariesService.remove(id, user.id);
  }

  @Roles(Role.REGISTRAR, Role.MANAGER)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiaryStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.beneficiariesService.updateStatus(id, dto, user.id);
  }
}
