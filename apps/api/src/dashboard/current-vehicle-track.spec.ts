import { currentVehicleTrack } from './current-vehicle-track';
describe('Current running vehicle trace', () => {
  it('selects the active trip and returns the most recent real fixes in chronological order', async () => {
    const findFirst = jest.fn(async () => ({ id: 'trip', startedAt: new Date(), startAddress: '起点', endAddress: '终点', trackPoints: [{ longitude: 117.2, latitude: 36.6, recordedAt: 'new' }, { longitude: 117.1, latitude: 36.6, recordedAt: 'old' }] }));
    const result = await currentVehicleTrack({ operationRecord: { findFirst } } as any, 'vehicle');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { vehicleId: 'vehicle', endedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED', 'CANCELED'] } }, select: expect.objectContaining({ trackPoints: expect.objectContaining({ take: 1000, orderBy: { sequence: 'desc' } }) }) }));
    expect(result.track.map(point => point.recordedAt)).toEqual(['old', 'new']); expect(result.trip?.id).toBe('trip');
  });
  it('returns no fabricated trajectory when there is no active trip', async () => { expect(await currentVehicleTrack({ operationRecord: { findFirst: async () => null } } as any, 'vehicle')).toEqual({ track: [], trip: null }); });
});
