import { describe, it, expect } from 'vitest';
import { t } from '../i18n/translations';

describe('多语言翻译', () => {
  it('中文所有key有值且不含英文', () => {
    const zhKeys = [
      'app.title','tab.record','tab.list','tab.stats','tab.profile',
      'form.submit','form.note','form.invalidAmount',
      'list.empty','list.exportCSV','list.import','list.delete','list.cancel',
      'stats.total','stats.count','stats.trend',
      'import.title','import.fileTypeError','import.emptyFile','import.headerError',
      'cat.title','cat.addCat1','cat.addCat2','cat.rename',
    ];
    zhKeys.forEach(key => {
      const val = t('zh', key);
      expect(val).not.toBe(key);
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('英文所有key有值', () => {
    const keys = ['app.title','tab.record','tab.list','tab.stats',
      'form.submit','list.empty','stats.total','import.title','cat.title'];
    keys.forEach(key => {
      const val = t('en', key);
      expect(val).not.toBe(key);
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('未知key返回原key', () => {
    expect(t('zh', 'not.exist')).toBe('not.exist');
    expect(t('en', 'not.exist')).toBe('not.exist');
  });
});
