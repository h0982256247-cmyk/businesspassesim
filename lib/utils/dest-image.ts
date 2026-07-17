// 目的地實景圖（Pexels，免費可商用）：主頁熱門目的地卡與商城國家卡共用的單一來源。
// key = 國家代碼（ISO 2/3 碼）或自訂 region 代碼（如「歐洲」「中港澳CSL」「新馬」），
// 每個目的地對應一張獨立、不重複的實景照；沒對到的目的地退回目的地色漸層，不會破圖。

export const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`

export const DEST_IMAGES: Record<string, string> = {
  // ── 亞洲 ──
  JP: pexels(4336279),  JPN: pexels(4336279),
  KR: pexels(380707),   KOR: pexels(380707),
  CN: pexels(2981806),
  HK: pexels(5607794),  HKG: pexels(5607794),
  MO: pexels(29740612),
  TH: pexels(5585153),
  VN: pexels(6871173),
  PH: pexels(13874296), PHL: pexels(13874296),
  ID: pexels(32855804),
  IN: pexels(18722577),
  TR: pexels(15167278),
  GU: pexels(12858509),
  新馬: pexels(777059),
  中港澳: pexels(31772150),
  中港澳CSL: pexels(21774044),
  // ── 歐洲 ──
  FR: pexels(17185651),
  DE: pexels(210459),
  ES: pexels(20879466),
  GB: pexels(220887),
  GR: pexels(164284),
  IS: pexels(29018995),
  FI: pexels(10967302),
  EU: pexels(14213757),
  '西歐/北歐': pexels(33927164),
  '中歐/東歐/巴爾幹': pexels(18192456),
  波羅的海三國: pexels(18555115),
  // ── 美洲 ──
  US: pexels(20847307), USA: pexels(20847307),
  CA: pexels(32131627),
  BR: pexels(3607628),
  AR: pexels(35747415),
  南美: pexels(1570610),
  // ── 大洋洲 / 非洲 ──
  紐澳: pexels(26840173),
  非洲: pexels(19168338),
}

// 商品若用自訂 region 代碼，countryCode 對不到 DEST_IMAGES 時改用中文名關鍵字補判。
export function resolveDestImage(code: string, nameZh = ''): string | undefined {
  if (code && DEST_IMAGES[code]) return DEST_IMAGES[code]
  if (nameZh.includes('新') && (nameZh.includes('馬') || nameZh.includes('加坡'))) return DEST_IMAGES['新馬']
  if (nameZh.includes('日本')) return DEST_IMAGES.JP
  if (nameZh.includes('韓'))   return DEST_IMAGES.KR
  if (nameZh.includes('美國') || nameZh.includes('美国')) return DEST_IMAGES.US
  if (nameZh.includes('菲律')) return DEST_IMAGES.PH
  if (nameZh.includes('香港')) return DEST_IMAGES.HK
  if (nameZh.includes('馬來') || nameZh.includes('马来')) return DEST_IMAGES['新馬']
  return undefined
}
