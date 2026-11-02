import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOperationRegionDto } from './dto';

describe('道路通行区边界顶点', () => {
  const region = (count: number) => plainToInstance(CreateOperationRegionDto, { businessNo: 'ROAD-BOUNDARY', name: '道路通行区', organizationId: 'org', validFrom: '2026-10-31', polygon: Array.from({ length: count }, (_, index) => ({ longitude: 117 + index / 100000, latitude: 36.7 })) });
  it('接受保留真实道路转折点的456点边界', async () => {
    expect(await validate(region(456))).toEqual([]);
  });
  it('仍限制异常大的1001点请求', async () => {
    expect((await validate(region(1001))).some(error => error.property === 'polygon' && !!error.constraints?.arrayMaxSize)).toBe(true);
  });
});
