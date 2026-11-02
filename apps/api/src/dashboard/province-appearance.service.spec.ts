import { ProvinceAppearanceService } from './province-appearance.service';
import { APPEARANCE_DEFAULTS, cleanAppearance } from './province-appearance.schema';
import { AuthUser } from '../auth/auth.types';
const admin = { accountLevel: 'PROVINCE', portal: 'REGULATORY', permissions: ['dashboard:view', 'system:organization:update'] } as AuthUser;
describe('Province shared appearance validation and ownership', () => {
  it('defaults to fully transparent panels', () => { expect(cleanAppearance({}).panelOpacity).toBe(0); });
  it('upgrades existing styles with 3D defaults while retaining saved colors', () => {
    const style = cleanAppearance({ primary: '#335577', panelOpacity: .45 });
    expect(style).toMatchObject({ primary: '#335577', panelOpacity: .45, map3d: true, mapPitch: 42, mapRegionHeight: 12000, mapBuildingHeight: 1 });
  });
  it('validates 3D camera, height and building settings', () => {
    for (const input of [{ mapPitch: 90 }, { mapRotation: 181 }, { mapRegionHeight: -1 }, { mapBuildingHeight: 0 }, { map3d: 'true' }, { mapSideColor: 'blue' }]) expect(() => cleanAppearance(input)).toThrow();
    expect(cleanAppearance({ map3d: false, mapPitch: 0, mapRegionHeight: 30000, mapBuildingHeight: 5 }).map3d).toBe(false);
  });
  it('rejects invalid colors, selectors, switches, ranges and unknown settings', () => {
    for (const input of [{ primary: 'url(https://untrusted)' }, { panelOpacity: 2 }, { panelWidth: -20 }, { labels: 'false' }, { mapStyle: 'untrusted-style' }, { surprise: true }, { labelSize: NaN }]) expect(() => cleanAppearance(input)).toThrow();
  });
  it('requires province identity for reads and province management for writes', async () => {
    const service = new ProvinceAppearanceService({} as any, {} as any);
    await expect(service.read({ ...admin, accountLevel: 'CITY' })).rejects.toThrow('仅省级');
    await expect(service.read({ ...admin, portal: 'ENTERPRISE' })).rejects.toThrow('仅省级');
    await expect(service.save({ ...admin, permissions: ['dashboard:view'] }, { style: {}, expectedRevision: 0 })).rejects.toThrow('管理权限');
  });
  it('uses atomic revision matching and rejects stale editors before updating', async () => {
    const prisma = { $queryRaw: jest.fn(async () => [{ revision: 3, payload: JSON.stringify({ style: APPEARANCE_DEFAULTS, presets: [] }), updatedAt: new Date() }]), $executeRaw: jest.fn(async () => 0) };
    const service = new ProvinceAppearanceService(prisma as any, { audit: jest.fn() } as any);
    await expect(service.save(admin, { style: {}, expectedRevision: 2 })).rejects.toThrow('其他浏览器'); expect(prisma.$executeRaw).not.toHaveBeenCalled();
    await expect(service.save(admin, { style: {}, expectedRevision: 3 })).rejects.toThrow('其他浏览器');
  });
  it('does not change the active style when saving a named preset', async () => {
    let payload = JSON.stringify({ style: { ...APPEARANCE_DEFAULTS, primary: '#112233' }, presets: [] }); let revision = 0;
    const prisma = { $queryRaw: jest.fn(async () => [{ revision, payload, updatedAt: new Date() }]), $executeRaw: jest.fn(async (_template, next: string) => { payload = next; revision++; return 1; }) };
    const service = new ProvinceAppearanceService(prisma as any, { audit: jest.fn() } as any);
    const result = await service.preset(admin, { expectedRevision: 0, name: '测试预设', style: { ...APPEARANCE_DEFAULTS, primary: '#334455' } });
    expect(result.style.primary).toBe('#112233'); expect(result.presets[0].style.primary).toBe('#334455'); expect(result.revision).toBe(1);
  });
});
