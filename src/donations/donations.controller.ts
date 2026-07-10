import {
  BadRequestException,
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
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';
import { UpdateDonationStatusDto } from './dto/update-donation-status.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { QueryDonationsDto } from './dto/query-donations.dto';
import { LookupDonationsDto } from './dto/lookup-donations.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateDonationDto, @CurrentUser() user?: AuthUser) {
    return this.donationsService.create(dto, user);
  }

  @ApiBearerAuth()
  @Get()
  findAll(@Query() query: QueryDonationsDto, @CurrentUser() user: AuthUser) {
    return this.donationsService.findAll(query, user);
  }

  @Public()
  @Get('track/:code')
  track(@Param('code') code: string) {
    return this.donationsService.track(code);
  }

  @Public()
  @Get('lookup')
  lookup(@Query() q: LookupDonationsDto) {
    if (q.email) return this.donationsService.lookupByEmail(q.email);
    if (q.phone) return this.donationsService.lookupByPhone(q.phone);
    throw new BadRequestException('Indica un correo o un teléfono');
  }

  @ApiBearerAuth()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.donationsService.findOne(id, user);
  }

  @ApiBearerAuth()
  @Roles(Role.MANAGER, Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDonationStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.donationsService.updateStatus(id, dto, user);
  }

  @Public()
  @Post(':id/confirm-payment')
  confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.donationsService.confirmPayment(id, dto, user);
  }
}
