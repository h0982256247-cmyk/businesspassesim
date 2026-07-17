import type { HomeTemplate, ProductsTemplate } from '@/components/liff/TenantContext'
import type { ComponentType } from 'react'
import type { HomePageProps } from './home/types'
import type { ProductsTemplateProps } from './products/types'

// ── Home page templates ──────────────────────────────────────────────────────

import ClassicHome   from './home/ClassicHome'
import DarkExplorer  from './home/DarkExplorer'
import BreezeHome    from './home/BreezeHome'

export const HOME_TEMPLATES: Record<HomeTemplate, ComponentType<HomePageProps>> = {
  landmark: ClassicHome,    // key 沿用 landmark，後台存的值不用改
  gradient: DarkExplorer,
  minimal:  BreezeHome,
}

// ── Products page templates ──────────────────────────────────────────────────

import ClassicShop  from './products/ClassicShop'
import MagazineShop from './products/MagazineShop'
import CompactShop  from './products/CompactShop'

export const PRODUCTS_TEMPLATES: Record<ProductsTemplate, ComponentType<ProductsTemplateProps>> = {
  classic:  ClassicShop,
  magazine: MagazineShop,
  compact:  CompactShop,
}

// ── Template metadata（平台後台選擇器用）────────────────────────────────────

export const HOME_TEMPLATE_META: { key: HomeTemplate; name: string; desc: string }[] = [
  { key: 'landmark', name: '經典首頁',   desc: '暖色調，2 欄彩色目的地卡片，適合多國商品' },
  { key: 'gradient', name: '暗黑探索家', desc: '深色沉浸感，橫向滑動目的地，科技氛圍' },
  { key: 'minimal',  name: '清新微風',   desc: '純白簡約，直式列表帶起價，iOS 清爽風格' },
]

export const PRODUCTS_TEMPLATE_META: { key: ProductsTemplate; name: string; desc: string }[] = [
  { key: 'classic',  name: '經典方格', desc: '2 欄國家格 + 卡片式方案列表' },
  { key: 'magazine', name: '雜誌橫滑', desc: '彩色橫向大卡選國家 + 沉浸式方案頁' },
  { key: 'compact',  name: '緊湊列表', desc: '密集單欄列表，適合方案數量多的商家' },
]
