import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BrigadesService } from './brigades.service';
import { CreateBrigadeDto } from './dto/create-brigade.dto';
import { UpdateBrigadeDto } from './dto/update-brigade.dto';
import { AddBrigadeMemberDto } from './dto/add-brigade-member.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('brigades')
@Controller()
export class BrigadesController {
  constructor(private readonly brigades: BrigadesService) {}

  @Public()
  @Get('campaigns/:campaignId/brigades')
  list(@Param('campaignId') campaignId: string) {
    return this.brigades.listByCampaign(campaignId);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('campaigns/:campaignId/brigades')
  create(
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateBrigadeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brigades.create(campaignId, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch('brigades/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBrigadeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brigades.update(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete('brigades/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.brigades.remove(id, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post('brigades/:id/members')
  addMember(
    @Param('id') id: string,
    @Body() dto: AddBrigadeMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brigades.addMember(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Delete('brigades/:id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.brigades.removeMember(id, memberId, user);
  }
}
