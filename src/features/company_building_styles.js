/**
 * Global Famous Company & Iconic Institution Architectural Classifier.
 *
 * Recognizes 120+ world-famous companies, financial institutions, research labs,
 * universities, museums, sacred/historic monuments, stadiums, and hospitality brands
 * from OpenStreetMap building names and tags (`btype`), returning:
 *   - `category`: 'tech_hq' | 'finance_hq' | 'auto_aero' | 'media_luxury' | 'university'
 *                 | 'museum_culture' | 'sacred_historic' | 'stadium_arena' | 'hospital_med'
 *                 | 'hotel_resort' | 'civic_gov'
 *   - `brandName`: Canonical English display name
 *   - `brandNameZh`: Canonical Chinese display name
 *   - `sectorEn` / `sectorZh`: Concise architectural/industry badge for PropertyInspector
 *   - `primaryRgb` / `accentRgb`: Signature brand/architectural colors ([r, g, b] in 0..1)
 *   - `facadeLayers`: Curated facade texture array indices
 *   - `ratePerSqm`: Realistic valuation rate (USD / m^2)
 *   - `archFeatures`: Flags driving 3D near-LOD architectural synthesis in `wfc_mesh_builder.js`
 */

// Helper to convert hex '#RRGGBB' to normalized [r, g, b]
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const BRAND_RULES = [
  // --- Global Tech, AI & Semiconductor Giants ---
  {
    re: /\b(google|alphabet|googleplex|youtube|waymo|deepmind)\b|谷歌/i,
    category: 'tech_hq',
    brandName: 'Google / Alphabet',
    brandNameZh: '谷歌总部园区 (Google)',
    sectorEn: 'Global Tech & AI Campus',
    sectorZh: '全球科技与人工智能园区',
    primaryRgb: hex('#E8EAED'),
    accentRgb: hex('#4285F4'),
    secondaryAccentRgb: hex('#34A853'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 14500,
  },
  {
    re: /\b(apple\s*park|apple\s*campus|apple\s*inc|apple\s*infinite\s*loop|apple\s*hq)\b|苹果总部|苹果园区/i,
    category: 'tech_hq',
    brandName: 'Apple',
    brandNameZh: '苹果园区 (Apple)',
    sectorEn: 'Consumer Tech Flagship Campus',
    sectorZh: '科技旗舰研发园区',
    primaryRgb: hex('#E5E7EB'),
    accentRgb: hex('#F8FAFC'),
    facadeLayers: [1, 13, 0, 2],
    ratePerSqm: 16800,
  },
  {
    re: /\b(nvidia|endeavor|voyager)\b|英伟达/i,
    category: 'tech_hq',
    brandName: 'NVIDIA',
    brandNameZh: '英伟达总部 (NVIDIA)',
    sectorEn: 'AI & GPU Computing HQ',
    sectorZh: '人工智能与算力芯片总部',
    primaryRgb: hex('#CBD5E1'),
    accentRgb: hex('#76B900'),
    facadeLayers: [1, 0, 13, 2],
    ratePerSqm: 16200,
  },
  {
    re: /\b(meta\s*platforms|meta\s*hq|facebook|instagram|whatsapp)\b|脸书/i,
    category: 'tech_hq',
    brandName: 'Meta',
    brandNameZh: 'Meta 科技园区',
    sectorEn: 'Social & AI Research Campus',
    sectorZh: '社交网络与人工智能园区',
    primaryRgb: hex('#E2E8F0'),
    accentRgb: hex('#0668E1'),
    facadeLayers: [0, 2, 1, 13],
    ratePerSqm: 14200,
  },
  {
    re: /\b(microsoft|github|linkedin|xbox|redmond\s*campus)\b|微软/i,
    category: 'tech_hq',
    brandName: 'Microsoft',
    brandNameZh: '微软研发园区 (Microsoft)',
    sectorEn: 'Cloud & Enterprise Software HQ',
    sectorZh: '云计算与软件工程总部',
    primaryRgb: hex('#DCE3EA'),
    accentRgb: hex('#00A4EF'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 14000,
  },
  {
    re: /\b(amazon|aws|amazon\s*spheres|day\s*1|twitch)\b|亚马逊/i,
    category: 'tech_hq',
    brandName: 'Amazon / AWS',
    brandNameZh: '亚马逊总部大厦 (Amazon)',
    sectorEn: 'Cloud & E-Commerce HQ',
    sectorZh: '云计算与全球电商总部',
    primaryRgb: hex('#D6DEE6'),
    accentRgb: hex('#FF9900'),
    facadeLayers: [0, 1, 2, 5],
    ratePerSqm: 13800,
  },
  {
    re: /\b(openai)\b/i,
    category: 'tech_hq',
    brandName: 'OpenAI',
    brandNameZh: 'OpenAI 总部',
    sectorEn: 'Frontier AI Research HQ',
    sectorZh: '前沿人工智能研究总部',
    primaryRgb: hex('#E2E8F0'),
    accentRgb: hex('#10A37F'),
    facadeLayers: [1, 0, 4, 13],
    ratePerSqm: 15800,
  },
  {
    re: /\b(anthropic)\b/i,
    category: 'tech_hq',
    brandName: 'Anthropic',
    brandNameZh: 'Anthropic 总部',
    sectorEn: 'AI Safety & Research HQ',
    sectorZh: '人工智能安全与研发总部',
    primaryRgb: hex('#EAE4DC'),
    accentRgb: hex('#D97757'),
    facadeLayers: [4, 1, 0, 13],
    ratePerSqm: 15500,
  },
  {
    re: /\b(xai)\b/i,
    category: 'tech_hq',
    brandName: 'xAI',
    brandNameZh: 'xAI 研发中心',
    sectorEn: 'AI Supercompute Facility',
    sectorZh: '人工智能超算研发中心',
    primaryRgb: hex('#CBD5E1'),
    accentRgb: hex('#F8FAFC'),
    facadeLayers: [1, 0, 2],
    ratePerSqm: 14800,
  },
  {
    re: /\b(tesla|gigafactory)\b|特斯拉/i,
    category: 'auto_aero',
    brandName: 'Tesla',
    brandNameZh: '特斯拉研发与超算中心 (Tesla)',
    sectorEn: 'EV, Robotics & AI HQ',
    sectorZh: '智能电动与机器人总部',
    primaryRgb: hex('#E2E8F0'),
    accentRgb: hex('#E82127'),
    facadeLayers: [1, 13, 0, 23],
    ratePerSqm: 12800,
  },
  {
    re: /\b(spacex|starbase|starlink)\b|太空探索技术/i,
    category: 'auto_aero',
    brandName: 'SpaceX',
    brandNameZh: 'SpaceX 航天总部',
    sectorEn: 'Orbital Launch & Spacecraft HQ',
    sectorZh: '商业航天与星舰研发总部',
    primaryRgb: hex('#CBD5E1'),
    accentRgb: hex('#38BDF8'),
    facadeLayers: [1, 13, 23, 0],
    ratePerSqm: 13500,
  },
  {
    re: /\b(netflix)\b|奈飞/i,
    category: 'media_luxury',
    brandName: 'Netflix',
    brandNameZh: 'Netflix 总部园区',
    sectorEn: 'Global Streaming & Studio HQ',
    sectorZh: '全球流媒体与影视制片总部',
    primaryRgb: hex('#D8DCE2'),
    accentRgb: hex('#E50914'),
    facadeLayers: [1, 0, 4, 13],
    ratePerSqm: 13200,
  },
  {
    re: /\b(salesforce)\b/i,
    category: 'tech_hq',
    brandName: 'Salesforce',
    brandNameZh: 'Salesforce 大厦',
    sectorEn: 'Enterprise Cloud Tower',
    sectorZh: '企业云服务摩天总部',
    primaryRgb: hex('#DCE6F2'),
    accentRgb: hex('#00A1E0'),
    facadeLayers: [0, 1, 2, 5],
    ratePerSqm: 15200,
  },
  {
    re: /\b(oracle)\b|甲骨文/i,
    category: 'tech_hq',
    brandName: 'Oracle',
    brandNameZh: '甲骨文总部 (Oracle)',
    sectorEn: 'Database & Cloud Campus',
    sectorZh: '数据库与云基础设施园区',
    primaryRgb: hex('#DCE4EC'),
    accentRgb: hex('#F80000'),
    facadeLayers: [0, 2, 1, 5],
    ratePerSqm: 13400,
  },
  {
    re: /\b(adobe)\b/i,
    category: 'tech_hq',
    brandName: 'Adobe',
    brandNameZh: 'Adobe 总部大厦',
    sectorEn: 'Creative Cloud & Digital Media HQ',
    sectorZh: '创意软件与数字媒体总部',
    primaryRgb: hex('#E2E6EC'),
    accentRgb: hex('#FA0F00'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 13900,
  },
  {
    re: /\b(intel|robert\s*noyce)\b|英特尔/i,
    category: 'tech_hq',
    brandName: 'Intel',
    brandNameZh: '英特尔研发总部 (Intel)',
    sectorEn: 'Semiconductor R&D & Fab Campus',
    sectorZh: '半导体芯片研发与制造园区',
    primaryRgb: hex('#DCE6F0'),
    accentRgb: hex('#0071C5'),
    facadeLayers: [0, 2, 1, 13],
    ratePerSqm: 12900,
  },
  {
    re: /\b(amd|advanced\s*micro\s*devices)\b|超威半导体/i,
    category: 'tech_hq',
    brandName: 'AMD',
    brandNameZh: 'AMD 处理器总部',
    sectorEn: 'High-Performance Compute & GPU HQ',
    sectorZh: '高性能计算与芯片总部',
    primaryRgb: hex('#DCE2E8'),
    accentRgb: hex('#ED1C24'),
    facadeLayers: [1, 0, 2, 13],
    ratePerSqm: 13400,
  },
  {
    re: /\b(tsmc|taiwan\s*semiconductor)\b|台积电/i,
    category: 'tech_hq',
    brandName: 'TSMC',
    brandNameZh: '台积电晶圆研发厂区 (TSMC)',
    sectorEn: 'Advanced Semiconductor Foundry HQ',
    sectorZh: '先进晶圆代工与芯片制造总部',
    primaryRgb: hex('#E2E6EA'),
    accentRgb: hex('#D71920'),
    facadeLayers: [1, 13, 0, 2],
    ratePerSqm: 15000,
  },
  {
    re: /\b(asml)\b|阿斯麦/i,
    category: 'tech_hq',
    brandName: 'ASML',
    brandNameZh: 'ASML 光刻机研发总部',
    sectorEn: 'EUV Photolithography Systems HQ',
    sectorZh: '极紫外光刻系统研发总部',
    primaryRgb: hex('#DCE4F0'),
    accentRgb: hex('#0F238C'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 14600,
  },
  {
    re: /\b(qualcomm|broadcom|arm\s*ltd|ibm|cisco|sap|palantir|uber|airbnb|stripe|snowflake|databricks|cloudflare|spotify|sony|nintendo|samsung|sk\s*hynix|foxconn|lg\s*twin)\b|三星|索尼|任天堂|思科|甲骨文|富士康/i,
    category: 'tech_hq',
    brandName: null, // Uses matched token or building name
    brandNameZh: null,
    sectorEn: 'Global Technology Headquarters',
    sectorZh: '全球科技企业总部大厦',
    primaryRgb: hex('#DCE4EE'),
    accentRgb: hex('#2563EB'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 13600,
  },
  {
    re: /\b(tencent|wechat|alibaba|alipay|ant\s*group|bytedance|tiktok|douyin|baidu|huawei|xiaomi|byd|dji|jd\.com|meituan|netease|kuaishou)\b|腾讯|阿里巴巴|蚂蚁集团|字节跳动|抖音|百度|华为|小米|比亚迪|大疆|京东|美团|网易|快手/i,
    category: 'tech_hq',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Asia-Pacific Tech & Innovation HQ',
    sectorZh: '亚太科技创新企业总部园区',
    primaryRgb: hex('#DCE6F2'),
    accentRgb: hex('#0066FF'),
    facadeLayers: [0, 1, 2, 13],
    ratePerSqm: 13800,
  },

  // --- Global Finance, Stock Exchanges & Consulting ---
  {
    re: /\b(new\s*york\s*stock\s*exchange|nyse|nasdaq|london\s*stock\s*exchange|tokyo\s*stock\s*exchange|hong\s*kong\s*exchange|hkex|shanghai\s*stock\s*exchange|bourse)\b|证券交易所|交易所大厦/i,
    category: 'finance_hq',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Global Financial Exchange Landmark',
    sectorZh: '全球证券交易中心地标',
    primaryRgb: hex('#E6E0D4'),
    accentRgb: hex('#D4AF37'),
    facadeLayers: [7, 0, 1, 4],
    ratePerSqm: 17500,
  },
  {
    re: /\b(federal\s*reserve|bank\s*of\s*england|european\s*central\s*bank|bank\s*of\s*japan|people'?s\s*bank\s*of\s*china)\b|中央银行|人民银行|美联储/i,
    category: 'civic_gov',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Central Bank & Monetary Authority',
    sectorZh: '国家中央银行与金融总局',
    primaryRgb: hex('#E8E2D5'),
    accentRgb: hex('#C5A059'),
    facadeLayers: [7, 4, 9],
    ratePerSqm: 16000,
  },
  {
    re: /\b(jpmorgan|jp\s*morgan|chase\s*tower|goldman\s*sachs|morgan\s*stanley|citigroup|citibank|citi\s*tower|bank\s*of\s*america|blackrock|bloomberg|hsbc|barclays|ubs|deutsche\s*bank|standard\s*chartered|bank\s*of\s*china|icbc|china\s*merchants\s*bank|citic|mckinsey|bcg|bain|deloitte|pwc|ernst\s*&?\s*young|kpmg)\b|摩根|高盛|花旗|汇丰|巴克莱|瑞银|德意志银行|中国银行|工商银行|建设银行|招商银行|中信大厦|麦肯锡|德勤|普华永道|安永|毕马威/i,
    category: 'finance_hq',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Global Banking & Financial Tower',
    sectorZh: '国际金融与投资银行总部大厦',
    primaryRgb: hex('#DCE4EE'),
    accentRgb: hex('#38BDF8'),
    facadeLayers: [0, 1, 2, 5, 7],
    ratePerSqm: 15400,
  },

  // --- Global Aerospace, Automotive, Biotech & Science ---
  {
    re: /\b(nasa|jet\s*propulsion\s*lab|jpl|boeing|airbus|lockheed\s*martin|northrop|raytheon|cern|fermilab|lawrence\s*berkeley|slac)\b|国家航空航天|波音|空客|欧洲核子研究/i,
    category: 'auto_aero',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Aerospace & National Science Center',
    sectorZh: '航空航天与国家科学实验室',
    primaryRgb: hex('#E2E8F0'),
    accentRgb: hex('#0B3D91'),
    facadeLayers: [1, 13, 0, 2],
    ratePerSqm: 12600,
  },
  {
    re: /\b(toyota|lexus|honda|nissan|bmw|mercedes|daimler|porsche|ferrari|volkswagen|audi|hyundai|ford\s*world\s*hq|general\s*motors|pfizer|moderna|genentech|roche|novartis|astrazeneca|amgen|gilead|eli\s*lilly|novo\s*nordisk)\b|丰田|本田|宝马|奔驰|保时捷|法拉利|大众|奥迪|现代汽车|辉瑞|罗氏|诺华|阿斯利康/i,
    category: 'auto_aero',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Global Engineering & Biotech HQ',
    sectorZh: '全球精密制造与生物医药总部',
    primaryRgb: hex('#E2E7EC'),
    accentRgb: hex('#0093D0'),
    facadeLayers: [1, 0, 13, 2],
    ratePerSqm: 12800,
  },

  // --- Global Media, Luxury, Retail & Hospitality ---
  {
    re: /\b(disney|walt\s*disney|pixar|marvel|lucasfilm|warner\s*bros|universal\s*studios|nbcuniversal|paramount|sony\s*pictures|bbc\s*broadcasting|new\s*york\s*times|lvmh|louis\s*vuitton|dior|chanel|hermes|gucci|prada|rolex|cartier|tiffany|ikea|costco|walmart|target\s*plaza|starbucks\s*reserve|harrods|galeries\s*lafayette|ginza\s*six)\b|迪士尼|皮克斯|环球影城|华纳兄弟|纽约时报|路易威登|香奈儿|爱马仕|古驰|劳力士|宜家|老佛爷百货/i,
    category: 'media_luxury',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Global Media & Luxury Flagship',
    sectorZh: '全球传媒集团与奢侈品旗舰大厦',
    primaryRgb: hex('#EAE2D6'),
    accentRgb: hex('#D4AF37'),
    facadeLayers: [4, 7, 0, 1],
    ratePerSqm: 15600,
  },
  {
    re: /\b(four\s*seasons|ritz[\s-]*carlton|mandarin\s*oriental|st\.?\s*regis|peninsula\s*hotel|waldorf\s*astoria|park\s*hyatt|grand\s*hyatt|jw\s*marriott|marriott\s*marquis|hilton|intercontinental|shangri[\s-]*la|raffles|fairmont|aman\s*tokyo|burj\s*al\s*arab|marina\s*bay\s*sands|bellagio|caesars\s*palace|venetian|wynn)\b|四季酒店|丽思卡尔顿|文华东方|瑞吉酒店|半岛酒店|华尔道夫|柏悦|君悦|万豪|希尔顿|洲际酒店|香格里拉|金沙酒店/i,
    category: 'hotel_resort',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Five-Star Luxury Hotel & Resort',
    sectorZh: '国际五星级奢华酒店地标',
    primaryRgb: hex('#ECE5D8'),
    accentRgb: hex('#EAB308'),
    facadeLayers: [7, 4, 0, 1, 5],
    ratePerSqm: 14400,
  },

  // --- Global Universities & Research Institutes ---
  {
    re: /\b(mit|massachusetts\s*institute|stanford|harvard|uc\s*berkeley|caltech|yale|princeton|columbia\s*university|nyu|cmu|carnegie\s*mellon|oxford\s*university|cambridge\s*university|imperial\s*college|eth\s*zurich|sorbonne|tsinghua|peking\s*university|university\s*of\s*tokyo|kyoto\s*university|nus|ntu|university|college|institute\s*of\s*technology)\b|清华大学|北京大学|复旦|交通大学|浙江大学|东京大学|早稻田|牛津|剑桥|哈佛|斯坦福|麻省理工|大学|学院/i,
    category: 'university',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'World University & Research Hall',
    sectorZh: '世界高等学府与学术殿堂',
    primaryRgb: hex('#E6DEC8'),
    accentRgb: hex('#991B1B'),
    facadeLayers: [7, 8, 9, 4],
    ratePerSqm: 11200,
  },

  // --- Global Museums, Opera Houses & Cultural Landmarks ---
  {
    re: /\b(louvre|british\s*museum|metropolitan\s*museum|met\s*museum|smithsonian|guggenheim|moma|modern\s*art|tate\s*modern|musee\s*d'?orsay|centre\s*pompidou|prado|uffizi|hermitage|national\s*gallery|rijksmuseum|de\s*young|sfmoma|getty\s*center|lacma|broad\s*museum|opera\s*house|symphony\s*hall|philharmonic|concert\s*hall|lincoln\s*center|kennedy\s*center|barbican|museum|art\s*gallery|planetarium|aquarium)\b|故宫博物院|国家博物馆|卢浮宫|大英博物馆|大都会艺术|古根海姆|现代艺术博物馆|歌剧院|音乐厅|大剧院|美术馆|博物馆|天文馆/i,
    category: 'museum_culture',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'World Museum & Performing Arts Icon',
    sectorZh: '世界级博物馆与艺术文化地标',
    primaryRgb: hex('#EBE4D8'),
    accentRgb: hex('#38BDF8'),
    facadeLayers: [7, 4, 9, 1],
    ratePerSqm: 13500,
  },

  // --- Sacred Monuments, Cathedrals, Temples & Historic Palaces ---
  {
    re: /\b(cathedral|basilica|duomo|notre[\s-]*dame|sacre[\s-]*coeur|westminster\s*abbey|st\.?\s*paul'?s|st\.?\s*peter'?s|sagrada\s*familia|grace\s*cathedral|st\.?\s*patrick'?s|minster|abbey)\b|大教堂|圣母院|主教座堂/i,
    category: 'sacred_historic',
    subKind: 'cathedral',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Historic Cathedral & Basilica',
    sectorZh: '历史大教堂与宗教艺术建筑',
    primaryRgb: hex('#E2D9C5'),
    accentRgb: hex('#D4AF37'),
    facadeLayers: [7, 9, 4],
    ratePerSqm: 14000,
  },
  {
    re: /\b(senso[\s-]*ji|meiji\s*jingu|kinkaku|kiyomizu|fushimi\s*inari|temple|shrine|pagoda|monastery|mosque|synagogue|palace|castle|chateau|forbidden\s*city|buckingham|versailles|schloss|alcazar)\b|寺|庙|宫|祠|塔|神社|清真寺|皇宫|城堡/i,
    category: 'sacred_historic',
    subKind: 'temple_palace',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Historic Palace & Sacred Monument',
    sectorZh: '历史宫殿与传统文化遗产建筑',
    primaryRgb: hex('#E4D5C3'),
    accentRgb: hex('#D97706'),
    facadeLayers: [15, 7, 9, 4],
    ratePerSqm: 13800,
  },

  // --- Global Stadiums, Arenas & Ballparks ---
  {
    re: /\b(stadium|arena|coliseum|colosseum|ballpark|bird'?s\s*nest|camp\s*nou|santiago\s*bernabeu|wembley|old\s*trafford|emirates\s*stadium|allianz\s*arena|san\s*siro|sofi\s*stadium|chase\s*center|oracle\s*park|yankee\s*stadium|madison\s*square\s*garden|barclays\s*center|crypto\.com\s*arena|dodger\s*stadium|tokyo\s*dome|budokan)\b|体育场|体育馆|鸟巢|工人体育场|五棵松|球场/i,
    category: 'stadium_arena',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Major Sports Stadium & Arena',
    sectorZh: '大型国际体育场馆地标',
    primaryRgb: hex('#DCE4EE'),
    accentRgb: hex('#38BDF8'),
    facadeLayers: [1, 13, 0, 2],
    ratePerSqm: 11800,
  },

  // --- World-Renowned Hospitals & Medical Research Centers ---
  {
    re: /\b(mayo\s*clinic|johns\s*hopkins|cleveland\s*clinic|mass\s*general|ucsf\s*medical|stanford\s*hospital|mount\s*sinai|cedars[\s-]*sinai|st\.?\s*thomas'?\s*hospital|charite|hospital|medical\s*center)\b|协和医院|同仁医院|瑞金医院|华西医院|医院|医疗中心/i,
    category: 'hospital_med',
    brandName: null,
    brandNameZh: null,
    sectorEn: 'Academic Medical Center & Hospital',
    sectorZh: '大型医学中心与综合医院',
    primaryRgb: hex('#E6EEF4'),
    accentRgb: hex('#EF4444'),
    facadeLayers: [4, 1, 0, 13],
    ratePerSqm: 10800,
  },
];

const CIVIC_GOV_RE =
  /\b(city\s*hall|capitol|courthouse|supreme\s*court|parliament|ministry|embassy|consulate|federal|municipal|civic\s*center|library|national\s*archives|white\s*house|pentagon|reichstag|elysee|downing\s*street|diet\s*building)\b|市政府|市政厅|议会|国会|法院|大使馆|领事馆|图书馆|政务|政府/i;

function buildArchFeatures(category, subKind = null) {
  const isCorp =
    category === 'tech_hq' ||
    category === 'finance_hq' ||
    category === 'auto_aero' ||
    category === 'media_luxury' ||
    category === 'hotel_resort' ||
    category === 'hospital_med';
  return {
    glassAtriumMarquee: isCorp,
    skySignMonument: isCorp,
    skyGardenAtrium: category === 'tech_hq' || category === 'auto_aero' || category === 'media_luxury' || category === 'hotel_resort',
    colonnadePortico: category === 'civic_gov' || category === 'university' || category === 'museum_culture' || category === 'sacred_historic',
    glassPyramid: category === 'museum_culture',
    grandDome: category === 'civic_gov' || category === 'university' || (category === 'sacred_historic' && subKind !== 'cathedral'),
    twinSpires: category === 'sacred_historic' && subKind === 'cathedral',
    pagodaEaves: category === 'sacred_historic' && subKind === 'temple_palace',
    stadiumFloodlights: category === 'stadium_arena',
  };
}

/**
 * Classifies any building by its OpenStreetMap name, `btype` tag, height, and footprint span.
 * Returns null for ordinary generic buildings so they incur zero extra overhead.
 */
export function classifyFamousBuilding(rawName = '', rawBtype = '', height = 12, maxSpan = 20) {
  const name = String(rawName || '').trim();
  const btype = String(rawBtype || 'yes').toLowerCase();

  // Strip synthetic fallback suffixes ("沿线 · ...", "(3层)") before testing brand regexes
  const isSyntheticName =
    name.includes('沿线') ||
    name.includes('层)') ||
    name === '低层街区建筑' ||
    name === '城市综合楼宇' ||
    name === '多层城市建筑';
  const cleanName = isSyntheticName ? '' : name;

  if (cleanName.length >= 2) {
    for (let i = 0; i < BRAND_RULES.length; i++) {
      const rule = BRAND_RULES[i];
      if (rule.re.test(cleanName)) {
        return {
          category: rule.category,
          brandName: rule.brandName || cleanName,
          brandNameZh: rule.brandNameZh || cleanName,
          sectorEn: rule.sectorEn,
          sectorZh: rule.sectorZh,
          primaryRgb: rule.primaryRgb,
          accentRgb: rule.accentRgb,
          secondaryAccentRgb: rule.secondaryAccentRgb || null,
          facadeLayers: rule.facadeLayers,
          ratePerSqm: rule.ratePerSqm,
          archFeatures: buildArchFeatures(rule.category, rule.subKind),
        };
      }
    }

    if (CIVIC_GOV_RE.test(cleanName)) {
      return {
        category: 'civic_gov',
        brandName: cleanName,
        brandNameZh: cleanName,
        sectorEn: 'Civic & Government Landmark',
        sectorZh: '市政与公共行政地标',
        primaryRgb: [1.02, 1.00, 0.95],
        accentRgb: [0.84, 0.69, 0.24],
        secondaryAccentRgb: null,
        facadeLayers: [7, 4, 9],
        ratePerSqm: 12400,
        archFeatures: buildArchFeatures('civic_gov'),
      };
    }
  }

  // Fallback to explicit institutional OSM `building=*` tags (`btype`)
  if (btype === 'university' || btype === 'college') {
    return {
      category: 'university',
      brandName: cleanName || 'University Hall',
      brandNameZh: cleanName || '大学学术中心',
      sectorEn: 'University & Academic Hall',
      sectorZh: '高等学府教学研发楼',
      primaryRgb: [0.96, 0.92, 0.86],
      accentRgb: [0.65, 0.16, 0.16],
      secondaryAccentRgb: null,
      facadeLayers: [7, 8, 9, 4],
      ratePerSqm: 10500,
      archFeatures: buildArchFeatures('university'),
    };
  }
  if (btype === 'museum') {
    return {
      category: 'museum_culture',
      brandName: cleanName || 'Museum & Art Center',
      brandNameZh: cleanName || '艺术博物馆',
      sectorEn: 'Museum & Cultural Landmark',
      sectorZh: '博物馆与文化艺术中心',
      primaryRgb: [0.98, 0.96, 0.92],
      accentRgb: [0.22, 0.74, 0.97],
      secondaryAccentRgb: null,
      facadeLayers: [7, 4, 9, 1],
      ratePerSqm: 12800,
      archFeatures: buildArchFeatures('museum_culture'),
    };
  }
  if (btype === 'cathedral' || btype === 'church' || btype === 'chapel') {
    return {
      category: 'sacred_historic',
      brandName: cleanName || 'Historic Cathedral',
      brandNameZh: cleanName || '历史教堂建筑',
      sectorEn: 'Historic Cathedral & Sanctuary',
      sectorZh: '历史教堂与宗教建筑',
      primaryRgb: [0.94, 0.90, 0.83],
      accentRgb: [0.83, 0.68, 0.22],
      secondaryAccentRgb: null,
      facadeLayers: [7, 9, 4],
      ratePerSqm: 12000,
      archFeatures: buildArchFeatures('sacred_historic', 'cathedral'),
    };
  }
  if (btype === 'temple' || btype === 'shrine' || btype === 'mosque' || btype === 'synagogue' || btype === 'historic') {
    return {
      category: 'sacred_historic',
      brandName: cleanName || 'Historic Temple',
      brandNameZh: cleanName || '传统历史殿宇',
      sectorEn: 'Sacred Temple & Heritage Site',
      sectorZh: '历史文化遗产与传统建筑',
      primaryRgb: [0.94, 0.88, 0.80],
      accentRgb: [0.85, 0.47, 0.02],
      secondaryAccentRgb: null,
      facadeLayers: [15, 7, 9, 4],
      ratePerSqm: 12200,
      archFeatures: buildArchFeatures('sacred_historic', 'temple_palace'),
    };
  }
  if (btype === 'stadium' || btype === 'grandstand' || btype === 'sports_centre') {
    return {
      category: 'stadium_arena',
      brandName: cleanName || 'Sports Stadium & Arena',
      brandNameZh: cleanName || '大型体育场馆',
      sectorEn: 'Sports Stadium & Arena',
      sectorZh: '大型体育竞技场馆',
      primaryRgb: [0.92, 0.95, 0.99],
      accentRgb: [0.22, 0.74, 0.97],
      secondaryAccentRgb: null,
      facadeLayers: [1, 13, 0, 2],
      ratePerSqm: 11200,
      archFeatures: buildArchFeatures('stadium_arena'),
    };
  }
  if (btype === 'hospital') {
    return {
      category: 'hospital_med',
      brandName: cleanName || 'Medical Center',
      brandNameZh: cleanName || '综合医疗中心',
      sectorEn: 'Hospital & Medical Center',
      sectorZh: '大型综合医疗中心',
      primaryRgb: [0.95, 0.98, 1.00],
      accentRgb: [0.94, 0.27, 0.27],
      secondaryAccentRgb: null,
      facadeLayers: [4, 1, 0, 13],
      ratePerSqm: 10200,
      archFeatures: buildArchFeatures('hospital_med'),
    };
  }
  if (btype === 'hotel' && (height >= 24 || maxSpan >= 28 || cleanName.length > 0)) {
    return {
      category: 'hotel_resort',
      brandName: cleanName || 'Grand Hotel',
      brandNameZh: cleanName || '星级大酒店',
      sectorEn: 'Luxury Hotel & Hospitality Tower',
      sectorZh: '星级酒店与商务旅居大厦',
      primaryRgb: [0.96, 0.93, 0.88],
      accentRgb: [0.92, 0.70, 0.03],
      secondaryAccentRgb: null,
      facadeLayers: [7, 4, 0, 1, 5],
      ratePerSqm: 11800,
      archFeatures: buildArchFeatures('hotel_resort'),
    };
  }
  if (btype === 'government' || btype === 'civic' || btype === 'public') {
    return {
      category: 'civic_gov',
      brandName: cleanName || 'Civic Hall',
      brandNameZh: cleanName || '公共市政大厦',
      sectorEn: 'Civic & Government Building',
      sectorZh: '公共市政与行政建筑',
      primaryRgb: [1.02, 1.00, 0.95],
      accentRgb: [0.84, 0.69, 0.24],
      secondaryAccentRgb: null,
      facadeLayers: [7, 4, 9],
      ratePerSqm: 11000,
      archFeatures: buildArchFeatures('civic_gov'),
    };
  }

  return null;
}
