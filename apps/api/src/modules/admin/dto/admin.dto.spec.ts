import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateInterviewQuestionDto, CreateRoleProfileDto, CreateSourceFeedDto } from './admin.dto';

describe('CreateSourceFeedDto', () => {
  it('rejects non-url feed values', () => {
    const dto = new CreateSourceFeedDto();
    dto.name = 'Bad Feed';
    dto.type = 'RSS' as never;
    dto.url = 'not-a-url';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('accepts valid HTTP feed URLs', () => {
    const dto = new CreateSourceFeedDto();
    dto.name = 'Valid Feed';
    dto.type = 'RSS' as never;
    dto.url = 'https://example.com/feed.xml';

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects blank source feed names', () => {
    const dto = new CreateSourceFeedDto();
    dto.name = '   ';
    dto.type = 'RSS' as never;
    dto.url = 'https://example.com/feed.xml';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('CreateRoleProfileDto', () => {
  it('rejects blank text fields', () => {
    const dto = new CreateRoleProfileDto();
    dto.name = 'AI PM';
    dto.slug = '   ';
    dto.description = 'Product role';

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('CreateInterviewQuestionDto', () => {
  it('rejects blank question text', () => {
    const dto = new CreateInterviewQuestionDto();
    dto.roleProfileId = 'role-1';
    dto.difficulty = 'MID' as never;
    dto.question = '   ';
    dto.rubric = {};

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
