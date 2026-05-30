import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateSourceFeedDto } from './admin.dto';

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
});
