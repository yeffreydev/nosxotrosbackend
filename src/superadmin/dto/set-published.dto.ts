import { IsBoolean } from 'class-validator';

// Publicar / despublicar una campaña: true → ACTIVE, false → DRAFT.
export class SetPublishedDto {
  @IsBoolean()
  published!: boolean;
}
