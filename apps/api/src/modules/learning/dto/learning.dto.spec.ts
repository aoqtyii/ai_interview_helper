import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateLearningProgressDto } from './learning.dto';

describe('UpdateLearningProgressDto', () => {
  it('rejects blank learning item ids', () => {
    const dto = new UpdateLearningProgressDto();
    dto.learningItemId = '   ';
    dto.status = 'DONE' as never;

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
