import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateSurveyDto } from './dto/create-survey.dto';

@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSurveyDto, userId?: string) {
    const response = await this.prisma.surveyResponse.create({
      data: {
        kind: dto.kind,
        score: dto.score,
        context: dto.context,
        comment: dto.comment,
        userId: userId ?? null,
      },
    });
    await this.audit.log(userId ?? null, 'create', 'SurveyResponse', response.id, {
      kind: dto.kind,
      score: dto.score,
    });
    return response;
  }
}
