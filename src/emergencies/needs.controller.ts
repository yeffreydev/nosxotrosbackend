import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EmergenciesService } from './emergencies.service';
import { UpdateNeedDto } from './dto/update-need.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('needs')
@ApiBearerAuth()
@Controller('needs')
export class NeedsController {
  constructor(private readonly emergenciesService: EmergenciesService) {}

  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNeedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.emergenciesService.updateNeed(id, dto, user.id);
  }
}
