import { describe, expect, it } from 'vitest';
import { operationsManual, userGuideManual } from 'virtual:manual-docs';

describe('マニュアルビルド変換 (virtual:manual-docs)', () => {
  it('OPERATIONS.md と USER_GUIDE.md の HTML・目次・画像パスが正しく生成される', () => {
    for (const doc of [operationsManual, userGuideManual]) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.toc.length).toBeGreaterThan(0);
      expect(doc.html).toContain('/manual-images/');
      expect(doc.html).toContain('<figure class="manual-figure">');
      expect(doc.html).toContain('<figcaption>');
      expect(doc.html).not.toContain('./images/');

      for (const item of doc.toc) {
        expect(doc.html).toContain(`id="${item.id}"`);
        expect([2, 3]).toContain(item.level);
        expect(item.text.length).toBeGreaterThan(0);
      }
    }

    expect(operationsManual.title).toContain('運営・トラブル対応マニュアル');
    expect(userGuideManual.title).toContain('一般部員向けガイド');
  });
});
