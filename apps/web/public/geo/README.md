# 行政区底图

来源：阿里云 DataV GeoAtlas 公共行政区边界。2026-09-22 下载。

- 100000.json：https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
- 330000.json：https://geo.datav.aliyun.com/areas_v3/bound/330000_full.json
- 山东业务地图使用 `../map/threemap/geojson/370000.json`，对应 https://geo.datav.aliyun.com/areas_v3/bound/370000_full.json 。山东16市业务明细由城市工作空间及所属组织查询，地图几何不携带业务数值。
- world.json：Natural Earth 110m 公共领域国家轮廓，https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson 。仅作低亮度全球背景。

仅包含地理几何，不含业务统计。业务数值从监管数据库接口读取。生产发布前应按使用地区要求审核地图及数据源授权。
