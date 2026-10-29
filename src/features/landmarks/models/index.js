// feature/famous-landmarks: one module per landmark id (see registry.js). Module API:
//   export function build(k: Kit)  -- required; model space metres, origin = ground centre, +Y up, front = -Z
//   export const colliders = [{ x, z, hw, hd, h, rot? } | { x, z, r, h }]  -- local frame, h = metres above base
//   export const lodDist = 1600; export const glowStrength = 2.2;  -- optional
//   export const fineDist = 450;  -- optional [lm-materials]: range of the close-up level when build() reads k.fine
//   export function setup({ THREE, group, parts, L, mats }) { return { update(dt, t, night, dist) {} } }  -- optional
import * as m_liberty from "./liberty.js";
import * as m_empire from "./empire.js";
import * as m_chrysler from "./chrysler.js";
import * as m_onewtc from "./onewtc.js";
import * as m_eiffel from "./eiffel.js";
import * as m_arcdetriomphe from "./arcdetriomphe.js";
import * as m_westminster from "./westminster.js";
import * as m_londoneye from "./londoneye.js";
import * as m_towerbridge from "./towerbridge.js";
import * as m_brandenburg from "./brandenburg.js";
import * as m_colosseum from "./colosseum.js";
import * as m_pisa from "./pisa.js";
import * as m_stbasil from "./stbasil.js";
import * as m_coit from "./coit.js";
import * as m_transamerica from "./transamerica.js";
import * as m_salesforce from "./salesforce.js";
import * as m_palacefinearts from "./palacefinearts.js";
import * as m_ferrybuilding from "./ferrybuilding.js";
import * as m_spaceneedle from "./spaceneedle.js";
import * as m_gatewayarch from "./gatewayarch.js";
import * as m_cntower from "./cntower.js";
import * as m_christ from "./christ.js";
import * as m_operahouse from "./operahouse.js";
import * as m_harbourbridge from "./harbourbridge.js";
import * as m_taj from "./taj.js";
import * as m_burj from "./burj.js";
import * as m_tokyotower from "./tokyotower.js";
import * as m_skytree from "./skytree.js";
import * as m_pearl from "./pearl.js";
import * as m_petronas from "./petronas.js";
import * as m_marinabaysands from "./marinabaysands.js";
import * as m_khufu from "./khufu.js";
import * as m_khafre from "./khafre.js";
import * as m_menkaure from "./menkaure.js";
import * as m_sphinx from "./sphinx.js";
import * as m_tiananmen from "./tiananmen.js"; // feature/beijing-landmarks
import * as m_forbiddencity from "./forbiddencity.js"; // feature/beijing-landmarks
import * as m_heroesmonument from "./heroesmonument.js"; // feature/beijing-landmarks
import * as m_greathall from "./greathall.js"; // feature/beijing-landmarks
import * as m_natmuseum from "./natmuseum.js"; // feature/beijing-landmarks
import * as m_maomausoleum from "./maomausoleum.js"; // feature/beijing-landmarks
import * as m_taflagpole from "./taflagpole.js"; // feature/beijing-landmarks
import * as m_zhengyangmen from "./zhengyangmen.js"; // feature/beijing-landmarks
import * as m_qianmenarrow from "./qianmenarrow.js"; // feature/beijing-landmarks
import * as m_qiniandian from "./qiniandian.js"; // feature/beijing-landmarks
import * as m_jingshan from "./jingshan.js"; // feature/beijing-landmarks
import * as m_beihaidagoba from "./beihaidagoba.js"; // feature/beijing-landmarks
import * as m_birdsnest from "./birdsnest.js"; // feature/beijing-landmarks
import * as m_watercube from "./watercube.js"; // feature/beijing-landmarks
import * as m_cctv from "./cctv.js"; // feature/beijing-landmarks
import * as m_chinazun from "./chinazun.js"; // feature/beijing-landmarks
import * as m_taipei101 from "./taipei101.js"; // feature/lm-east
import * as m_lotustemple from "./lotustemple.js"; // feature/lm-east
import * as m_burjalarab from "./burjalarab.js"; // feature/lm-east
import * as m_hagiasophia from "./hagiasophia.js"; // feature/lm-east
import * as m_sheikhzayed from "./sheikhzayed.js"; // feature/lm-east
import * as m_angkorwat from "./angkorwat.js"; // feature/lm-east
import * as m_shwedagon from "./shwedagon.js"; // feature/lm-east
import * as m_watarun from "./watarun.js"; // feature/lm-east
import * as m_gatewayofindia from "./gatewayofindia.js"; // feature/lm-east
import * as m_skytower from "./skytower.js"; // feature/lm-east
import * as m_washmonument from "./washmonument.js"; // feature/lm-west
import * as m_lincoln from "./lincoln.js"; // feature/lm-west
import * as m_goldengate from "./goldengate.js"; // feature/lm-west
import * as m_capitol from "./capitol.js"; // feature/lm-west
import * as m_sagrada from "./sagrada.js"; // feature/lm-west
import * as m_notredame from "./notredame.js"; // feature/lm-west
import * as m_stpeters from "./stpeters.js"; // feature/lm-west
import * as m_parthenon from "./parthenon.js"; // feature/lm-west
import * as m_atomium from "./atomium.js"; // feature/lm-west
import * as m_shard from "./shard.js"; // feature/lm-west
import * as m_cologne from "./cologne.js"; // feature/lm-west
import * as m_elcastillo from "./elcastillo.js"; // feature/lm-west
import * as m_sfcityhall from "./sfcityhall.js"; // feature/cluster4-landmarks
import * as m_applepark from "./applepark.js"; // feature/cluster4-landmarks
import * as m_googleplex from "./googleplex.js"; // feature/cluster4-landmarks
import * as m_googlebayview from "./googlebayview.js"; // feature/cluster4-landmarks
import * as m_nvidiahq from "./nvidiahq.js"; // feature/cluster4-landmarks
import * as m_metahq from "./metahq.js"; // feature/cluster4-landmarks
import * as m_hollywoodsign from "./hollywoodsign.js"; // feature/cluster4-landmarks
import * as m_griffith from "./griffith.js"; // feature/cluster4-landmarks
import * as m_whitehouse from "./whitehouse.js"; // feature/cluster4-landmarks
import * as m_pentagon from "./pentagon.js"; // feature/cluster4-landmarks

import * as m_amazon_spheres from "./amazon_spheres.js"; // feature/global-companies
import * as m_microsoft_hq from "./microsoft_hq.js"; // feature/global-companies
import * as m_openai_hq from "./openai_hq.js"; // feature/global-companies
import * as m_salesforce_park from "./salesforce_park.js"; // feature/global-companies
import * as m_stanford_campus from "./stanford_campus.js"; // feature/global-companies
import * as m_mit_dome from "./mit_dome.js"; // feature/global-companies
import * as m_nyse from "./nyse.js"; // feature/global-companies
import * as m_tesla_giga from "./tesla_giga.js"; // feature/global-companies
import * as m_spacex_starbase from "./spacex_starbase.js"; // feature/global-companies
import * as m_tsmc_hq from "./tsmc_hq.js"; // feature/global-companies
import * as m_tencent_hq from "./tencent_hq.js"; // feature/global-companies
import * as m_samsung_hq from "./samsung_hq.js"; // feature/global-companies
import * as m_cern_globe from "./cern_globe.js"; // feature/global-companies
import * as m_louvre from "./louvre.js"; // feature/global-companies

export const MODELS = {
  liberty: m_liberty,
  empire: m_empire,
  chrysler: m_chrysler,
  onewtc: m_onewtc,
  eiffel: m_eiffel,
  arcdetriomphe: m_arcdetriomphe,
  westminster: m_westminster,
  londoneye: m_londoneye,
  towerbridge: m_towerbridge,
  brandenburg: m_brandenburg,
  colosseum: m_colosseum,
  pisa: m_pisa,
  stbasil: m_stbasil,
  coit: m_coit,
  transamerica: m_transamerica,
  salesforce: m_salesforce,
  palacefinearts: m_palacefinearts,
  ferrybuilding: m_ferrybuilding,
  spaceneedle: m_spaceneedle,
  gatewayarch: m_gatewayarch,
  cntower: m_cntower,
  christ: m_christ,
  operahouse: m_operahouse,
  harbourbridge: m_harbourbridge,
  taj: m_taj,
  burj: m_burj,
  tokyotower: m_tokyotower,
  skytree: m_skytree,
  pearl: m_pearl,
  petronas: m_petronas,
  marinabaysands: m_marinabaysands,
  khufu: m_khufu,
  khafre: m_khafre,
  menkaure: m_menkaure,
  sphinx: m_sphinx,
  tiananmen: m_tiananmen,
  forbiddencity: m_forbiddencity,
  heroesmonument: m_heroesmonument,
  greathall: m_greathall,
  natmuseum: m_natmuseum,
  maomausoleum: m_maomausoleum,
  taflagpole: m_taflagpole,
  zhengyangmen: m_zhengyangmen,
  qianmenarrow: m_qianmenarrow,
  qiniandian: m_qiniandian,
  jingshan: m_jingshan,
  beihaidagoba: m_beihaidagoba,
  birdsnest: m_birdsnest,
  watercube: m_watercube,
  cctv: m_cctv,
  chinazun: m_chinazun,
  taipei101: m_taipei101,
  lotustemple: m_lotustemple,
  burjalarab: m_burjalarab,
  hagiasophia: m_hagiasophia,
  sheikhzayed: m_sheikhzayed,
  angkorwat: m_angkorwat,
  shwedagon: m_shwedagon,
  watarun: m_watarun,
  gatewayofindia: m_gatewayofindia,
  skytower: m_skytower,
  washmonument: m_washmonument,
  lincoln: m_lincoln,
  goldengate: m_goldengate,
  capitol: m_capitol,
  sagrada: m_sagrada,
  notredame: m_notredame,
  stpeters: m_stpeters,
  parthenon: m_parthenon,
  atomium: m_atomium,
  shard: m_shard,
  cologne: m_cologne,
  elcastillo: m_elcastillo,
  sfcityhall: m_sfcityhall,
  applepark: m_applepark,
  googleplex: m_googleplex,
  googlebayview: m_googlebayview,
  nvidiahq: m_nvidiahq,
  metahq: m_metahq,
  hollywoodsign: m_hollywoodsign,
  griffith: m_griffith,
  whitehouse: m_whitehouse,
  pentagon: m_pentagon,
  amazon_spheres: m_amazon_spheres,
  microsoft_hq: m_microsoft_hq,
  openai_hq: m_openai_hq,
  salesforce_park: m_salesforce_park,
  stanford_campus: m_stanford_campus,
  mit_dome: m_mit_dome,
  nyse: m_nyse,
  tesla_giga: m_tesla_giga,
  spacex_starbase: m_spacex_starbase,
  tsmc_hq: m_tsmc_hq,
  tencent_hq: m_tencent_hq,
  samsung_hq: m_samsung_hq,
  cern_globe: m_cern_globe,
  louvre: m_louvre,
};
