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
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationsDto } from './dto/query-organizations.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryOrganizationsDto) {
    return this.organizationsService.findAll(query);
  }

  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthUser) {
    return this.organizationsService.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.organizationsService.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.organizationsService.verify(id, user.id);
  }
}
