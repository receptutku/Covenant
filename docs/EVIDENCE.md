# PPREV — Canlı Zincir Kanıtları

Bu dosyadaki her link **gerçek Hedera testnet** işlemine gider ve kalıcıdır.
Hiçbiri mock, simülasyon veya ekran görüntüsü değildir.

**Ağ:** Hedera testnet · **Explorer:** [HashScan](https://hashscan.io/testnet)

---

## Altyapı

| Ne | ID | Link |
|---|---|---|
| Operator / treasury | `0.0.9695718` | [HashScan](https://hashscan.io/testnet/account/0.0.9695718) |
| HCS denetim topic'i | `0.0.9734777` | [HashScan](https://hashscan.io/testnet/topic/0.0.9734777) |
| buyer1 (KYC'li alıcı / tenant) | `0.0.9734741` | [HashScan](https://hashscan.io/testnet/account/0.0.9734741) |
| buyer2 (ikincil alıcı) | `0.0.9734742` | [HashScan](https://hashscan.io/testnet/account/0.0.9734742) |
| nokyc (associate ✅ / KYC ⛔) | `0.0.9734743` | [HashScan](https://hashscan.io/testnet/account/0.0.9734743) |

---

## Üç altın sahne — HTS tokenizasyon ve compliance

`npm run golden` ile üretildi ve her çalıştırmada iddiaları program içinde doğrular.

| # | Sahne | Kanıt | Link |
|---|---|---|---|
| — | HTS property token (PROP-001) | fungible, `decimals=0`, arz `1000`, KYC + freeze key, %2 fractional fee (min 1) | [`0.0.9734808`](https://hashscan.io/testnet/token/0.0.9734808) |
| 1 | **Primary transfer** | operator → buyer1, 100 hisse, **fee kesilmedi** (treasury muaf) | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926059.544457087) |
| 2 | **Secondary transfer + %2 fee** | buyer1 → buyer2, 100 gönderildi → **fee 2**, alıcı **98** aldı | [tx](https://hashscan.io/testnet/transaction/0.0.9695718@1784926061.146533751) |
| 3 | **KYC reddi — ağ seviyesi** | operator → nokyc, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` | [nokyc hesabı](https://hashscan.io/testnet/account/0.0.9734743) |

### 3. sahne neden önemli

nokyc hesabı token'a **associate edilmiştir** ama **KYC almamıştır**. Bu ayrım kasıtlıdır:

- Associate edilmeseydi hata `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` olurdu — yani "hesap bu
  token'ı hiç kabul etmemiş". Bu, anlatmak istediğimiz şey değil.
- Associate + KYC yok → `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` — yani "hesap token'ı kabul
  etti ama **kimlik doğrulaması olmadan transfer alamaz**".

Reddi veren uygulama kodu değil, **Hedera ağının kendisidir**. Uygulama katmanı devre dışı
bırakılsa bile bu kural geçerli kalır.

### %2 fee neden yalnız ikincil transferde görünüyor

Fee collector treasury (operator) hesabıdır ve Hedera'da fee collector kendi
transferlerinden muaftır. Bu yüzden birincil satış (treasury → alıcı) ücretsizdir; ücret
yalnız hisseler **ikincil piyasada** el değiştirirken kesilir. Protokolde bu, kira geliri
dağıtım mekanizmasını temsil eder.

---

## Bekleyen kanıtlar

Aşağıdakiler ilgili faz tamamlandığında bu tabloya eklenecek:

- [ ] Verifier tamper testi — oynanmış attestation tokenize'ı blokluyor (R3)
- [ ] ENS canlı config çözümü — Sepolia (R6)
- [ ] Mirror Node denetim zaman çizelgesi (R6)
- [ ] Kiralama escrow HBAR kilidi (R6.5)
- [ ] Kiralama settlement — temiz iade (R6.5)
- [ ] Kiralama expiration — iade + landlord slash (R6.5)

---

## Yeniden üretme

```bash
npm install
cp .env.example .env.local     # OPERATOR_ID + OPERATOR_KEY doldur
npm run accounts:create        # buyer1 / buyer2 / nokyc üretir
npm run bootstrap              # HCS denetim topic'i açar
npm run golden                 # üç altın sahneyi çalıştırır ve doğrular
```

`npm run golden` yalnız işlem yapmaz — her iddiayı program içinde `assert` eder.
Fee 2 değilse, alıcı 98 almadıysa veya nokyc transferi geçerse script hata verip çıkar.
