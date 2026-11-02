/**
 * Camera presets only. Coordinates are approximate visual centers, not survey-grade boundaries.
 * Replace/extend with your authoritative administrative-region catalogue when integrating a project.
 */
export const WORLD_REGION = Object.freeze({
  id: 'world',
  name: '全球',
  nameEn: 'World',
  level: 'global',
  center: [105, 28],
  height: 23_000_000,
  heading: 0,
  pitch: -90,
});

export const CHINA_REGION = Object.freeze({
  id: 'china',
  adcode: '100000',
  name: '中国',
  nameEn: 'China',
  level: 'country',
  center: [104.2, 35.7],
  height: 5_300_000,
  heading: 0,
  pitch: -90,
});

const city = (id, adcode, name, center, height = 130_000) => ({
  id,
  adcode,
  name,
  level: 'city',
  center,
  height,
  heading: 0,
  pitch: -58,
});

const province = (id, adcode, name, center, cities = [], height = 1_150_000) => ({
  id,
  adcode,
  name,
  level: 'province',
  center,
  height,
  heading: 0,
  pitch: -70,
  cities,
});

export const CHINA_PROVINCES = Object.freeze([
  province('beijing', '110000', '北京市', [116.4074, 39.9042], [], 260_000),
  province('tianjin', '120000', '天津市', [117.2009, 39.0842], [], 260_000),
  province('hebei', '130000', '河北省', [114.50, 38.04], [
    city('shijiazhuang', '130100', '石家庄市', [114.5149, 38.0428]),
    city('tangshan', '130200', '唐山市', [118.1802, 39.6309]),
    city('qinhuangdao', '130300', '秦皇岛市', [119.6005, 39.9354]),
  ]),
  province('shanxi', '140000', '山西省', [112.55, 37.87], [
    city('taiyuan', '140100', '太原市', [112.5489, 37.8706]),
  ]),
  province('inner-mongolia', '150000', '内蒙古自治区', [111.75, 40.84], [
    city('hohhot', '150100', '呼和浩特市', [111.7492, 40.8426]),
    city('tongliao', '150500', '通辽市', [122.2433, 43.6536]),
    city('chifeng', '150400', '赤峰市', [118.8876, 42.2578]),
  ], 1_650_000),
  province('liaoning', '210000', '辽宁省', [123.43, 41.80], [
    city('shenyang', '210100', '沈阳市', [123.4315, 41.8057]),
    city('dalian', '210200', '大连市', [121.6147, 38.9140]),
    city('dandong', '210600', '丹东市', [124.3547, 40.0008]),
    city('jinzhou', '210700', '锦州市', [121.1269, 41.0952]),
    city('yingkou', '210800', '营口市', [122.2354, 40.6670]),
    city('panjin', '211100', '盘锦市', [122.0707, 41.1199]),
  ]),
  province('jilin', '220000', '吉林省', [125.32, 43.82], [
    city('changchun', '220100', '长春市', [125.3235, 43.8171]),
    city('jilin-city', '220200', '吉林市', [126.5496, 43.8379]),
  ]),
  province('heilongjiang', '230000', '黑龙江省', [126.53, 45.80], [
    city('harbin', '230100', '哈尔滨市', [126.5349, 45.8038]),
    city('qiqihar', '230200', '齐齐哈尔市', [123.9182, 47.3543]),
    city('daqing', '230600', '大庆市', [125.1038, 46.5893]),
  ], 1_400_000),
  province('shanghai', '310000', '上海市', [121.4737, 31.2304], [], 250_000),
  province('jiangsu', '320000', '江苏省', [118.80, 32.06], [
    city('nanjing', '320100', '南京市', [118.7969, 32.0603]),
    city('suzhou', '320500', '苏州市', [120.5853, 31.2989]),
    city('lianyungang', '320700', '连云港市', [119.2216, 34.5967]),
  ]),
  province('zhejiang', '330000', '浙江省', [120.16, 30.27], [
    city('hangzhou', '330100', '杭州市', [120.1551, 30.2741]),
    city('ningbo', '330200', '宁波市', [121.5503, 29.8746]),
    city('wenzhou', '330300', '温州市', [120.6994, 27.9949]),
    city('jiaxing', '330400', '嘉兴市', [120.7555, 30.7461]),
    city('huzhou', '330500', '湖州市', [120.0868, 30.8943]),
    city('shaoxing', '330600', '绍兴市', [120.5802, 30.0303]),
    city('jinhua', '330700', '金华市', [119.6495, 29.0895]),
    city('quzhou', '330800', '衢州市', [118.8595, 28.9701]),
    city('zhoushan', '330900', '舟山市', [122.2072, 29.9853]),
    city('taizhou-zj', '331000', '台州市', [121.4208, 28.6564]),
    city('lishui', '331100', '丽水市', [119.9229, 28.4676]),
  ]),
  province('anhui', '340000', '安徽省', [117.23, 31.82], [
    city('hefei', '340100', '合肥市', [117.2272, 31.8206]),
  ]),
  province('fujian', '350000', '福建省', [119.30, 26.08], [
    city('fuzhou', '350100', '福州市', [119.2965, 26.0745]),
    city('xiamen', '350200', '厦门市', [118.0894, 24.4798]),
  ]),
  province('jiangxi', '360000', '江西省', [115.86, 28.68], [
    city('nanchang', '360100', '南昌市', [115.8579, 28.6829]),
  ]),
  province('shandong', '370000', '山东省', [117.12, 36.65], [
    city('jinan', '370100', '济南市', [117.1205, 36.6512]),
    city('qingdao', '370200', '青岛市', [120.3826, 36.0671]),
    city('yantai', '370600', '烟台市', [121.4479, 37.4638]),
    city('rizhao', '371100', '日照市', [119.5269, 35.4164]),
  ]),
  province('henan', '410000', '河南省', [113.63, 34.75], [
    city('zhengzhou', '410100', '郑州市', [113.6254, 34.7466]),
  ]),
  province('hubei', '420000', '湖北省', [114.31, 30.59], [
    city('wuhan', '420100', '武汉市', [114.3054, 30.5931]),
  ]),
  province('hunan', '430000', '湖南省', [112.94, 28.23], [
    city('changsha', '430100', '长沙市', [112.9388, 28.2282]),
  ]),
  province('guangdong', '440000', '广东省', [113.27, 23.13], [
    city('guangzhou', '440100', '广州市', [113.2644, 23.1291]),
    city('shenzhen', '440300', '深圳市', [114.0579, 22.5431]),
    city('foshan', '440600', '佛山市', [113.1214, 23.0215]),
    city('zhanjiang', '440800', '湛江市', [110.3594, 21.2707]),
  ]),
  province('guangxi', '450000', '广西壮族自治区', [108.37, 22.82], [
    city('nanning', '450100', '南宁市', [108.3669, 22.8170]),
    city('qinzhou', '450700', '钦州市', [108.6543, 21.9809]),
  ]),
  province('hainan', '460000', '海南省', [110.20, 20.04], [
    city('haikou', '460100', '海口市', [110.1983, 20.0440]),
  ]),
  province('chongqing', '500000', '重庆市', [106.5516, 29.5630], [], 300_000),
  province('sichuan', '510000', '四川省', [104.07, 30.57], [
    city('chengdu', '510100', '成都市', [104.0665, 30.5723]),
  ]),
  province('guizhou', '520000', '贵州省', [106.63, 26.65], [
    city('guiyang', '520100', '贵阳市', [106.6302, 26.6470]),
  ]),
  province('yunnan', '530000', '云南省', [102.83, 24.88], [
    city('kunming', '530100', '昆明市', [102.8329, 24.8801]),
  ]),
  province('tibet', '540000', '西藏自治区', [91.14, 29.65], [
    city('lhasa', '540100', '拉萨市', [91.1409, 29.6456]),
  ], 1_650_000),
  province('shaanxi', '610000', '陕西省', [108.94, 34.34], [
    city('xian', '610100', '西安市', [108.9398, 34.3416]),
  ]),
  province('gansu', '620000', '甘肃省', [103.83, 36.06], [
    city('lanzhou', '620100', '兰州市', [103.8343, 36.0611]),
  ], 1_450_000),
  province('qinghai', '630000', '青海省', [101.78, 36.62], [
    city('xining', '630100', '西宁市', [101.7782, 36.6171]),
  ], 1_550_000),
  province('ningxia', '640000', '宁夏回族自治区', [106.23, 38.49], [
    city('yinchuan', '640100', '银川市', [106.2309, 38.4872]),
  ]),
  province('xinjiang', '650000', '新疆维吾尔自治区', [87.62, 43.83], [
    city('urumqi', '650100', '乌鲁木齐市', [87.6168, 43.8256]),
  ], 2_050_000),
  province('taiwan', '710000', '台湾省', [121.0, 23.7], [
    city('taipei', '710100', '台北', [121.5654, 25.0330]),
  ], 650_000),
  province('hongkong', '810000', '香港特别行政区', [114.1694, 22.3193], [], 180_000),
  province('macao', '820000', '澳门特别行政区', [113.5439, 22.1987], [], 120_000),
]);

export function findProvince(id) {
  return CHINA_PROVINCES.find((item) => item.id === id) ?? null;
}

export function findCity(provinceId, cityId) {
  return findProvince(provinceId)?.cities?.find((item) => item.id === cityId) ?? null;
}
