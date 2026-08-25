import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SuperadminService } from './superadmin.service';
import { SuperadminGuard } from './superadmin.guard';
import { SuperadminLoginDto } from './dto/superadmin-login.dto';
import { SetPublishedDto } from './dto/set-published.dto';
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
  @Delete('organizers/:id/verify')
  unverify(@Param('id') id: string) {
    return this.service.unverifyOrganizer(id);
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Get('campaigns')
  campaigns() {
    return this.service.listCampaigns();
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Patch('campaigns/:id/published')
  setPublished(@Param('id') id: string, @Body() dto: SetPublishedDto) {
    return this.service.setCampaignPublished(id, dto.published);
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Delete('campaigns/:id')
  deleteCampaign(@Param('id') id: string) {
    return this.service.deleteCampaign(id);
  }

  // Verificación de pagos: todo el dinero que llega, con su prueba de abono.
  @Public()
  @UseGuards(SuperadminGuard)
  @Get('payments')
  payments() {
    return this.service.listPayments();
  }

  @Public()
  @UseGuards(SuperadminGuard)
  @Post('payments/:donationId/confirm')
  confirmPayment(
    @Param('donationId') donationId: string,
    @Body() dto: { reference?: string },
  ) {
    return this.service.confirmPayment(donationId, dto?.reference);
  }
}
