/**
 * World Explorer (世界探索) — Internationalization (i18n) Module
 *
 * Requirements & Invariants:
 * 1. Project Title: 'World Explorer' (en) / '世界探索' (zh).
 * 2. Supported Languages: 'zh' (Simplified Chinese) and 'en' (English).
 * 3. Initial Language Selection: Chosen on every page load via a language modal
 *    (session-fixed; does NOT auto-skip from localStorage).
 */

export const PROJECT_TITLE = 'World Explorer';

let currentLang = 'en';
const langChangeCallbacks = new Set();

export const I18N = {
  zh: {
    dom: {
      page_title: '世界探索',
      game_title: '世界探索',
      lbl_road: '当前道路 / 区域',
      lbl_latlon: '真实经纬度 (WGS-84)',
      lbl_xyz: '天安门相对坐标 / 高程',
      lbl_speed_chunks: '速率 / 区块流式状态',
      grp_mode: '交互模式',
      btn_mode_drive: '驾驶 [F]',
      btn_mode_drive_title: '驾驶载具 (快捷键 F)',
      btn_mode_walk: '步行 [F]',
      btn_mode_walk_title: '下车步行 · 按住 Shift 触发外骨骼量子疾跑特效 (快捷键 F)',
      btn_mode_heli: '直升机 [C]',
      btn_mode_heli_title: '涡轴武装/行政直升机巡航模式 · 按住 Shift 开启双发加力燃烧 (快捷键 C)',
      grp_cam_car: '视角与车辆',
      btn_cam_toggle: '视角切换 [V]',
      btn_cam_toggle_title: '切换 3D 追尾 / 经典 GTA 俯视角 / 低角街景 (快捷键 V)',
      btn_car_cycle: '换车 [G]',
      btn_car_cycle_title: '切换 6 款炫酷载具 (快捷键 G)',
      btn_nitro_toggle: '氮气 [Shift]',
      btn_nitro_toggle_title: '开启/锁定氮气加速 (或按住 Shift 键触发全载具/步行/直升机专属特效)',
      btn_map_open: '全城地图 [M]',
      btn_map_open_title: '打开 40km×40km 全城矢量导航与秒传大地图 (快捷键 M)',
      btn_wfc_lab: 'WFC 实验台',
      btn_wfc_lab_title: '打开北京 3D 建筑波函数坍缩 (WFC) 快速迭代实验台',
      grp_time: '时刻与光影',
      time_noon: '正午',
      time_sunset: '落日',
      time_night: '夜景',
      time_overcast: '雾霭',
      grp_layers: 'OSM 交通与建筑图层检验',
      chk_buildings: '3D 建筑/天井',
      chk_markings: '车道标线/箭头',
      chk_bridges: '立交桥墩/护栏',
      chk_facilities: '红绿灯/路牌/站点',
      chk_railways: '国铁/高架地铁',
      chk_traffic: 'AI 环路车流',
      drawer_title: '北京 40km×40km 枢纽秒传',
      drawer_sub: '1:1 真实尺度 · 20 个精选立交/地标 + 365 个地铁/火车站',
      drawer_toggle_title: '折叠/展开面板 [Tab]',
      hub_search_placeholder: '搜索地标 / 立交桥 / 地铁站 (如: 国贸, 西直门, 五道口)...',
      cat_all: '精选枢纽',
      cat_cbd: '立交/CBD',
      cat_hub: '交通枢纽',
      cat_landmark: '名胜地标',
      cat_stations: '全城站点(365)',
      insp_close_title: '关闭检视器',
      insp_osm_link: '在 OpenStreetMap.org 查看原始数据 ↗',
      insp_nav_btn: '设为 GPS 导航终点',
      minimap_title: '点击打开全城 40km×40km 大地图 [M]',
      minimap_scale: 'R=450m · 实时区块路网',
      bottom_bar_html: `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 随视角行进/驾驶/飞行</span>
<span><kbd>鼠标拖拽</kbd>/<kbd>Q</kbd><kbd>E</kbd> 旋转相机/升降</span>
<span><kbd>Space</kbd>/<kbd>Ctrl</kbd> 跳跃/手刹/直升机升降</span>
<span><kbd>Shift</kbd> 氮气加速 (1马赫音爆/涡轴加力/量子疾跑)</span>
<span><kbd>F</kbd> 驾驶/步行切换</span>
<span><kbd>C</kbd> 直升机模式</span>
<span><kbd>G</kbd> 切换 6 款炫酷载具</span>
<span><kbd>M</kbd> 40km×40km 全城地图与导航</span>
<span><kbd>左键点击建筑/道路</kbd> 检视真实 OSM 属性</span>`,
      map_modal_title: '北京市中心 40km × 40km (1,600 km²) 真实 OSM 路网、轨道与区块检视大图',
      map_modal_sub_html: '滚轮连续缩放 · 拖拽平移 · 可切换<b>左键任意选点秒传</b>或<b>左键规划 A* 导航</b> · <b>右键点击 (或 Shift+左键)</b> 随时瞬间传送至任意坐标',
      btn_map_mode_teleport: '左键模式：任意点秒传',
      btn_map_mode_nav: '左键模式：A* 路径导航',
      btn_map_center_player: '定位玩家',
      btn_map_reset_view: '全城总览 (40km)',
      btn_map_clear_gps: '清除导航',
      btn_map_close: '关闭 [M / Esc]',
      leg_ring: '环路/高速 (二至五环)',
      leg_primary: '主干道 (长安街等)',
      leg_secondary: '次干道/联络线',
      leg_bridge: '立交高架桥 (Layer≥1)',
      leg_subway: '北京地铁线网',
      leg_water: '护城河/湖泊水系',
      leg_chunk: '已加载 3D 区块',
    },
    runtime: {
      // [kaiju]
      mode_kaiju: '怪兽',
      kaiju_title: '怪兽防卫',
      kaiju_badge: '怪兽防卫',
      kaiju_alert: '怪兽警报',
      kaiju_name: '怪兽',
      kaiju_city: '城市损毁',
      kaiju_hull: '机体',
      kaiju_heat: '机炮',
      kaiju_missile: '导弹',
      kaiju_overheat: '过热',
      kaiju_ready: '就绪',
      kaiju_saved: '城市得救',
      kaiju_fallen: '城市沦陷',
      kaiju_time: '用时',
      kaiju_accuracy: '命中率',
      kaiju_missile_hits: '导弹命中',
      kaiju_cannon_hits: '机炮命中',
      kaiju_again: '再来一局',
      kaiju_exit: '退出',
      kaiju_paused: '暂停',
      kaiju_resume: '继续',
      kaiju_restart: '重新开始',
      kaiju_mute: '静音',
      kaiju_unmute: '取消静音',
      kaiju_down: '直升机坠毁',
      kaiju_hint: 'W/S 移动 · A/D 转向 · Q/E 升降 · ←/→ 闪避 · 空格 开火 · F 导弹 · R 超武',
      kaiju_lock: '锁定',
      kaiju_dodge: '闪避',
      kaiju_danger: '危险区域',
      kaiju_supply_drop: '补给空投',
      kaiju_item_railgun: '电磁炮',
      kaiju_item_swarm: '蜂群导弹',
      kaiju_item_emp: '电磁脉冲',
      kaiju_item_orbital: '轨道打击',
      kaiju_item_repair: '维修包',
      kaiju_item_coolant: '冷却剂',
      default_road: '长安街 · 天安门广场',
      urban_road_fallback: '北京市区道路',
      chunks_unit: '区块',
      sonic_boom: '音爆',
      mode_walk_badge: '街头步行 (Shift 量子疾跑)',
      mode_heli_badge: '涡轴直升机 (Shift 双发加力)',
      mode_drive_fallback: '实车驾驶',
      cam_chase: '3D 追尾',
      cam_topdown: 'GTA 俯视',
      cam_street: '街景低角',
      dist_from_tam: '距天安门 {km}km',
      osm_station_desc: 'OSM 站点 #{id}',
      map_teleport_label: '大地图选点空降',
      map_right_teleport_label: '大地图右键瞬移',
      map_nav_dest: '大地图导航终点',
      out_of_bounds: '界外',
      station_prefix: '地铁/火车站：',
      insp_btype: '建筑分类',
      insp_bpart_suffix: ' · 分级体块 (building:part)',
      insp_style: '风貌样式',
      insp_height: '顶面高度 (height)',
      insp_levels_unit: '层',
      insp_min_h: '底面悬挑 (min_h)',
      insp_courtyards: '中空天井 (inner)',
      insp_courtyards_unit: '个 multipolygon 内院',
      insp_click_latlon: '点击处经纬度',
      insp_highway_cls: '道路等级 (highway)',
      insp_highway_ref: '道路编号 (ref)',
      insp_none: '无',
      insp_lanes_width: '车道与宽度',
      insp_lanes_fmt: '{lanes} 车道 · 宽度 {width} m',
      insp_oneway: '通行方向 (oneway)',
      insp_oneway_yes: '单向行驶 (One-Way)',
      insp_oneway_no: '双向行驶 (Two-Way)',
      insp_layer: '立体分层 (layer)',
      insp_layer_bridge: '立交高架桥 Bridge',
      insp_layer_tunnel: '下穿隧道 Tunnel',
      insp_layer_ground: '地面道路',
      insp_click_elev: '点击处高程 / 坐标',
    },
    vehicles: {
      cyber_mach1: '概念超跑',
      aero_formula: '方程式赛车',
      supercar: 'GT 跑车',
      taxi: '城市出租车',
      police: '警用巡逻车',
      bus: '城市巴士',
    },
    bookmarks: {
      tiananmen: {
        name: '天安门广场 · 长安街中轴线',
        desc: '北京坐标原点 (0, 0) · 紫禁城午门/护城河/长安街双向十车道',
      },
      guomao: {
        name: '国贸桥立交 · CBD 中国尊',
        desc: '东三环与建国路多层互通立交 · 中国尊 (528m) / 国贸三期 / 央视总部大楼',
      },
      cctv: {
        name: '中央广播电视总台 (大裤衩)',
        desc: '东三环中路光华路交汇 · 真实 OSM building:part 悬挑体块与 CBD 建筑群',
      },
      xizhimen: {
        name: '西直门立交桥 · 北京北站',
        desc: '西二环经典多层环形匝道立交 + 地铁2/4/13号线与京张高铁国铁股道',
      },
      sanyuanqiao: {
        name: '三元桥立交 · 机场高速起点',
        desc: '北三环与京密路/首都机场高速 S12 互通跨线桥与三元西桥',
      },
      gugong: {
        name: '故宫博物院 · 太和殿与筒子河',
        desc: '紫禁城完整宫殿群、内廷院落 multipolygon 天井与护城河水系',
      },
      shichahai: {
        name: '什刹海 · 钟鼓楼胡同四合院区',
        desc: '前海/后海/西海连片水系 · 烟袋斜街、鼓楼东大街与低矮青砖四合院肌理',
      },
      tiantan: {
        name: '天坛公园 · 祈年殿',
        desc: '南二环天坛祈年殿 (38m)、丹陛桥中轴步道与古柏林公园',
      },
      olympic: {
        name: '奥林匹克公园 · 鸟巢与水立方',
        desc: '北四环中轴延长线 · 国家体育场中空看台、龙形水系与北四环地下隧道',
      },
      zhongguancun: {
        name: '中关村大街 · 海淀黄庄/北四环',
        desc: '北四环西路一亩园/中关村立交、海淀大街科技园与周边北大/清华校园',
      },
      wudaokou: {
        name: '五道口 · 地铁13号线高架与成府路',
        desc: '成府路/荷清路平交铁路道口与地铁13号线五道口站、清华东门',
      },
      sanlitun: {
        name: '三里屯太古里 · 工人体育场',
        desc: '工人体育场北路、三里屯路开放式街区与亮马河国际风情水岸',
      },
      financial_st: {
        name: '北京金融街 · 复兴门桥',
        desc: '西二环复兴门立交桥、长安街西延线与金融街总部建筑群',
      },
      yiheyuan: {
        name: '颐和园 · 昆明湖与万寿山',
        desc: '西北五环内超大型天然湖泊水系、南湖岛 multipolygon 与西郊线有轨电车',
      },
      beijing_south: {
        name: '北京南站 · 京津/京沪高铁场站',
        desc: '南二环至南三环超大型椭圆形高架候车厅与数十条密集国铁/高铁股道',
      },
      beijing_west: {
        name: '北京西站 · 莲花池立交桥',
        desc: '西三环莲花桥互通立交、广安路高架与北京西站北广场门楼',
      },
      wangjing: {
        name: '望京 SOHO · 广顺北大街',
        desc: '东北四环至五环望京商务区 · 曲面流线建筑群与京承/机场高速联络网',
      },
      lize: {
        name: '丽泽金融商务区 · 菜户营桥',
        desc: '西南二环至三环丽泽路新摩天楼集群与护城河水系交汇',
      },
      shougang: {
        name: '首钢工业遗址公园 · 新首钢大桥',
        desc: '长安街西延线最西端 (-19.5km) · 高炉工业建筑群、群明湖与永定河跨河大桥',
      },
      wufangqiao: {
        name: '东五环五方桥 · 京哈高速互通',
        desc: '东五环与京哈高速 G1 大型三层蝶形互通立交桥，检验五环边缘真实路网',
      },
      jingshan_peak: {
        name: '景山公园 · 万春亭观景台',
        desc: '北京内城制高点 · 俯瞰紫禁城全貌与北京中轴线',
      },
      foxiangge_peak: {
        name: '颐和园 · 万寿山佛香阁',
        desc: '万寿山最高点 · 俯瞰昆明湖全景与十七孔桥',
      },
      fragrant_hills_peak: {
        name: '香山公园 · 香炉峰 (鬼见愁)',
        desc: '西山名胜最高峰 (海拔 575m) · 俯瞰北京全城平原与宏大天际线',
      },
    },
    styles: {
      S01: { name: '京东/翠宫新中式科技大厦 (深蓝灰幕墙 + 朱红牌楼冠顶)', shortName: 'S01·新中式科技大厦' },
      S01_zgc_pailou_glass: { name: '京东/翠宫新中式科技大厦 (深蓝灰幕墙 + 朱红牌楼冠顶)', shortName: 'S01·新中式科技大厦' },
      S02: { name: '国贸/金融街宝石蓝全隐框玻璃幕墙大厦', shortName: 'S02·宝石蓝全玻幕墙' },
      S02_cbd_sapphire_curtain: { name: '国贸/金融街宝石蓝全隐框玻璃幕墙大厦', shortName: 'S02·宝石蓝全玻幕墙' },
      S03: { name: '中关村/望京翡翠绿镀膜玻璃 + 象牙白水平连窗大厦', shortName: 'S03·翡翠绿水平连窗' },
      S03_emerald_ribbon_tech: { name: '中关村/望京翡翠绿镀膜玻璃 + 象牙白水平连窗大厦', shortName: 'S03·翡翠绿水平连窗' },
      S04: { name: '长安街/金融街桃花红与暖灰麻花岗岩竖肋大厦', shortName: 'S04·金融街花岗岩竖肋' },
      S04_granite_rib_financial: { name: '长安街/金融街桃花红与暖灰麻花岗岩竖肋大厦', shortName: 'S04·金融街花岗岩竖肋' },
      S05: { name: '后现代香槟金/古铜铝板阶梯退台写字楼', shortName: 'S05·香槟金阶梯塔楼' },
      S05_champagne_artdeco_tower: { name: '后现代香槟金/古铜铝板阶梯退台写字楼', shortName: 'S05·香槟金阶梯塔楼' },
      S06: { name: '50年代百万庄/学院路苏式清水红砖坡顶家属楼', shortName: 'S06·50年代苏式红砖楼' },
      S06_50s_soviet_redbrick: { name: '50年代百万庄/学院路苏式清水红砖坡顶家属楼', shortName: 'S06·50年代苏式红砖楼' },
      S07: { name: '80年代知春里红砖混搭米白圈梁板楼 + 蓝铁皮包阳台', shortName: 'S07·80年代知春里红砖楼' },
      S07_80s_zhichunli_brick_stucco: { name: '80年代知春里红砖混搭米白圈梁板楼 + 蓝铁皮包阳台', shortName: 'S07·80年代知春里红砖楼' },
      S08: { name: '80年代海淀黄庄/双榆树明黄涂料板楼 + 邮政绿水刷石墙裙', shortName: 'S08·80年代黄庄黄涂料楼' },
      S08_80s_huangzhuang_ochre: { name: '80年代海淀黄庄/双榆树明黄涂料板楼 + 邮政绿水刷石墙裙', shortName: 'S08·80年代黄庄黄涂料楼' },
      S09: { name: '90年代方庄/劲松枣红釉面条砖 + 白色分格带多层公寓', shortName: 'S09·90年代枣红条砖楼' },
      S09_90s_fangzhuang_redtile: { name: '90年代方庄/劲松枣红釉面条砖 + 白色分格带多层公寓', shortName: 'S09·90年代枣红条砖楼' },
      S10: { name: '北京老旧小区综合整治节能改造浅暖灰/藕荷粉刷板楼', shortName: 'S10·节能改造粉刷板楼' },
      S10_renovated_pastel_slab: { name: '北京老旧小区综合整治节能改造浅暖灰/藕荷粉刷板楼', shortName: 'S10·节能改造粉刷板楼' },
      S11: { name: '90年代亚运村/育新天蓝配纯白马赛克高层塔楼', shortName: 'S11·亚运村蓝白瓷砖塔楼' },
      S11_90s_yayuncun_bluewhite: { name: '90年代亚运村/育新天蓝配纯白马赛克高层塔楼', shortName: 'S11·亚运村蓝白瓷砖塔楼' },
      S12: { name: '2005年代海淀/知春路赭石红配米白真石漆飘窗板塔', shortName: 'S12·海淀赭石红飘窗塔楼' },
      S12_05s_haidian_sienna_bay: { name: '2005年代海淀/知春路赭石红配米白真石漆飘窗板塔', shortName: 'S12·海淀赭石红飘窗塔楼' },
      S13: { name: '2010年代望京/青年路暖卡其配深咖铝板现代高层公寓', shortName: 'S13·望京暖卡其深咖公寓' },
      S13_10s_wangjing_khaki_modern: { name: '2010年代望京/青年路暖卡其配深咖铝板现代高层公寓', shortName: 'S13·望京暖卡其深咖公寓' },
      S14: { name: '2015年代万柳/大望路法式新古典莱州米黄干挂石材大平层', shortName: 'S14·新古典米黄石材公寓' },
      S14_15s_neoclassical_stone: { name: '2015年代万柳/大望路法式新古典莱州米黄干挂石材大平层', shortName: 'S14·新古典米黄石材公寓' },
      S15: { name: '2020年代银灰铝板配宽幅蓝灰落地玻璃第四代住宅', shortName: 'S15·20年代铝板落地窗豪宅' },
      S15_20s_silver_minimal_flat: { name: '2020年代银灰铝板配宽幅蓝灰落地玻璃第四代住宅', shortName: 'S15·20年代铝板落地窗豪宅' },
      S16: { name: '50年代三里河/长安街民族形式大屋顶部委办公楼', shortName: 'S16·三里河大屋顶政教楼' },
      S16_50s_sanlihe_ministry: { name: '50年代三里河/长安街民族形式大屋顶部委办公楼', shortName: 'S16·三里河大屋顶政教楼' },
      S17: { name: '80–90年代白瓷砖配湖蓝反光玻璃科研院所/医院门诊楼', shortName: 'S17·90年代白瓷砖蓝玻楼' },
      S17_90s_whitetile_blueglass: { name: '80–90年代白瓷砖配湖蓝反光玻璃科研院所/医院门诊楼', shortName: 'S17·90年代白瓷砖蓝玻楼' },
      S18: { name: '清华北大/学院路暖红砖配汉白玉窗套科教实验楼', shortName: 'S18·高校红砖白石科教楼' },
      S18_campus_redbrick_arch: { name: '清华北大/学院路暖红砖配汉白玉窗套科教实验楼', shortName: 'S18·高校红砖白石科教楼' },
      S19: { name: '798/北京卫星制造厂暗红砖配黑钢框大跨度工业厂房', shortName: 'S19·798/航天红砖厂房' },
      S19_798_industrial_loft: { name: '798/北京卫星制造厂暗红砖配黑钢框大跨度工业厂房', shortName: 'S19·798/航天红砖厂房' },
      S20: { name: '五道口/西单暖白穿孔铝板 + 多彩霓虹门头与巨幅LED商业体', shortName: 'S20·五道口多彩商业体' },
      S20_wudaokou_vibrant_mall: { name: '五道口/西单暖白穿孔铝板 + 多彩霓虹门头与巨幅LED商业体', shortName: 'S20·五道口多彩商业体' },
      S21: { name: '三里屯/国贸炭黑金属配琥珀金灯带潮流商业裙房', shortName: 'S21·三里屯黑金商业体' },
      S21_sanlitun_obsidian_retail: { name: '三里屯/国贸炭黑金属配琥珀金灯带潮流商业裙房', shortName: 'S21·三里屯黑金商业体' },
      S22: { name: '90年代北京老牌高星级饭店 (古铜茶色反光玻璃 + 浅粉红花岗岩)', shortName: 'S22·90年代茶色玻璃饭店' },
      S22_90s_bronze_hotel: { name: '90年代北京老牌高星级饭店 (古铜茶色反光玻璃 + 浅粉红花岗岩)', shortName: 'S22·90年代茶色玻璃饭店' },
      S23: { name: '什刹海/南锣鼓巷官式磨砖对缝青砖四合院 + 朱红广亮大门', shortName: 'S23·什刹海青砖四合院' },
      S23_shichahai_siheyuan: { name: '什刹海/南锣鼓巷官式磨砖对缝青砖四合院 + 朱红广亮大门', shortName: 'S23·什刹海青砖四合院' },
      S24: { name: '故宫/皇家坛庙宫廷朱红墙 + 汉白玉须弥座 + 金黄琉璃瓦重檐大殿', shortName: 'S24·皇家红墙黄瓦宫殿' },
      S24_imperial_palace: { name: '故宫/皇家坛庙宫廷朱红墙 + 汉白玉须弥座 + 金黄琉璃瓦重檐大殿', shortName: 'S24·皇家红墙黄瓦宫殿' },
    },
  },

  en: {
    dom: {
      page_title: 'World Explorer',
      game_title: 'World Explorer',
      lbl_road: 'Current Road / Area',
      lbl_latlon: 'Coordinates (WGS-84)',
      lbl_xyz: 'Relative XYZ / Elevation',
      lbl_speed_chunks: 'Speed / Chunk Streaming',
      grp_mode: 'Interaction Mode',
      btn_mode_drive: 'Drive [F]',
      btn_mode_drive_title: 'Drive Vehicle (Shortcut: F)',
      btn_mode_walk: 'Walk [F]',
      btn_mode_walk_title: 'Walk on Foot · Hold Shift for Cyber-Sprint Boost (Shortcut: F)',
      btn_mode_heli: 'Helicopter [C]',
      btn_mode_heli_title: 'Turbine Helicopter Cruise · Hold Shift for Twin Afterburners (Shortcut: C)',
      grp_cam_car: 'Camera & Vehicle',
      btn_cam_toggle: 'Camera [V]',
      btn_cam_toggle_title: 'Cycle 3D Chase / Top-Down / Street Camera (Shortcut: V)',
      btn_car_cycle: 'Switch Car [G]',
      btn_car_cycle_title: 'Cycle 6 Vehicles (Shortcut: G)',
      btn_nitro_toggle: 'Nitro [Shift]',
      btn_nitro_toggle_title: 'Toggle/Lock Nitro Boost (or hold Shift for mode-specific VFX)',
      btn_map_open: 'World Map [M]',
      btn_map_open_title: 'Open 40km×40km Full-City Vector Navigation & Teleport Map (Shortcut: M)',
      btn_wfc_lab: 'WFC Lab',
      btn_wfc_lab_title: 'Open Beijing 3D Building Wave Function Collapse (WFC) Workbench',
      grp_time: 'Time & Lighting',
      time_noon: 'Noon',
      time_sunset: 'Sunset',
      time_night: 'Night',
      time_overcast: 'Overcast',
      grp_layers: 'OSM Layers & Traffic',
      chk_buildings: '3D Buildings',
      chk_markings: 'Lane Markings',
      chk_bridges: 'Bridge Piers',
      chk_facilities: 'Signals & Signs',
      chk_railways: 'Rail & Subway',
      chk_traffic: 'AI Traffic',
      drawer_title: '40km×40km Fast Travel Hubs',
      drawer_sub: '1:1 Metric Scale · 20 Curated Hubs/Landmarks + 365 Transit Stations',
      drawer_toggle_title: 'Collapse / Expand Panel [Tab]',
      hub_search_placeholder: 'Search landmarks / interchanges / stations (e.g. Guomao, Xizhimen)...',
      cat_all: 'Featured',
      cat_cbd: 'CBD & Towers',
      cat_hub: 'Transit Hubs',
      cat_landmark: 'Landmarks',
      cat_stations: 'Stations (365)',
      insp_close_title: 'Close Inspector',
      insp_osm_link: 'View Raw Data on OpenStreetMap.org ↗',
      insp_nav_btn: 'Set as GPS Destination',
      minimap_title: 'Click to open 40km×40km World Map [M]',
      minimap_scale: 'R=450m · Live Chunk Roads',
      bottom_bar_html: `<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move / Drive / Fly</span>
<span><kbd>Drag Mouse</kbd>/<kbd>Q</kbd><kbd>E</kbd> Orbit Camera / Altitude</span>
<span><kbd>Space</kbd>/<kbd>Ctrl</kbd> Jump / Handbrake / Vertical Thrust</span>
<span><kbd>Shift</kbd> Nitro Boost (Mach-1 Sonic Boom / Afterburner / Cyber-Sprint)</span>
<span><kbd>F</kbd> Toggle Drive / Walk</span>
<span><kbd>C</kbd> Helicopter Mode</span>
<span><kbd>G</kbd> Cycle 6 Vehicles</span>
<span><kbd>M</kbd> 40km×40km Map & GPS</span>
<span><kbd>Left-Click Building/Road</kbd> Inspect Raw OSM Tags</span>`,
      map_modal_title: 'Beijing 40km × 40km (1,600 km²) OSM Road, Rail & Chunk Interactive Map',
      map_modal_sub_html: 'Wheel to zoom · Drag to pan · Toggle <b>Left-Click Teleport Anywhere</b> or <b>Left-Click A* Route</b> · <b>Right-Click (or Shift+Click)</b> always teleports to exact point',
      btn_map_mode_teleport: 'Click Mode: Teleport Anywhere',
      btn_map_mode_nav: 'Click Mode: A* Navigation',
      btn_map_center_player: 'Center Player',
      btn_map_reset_view: 'Full City (40km)',
      btn_map_clear_gps: 'Clear Route',
      btn_map_close: 'Close [M / Esc]',
      leg_ring: 'Ring Roads / Expressways',
      leg_primary: 'Primary Arterials',
      leg_secondary: 'Secondary Roads',
      leg_bridge: 'Elevated Bridges (Layer≥1)',
      leg_subway: 'Subway Network',
      leg_water: 'Rivers & Lakes',
      leg_chunk: 'Loaded 3D Chunks',
    },
    runtime: {
      // [kaiju]
      mode_kaiju: 'Kaiju',
      kaiju_title: 'Kaiju Defense',
      kaiju_badge: 'KAIJU DEFENSE',
      kaiju_alert: 'KAIJU ALERT',
      kaiju_name: 'KAIJU',
      kaiju_city: 'City Damage',
      kaiju_hull: 'Hull',
      kaiju_heat: 'Cannon',
      kaiju_missile: 'Missiles',
      kaiju_overheat: 'Overheat',
      kaiju_ready: 'Ready',
      kaiju_saved: 'City Saved',
      kaiju_fallen: 'City Fallen',
      kaiju_time: 'Time',
      kaiju_accuracy: 'Accuracy',
      kaiju_missile_hits: 'Missile hits',
      kaiju_cannon_hits: 'Cannon hits',
      kaiju_again: 'Play Again',
      kaiju_exit: 'Exit',
      kaiju_paused: 'Paused',
      kaiju_resume: 'Resume',
      kaiju_restart: 'Restart',
      kaiju_mute: 'Mute',
      kaiju_unmute: 'Unmute',
      kaiju_down: 'Helicopter down',
      kaiju_hint: 'W/S Move · A/D Yaw · Q/E Alt · ←/→ Dodge · Space Fire · F Missiles · R Super',
      kaiju_lock: 'LOCK',
      kaiju_dodge: 'Dodge',
      kaiju_danger: 'DANGER ZONE',
      kaiju_supply_drop: 'Supply drop',
      kaiju_item_railgun: 'Railgun',
      kaiju_item_swarm: 'Missile Swarm',
      kaiju_item_emp: 'EMP',
      kaiju_item_orbital: 'Orbital Strike',
      kaiju_item_repair: 'Repair Kit',
      kaiju_item_coolant: 'Coolant',
      default_road: "Chang'an Ave · Tiananmen Sq",
      urban_road_fallback: 'Beijing Urban Road',
      chunks_unit: 'chunks',
      sonic_boom: 'Sonic Boom',
      mode_walk_badge: 'Walking (Shift Cyber-Sprint)',
      mode_heli_badge: 'Turbine Helicopter (Shift Afterburner)',
      mode_drive_fallback: 'Driving',
      cam_chase: '3D Chase',
      cam_topdown: 'Top-Down',
      cam_street: 'Street View',
      dist_from_tam: '{km} km from Tiananmen',
      osm_station_desc: 'OSM Transit Station #{id}',
      map_teleport_label: 'Map Point Teleport',
      map_right_teleport_label: 'Map Instant Teleport',
      map_nav_dest: 'Map Navigation Target',
      out_of_bounds: 'Out of Bounds',
      station_prefix: 'Transit Station: ',
      insp_btype: 'Building Type',
      insp_bpart_suffix: ' · Stepped Volume (building:part)',
      insp_style: 'Architectural Style',
      insp_height: 'Roof Height (height)',
      insp_levels_unit: 'F',
      insp_min_h: 'Min Height (min_h)',
      insp_courtyards: 'Inner Courtyards',
      insp_courtyards_unit: 'multipolygon courtyards',
      insp_click_latlon: 'Clicked Lat/Lon',
      insp_highway_cls: 'Highway Class',
      insp_highway_ref: 'Route Ref',
      insp_none: 'None',
      insp_lanes_width: 'Lanes & Width',
      insp_lanes_fmt: '{lanes} lanes · {width} m wide',
      insp_oneway: 'Traffic Direction',
      insp_oneway_yes: 'One-Way',
      insp_oneway_no: 'Two-Way',
      insp_layer: 'Vertical Layer',
      insp_layer_bridge: 'Elevated Bridge',
      insp_layer_tunnel: 'Underground Tunnel',
      insp_layer_ground: 'Ground Level',
      insp_click_elev: 'Clicked Elev / Coords',
    },
    vehicles: {
      cyber_mach1: 'Concept Hypercar',
      aero_formula: 'Formula Racer',
      supercar: 'GT Coupe',
      taxi: 'City Taxi',
      police: 'Police Cruiser',
      bus: 'City Bus',
    },
    bookmarks: {
      tiananmen: {
        name: "Tiananmen Square · Chang'an Central Axis",
        desc: "Beijing origin (0, 0) · Forbidden City Meridian Gate / moat / 10-lane Chang'an Ave",
      },
      guomao: {
        name: 'Guomao Bridge Interchange · CBD China Zun',
        desc: 'East 3rd Ring & Jianguo Rd interchange · China Zun (528m) / CWTC III / CCTV HQ',
      },
      cctv: {
        name: 'CCTV Headquarters ("Big Pants")',
        desc: 'East 3rd Ring & Guanghua Rd · True OSM building:part cantilevers & CBD towers',
      },
      xizhimen: {
        name: 'Xizhimen Interchange · Beijing North Station',
        desc: 'West 2nd Ring circular ramp cloverleaf + Subway L2/4/13 & Jingzhang High-Speed Rail',
      },
      sanyuanqiao: {
        name: 'Sanyuanqiao Interchange · Airport Expressway',
        desc: 'North 3rd Ring & S12 Capital Airport Expressway / Jingmi Rd flyover junction',
      },
      gugong: {
        name: 'Palace Museum · Forbidden City & Moat',
        desc: 'Complete imperial palace halls, multipolygon courtyard lightwells & moat network',
      },
      shichahai: {
        name: 'Shichahai · Bell & Drum Towers / Hutong Siheyuan',
        desc: 'Qianhai/Houhai/Xihai lakes · Yandai Byway, Drum Tower St & grey-brick courtyards',
      },
      tiantan: {
        name: 'Temple of Heaven · Hall of Prayer for Good Harvests',
        desc: 'South 2nd Ring circular hall (38m), Danbi Bridge axis & ancient cypress forest',
      },
      olympic: {
        name: "Olympic Park · Bird's Nest & Water Cube",
        desc: 'North 4th Ring central axis · National Stadium hollow bowl, Dragon Lake & tunnel',
      },
      zhongguancun: {
        name: 'Zhongguancun Ave · Haidian Huangzhuang / 4th Ring',
        desc: 'North 4th Ring tech hub, Haidian St Silicon Valley park & PKU/Tsinghua borders',
      },
      wudaokou: {
        name: 'Wudaokou · Subway Line 13 Elevated & Chengfu Rd',
        desc: 'Chengfu Rd grade crossing, Subway Line 13 elevated station & Tsinghua East Gate',
      },
      sanlitun: {
        name: "Sanlitun Taikoo Li · Workers' Stadium",
        desc: 'Gongti North Rd, open-block shopping district & Liangma River international waterfront',
      },
      financial_st: {
        name: 'Beijing Financial Street · Fuxingmen Bridge',
        desc: "West 2nd Ring Fuxingmen cloverleaf, Chang'an Ave West & financial HQ towers",
      },
      yiheyuan: {
        name: 'Summer Palace · Kunming Lake & Longevity Hill',
        desc: 'Northwest 5th Ring natural lake basin, Nanhu Island multipolygon & Xijiao light rail',
      },
      beijing_south: {
        name: 'Beijing South Railway Station · High-Speed Rail Hub',
        desc: 'South 2nd/3rd Ring oval elevated concourse & dozens of high-speed rail tracks',
      },
      beijing_west: {
        name: 'Beijing West Railway Station · Lianhuachi Interchange',
        desc: "West 3rd Ring Lianhua Bridge flyover, Guang'an elevated & grand gateway concourse",
      },
      wangjing: {
        name: 'Wangjing SOHO · Guangshun North Ave',
        desc: 'Northeast 4th-5th Ring Wangjing CBD · Curvilinear towers & Jingcheng expressway links',
      },
      lize: {
        name: 'Lize Financial Business District · Caihuying Bridge',
        desc: 'Southwest 2nd/3rd Ring Lize Rd skyscraper cluster & moat junction',
      },
      shougang: {
        name: 'Shougang Industrial Park · New Shougang Bridge',
        desc: "Chang'an Ave West terminus (-19.5km) · Blast furnaces, Qunming Lake & Yongding River cable bridge",
      },
      wufangqiao: {
        name: 'East 5th Ring Wufangqiao · G1 Jingha Expressway',
        desc: 'East 5th Ring & G1 Jingha Expressway 3-level butterfly interchange at city edge',
      },
      jingshan_peak: {
        name: 'Jingshan Park · Wanchun Pavilion Peak',
        desc: 'Inner-city scenic peak · Panoramic overlook of Forbidden City & Beijing central axis',
      },
      foxiangge_peak: {
        name: 'Summer Palace · Foxiangge Peak',
        desc: 'Longevity Hill peak · Overlook of Kunming Lake & 17-Arch Bridge',
      },
      fragrant_hills_peak: {
        name: 'Fragrant Hills · Incense Burner Peak (Guijianchou)',
        desc: 'Highest Western Hills peak (575m) · Overlook of Beijing plain & grand city skyline',
      },
    },
    styles: {
      S01: { name: 'JD/Cuigong Neo-Chinese Tech Tower (Deep Blue-Grey Curtain + Vermilion Pailou Crown)', shortName: 'S01·Neo-Chinese Tech' },
      S01_zgc_pailou_glass: { name: 'JD/Cuigong Neo-Chinese Tech Tower (Deep Blue-Grey Curtain + Vermilion Pailou Crown)', shortName: 'S01·Neo-Chinese Tech' },
      S02: { name: 'CBD / Financial St Sapphire Blue Frameless Glass Curtain Tower', shortName: 'S02·Sapphire Curtain' },
      S02_cbd_sapphire_curtain: { name: 'CBD / Financial St Sapphire Blue Frameless Glass Curtain Tower', shortName: 'S02·Sapphire Curtain' },
      S03: { name: 'Zhongguancun / Wangjing Emerald Coated Glass + Ribbon Window Tech Tower', shortName: 'S03·Emerald Ribbon' },
      S03_emerald_ribbon_tech: { name: 'Zhongguancun / Wangjing Emerald Coated Glass + Ribbon Window Tech Tower', shortName: 'S03·Emerald Ribbon' },
      S04: { name: "Chang'an Ave / Financial St Granite Vertical Rib Tower", shortName: 'S04·Granite Rib' },
      S04_granite_rib_financial: { name: "Chang'an Ave / Financial St Granite Vertical Rib Tower", shortName: 'S04·Granite Rib' },
      S05: { name: 'Postmodern Champagne Gold / Bronze Terraced Stepped Office Tower', shortName: 'S05·Champagne Stepped' },
      S05_champagne_artdeco_tower: { name: 'Postmodern Champagne Gold / Bronze Terraced Stepped Office Tower', shortName: 'S05·Champagne Stepped' },
      S06: { name: '1950s Baiwanzhuang / Xueyuan Rd Soviet Red-Brick Pitched-Roof Slabs', shortName: 'S06·Soviet Red-Brick' },
      S06_50s_soviet_redbrick: { name: '1950s Baiwanzhuang / Xueyuan Rd Soviet Red-Brick Pitched-Roof Slabs', shortName: 'S06·Soviet Red-Brick' },
      S07: { name: '1980s Zhichunli Red Brick & Stucco Band Residential Slab with Blue Enclosed Balconies', shortName: 'S07·Zhichunli Brick Slab' },
      S07_80s_zhichunli_brick_stucco: { name: '1980s Zhichunli Red Brick & Stucco Band Residential Slab with Blue Enclosed Balconies', shortName: 'S07·Zhichunli Brick Slab' },
      S08: { name: '1980s Haidian Huangzhuang / Shuangyushu Ochre-Yellow Stucco Slab', shortName: 'S08·Huangzhuang Ochre Slab' },
      S08_80s_huangzhuang_ochre: { name: '1980s Haidian Huangzhuang / Shuangyushu Ochre-Yellow Stucco Slab', shortName: 'S08·Huangzhuang Ochre Slab' },
      S09: { name: '1990s Fangzhuang / Jinsong Crimson Ceramic Split-Tile Apartment', shortName: 'S09·Crimson Tile Slab' },
      S09_90s_fangzhuang_redtile: { name: '1990s Fangzhuang / Jinsong Crimson Ceramic Split-Tile Apartment', shortName: 'S09·Crimson Tile Slab' },
      S10: { name: 'Beijing Retrofitted Energy-Efficient Warm-Grey / Pastel Stucco Slabs', shortName: 'S10·Retrofitted Pastel Slab' },
      S10_renovated_pastel_slab: { name: 'Beijing Retrofitted Energy-Efficient Warm-Grey / Pastel Stucco Slabs', shortName: 'S10·Retrofitted Pastel Slab' },
      S11: { name: '1990s Asian Games Village Sky-Blue & White Mosaic High-Rise Tower', shortName: 'S11·Asian Games Mosaic Tower' },
      S11_90s_yayuncun_bluewhite: { name: '1990s Asian Games Village Sky-Blue & White Mosaic High-Rise Tower', shortName: 'S11·Asian Games Mosaic Tower' },
      S12: { name: '2000s Haidian Sienna Red & Warm Stucco Bay-Window Residential Tower', shortName: 'S12·Haidian Sienna Bay Tower' },
      S12_05s_haidian_sienna_bay: { name: '2000s Haidian Sienna Red & Warm Stucco Bay-Window Residential Tower', shortName: 'S12·Haidian Sienna Bay Tower' },
      S13: { name: '2010s Wangjing Khaki & Coffee Aluminium High-Rise Apartments', shortName: 'S13·Wangjing Khaki Tower' },
      S13_10s_wangjing_khaki_modern: { name: '2010s Wangjing Khaki & Coffee Aluminium High-Rise Apartments', shortName: 'S13·Wangjing Khaki Tower' },
      S14: { name: '2015s Neoclassical Beige Limestone Dry-Hung Luxury Mansion', shortName: 'S14·Neoclassical Stone Tower' },
      S14_15s_neoclassical_stone: { name: '2015s Neoclassical Beige Limestone Dry-Hung Luxury Mansion', shortName: 'S14·Neoclassical Stone Tower' },
      S15: { name: '2020s Minimalist Silver Aluminium & Full-Height Glass Residence', shortName: 'S15·Silver Minimalist Flat' },
      S15_20s_silver_minimal_flat: { name: '2020s Minimalist Silver Aluminium & Full-Height Glass Residence', shortName: 'S15·Silver Minimalist Flat' },
      S16: { name: "1950s Sanlihe / Chang'an Ave National Style Big-Roof Ministry Building", shortName: 'S16·Sanlihe Big-Roof Ministry' },
      S16_50s_sanlihe_ministry: { name: "1950s Sanlihe / Chang'an Ave National Style Big-Roof Ministry Building", shortName: 'S16·Sanlihe Big-Roof Ministry' },
      S17: { name: '1990s White Tile & Lake-Blue Reflective Glass Research / Clinic Hall', shortName: 'S17·White Tile Blue Glass' },
      S17_90s_whitetile_blueglass: { name: '1990s White Tile & Lake-Blue Reflective Glass Research / Clinic Hall', shortName: 'S17·White Tile Blue Glass' },
      S18: { name: 'PKU/Tsinghua Academic Red Brick & Marble Trim Science Hall', shortName: 'S18·Academic Red Brick' },
      S18_campus_redbrick_arch: { name: 'PKU/Tsinghua Academic Red Brick & Marble Trim Science Hall', shortName: 'S18·Academic Red Brick' },
      S19: { name: '798 / Aerospace Dark Brick & Steel Frame Industrial Bauhaus Hall', shortName: 'S19·798 Industrial Loft' },
      S19_798_industrial_loft: { name: '798 / Aerospace Dark Brick & Steel Frame Industrial Bauhaus Hall', shortName: 'S19·798 Industrial Loft' },
      S20: { name: 'Wudaokou / Xidan Perforated Aluminium & Neon Signage Retail Mall', shortName: 'S20·Vibrant Retail Mall' },
      S20_wudaokou_vibrant_mall: { name: 'Wudaokou / Xidan Perforated Aluminium & Neon Signage Retail Mall', shortName: 'S20·Vibrant Retail Mall' },
      S21: { name: 'Sanlitun / CBD Obsidian Black Metal & Amber Glow Boutique Pavilion', shortName: 'S21·Obsidian Retail Mall' },
      S21_sanlitun_obsidian_retail: { name: 'Sanlitun / CBD Obsidian Black Metal & Amber Glow Boutique Pavilion', shortName: 'S21·Obsidian Retail Mall' },
      S22: { name: '1990s Bronze Reflective Glass & Pink Granite Grand Landmark Hotel', shortName: 'S22·Bronze Glass Hotel' },
      S22_90s_bronze_hotel: { name: '1990s Bronze Reflective Glass & Pink Granite Grand Landmark Hotel', shortName: 'S22·Bronze Glass Hotel' },
      S23: { name: 'Shichahai / Nanluoguxiang Grey-Brick Courtyard Siheyuan & Grand Gate', shortName: 'S23·Shichahai Siheyuan' },
      S23_shichahai_siheyuan: { name: 'Shichahai / Nanluoguxiang Grey-Brick Courtyard Siheyuan & Grand Gate', shortName: 'S23·Shichahai Siheyuan' },
      S24: { name: 'Forbidden City Imperial Vermilion Walls, Marble Terrace & Golden Tile Hall', shortName: 'S24·Imperial Palace Hall' },
      S24_imperial_palace: { name: 'Forbidden City Imperial Vermilion Walls, Marble Terrace & Golden Tile Hall', shortName: 'S24·Imperial Palace Hall' },
    },
  },
};

/**
 * Returns current active language ('zh' or 'en').
 */
export function getLang() {
  return currentLang;
}

/**
 * Registers a callback invoked whenever the language is switched.
 */
export function onLanguageChange(fn) {
  if (typeof fn === 'function') {
    langChangeCallbacks.add(fn);
  }
}

/**
 * Sets active language, updates document attributes, applies DOM translations,
 * and notifies all registered subscribers.
 */
export function setLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh';
  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    }
    applyDomTranslations();
  }
  for (const cb of langChangeCallbacks) {
    try {
      cb(currentLang);
    } catch (e) {
      console.error('[i18n] Error in language change callback:', e);
    }
  }
  return currentLang;
}

/**
 * Resolves a translation string with optional parameter replacement {param}.
 */
export function t(key, params = null) {
  const dict = I18N[currentLang] || I18N.zh;
  let val = dict.runtime?.[key] ?? dict.dom?.[key] ?? key;
  if (typeof val === 'function') {
    return val(params);
  }
  if (params && typeof val === 'string') {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return val;
}

/**
 * Returns localized name for vehicle ID.
 */
export function getVehicleName(id, fallback = '') {
  const dict = I18N[currentLang] || I18N.zh;
  return dict.vehicles?.[id] || fallback || id;
}

/**
 * Returns localized { name, desc } for a bookmark object or ID.
 */
export function getBookmarkText(bm) {
  if (!bm) return { name: '', desc: '' };
  const id = typeof bm === 'string' ? bm : bm.id;
  const dict = I18N[currentLang] || I18N.zh;
  const localized = dict.bookmarks?.[id];
  if (localized) {
    return {
      name: localized.name,
      desc: localized.desc,
    };
  }
  return {
    name: bm.name || id,
    desc: bm.desc || '',
  };
}

/**
 * Returns localized WFC style definition { name, shortName }.
 */
export function getStyleText(codeOrId, fallback = null) {
  const dict = I18N[currentLang] || I18N.zh;
  const match = dict.styles?.[codeOrId];
  if (match) return match;
  return fallback || { name: codeOrId, shortName: codeOrId };
}

/**
 * Helper to update checkbox label text without losing the input node and its state.
 */
function updateCheckboxLabel(inputId, text) {
  const input = document.getElementById(inputId);
  if (!input || !input.parentElement) return;
  const parent = input.parentElement;
  for (let i = parent.childNodes.length - 1; i >= 0; i--) {
    const node = parent.childNodes[i];
    if (node !== input) {
      parent.removeChild(node);
    }
  }
  parent.appendChild(document.createTextNode(' ' + text));
}

/**
 * Helper to update legend item text without losing its icon element.
 */
function updateLegendItem(iconSelector, text) {
  const icon = document.querySelector(iconSelector);
  if (!icon || !icon.parentElement) return;
  const parent = icon.parentElement;
  for (let i = parent.childNodes.length - 1; i >= 0; i--) {
    const node = parent.childNodes[i];
    if (node !== icon) {
      parent.removeChild(node);
    }
  }
  parent.appendChild(document.createTextNode(' ' + text));
}

/**
 * Applies all static DOM translations to the HTML page.
 */
export function applyDomTranslations() {
  if (typeof document === 'undefined') return;
  const dom = (I18N[currentLang] || I18N.zh).dom;

  // 1. Page & Brand Titles
  document.title = dom.page_title;
  const gameTitle = document.querySelector('.game-title');
  if (gameTitle) gameTitle.textContent = dom.game_title;

  // 2. HUD Telemetry Labels
  const teleLabels = document.querySelectorAll('.telemetry-grid .tele-label');
  if (teleLabels.length >= 4) {
    teleLabels[0].textContent = dom.lbl_road;
    teleLabels[1].textContent = dom.lbl_latlon;
    teleLabels[2].textContent = dom.lbl_xyz;
    teleLabels[3].textContent = dom.lbl_speed_chunks;
  }

  // 3. HUD Control Group Headers
  const groupLabels = document.querySelectorAll('#hud-top-right .group-label');
  if (groupLabels.length >= 4) {
    groupLabels[0].textContent = dom.grp_mode;
    groupLabels[1].textContent = dom.grp_cam_car;
    groupLabels[2].textContent = dom.grp_time;
    groupLabels[3].textContent = dom.grp_layers;
  }

  // 4. Mode Buttons
  const btnDrive = document.getElementById('btn-mode-drive');
  if (btnDrive) {
    btnDrive.textContent = dom.btn_mode_drive;
    btnDrive.title = dom.btn_mode_drive_title;
  }
  const btnWalk = document.getElementById('btn-mode-walk');
  if (btnWalk) {
    btnWalk.textContent = dom.btn_mode_walk;
    btnWalk.title = dom.btn_mode_walk_title;
  }
  const btnHeli = document.getElementById('btn-mode-freecam') || document.getElementById('btn-mode-heli');
  if (btnHeli) {
    btnHeli.textContent = dom.btn_mode_heli;
    btnHeli.title = dom.btn_mode_heli_title;
  }

  // 5. Camera, Car, Nitro & Tools Buttons
  const btnCam = document.getElementById('btn-cam-toggle');
  if (btnCam) {
    btnCam.textContent = dom.btn_cam_toggle;
    btnCam.title = dom.btn_cam_toggle_title;
  }
  const btnCar = document.getElementById('btn-car-cycle');
  if (btnCar) {
    btnCar.textContent = dom.btn_car_cycle;
    btnCar.title = dom.btn_car_cycle_title;
  }
  const btnNitro = document.getElementById('btn-nitro-toggle');
  if (btnNitro) {
    btnNitro.textContent = dom.btn_nitro_toggle;
    btnNitro.title = dom.btn_nitro_toggle_title;
  }
  const btnMapOpen = document.getElementById('btn-map-open');
  if (btnMapOpen) {
    btnMapOpen.textContent = dom.btn_map_open;
    btnMapOpen.title = dom.btn_map_open_title;
  }
  const btnWfc = document.querySelector('a[href*="wfc_demo"]');
  if (btnWfc) {
    btnWfc.textContent = dom.btn_wfc_lab;
    btnWfc.title = dom.btn_wfc_lab_title;
  }

  // 6. Time of Day Buttons
  const timeNoon = document.querySelector('.time-btn[data-time="noon"]');
  if (timeNoon) timeNoon.textContent = dom.time_noon;
  const timeSunset = document.querySelector('.time-btn[data-time="sunset"]');
  if (timeSunset) timeSunset.textContent = dom.time_sunset;
  const timeNight = document.querySelector('.time-btn[data-time="night"]');
  if (timeNight) timeNight.textContent = dom.time_night;
  const timeOvercast = document.querySelector('.time-btn[data-time="overcast"]');
  if (timeOvercast) timeOvercast.textContent = dom.time_overcast;

  // 7. Layer Toggles (Preserve Inputs)
  updateCheckboxLabel('chk-buildings', dom.chk_buildings);
  updateCheckboxLabel('chk-markings', dom.chk_markings);
  updateCheckboxLabel('chk-bridges', dom.chk_bridges);
  updateCheckboxLabel('chk-facilities', dom.chk_facilities);
  updateCheckboxLabel('chk-railways', dom.chk_railways);
  updateCheckboxLabel('chk-traffic', dom.chk_traffic);

  // 8. Landmark Drawer
  const drawerH2 = document.querySelector('#landmark-drawer .drawer-header h2');
  if (drawerH2) drawerH2.textContent = dom.drawer_title;
  const drawerSub = document.querySelector('#landmark-drawer .drawer-sub');
  if (drawerSub) drawerSub.textContent = dom.drawer_sub;
  const btnDrawerToggle = document.getElementById('btn-drawer-toggle');
  if (btnDrawerToggle) btnDrawerToggle.title = dom.drawer_toggle_title;
  const hubSearch = document.getElementById('hub-search');
  if (hubSearch) hubSearch.placeholder = dom.hub_search_placeholder;

  const tabAll = document.querySelector('.cat-tab[data-cat="all"]');
  if (tabAll) tabAll.textContent = dom.cat_all;
  const tabCbd = document.querySelector('.cat-tab[data-cat="立交与摩天楼"]') || document.querySelector('.cat-tab[data-cat="cbd"]');
  if (tabCbd) tabCbd.textContent = dom.cat_cbd;
  const tabHub = document.querySelector('.cat-tab[data-cat="立交与交通枢纽"]') || document.querySelector('.cat-tab[data-cat="hub"]');
  if (tabHub) tabHub.textContent = dom.cat_hub;
  const tabLandmark = document.querySelector('.cat-tab[data-cat="核心地标"]') || document.querySelector('.cat-tab[data-cat="landmark"]');
  if (tabLandmark) tabLandmark.textContent = dom.cat_landmark;
  const tabStations = document.querySelector('.cat-tab[data-cat="stations"]');
  if (tabStations) tabStations.textContent = dom.cat_stations;

  // 9. OSM Inspector Card
  const btnInspClose = document.getElementById('btn-insp-close');
  if (btnInspClose) btnInspClose.title = dom.insp_close_title;
  const inspOsmLink = document.getElementById('insp-osm-link');
  if (inspOsmLink) inspOsmLink.textContent = dom.insp_osm_link;
  const btnInspNav = document.getElementById('btn-insp-nav');
  if (btnInspNav) btnInspNav.textContent = dom.insp_nav_btn;

  // 10. Minimap
  const minimapWrap = document.getElementById('minimap-container');
  if (minimapWrap) minimapWrap.title = dom.minimap_title;
  const minimapScale = document.getElementById('minimap-scale');
  if (minimapScale) minimapScale.textContent = dom.minimap_scale;

  // 11. Bottom Keybind Guide Bar
  const bottomBar = document.getElementById('hud-bottom-bar');
  if (bottomBar) bottomBar.innerHTML = dom.bottom_bar_html;

  // 12. Full-Screen World Map Modal
  const mapModalH2 = document.querySelector('#world-map-modal .map-title-block h2');
  if (mapModalH2) mapModalH2.textContent = dom.map_modal_title;
  const mapModalP = document.querySelector('#world-map-modal .map-title-block p');
  if (mapModalP) mapModalP.innerHTML = dom.map_modal_sub_html;

  const btnMapMode = document.getElementById('btn-map-click-mode');
  if (btnMapMode) {
    const isNav = btnMapMode.dataset.mode === 'nav';
    btnMapMode.textContent = isNav ? dom.btn_map_mode_nav : dom.btn_map_mode_teleport;
  }
  const btnMapCenter = document.getElementById('btn-map-center-player');
  if (btnMapCenter) btnMapCenter.textContent = dom.btn_map_center_player;
  const btnMapReset = document.getElementById('btn-map-reset-view');
  if (btnMapReset) btnMapReset.textContent = dom.btn_map_reset_view;
  const btnMapClear = document.getElementById('btn-map-clear-gps');
  if (btnMapClear) btnMapClear.textContent = dom.btn_map_clear_gps;
  const btnMapClose = document.getElementById('btn-map-close');
  if (btnMapClose) btnMapClose.textContent = dom.btn_map_close;

  updateLegendItem('.leg-line.ring', dom.leg_ring);
  updateLegendItem('.leg-line.primary', dom.leg_primary);
  updateLegendItem('.leg-line.secondary', dom.leg_secondary);
  updateLegendItem('.leg-line.bridge', dom.leg_bridge);
  updateLegendItem('.leg-line.subway', dom.leg_subway);
  updateLegendItem('.leg-box.water', dom.leg_water);
  updateLegendItem('.leg-box.chunk', dom.leg_chunk);

  // [kaiju] generic data-i18n pass (only keys that exist)
  const rt = (I18N[currentLang] || I18N.zh).runtime || {};
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = rt[el.dataset.i18n] ?? dom[el.dataset.i18n];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const v = rt[el.dataset.i18nTitle] ?? dom[el.dataset.i18nTitle];
    if (typeof v === 'string') el.title = v;
  });
}

/**
 * Initializes and displays the initial language chooser modal on every page load.
 * Fixes language for the current session without reading or caching into localStorage.
 */
export function initLanguageChooser() {
  // Removed blocking startup language modal per Radical Simplicity
}

const PHRASE_REPLACEMENTS = [
  ["首都机场高速", "Capital Airport Expy "],
  ["京藏高速", "Jingzang Expy "],
  ["京港澳高速", "Jinggang'ao Expy "],
  ["京沪高速", "Jinghu Expy "],
  ["京哈高速", "Jingha Expy "],
  ["京承高速", "Jingcheng Expy "],
  ["京开高速", "Jingkai Expy "],
  ["京通快速", "Jingtong Expy "],
  ["东二环", "E 2nd Ring "],
  ["西二环", "W 2nd Ring "],
  ["南二环", "S 2nd Ring "],
  ["北二环", "N 2nd Ring "],
  ["二环", "2nd Ring "],
  ["东三环", "E 3rd Ring "],
  ["西三环", "W 3rd Ring "],
  ["南三环", "S 3rd Ring "],
  ["北三环", "N 3rd Ring "],
  ["三环", "3rd Ring "],
  ["东四环", "E 4th Ring "],
  ["西四环", "W 4th Ring "],
  ["南四环", "S 4th Ring "],
  ["北四环", "N 4th Ring "],
  ["四环", "4th Ring "],
  ["东五环", "E 5th Ring "],
  ["西五环", "W 5th Ring "],
  ["南五环", "S 5th Ring "],
  ["北五环", "N 5th Ring "],
  ["五环", "5th Ring "],
  ["长安街", "Chang'an "],
  ["天安门", "Tian'anmen "],
  ["中关村", "Zhongguancun "],
  ["三里屯", "Sanlitun "],
  ["什刹海", "Shichahai "],
  ["西直门", "Xizhimen "],
  ["东直门", "Dongzhimen "],
  ["建国门", "Jianguomen "],
  ["复兴门", "Fuxingmen "],
  ["阜成门", "Fuchengmen "],
  ["朝阳门", "Chaoyangmen "],
  ["宣武门", "Xuanwumen "],
  ["崇文门", "Chongwenmen "],
  ["德胜门", "Deshengmen "],
  ["安定门", "Andingmen "],
  ["永定门", "Yongdingmen "],
  ["广安门", "Guang'anmen "],
  ["广渠门", "Guangqumen "],
  ["左安门", "Zuo'anmen "],
  ["右安门", "You'anmen "],
  ["东便门", "Dongbianmen "],
  ["西便门", "Xibianmen "],
  ["和平门", "Hepingmen "],
  ["前门", "Qianmen "],
  ["王府井", "Wangfujing "],
  ["五道口", "Wudaokou "],
  ["国贸", "Guomao "],
  ["望京", "Wangjing "],
  ["金融街", "Financial St "]
];

const EXACT_TRANSLATIONS = Object.fromEntries(PHRASE_REPLACEMENTS.map(([k, v]) => [k, v.trim()]));

const ROAD_SUFFIXES = [
  ["旁 · 人行步道", " · Footpath"], // [release-6-integ] chunk_builder: `${name}旁 · 人行步道` (sidewalk of a named road)
  ["高速辅路", " Expy Frontage Rd"],
  ["快速路", " Expy"],
  ["高速公路", " Expy"],
  ["高速", " Expy"],
  ["北大街", " N Ave"],
  ["南大街", " S Ave"],
  ["东大街", " E Ave"],
  ["西大街", " W Ave"],
  ["内大街", " Inner Ave"],
  ["外大街", " Outer Ave"],
  ["中街", " Middle St"],
  ["北街", " N St"],
  ["南街", " S St"],
  ["东街", " E St"],
  ["西街", " W St"],
  ["大街", " Ave"],
  ["大道", " Blvd"],
  ["中路辅路", " Middle Frontage Rd"],
  ["北路辅路", " N Frontage Rd"],
  ["南路辅路", " S Frontage Rd"],
  ["东路辅路", " E Frontage Rd"],
  ["西路辅路", " W Frontage Rd"],
  ["辅路/内部通道", " Service Rd"], // [release-6-integ] chunk_builder: `${name}辅路/内部通道`
  ["辅路", " Frontage Rd"],
  ["中路", " Middle Rd"],
  ["北路", " N Rd"],
  ["南路", " S Rd"],
  ["东路", " E Rd"],
  ["西路", " W Rd"],
  ["立交桥", " Interchange"],
  ["跨线桥", " Overpass"],
  ["高架桥", " Viaduct"],
  ["胡同", " Hutong"],
  ["斜街", " Diagonal St"],
  ["地下隧道", " Tunnel"],
  ["隧道", " Tunnel"],
  ["匝道", " Ramp"],
  ["大桥", " Bridge"],
  ["桥", " Bridge"],
  ["路", " Rd"],
  ["街", " St"],
  ["巷", " Alley"],
  ["条", " Tiao"],
  ["里", " Li"]
];

const BUILDING_SUFFIXES = [
  ["国际中心", " Int'l Center"],
  ["金融中心", " Financial Center"],
  ["商务中心", " Business Center"],
  ["购物中心", " Shopping Mall"],
  ["写字楼", " Office Tower"],
  ["办公楼", " Office Bldg"],
  ["教学楼", " Academic Bldg"],
  ["实验楼", " Lab Bldg"],
  ["门诊楼", " Outpatient Bldg"],
  ["住院部", " Inpatient Bldg"],
  ["体育馆", " Gymnasium"],
  ["体育场", " Stadium"],
  ["博物馆", " Museum"],
  ["图书馆", " Library"],
  ["美术馆", " Art Gallery"],
  ["展览馆", " Exhibition Hall"],
  ["纪念馆", " Memorial Hall"],
  ["大使馆", " Embassy"],
  ["火车站", " Railway Station"],
  ["地铁站", " Subway Station"],
  ["大厦", " Tower"],
  ["中心", " Center"],
  ["广场", " Plaza"],
  ["饭店", " Hotel"],
  ["酒店", " Hotel"],
  ["宾馆", " Hotel"],
  ["公寓", " Apartments"],
  ["花园", " Garden"],
  ["家园", " Residence"],
  ["社区", " Community"],
  ["小区", " Residential Quarter"],
  ["大院", " Compound"],
  ["四合院", " Siheyuan"],
  ["胡同", " Hutong"],
  ["大学", " University"],
  ["学院", " Institute"],
  ["中学", " High School"],
  ["附中", " Affiliated High School"],
  ["小学", " Primary School"],
  ["医院", " Hospital"],
  ["公园", " Park"],
  ["城楼", " Gatehouse"],
  ["箭楼", " Arrow Tower"],
  ["角楼", " Corner Tower"],
  ["大殿", " Grand Hall"],
  ["宝殿", " Hall"],
  ["白塔", " White Dagoba"],
  ["寺", " Temple"],
  ["庙", " Temple"],
  ["观", " Taoist Temple"],
  ["宫", " Palace"],
  ["殿", " Hall"],
  ["阁", " Pavilion"],
  ["亭", " Pavilion"],
  ["塔", " Pagoda"],
  ["楼", " Bldg"],
  ["馆", " Hall"],
  ["院", " Courtyard"],
  ["门", " Gate"],
  ["站", " Station"]
];

const HANZI_PINYIN = {
  "北": "bei", "京": "jing", "东": "dong", "西": "xi", "南": "nan", "中": "zhong",
  "上": "shang", "下": "xia", "内": "nei", "外": "wai", "前": "qian", "后": "hou",
  "左": "zuo", "右": "you", "大": "da", "小": "xiao", "新": "xin", "老": "lao",
  "古": "gu", "今": "jin", "长": "chang", "安": "an", "天": "tian", "地": "di",
  "门": "men", "街": "jie", "路": "lu", "道": "dao", "桥": "qiao", "环": "huan",
  "一": "yi", "二": "er", "三": "san", "四": "si", "五": "wu", "六": "liu",
  "七": "qi", "八": "ba", "九": "jiu", "十": "shi", "百": "bai", "千": "qian",
  "万": "wan", "国": "guo", "贸": "mao", "建": "jian", "复": "fu", "兴": "xing",
  "朝": "chao", "阳": "yang", "海": "hai", "淀": "dian", "丰": "feng", "台": "tai",
  "石": "shi", "景": "jing", "山": "shan", "水": "shui", "河": "he", "湖": "hu",
  "公": "gong", "园": "yuan", "广": "guang", "场": "chang", "中": "zhong", "心": "xin",
  "大": "da", "厦": "sha", "楼": "lou", "馆": "guan", "院": "yuan", "校": "xiao",
  "体": "ti", "育": "yu", "工": "gong", "人": "ren", "农": "nong", "业": "ye",
  "科": "ke", "技": "ji", "金": "jin", "融": "rong", "商": "shang", "务": "wu",
  "文": "wen", "化": "hua", "艺": "yi", "术": "shu", "博": "bo", "物": "wu",
  "故": "gu", "宫": "gong", "太": "tai", "和": "he", "保": "bao", "中": "zhong",
  "乾": "qian", "清": "qing", "坤": "kun", "宁": "ning", "御": "yu", "花": "hua",
  "景": "jing", "什": "shi", "刹": "cha", "鼓": "gu", "钟": "zhong", "锣": "luo",
  "胡": "hu", "同": "tong", "巷": "xiang", "条": "tiao", "里": "li", "庄": "zhuang",
  "村": "cun", "屯": "tun", "店": "dian", "堡": "pu", "营": "ying", "坟": "fen",
  "庙": "miao", "寺": "si", "坛": "tan", "祈": "qi", "年": "nian", "雍": "yong",
  "阜": "fu", "成": "cheng", "宣": "xuan", "武": "wu", "崇": "chong", "德": "de",
  "胜": "sheng", "安": "an", "定": "ding", "永": "yong", "定": "ding", "广": "guang",
  "渠": "qu", "左": "zuo", "右": "you", "和": "he", "平": "ping", "正": "zheng",
  "阳": "yang", "永": "yong", "安": "an", "双": "shuang", "井": "jing", "劲": "jin",
  "松": "song", "潘": "pan", "家": "jia", "窑": "yao", "方": "fang", "木": "mu",
  "樨": "xi", "地": "di", "公": "gong", "主": "zhu", "玉": "yu", "渊": "yuan",
  "潭": "tan", "紫": "zi", "竹": "zhu", "白": "bai", "颐": "yi", "圆": "yuan",
  "明": "ming", "香": "xiang", "八": "ba", "达": "da", "岭": "ling", "长": "chang",
  "城": "cheng", "鸟": "niao", "巢": "chao", "立": "li", "奥": "ao", "林": "lin",
  "匹": "pi", "克": "ke", "亚": "ya", "运": "yun", "望": "wang", "酒": "jiu",
  "仙": "xian", "亮": "liang", "马": "ma", "麦": "mai", "子": "zi", "团结": "tuanjie",
  "呼": "hu", "家": "jia", "光": "guang", "华": "hua", "知": "zhi", "春": "chun",
  "学": "xue", "院": "yuan", "成": "cheng", "府": "fu", "清": "qing", "华": "hua",
  "万": "wan", "柳": "liu", "苏": "su", "州": "zhou", "北": "bei", "太": "tai",
  "平": "ping", "西": "xi", "土": "tu", "城": "cheng", "牡": "mu", "丹": "dan",
  "健": "jian", "翔": "xiang", "慧": "hui", "忠": "zhong", "大": "da", "屯": "tun"
};

function romanizeChineseSpan(str) {
  if (!str) return "";
  let s = str;
  for (let i = 0; i < PHRASE_REPLACEMENTS.length; i++) {
    const [zh, en] = PHRASE_REPLACEMENTS[i];
    if (s.includes(zh)) s = s.split(zh).join(" " + en + " ");
  }
  s = s
    .replace(/第([一二三四五六七八九十0-9]+)中学/g, "No.$1 High School")
    .replace(/第([一二三四五六七八九十0-9]+)小学/g, "No.$1 Primary School")
    .replace(/第([一二三四五六七八九十0-9]+)医院/g, "No.$1 Hospital")
    .replace(/([0-9]+)号楼/g, "Bldg #$1")
    .replace(/([0-9]+)号院/g, "Courtyard #$1")
    .replace(/([A-Za-z0-9]+)座/g, "Tower $1");

  const numMap = {
    "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9", "十": "10"
  };
  s = s.replace(/([一二三四五六七八九十]+)条/g, (_, d) => (numMap[d] || d) + " Tiao ");

  let out = "";
  let pyBuf = "";
  const flushPy = () => {
    if (!pyBuf) return;
    out += (out && !out.endsWith(" ") ? " " : "") + pyBuf.charAt(0).toUpperCase() + pyBuf.slice(1);
    pyBuf = "";
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= 0x4e00 && code <= 0x9fff) {
      const py = HANZI_PINYIN[ch] || "";
      pyBuf += py;
    } else {
      flushPy();
      out += ch;
    }
  }
  flushPy();
  return out
    .replace(/（/g, " (")
    .replace(/）/g, ") ")
    .replace(/·/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}

export function translateRoadName(name, lang = currentLang) {
  if (!name || lang !== "en") return name || "";
  const trimmed = String(name).trim();
  if (!trimmed) return "";
  if (EXACT_TRANSLATIONS[trimmed]) return EXACT_TRANSLATIONS[trimmed];

  // [release-6-integ] "<road>旁 · <class>" suffixes are matched whole below, not split at "·"
  if (trimmed.includes("·") && !ROAD_SUFFIXES.some(([zh]) => zh.includes("·") && trimmed.endsWith(zh))) {
    return trimmed
      .split("·")
      .map((part) => translateRoadName(part.trim(), "en"))
      .join(" · ");
  }

  for (let i = 0; i < ROAD_SUFFIXES.length; i++) {
    const [zhSuf, enSuf] = ROAD_SUFFIXES[i];
    if (trimmed.endsWith(zhSuf) && trimmed.length > zhSuf.length) {
      const stem = trimmed.slice(0, trimmed.length - zhSuf.length);
      const stemEn = EXACT_TRANSLATIONS[stem] || romanizeChineseSpan(stem);
      return (stemEn + enSuf).replace(/\s+/g, " ").trim();
    }
  }
  return romanizeChineseSpan(trimmed);
}

export function translateBuildingName(name, lang = currentLang) {
  if (!name || lang !== "en") return name || "";
  const trimmed = String(name)
    .trim()
    .replace(/([0-9]+)号楼/g, " Bldg #$1")
    .replace(/([0-9]+)号院/g, " Courtyard #$1");
  if (!trimmed) return "";
  if (EXACT_TRANSLATIONS[trimmed]) return EXACT_TRANSLATIONS[trimmed];

  if (/^OSM\s*建筑\s*(.*)$/.test(trimmed)) {
    return trimmed.replace(/^OSM\s*建筑\s*/, "OSM Building ");
  }
  if (/^北京建筑\s*(.*)$/.test(trimmed)) {
    return trimmed.replace(/^北京建筑\s*/, "Beijing Building ");
  }

  for (let i = 0; i < BUILDING_SUFFIXES.length; i++) {
    const [zhSuf, enSuf] = BUILDING_SUFFIXES[i];
    if (trimmed.endsWith(zhSuf) && trimmed.length > zhSuf.length) {
      const stem = trimmed.slice(0, trimmed.length - zhSuf.length);
      const stemEn = EXACT_TRANSLATIONS[stem] || romanizeChineseSpan(stem);
      return (stemEn + enSuf).replace(/\s+/g, " ").trim();
    }
  }
  return romanizeChineseSpan(trimmed);
}

export function translateStationName(name, lang = currentLang) {
  if (!name || lang !== "en") return name || "";
  const trimmed = String(name).trim();
  if (!trimmed) return "";
  if (EXACT_TRANSLATIONS[trimmed]) return EXACT_TRANSLATIONS[trimmed];
  const core = trimmed.endsWith("站") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
  if (EXACT_TRANSLATIONS[core]) return EXACT_TRANSLATIONS[core] + " Station";
  return romanizeChineseSpan(core) + (trimmed.endsWith("站") ? " Station" : "");
}
