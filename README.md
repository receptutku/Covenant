# PPREV

**Privacy-Preserving Real Estate Verification** · ETHGlobal Lisbon 2026

Gayrimenkul kiralama ve satışında mülk sahipliği doğrulanmadan ve karşı taraf uygunluğu
kanıtlanmadan işlemin ilerleyemediği; kimlik, doğrulama ve compliance kararlarının kişisel
veri sızdırmadan zincire yazıldığı bir protokol. Tek çekirdek, iki mod: **satış**
(fraksiyonel hisse) ve **kiralama** (escrow depozito).

> 🚧 Hackathon devam ediyor. Bu README iki yarıya bölünmüştür — çakışmayı önlemek için
> herkes yalnız kendi yarısına yazar.

---

<!-- ═══════════ ÜST YARI — AKİF ═══════════ -->
<!-- pitch · ekran görüntüleri · how it works · track tablosu -->

## Pitch

_(Akif — A9)_

## Ekran görüntüleri

_(Akif — A9)_

## How it works

_(Akif — A9)_

## Track tablosu

_(Akif — A9)_

<!-- ═══════════ ÜST YARI SONU ═══════════ -->

---

<!-- ═══════════ ALT YARI — RECEP ═══════════ -->
<!-- mimari · No Solidity · kurulum · verifier sınırı · public/private tablo · ENS · evidence · AI usage -->

## Mimari

_(Recep — R8)_

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev
```

Ayrıntılı kurulum ve demo seed adımları R8'de yazılacak.

## Minimal verifier sınırı

_(Recep — R8)_

## Public / private veri tablosu

_(Recep — R8)_

## ENS config discovery

_(Recep — R8)_

## Evidence

Canlı zincir kanıtları: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

## AI Usage

_(Recep — R8)_

<!-- ═══════════ ALT YARI SONU ═══════════ -->

---

## Dokümanlar

| Dosya | İçerik | Sahip |
|---|---|---|
| [`docs/API.md`](docs/API.md) | API kontratı — tek doğruluk kaynağı | Recep |
| `docs/EVIDENCE.md` | Canlı zincir kanıt linkleri | Recep |
| `docs/SUBMISSION.md` | ETHGlobal submission metni | Akif |
| `docs/FEEDBACK_selfie.md` | World Selfie Check geri bildirimi | Akif (user) + Recep (developer) |
| `docs/FEEDBACK_identity.md` | World Identity Check geri bildirimi | Akif (user) + Recep (developer) |

## Dizin sahipliği

Çakışmasız paralel geliştirme için:

- **Recep:** `app/api/**`, `lib/hedera/**`, `lib/world/**`, `lib/verifier/**`, `lib/crypto/**`, `lib/store.ts`, `lib/ens/**`, `scripts/**`
- **Akif:** `app/components/**`, `app/views/**`, `app/globals.css`, `lib/mockApi.ts`, `lib/realApi.ts`
- **Ortak (dokunmadan önce haber ver):** `app/page.tsx`, `docs/API.md`, `README.md`, `package*.json`, `.env.example`

## Solidity yok

Tüm zincir işlemleri native Hedera SDK ile yapılır — HTS (token), HCS (audit), Mirror Node
(public doğrulama). Repo'da hiçbir `.sol` dosyası veya EVM deploy adımı yoktur.
