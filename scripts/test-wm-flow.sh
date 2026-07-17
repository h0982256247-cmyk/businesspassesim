#!/usr/bin/env bash
# 測試 WM 三條 callback webhook 是否正常運作
#
# 用法：
#   BASE_URL=https://esim-eta-eight.vercel.app \
#   WM_ORDER_ID=b00xxxx2601150005 \
#   RCODE=5Un37NJHwy \
#   ICCID=8985100000000123456 \
#   bash scripts/test-wm-flow.sh
#
# 前置條件：DB 內要先有一筆 Order 滿足：
#   - wmOrderId = $WM_ORDER_ID
#   - esimRcode = NULL（測試 2.2 用）
# 跑完 2.2 之後 esimRcode 會被填入 $RCODE，後面才能跑 3.2 與 2.7
#
# 若要重複測試同一筆訂單，先到 Supabase SQL Editor 跑：
#   UPDATE orders SET
#     esim_rcode = NULL, esim_qrcode = NULL, esim_lpa = NULL,
#     esim_iccid = NULL, redeemed_at = NULL, activated_at = NULL,
#     status = 'PAID'
#   WHERE wm_order_id = 'YOUR_WM_ORDER_ID';

set -e

BASE_URL=${BASE_URL:-https://esim-eta-eight.vercel.app}
WM_ORDER_ID=${WM_ORDER_ID:?WM_ORDER_ID env required}
RCODE=${RCODE:-TEST_RCODE_$(date +%s)}
ICCID=${ICCID:-89861001234567890$(date +%s | tail -c 4)}

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; }
info()  { echo -e "${CYAN}ℹ${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }

echo
echo "─── 設定 ─────────────────────────────────────────"
echo "BASE_URL    : $BASE_URL"
echo "WM_ORDER_ID : $WM_ORDER_ID"
echo "RCODE       : $RCODE"
echo "ICCID       : $ICCID"
echo

# ─── Step 1: 模擬 2.2 eSIM 下單 callback ────────────────────────
echo "─── Step 1：模擬 2.2 eSIM 下單 callback ─────────────"
info "POST $BASE_URL/api/webhooks/wm/esim-ordered"

PAYLOAD_22=$(cat <<EOF
{
  "orderId":   "$WM_ORDER_ID",
  "orderSN":   "TEST_SN_$(date +%s)",
  "orderTime": "$(date '+%Y-%m-%d %H:%M:%S')",
  "code":      0,
  "msg":       "成功",
  "itemList": [{
    "iccid":          "$ICCID",
    "productName":    "Test eSIM 3 Days",
    "redemptionCode": "$RCODE",
    "wmproductId":    "WM_TEST_001",
    "productPrice":   100
  }],
  "encStr": "test_signature_no_verify"
}
EOF
)

RES1=$(curl -sS -w "\n__STATUS__:%{http_code}" -X POST \
  "$BASE_URL/api/webhooks/wm/esim-ordered" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_22")

BODY1=$(echo "$RES1" | sed '/__STATUS__:/d')
STATUS1=$(echo "$RES1" | grep __STATUS__ | cut -d: -f2)

if [ "$STATUS1" = "200" ] && [ "$BODY1" = "1" ]; then
  ok "HTTP 200, body='1'（WM 期望的成功回應）"
else
  fail "HTTP $STATUS1, body='$BODY1' (應為 '1')"
fi

warn "請到 Supabase 跑這條 SQL 驗證："
cat <<EOF
  SELECT status, esim_rcode, esim_iccid, wm_order_sn FROM orders
  WHERE wm_order_id = '$WM_ORDER_ID';
  -- 期望：status='COMPLETED', esim_rcode='$RCODE', esim_iccid='$ICCID', wm_order_sn 有值
EOF
echo
read -p "看到正確結果再按 Enter 繼續下一步…" _

# ─── Step 2: 標記 redeemedAt（模擬用戶按「我要安裝」）─────────
echo
echo "─── Step 2：模擬用戶按「我要安裝」 ────────────────────"
warn "這一步通常是用戶在 LIFF 點按鈕後我們呼叫 WM 3.1。"
warn "腳本無法真的打 WM（需要真實 merchantId/token），請手動到 Supabase 跑："
cat <<EOF
  UPDATE orders SET redeemed_at = NOW()
  WHERE wm_order_id = '$WM_ORDER_ID';
EOF
echo
read -p "跑完後按 Enter 繼續…" _

# ─── Step 3: 模擬 3.2 兌換兌換碼 callback ────────────────────
echo
echo "─── Step 3：模擬 3.2 兌換兌換碼 callback ─────────────"
info "POST $BASE_URL/api/webhooks/wm/esim-redeemed"

PAYLOAD_32=$(cat <<EOF
{
  "qrcode":        "https://tfmshippingsys.fastmove.com.tw/tApi/images/test_qr.jpg",
  "rcode":         "$RCODE",
  "qrcodeType":    2,
  "resultcode":    "000",
  "resultmsg":     "success",
  "iccid":         "$ICCID",
  "qrcodeContent": "LPA:1\$rsp.demo.com\$0913F6176020B7C603E3R42B61P686D3",
  "salePlanDays":  3,
  "pin1":          "1111",
  "pin2":          "2222",
  "puk1":          "33334444",
  "puk2":          "44445555",
  "cfCode":        "849372",
  "apnExplain":    "rsp.demo.com",
  "code":          0,
  "msg":           "success",
  "encStr":        "test_signature_no_verify"
}
EOF
)

RES2=$(curl -sS -w "\n__STATUS__:%{http_code}" -X POST \
  "$BASE_URL/api/webhooks/wm/esim-redeemed" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_32")

BODY2=$(echo "$RES2" | sed '/__STATUS__:/d')
STATUS2=$(echo "$RES2" | grep __STATUS__ | cut -d: -f2)

if [ "$STATUS2" = "200" ] && [ "$BODY2" = "1" ]; then
  ok "HTTP 200, body='1'"
else
  fail "HTTP $STATUS2, body='$BODY2'"
fi

warn "請到 Supabase 跑這條 SQL 驗證："
cat <<EOF
  SELECT esim_qrcode, esim_lpa, esim_pin1, esim_cf_code FROM orders
  WHERE wm_order_id = '$WM_ORDER_ID';
  -- 期望：esim_qrcode 有 URL，esim_lpa = 'LPA:1\$rsp.demo.com\$...'，pin/cf 有值
EOF
echo
read -p "看到正確結果再按 Enter 繼續下一步…" _

# ─── Step 4: 模擬 2.7 eSIM 激活通知 ──────────────────────────
echo
echo "─── Step 4：模擬 2.7 eSIM 激活通知 ───────────────────"
info "POST $BASE_URL/api/webhooks/wm/esim-activated"

NOW_MS=$(($(date +%s) * 1000))
END_MS=$((NOW_MS + 3 * 86400 * 1000))   # +3 天

PAYLOAD_27=$(cat <<EOF
{
  "orderId":  "$WM_ORDER_ID",
  "rcode":    "$RCODE",
  "iccid":    "$ICCID",
  "useSDate": "$NOW_MS",
  "useEDate": "$END_MS"
}
EOF
)

RES3=$(curl -sS -w "\n__STATUS__:%{http_code}" -X POST \
  "$BASE_URL/api/webhooks/wm/esim-activated" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_27")

BODY3=$(echo "$RES3" | sed '/__STATUS__:/d')
STATUS3=$(echo "$RES3" | grep __STATUS__ | cut -d: -f2)

if [ "$STATUS3" = "200" ] && [ "$BODY3" = "1" ]; then
  ok "HTTP 200, body='1'"
else
  fail "HTTP $STATUS3, body='$BODY3'"
fi

warn "請到 Supabase 跑這條 SQL 驗證："
cat <<EOF
  SELECT activated_at, activation_start, activation_end FROM orders
  WHERE wm_order_id = '$WM_ORDER_ID';
  -- 期望：activated_at 為剛剛時間，activation_start/end 為傳入的時間戳

  -- 順便確認 pending gift 是否被自動 cancel：
  SELECT cancel_reason, cancelled_at FROM order_gifts
  WHERE order_id = (SELECT id FROM orders WHERE wm_order_id = '$WM_ORDER_ID');
  -- 若有 pending gift，cancel_reason 應為 'esim_activated_by_buyer'
EOF

# ─── Step 5: 邊際測試 ───────────────────────────────────
echo
echo "─── Step 5：邊際測試（重複呼叫應該安全）─────────────"

info "再次呼叫 2.7（測試冪等性）..."
RES4=$(curl -sS -X POST "$BASE_URL/api/webhooks/wm/esim-activated" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_27")
if [ "$RES4" = "1" ]; then
  ok "重複呼叫安全（活化時間應該保留首次值，不會被覆蓋）"
else
  fail "重複呼叫回傳異常：$RES4"
fi

info "用錯誤的 orderId 呼叫 2.7（測試防偽）..."
RES5=$(curl -sS -X POST "$BASE_URL/api/webhooks/wm/esim-activated" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"FAKE_ID","rcode":"FAKE","iccid":"FAKE"}')
if [ "$RES5" = "1" ]; then
  ok "找不到對應訂單時仍回 '1'，不洩漏資訊"
else
  fail "回傳：$RES5"
fi

echo
echo "─── 全部完成 ─────────────────────────────────────"
ok "如果以上每步驟都通過，三條 webhook 鏈路均正常 ✨"
echo
echo "下一步建議手動測試："
echo "  1. LIFF 走完整付款流程（會打 WM 真實 2.1） "
echo "  2. WM 應該 1-3 分鐘內推 2.2 → 訂單變 COMPLETED + 有 rcode"
echo "  3. LIFF 訂單詳情頁按「我要安裝」→ 我們真實打 WM 3.1"
echo "  4. WM 推 3.2 → 訂單獲得 QR + LPA"
echo "  5. 真實掃 QR → 手機裝 eSIM → WM 推 2.7 → activated_at 寫入"
