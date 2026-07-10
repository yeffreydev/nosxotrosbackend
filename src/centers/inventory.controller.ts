import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CentersService } from './centers.service';
import { ScanDto } from './dto/scan.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly centersService: CentersService) {}

  @Roles(Role.MANAGER, Role.REGISTRAR)
  @Post('scan')
  scan(@Body() dto: ScanDto, @CurrentUser() user: AuthUser) {
    return this.centersService.scan(dto, user.id);
  }
}
