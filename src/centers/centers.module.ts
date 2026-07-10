import { Module } from '@nestjs/common';
import { CentersService } from './centers.service';
import { CentersController } from './centers.controller';
import { InventoryController } from './inventory.controller';
import { CategoriesController } from './categories.controller';

@Module({
  controllers: [CentersController, InventoryController, CategoriesController],
  providers: [CentersService],
  exports: [CentersService],
})
export class CentersModule {}
