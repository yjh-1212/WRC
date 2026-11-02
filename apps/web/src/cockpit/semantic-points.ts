// Screen-space clustering affects presentation only; source vehicle records stay intact.
export function groupVisiblePoints<T extends { id: string; longitude: number; latitude: number }>(points: T[], project: (point: T) => { x: number; y: number; visible: boolean } | null, cellSize: number) {
  const cells = new Map<string, T[]>();
  for (const point of points) {
    const position = project(point);
    if (!position?.visible) continue;
    const key = `${Math.floor(position.x / cellSize)}:${Math.floor(position.y / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(point); cells.set(key, cell);
  }
  return [...cells.values()].map(members => ({
    members,
    longitude: members.reduce((sum, p) => sum + p.longitude, 0) / members.length,
    latitude: members.reduce((sum, p) => sum + p.latitude, 0) / members.length,
  }));
}
