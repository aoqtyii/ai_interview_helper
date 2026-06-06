import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AddInterviewTurnDto, CreateInterviewSessionDto } from './interview.dto';

describe('CreateInterviewSessionDto', () => {
  it('rejects blank role profile ids', () => {
    const dto = new CreateInterviewSessionDto();
    dto.roleProfileId = '   ';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects blank optional topics when provided', () => {
    const dto = new CreateInterviewSessionDto();
    dto.roleProfileId = 'role-1';
    dto.topic = '   ';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('AddInterviewTurnDto', () => {
  it('rejects blank answers', () => {
    const dto = new AddInterviewTurnDto();
    dto.content = '   ';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
