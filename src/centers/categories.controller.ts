import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CentersService } from './centers.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly centersService: CentersService) {}

  @Public()
  @Get()
  findAll() {
    return this.centersService.listCategories();
  }
}
