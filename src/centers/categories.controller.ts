import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CentersService } from './centers.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly centersService: CentersService) {}

  @Public()
  @Get()
  findAll() {
    return this.centersService.listCategories();
  }

  // El organizador puede crear una categoría propia si la que necesita no existe.
  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.centersService.createCategory(dto, user.id);
  }
}
