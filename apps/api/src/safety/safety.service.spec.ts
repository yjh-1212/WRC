import { BadRequestException } from '@nestjs/common';
import { SafetyService } from './safety.service';

describe('SafetyService geometry and identifiers', () => {
  const service = new SafetyService({} as any, {} as any) as any;
  const square = [
    { longitude: 120, latitude: 30 },
    { longitude: 121, latitude: 30 },
    { longitude: 121, latitude: 31 },
    { longitude: 120, latitude: 31 },
  ];

  it('recognizes a point inside an electronic fence', () => {
    expect(service.pointInPolygon(120.5, 30.5, square)).toBe(true);
    expect(service.pointInPolygon(122, 30.5, square)).toBe(false);
  });

  it('rejects a polygon with fewer than three points', () => {
    expect(() => service.validatePolygon(square.slice(0, 2))).toThrow(BadRequestException);
  });

  it('creates traceable business numbers', () => {
    expect(service.businessNo('ALT')).toMatch(/^ALT-\d{14}-\d{4}$/);
  });
});
