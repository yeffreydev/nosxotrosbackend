import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('surveys')
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateSurveyDto, @CurrentUser() user?: AuthUser) {
    return this.surveysService.create(dto, user?.id);
  }
}
