import { ValidationError } from 'class-validator';
import { flattenValidationMessages, foreignKeyMessage, uniqueConflictMessage } from './validation';

describe('validation messages', () => {
  it('translates empty required fields to Chinese', () => {
    const error = Object.assign(new ValidationError(), {
      property: 'displayName',
      value: '',
      constraints: { isString: 'displayName must be a string' },
    });
    expect(flattenValidationMessages([error])).toEqual(['显示姓名不能为空']);
  });

  it('maps unique conflicts by field name', () => {
    expect(uniqueConflictMessage(['username'])).toBe('登录账号已存在，请更换后重试');
    expect(uniqueConflictMessage(['creditCode'])).toBe('统一社会信用代码已存在，请更换后重试');
    expect(uniqueConflictMessage('Vehicle_vin_key')).toBe('VIN已存在，请更换后重试');
  });

  it('maps foreign keys without confusing creditCode with code', () => {
    expect(foreignKeyMessage('enterpriseId')).toBe('所选所属企业不存在或已被删除');
    expect(foreignKeyMessage('Vehicle_enterpriseId_fkey')).toBe('所选所属企业不存在或已被删除');
  });
});
