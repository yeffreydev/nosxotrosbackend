import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VolunteersService } from './volunteers.service';
import { UpdateVolunteerDto } from './dto/update-volunteer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('volunteers')
@ApiBearerAuth()
@Controller('volunteers')
export class VolunteersController {
  constructor(private readonly volunteersService: VolunteersService) {}

  @Roles(Role.VOLUNTEER)
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.volunteersService.getMe(user.id);
  }

  @Roles(Role.VOLUNTEER)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateVolunteerDto) {
    return this.volunteersService.updateMe(user.id, dto);
  }

  @Roles(Role.VOLUNTEER)
  @Get('me/passport')
  getPassport(@CurrentUser() user: AuthUser) {
    return this.volunteersService.getPassport(user.id);
  }
}
