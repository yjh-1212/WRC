"""Build Shandong's georeferenced satellite atlas, following liaoliang's map pipeline.

The source is real AMap satellite tiles; this does not generate or paint geographic
imagery. The atlas is published only after every source tile has been decoded.
"""
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import time
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'apps/web/public/map/shandong-relief'
CACHE = ROOT / 'tmp/shandong-satellite-tiles'
ZOOM, SIZE = 8, 256
N = 2 ** ZOOM
URL = 'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'


def coordinates(value):
    if isinstance(value[0], (int, float)):
        yield value
    else:
        for child in value:
            yield from coordinates(child)


def fetch(position):
    x, y = position
    target = CACHE / f'{ZOOM}-{x}-{y}.jpg'
    for attempt in range(3):
        try:
            raw = target.read_bytes() if target.exists() else subprocess.run(
                ['curl.exe', '--silent', '--show-error', '--fail', '--location', '--max-time', '20', URL.format(x=x, y=y, z=ZOOM)],
                check=True, capture_output=True, timeout=25,
            ).stdout
            tile = Image.open(io.BytesIO(raw)).convert('RGB')
            if tile.size != (SIZE, SIZE):
                raise ValueError(f'Invalid tile dimensions: {tile.size}')
            target.write_bytes(raw)
            return position, tile
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def main():
    geo = json.loads((ROOT / 'apps/web/public/map/threemap/geojson/370000.json').read_text(encoding='utf-8'))
    points = [point for feature in geo['features'] for point in coordinates(feature['geometry']['coordinates'])]
    tile_y = lambda lat: (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * N
    xmin, xmax = [math.floor((value + 180) / 360 * N) for value in [min(p[0] for p in points), max(p[0] for p in points)]]
    ymin, ymax = [math.floor(tile_y(value)) for value in [max(p[1] for p in points), min(p[1] for p in points)]]
    CACHE.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    jobs = [(x, y) for y in range(ymin, ymax + 1) for x in range(xmin, xmax + 1)]
    atlas = Image.new('RGB', ((xmax - xmin + 1) * SIZE, (ymax - ymin + 1) * SIZE))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for (x, y), tile in pool.map(fetch, jobs):
            atlas.paste(tile, ((x - xmin) * SIZE, (y - ymin) * SIZE))
    image = DEST / 'shandong-satellite.webp'
    pending = image.with_suffix('.pending.webp')
    atlas.save(pending, 'WEBP', quality=94, method=6)
    pending.replace(image)
    metadata = {
        'provider': '高德地图', 'layer': '卫星影像', 'attribution': '© 高德地图', 'source': 'https://www.amap.com/',
        'tileTemplate': URL, 'zoom': ZOOM, 'tileCount': len(jobs), 'projection': 'Web Mercator',
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'note': '山东区域卫星瓦片拼接，影像采集日期随瓦片变化，不是实时影像。',
        'width': atlas.width, 'height': atlas.height,
        'bounds': {'west': xmin / N * 360 - 180, 'east': (xmax + 1) / N * 360 - 180,
                   'south': 180 - (ymax + 1) / N * 360, 'north': 180 - ymin / N * 360},
        'boundsUnits': 'longitude degrees and Mercator latitude degrees',
        'sha256': hashlib.sha256(image.read_bytes()).hexdigest(),
    }
    (DEST / 'shandong-satellite.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(jobs)} tiles, {atlas.width}x{atlas.height}, {image.stat().st_size} bytes')


if __name__ == '__main__':
    main()
