import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuperadminService } from './superadmin.service';
import { SuperadminGuard } from './superadmin.guard';
import { SuperadminLoginDto } from './dto/superadmin-login.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('superadmin')
@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly service: SuperadminService) {}

  @Public()
  @Post('login')
  login(@Body() dto: SuperadminLoginDto) {
    return this.service.login(dto);
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Get('organizers')
  organizers() {
    return this.service.listOrganizers();
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Post('organizers/:id/verify')
  verify(@Param('id') id: string) {
    return this.service.verifyOrganizer(id);
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Get('campaigns')
  campaigns() {
    return this.service.listCampaigns();
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Delete('campaigns/:id')
  deleteCampaign(@Param('id') id: string) {
    return this.service.deleteCampaign(id);
  }
}
