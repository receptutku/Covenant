Bu dosyayı olduğu gibi ChatGPT'ye yapıştır. Uygulama frozen ve çalışıyor durumda (3 canlı Hedera testnet provası geçildi) — istenen tek şey görsel katmanın **"Stone + Glass Protocol"** yönünde yeniden tasarlanması. Aşağıda tüm ilgili dosyaların gerçek içeriği var; bunların dışında bir şey uydurma, gerçek koddan çalış — component isimleri, prop'lar, className'ler uydurma olmayacak, aşağıdaki gerçek kodun üzerine diff üreteceksin.

---

## Ne istiyorum

Next.js 16 (App Router, React 19, TypeScript strict, Tailwind v4) ile yazılmış, çalışan bir dApp'in **sadece görsel katmanını** "Stone + Glass Protocol" yönünde yeniden tasarlamanı istiyorum: ETHGlobal Lisbon'un mekanına (Pavilhão Carlos Lopes) gönderme yapan, taş/mermer/azulejo-mavisi mimari doku + cam yüzeyler + editorial fintech tipografisi hissi. Tarihi doku soyut ve düşük kontrastlı kalmalı — bir seyahat/turizm landing page'i gibi görünmemeli, dekoratif olmamalı. Detaylar aşağıdaki "Görsel yön: Stone + Glass Protocol" bölümünde.

Çıktı olarak bana şunları ver, sırayla:

1. Yeni **`app/globals.css`** — tam dosya, baştan sona, aşağıdaki mevcut dosyanın yerine geçecek.
2. Aşağıda listelenen her component/view dosyası için **sadece değişen JSX/className parçaları** — "bul-değiştir" mantığında, net şekilde hangi satırın yerine ne geleceği belli olacak. Tüm dosyayı tekrar yazmana gerek yok, ama net ve eksiksiz ver ki ben (ya da benim yerime kod uygulayan başka bir asistan) doğrudan uygulayabilsin.
3. Her dosya için kısa bir "neden" notu (1-2 cümle) — tasarım kararının editorial fintech yönüyle nasıl uyuştuğunu açıkla.

Sırayı şu şekilde izle (aşağıdakiler birbirine bağımlı, globals.css her şeyin temeli):

1. `app/globals.css` — token'lar, tipografi ölçeği, `.btn` `.field` `.panel` gibi component class'ları
2. `app/components/common/*` — ActionCard, StatusBadge, StepIndicator, ErrorCard, EvidenceLink, PrivacyNote
3. `app/views/BuyerView.tsx` — önce bu, çünkü demo'nun iki kritik anı burada
4. `app/views/SellerView.tsx`, `app/views/VerifierView.tsx`, `app/views/AuditTimeline.tsx`, `app/views/CapTable.tsx`
5. `app/page.tsx` — genel layout, header, tab switcher

---

## KESİN KURALLAR — İhlal edilemez

Bu kurallar pazarlık konusu değil; ihlal edilirse çıktın kullanılamaz olur:

- **Sadece görsel katman.** Değiştirebileceklerin: CSS (`app/globals.css`), `className` string'leri, bir component'in `return` ifadesi içindeki markup yapısı (wrapper'lar, grid'ler, görsel elemanların sırası), ve istersen `app/components/` altında kendi oluşturacağın yeni dosyalar.
- **Asla değiştiremeyeceklerin:**
  - Hiçbir `useState`, `useEffect`, handler fonksiyonu, `async` çağrısı — bunlar aşağıdaki kodda görünüyor, olduğu gibi kalacak.
  - `lib/` klasöründeki hiçbir şey (bu dosyaları sana vermedim bile, onlara dokunma).
  - Prop isimleri, component isimleri, export isimleri.
  - **Ekrandaki hiçbir metin/copy.** Her cümle bilinçli yazıldı, bazıları protokolün ne yaptığına dair kanıt niteliğinde iddialar taşıyor (örn. hata mesajları, "ENS confirmed the token before the transfer" gibi). Bir metin sana yanlış görünüyorsa değiştirme, sadece not düş.
  - Bir şeyin ne zaman render olacağına karar veren koşullu mantık (`{condition && <X/>}` gibi ifadelerdeki koşulun kendisi — görsel yapıyı değiştirebilirsin ama koşulu değil).
- **Yeni paket/kütüphane yok.** İkon paketi yok, animasyon kütüphanesi yok, UI kit yok. Sadece inline SVG ve CSS.
- **Hem koyu hem açık tema çalışmalı.** Kod `@media (prefers-color-scheme: dark)` kullanıyor — bu deseni koru, iki temayı da tasarla.
- **Ekran projeksiyonla gösterilecek.** 11px altı font yok, düşük kontrastlı grili tonlardan kaçın.
- **İçerik uzunluğu sabit.** Bazı kartlarda 4 satırlık açıklama var, kısaltamazsın — var olan yoğunluğa göre tasarla.

---

## Uygulama ne yapıyor (bağlam için)

PPREV — parçalı gayrimenkul tokenizasyonu, ETHGlobal Lisbon 2026 için yapıldı. İki kural protokolü tanımlıyor: bir insan mülk belgelerini doğrulamadan hiçbir token oluşmaz, ve bir cüzdan uygunluğunu kanıtlamadan hiçbir pay o cüzdana ulaşamaz. İkinci kural uygulama kodu tarafından değil Hedera ağı tarafından zorlanıyor — pitch'in özü bu.

Tek sayfa (`app/page.tsx`), üstte üç kolon, altta iki tam-genişlik panel:

| Bölge | Dosya | Ne yapıyor |
|---|---|---|
| Seller kolonu | `SellerView.tsx` | Selfie doğrulama → belge yükleme → durum kontrolü → tokenize |
| Verifier kolonu | `VerifierView.tsx` | Admin girişi → inceleme kuyruğu → onay/red → tamper testi |
| Buyer kolonu | `BuyerView.tsx` | ENS okuma → hesap → kimlik/KYC → satın alma |
| Audit paneli | `AuditTimeline.tsx` | Hedera Mirror Node'dan okunan HCS event zaman çizelgesi |
| Cap table | `CapTable.tsx` | Payları kim tutuyor, Mirror Node'dan okunuyor |

Mobilde (`lg` altı) üç kolon sekmelere dönüşüyor ama **üçü de mount edilmiş kalıyor**, CSS ile gizleniyor (state kaybolmasın diye) — bu deseni bozma.

### Demo'yu taşıyan iki an — bunlara en çok özen göster

Bir jüri üyesi bu demoyu üç dakika izliyor. Sonucu belirleyen iki kare, ikisi de Buyer kolonunda:

1. **Reddediliş.** Bilerek KYC'siz bırakılmış bir hesapla satın alma, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` hatasıyla başarısız oluyor — bu string Hedera'nın konsensüs node'ları tarafından üretiliyor, uygulama tarafından değil. `hederaStatus` mevcut olduğunda bu string ekrandaki en büyük şey olmalı; kendi hata `code`'umuz dipnot olmalı. (`ErrorCard.tsx`'e bak — `fromNetwork` mantığı bunu zaten ayırıyor, sen sadece görselini güçlendir.)
2. **Ücret.** 100 payın ikincil transferi 100 düşer, ağ 2 alır, alıcı 98 alır. Bu üç sayı ayrı ayrı gösteriliyor ve ayrı kalmalı — birleştirmek Mirror Node'un aynı işlem için tuttuğu kayıtla çelişir. (`BuyerView.tsx` içinde `Sent / Protocol fee / Received` üçlü grid'i.)

Ekrandaki her şey bunların etrafında destekleyici. Bir tasarım kararı geri kalanını güzelleştirirken bu ikisini zayıflatıyorsa, yanlış karardır.

### Mevcut tasarımın durumu

Bir "token'lardan" geçiş zaten yapıldı, taban olarak makul ama tavan değil: CSS değişkenleri var (`--surface`, `--border`, `--muted`, `--faint`, `--accent`), `.btn` `.field` `.panel` component class'ları var, emoji yerine inline SVG kullanılıyor, badge'lerde renk + nokta ikisi birden var (renk körü/ekran görüntüsü için).

Kullanıcının verdiği hüküm: **çok temel, profesyonel hissettirmiyor.** Sorun detaylar değil, arketip — üç kolonda metin yoğun, istiflenmiş beyaz kartlar. Daha fazla cila değil, bir bakış açısı gerekiyor.

**Seçilen yön: Stone + Glass Protocol.** Aşağıdaki bölüme bak.

---

## Görsel yön: Stone + Glass Protocol

Modern bir protokol terminali, tarihi bir Lisbon mekanının içine kurulmuş gibi hissettirmeli: taş, mermer, azulejo-mavisi mimari doku, cam, restrained fintech tipografisi. Turizm/landing page hissi yok, dekoratif değil — mimari doku soyut ve çok düşük kontrastlı kalmalı, arka planda fark edilir ama dikkat çekmez.

Tasarım nitelikleri:
- Editorial fintech, jenerik dashboard değil.
- Büyük, kendinden emin tipografi; mümkün olan yerde bol boşluk; güçlü hiyerarşi.
- İnce border'lar, yarı saydam yüzeyler, hafif cam (glass) hissi.
- Soyut mimari arkaplan dokusu: taş grid, yumuşak azulejo-mavi çizgi işi, çok düşük kontrast — image asset yok, sadece layered gradient + CSS pattern.
- Palet: kırık-beyaz / neredeyse-siyah / taş grisi / azulejo mavisi / küçük kontrollü oker (ochre) vurgu.
- Hem açık hem koyu tema çalışmalı.
- Projeksiyon-güvenli: 11px altı yazı yok, kritik metinde düşük kontrast yok.
- Geist Sans ana font kalmalı; Geist Mono sadece hash/hesap ID/token ID/sayısal proof değerleri için (mevcut desen zaten böyle, koru).

Önerilen yeni class'lar (mevcut `.btn` `.field` `.panel` `.label-eyebrow`'a ek, isim çakışması olmasın):
- `.app-shell` — sayfanın en dış kabuğu, mimari arkaplanı taşıyan katman.
- `.architectural-bg` — taş/azulejo doku katmanı (pseudo-element veya ayrı div, sadece CSS/gradient).
- `.glass-panel` — yarı saydam, hafif blur'lu yüzey (kartlar/paneller için `.panel`'in "premium" versiyonu).
- `.evidence-panel` — HashScan/Mirror Node kanıtlarının göründüğü kutular için (EvidenceLink çevresi, buy result kutusu).
- `.metric-tile` — Sent/Protocol fee/Received gibi tekil büyük sayı gösteren kutular için.

Özel dosya gereksinimleri:
- **ErrorCard:** `hederaStatus` mevcut olduğunda headline bir "ağ hükmü" (network verdict) gibi hissettirmeli — premium ve tipografik, jenerik kırmızı alert değil. Kırmızı/hata anlamı kalsın ama abartısız. `headline`'ı seçen mantığa dokunma.
- **BuyerView:** En güçlü kolon olmalı. Buy sonucu bir "settlement evidence module" gibi görünmeli. Sent / Protocol fee / Received üç ayrı `metric-tile` olmalı — Protocol fee hafifçe vurgulanabilir ama üçlü hikayeyi (100 → 2 → 98) gölgelememeli. ENS proof badge'leri ve HashScan linki dekorasyon değil kanıt gibi hissettirilmeli.
- **page.tsx:** Header editorial ve "sahne hazır" hissetmeli, pazarlama landing page'i olmamalı. Mobilde üç view'ın da mount kalması korunmalı (CSS ile gizleme). Masaüstünde üç kolon "bağlantısız üç kart" değil, "birleşik bir protokol konsolu" gibi okunmalı. Audit timeline + cap table "herkese açık kanıt katmanı" gibi hissettirilmeli.

Çıktını bitirmeden önce kendi cevabını kontrol et: yanlışlıkla bir mantık/copy değişikliği yaptın mı diye bak.

---

## Şu anki tam dosya içerikleri

### `app/globals.css` (değiştirilecek dosyanın tamamı)

```css
@import "tailwindcss";

/*
 * PPREV design tokens.
 *
 * One scale, two themes. Components reference these rather than picking zinc-200
 * here and zinc-300 there, which is how a screen ends up with six greys that are
 * almost the same and none of them deliberate.
 */
:root {
  --background: #fafaf9;
  --surface: #ffffff;
  --surface-sunken: #f5f5f4;
  --foreground: #1c1917;
  --muted: #78716c;
  --faint: #a8a29e;
  --border: #e7e5e4;
  --border-strong: #d6d3d1;
  --accent: #1c1917;
  --accent-foreground: #ffffff;
  --ring: rgba(28, 25, 23, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0b;
    --surface: #141416;
    --surface-sunken: #1b1b1f;
    --foreground: #f5f5f4;
    --muted: #a1a1aa;
    --faint: #71717a;
    --border: #26262b;
    --border-strong: #34343a;
    --accent: #fafafa;
    --accent-foreground: #0a0a0b;
    --ring: rgba(255, 255, 255, 0.14);
  }
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-sunken: var(--surface-sunken);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-line: var(--border);
  --color-line-strong: var(--border-strong);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  -webkit-font-smoothing: antialiased;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

::selection {
  background: var(--accent);
  color: var(--accent-foreground);
}

:focus-visible {
  outline: 2px solid var(--foreground);
  outline-offset: 2px;
}

.scroll-quiet::-webkit-scrollbar {
  width: 6px;
}
.scroll-quiet::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}
.scroll-quiet::-webkit-scrollbar-track {
  background: transparent;
}

@layer components {
  .btn {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium
           transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-foreground);
  }
  .btn-primary:hover:not(:disabled) {
    opacity: 0.88;
  }
  .btn-secondary {
    border: 1px solid var(--border-strong);
    color: var(--foreground);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-sunken);
  }
  .btn-sm {
    @apply rounded-md px-2.5 py-1 text-xs;
  }

  .field {
    @apply rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    color: var(--foreground);
  }
  .field::placeholder {
    color: var(--faint);
  }
  .field:focus {
    border-color: var(--border-strong);
    outline: none;
    box-shadow: 0 0 0 3px var(--ring);
  }

  .panel {
    @apply rounded-2xl p-5;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .label-eyebrow {
    @apply text-[10px] font-semibold uppercase tracking-[0.08em];
    color: var(--faint);
  }
}
```

Bu dosyada değiştirebileceklerin: renk değerleri, tipografi ölçeği (yeni `--font-size-*` / `text-[Npx]` değerleri önerebilirsin), `.btn` `.field` `.panel` `.label-eyebrow` class tanımları, yeni component class'ları ekleme (`.eyebrow`, `.stat`, vs.). Değiştiremeyeceğin: `--color-*` `@theme inline` bloğundaki değişken *isimleri* (Tailwind bunlara referans veriyor, isim değişirse her yerde kırılır) — sadece hex/renk *değerlerini* değiştir.

### `app/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { SellerView } from "@/app/views/SellerView";
import { VerifierView } from "@/app/views/VerifierView";
import { BuyerView } from "@/app/views/BuyerView";
import { AuditTimeline } from "@/app/views/AuditTimeline";
import { CapTable } from "@/app/views/CapTable";
import type { Attestation } from "@/lib/api-types";

const TABS = [
  { key: "seller", label: "Seller" },
  { key: "verifier", label: "Verifier" },
  { key: "buyer", label: "Buyer" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("seller");
  const [attestations, setAttestations] = useState<Record<string, Attestation>>({});

  function handleApproved(propertyId: string, attestation: Attestation) {
    setAttestations((prev) => ({ ...prev, [propertyId]: attestation }));
  }

  return (
    <div className="flex flex-1 flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">PPREV</h1>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-[var(--muted)]">
              A fractional real-estate protocol: no token without a verified property, no share without proof
              of eligibility.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--faint)]">
            <span className="rounded-md border border-[var(--border)] px-2 py-1">Hedera</span>
            <span className="rounded-md border border-[var(--border)] px-2 py-1">World ID</span>
            <span className="rounded-md border border-[var(--border)] px-2 py-1">ENS</span>
          </div>
        </div>
      </header>

      {/* Mobile: tab switcher */}
      <nav className="flex gap-1 border-b border-[var(--border)] bg-[var(--surface)] p-2 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/*
        Each view is mounted exactly ONCE and shown/hidden with CSS only.
        Below `lg` only the active tab is visible; from `lg` up all three sit side by side.
      */}
      <main className="flex-1 p-4 sm:p-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:p-6">
        <div
          className={`${activeTab === "seller" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-[var(--border)] lg:bg-[var(--surface)] lg:p-5`}
        >
          <SellerView attestations={attestations} />
        </div>
        <div
          className={`${activeTab === "verifier" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-[var(--border)] lg:p-5`}
        >
          <VerifierView onApproved={handleApproved} />
        </div>
        <div
          className={`${activeTab === "buyer" ? "block" : "hidden"} lg:block rounded-2xl lg:border lg:border-[var(--border)] lg:bg-[var(--surface)] lg:p-5`}
        >
          <BuyerView />
        </div>
      </main>

      <section className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <AuditTimeline />
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <CapTable />
          </div>
        </div>
      </section>
    </div>
  );
}
```

### `app/components/common/ActionCard.tsx` (her adımın temel birimi)

```tsx
export function ActionCard({ title, description, disabledReason, techNote, children }) {
  const match = /^(\d+(?:-\d+)?\.)\s*(.*)$/.exec(title);
  const [step, heading] = match ? [match[1], match[2]] : [null, title];

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline gap-2">
        {step && <span className="tabular text-xs font-semibold text-[var(--faint)]">{step}</span>}
        <h3 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">{heading}</h3>
      </div>
      {description && <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>}
      {children && <div className="mt-3.5">{children}</div>}
      {disabledReason && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
          <LockIcon /><span>{disabledReason}</span>
        </p>
      )}
      {techNote && <p className="mt-3 text-xs leading-relaxed text-[var(--faint)]">{techNote}</p>}
    </section>
  );
}
```

`title` prop'undaki "1. Selfie Check" gibi bir string, regex ile "1." ve "Selfie Check" olarak ayrılıyor — bu mantığı bozma, sadece `step` ve `heading`'in görsel sunumunu değiştirebilirsin.

### `app/components/common/StatusBadge.tsx`

```tsx
type Status = "idle" | "pending" | "success" | "error" | "info";

const STYLES: Record<Status, { chip: string; dot: string }> = {
  idle: { chip: "bg-[var(--surface-sunken)] text-[var(--muted)] ring-1 ring-[var(--border)]", dot: "bg-[var(--faint)]" },
  pending: { chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900", dot: "bg-amber-500" },
  success: { chip: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900", dot: "bg-emerald-500" },
  error: { chip: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900", dot: "bg-red-500" },
  info: { chip: "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900", dot: "bg-blue-500" },
};

export function StatusBadge({ status, children }) {
  const style = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      {children}
    </span>
  );
}
```

Renk körü/ekran görüntüsü için nokta + renk ikisi birlikte var — bu deseni koru, sadece renk paletini yeni tokenlara uydur.

### `app/components/common/ErrorCard.tsx` (altın anlardan biri — özenle tasarla)

```tsx
export function ErrorCard({ error, note }) {
  const isApiError = error instanceof ApiRequestError;
  const fromNetwork = isApiError && Boolean(error.hederaStatus);
  const headline = fromNetwork ? error.hederaStatus : isApiError ? error.code : "ERROR";

  return (
    <div className={`overflow-hidden rounded-xl border bg-red-50 dark:bg-red-950/40 ${fromNetwork ? "border-red-400/70 dark:border-red-800" : "border-red-300/70 dark:border-red-900/70"}`}>
      {fromNetwork && (
        <div className="border-b border-red-200 bg-red-100 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Rejected by the Hedera network
        </div>
      )}
      <div className="p-4">
        <p className={`break-all font-mono font-bold leading-tight text-red-700 dark:text-red-300 ${fromNetwork ? "text-lg" : "text-sm"}`}>{headline}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-red-700/80 dark:text-red-300/80">{error.message}</p>
        {fromNetwork && <p className="mt-2 font-mono text-[11px] text-red-600/60 dark:text-red-400/60">code: {error.code}</p>}
        {note && <p className="mt-3 border-t border-red-200 pt-3 text-xs leading-relaxed text-red-700/70 dark:border-red-900 dark:text-red-300/70">{note}</p>}
      </div>
    </div>
  );
}
```

`fromNetwork` true olduğunda `headline` ekranda büyük ve mono font'la görünmeli — bu "protokol seni reddetti, biz değil" mesajının görsel ispatı. Bu component'i editorial fintech dilinde nasıl daha çarpıcı yapabileceğini özellikle düşün (örn. büyük negatif-space, güçlü tipografi kontrastı).

### `app/components/common/EvidenceLink.tsx`, `PrivacyNote.tsx`, `StepIndicator.tsx`

```tsx
// EvidenceLink.tsx
export function EvidenceLink({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 underline decoration-blue-600/25 underline-offset-[3px] transition-colors hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/25 dark:hover:decoration-blue-400">
      {label}
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 fill-none stroke-current stroke-[1.75]" aria-hidden>
        <path d="M4 2h6v6" /><path d="M10 2 2.5 9.5" />
      </svg>
    </a>
  );
}

// PrivacyNote.tsx
export function PrivacyNote({ children }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
      <svg viewBox="0 0 16 16" className="mt-[2px] h-3 w-3 shrink-0 fill-none stroke-current stroke-[1.5]" aria-hidden>
        <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

// StepIndicator.tsx
export function StepIndicator({ steps, activeIndex }) {
  return (
    <ol className="flex flex-wrap items-center gap-1">
      {steps.map((label, i) => {
        const state = i === activeIndex ? "active" : i < activeIndex ? "done" : "todo";
        const styles = state === "active" ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold"
          : state === "done" ? "text-[var(--muted)]" : "text-[var(--faint)]";
        return (
          <li key={label} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${styles}`}>
            <span className="tabular" aria-hidden>{state === "done" ? "✓" : i + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

### `app/views/BuyerView.tsx` — en kritik dosya, tam JSX (return bloğu)

Not: state/handler kısmı (dosyanın üst yarısı, `useState`/`useEffect`/`async function`'lar) burada verilmedi çünkü zaten dokunulmayacak. Sadece `return (...)` bloğundaki JSX aşağıda — bu blok içindeki markup yapısını ve className'leri değiştirebilirsin, koşulları (`{ens && ...}`, `{buyResult && ...}` gibi) değiştiremezsin.

```tsx
return (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Buyer</h2>
      <StepIndicator steps={STEPS} activeIndex={step} />
    </div>

    <ActionCard title="Demo helpers" description="Seed PROP-001 (the KYC-denied and secondary-fee golden scenes run on top of it)." techNote="Development only — returns 404 in production. Re-seed before the secondary scene: each run permanently moves shares from buyer1 to buyer2.">
      <button onClick={handleSeed} disabled={busy === "seed" || !adminSecret.trim()} className="btn btn-secondary btn-sm">
        {busy === "seed" ? "Seeding..." : "Seed PROP-001"}
      </button>
      {seedResult && (
        <p className="mt-2 text-xs text-emerald-600">
          Seeded {seedResult.properties.join(", ")} · token {seedResult.tokenId} · {seedResult.elapsedMs}ms
          {!seedResult.rebalanced.ok && <span className="block text-amber-600">Share reservoir exhausted — the secondary scene will fail. Run `npm run stage` before presenting.</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} placeholder="admin secret" className="field" />
        <button onClick={handleClearReplay} disabled={busy === "replay" || !adminSecret} className="btn btn-secondary btn-sm">
          {busy === "replay" ? "Clearing..." : "Clear World replay guard"}
        </button>
        {clearedCount !== null && <span className="text-xs text-emerald-600">{clearedCount} proof digest(s) forgotten.</span>}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">Run this between rehearsals. It forgets used World proofs only — seeded properties, sessions and chain state survive.</p>
    </ActionCard>

    <ActionCard title="0. Pick a property" description="Golden scenes run on PROP-001; type any live property id." techNote="Discovery is live; settlement is not. The client resolves each property's config from ENS before it renders, but transfers still read the token from the server's own record.">
      <div className="flex flex-wrap items-center gap-2">
        <input value={propertyId} onChange={(e) => { setPropertyId(e.target.value.trim().toUpperCase()); setEns(null); setKyc(null); setBuyResult(null); }} placeholder="PROP-001" className="field w-36 font-mono" />
        <button onClick={loadEns} disabled={busy === "ens"} className="btn btn-primary">
          {busy === "ens" ? "Reading..." : ens ? "Re-read live ENS config" : "Read live ENS config"}
        </button>
      </div>
      {ens && (
        <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs">
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge status="info">{ens.name}</StatusBadge>
            <StatusBadge status="success">Source: {ens.source === "ens" ? "ENS Sepolia · live" : "env-fallback"}</StatusBadge>
            <StatusBadge status={ens.mode === "SALE" ? "idle" : "pending"}>{ens.mode}</StatusBadge>
          </div>
          <table className="w-full text-left">
            <tbody>
              {Object.entries(ens.records).map(([k, v]) => (
                <tr key={k} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-2 font-mono text-[var(--faint)]">{k}</td>
                  <td className="py-1 font-mono break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[var(--muted)]">
            Resolved at {new Date(ens.resolvedAt).toLocaleTimeString()}. Tokenizing republishes the token id in the background, so a read taken while that write is confirming still shows the previous run&apos;s id — re-read to pick up the new one. Reads are cached for up to 60s: an unchanged timestamp means the same resolution was served again, not that the value was re-confirmed.
          </p>
        </div>
      )}
    </ActionCard>

    <ActionCard title="1-2. Pick an account + Association" description="buyer1/buyer2 are KYC'd test accounts; nokyc is deliberately un-KYC'd." disabledReason={!ens ? "Read the ENS config first." : undefined}>
      <div className="flex flex-wrap gap-2">
        {["buyer1", "buyer2", "nokyc"].map((k) => (
          <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${buyerKey === k ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black" : "border-[var(--border-strong)] "}`}>
            <input type="radio" className="hidden" checked={buyerKey === k} onChange={() => setBuyerKey(k)} disabled={!ens} />
            {k}
          </label>
        ))}
      </div>
      <label className="mt-3 block text-xs text-[var(--muted)]">
        Hedera account for {buyerKey}
        <input value={buyerAccountId} onChange={(e) => setAccounts((prev) => ({ ...prev, [buyerKey]: e.target.value }))} placeholder="0.0.xxxxxx" className="field mt-1 block w-full font-mono" />
      </label>
      {!buyerAccountId && <p className="mt-1 text-xs text-amber-600">/api/health returned no id for {buyerKey}. Check the backend&apos;s .env, or paste the id above.</p>}
      <p className="mt-2 text-xs text-[var(--muted)]">Being associated does not grant a right to buy — only KYC does.</p>
    </ActionCard>

    <ActionCard title="3. Identity Check → KYC" description="World Identity confirms 18+/jurisdiction; a TokenGrantKycTransaction fires server-side." disabledReason={!ens ? "Read the ENS config first." : buyerKey === "nokyc" ? "nokyc is deliberately never granted KYC (golden scene)." : undefined}>
      {buyerKey !== "nokyc" && (
        <div className="flex flex-wrap items-center gap-2">
          <WorldVerifyButton action="verify-buyer" signal={`${propertyId}:${buyerAccountId}`} label={busy === "kyc" ? "Verifying..." : "Grant KYC via Identity Check"} disabled={!ens || !buyerAccountId || busy === "kyc"} onProof={handleBuyerProof} />
          <button onClick={doDevKyc} disabled={!ens || !adminSecret || !buyerAccountId || busy === "kyc"} title="Requires the admin secret entered in Demo helpers above." className="rounded-md border border-dashed border-amber-400 px-3 py-1.5 text-xs text-amber-700 disabled:opacity-50 dark:text-amber-400">
            Dev: grant without World proof
          </button>
        </div>
      )}
      {kyc && (
        <div className="mt-2 flex flex-col gap-1">
          <StatusBadge status="success">KYC_GRANTED</StatusBadge>
          <EvidenceLink href={kyc.hashscanUrl} label="View on HashScan" />
        </div>
      )}
      <PrivacyNote>Only age≥18 is requested; no name, address, nationality, or document image is collected, and the raw proof is never stored.</PrivacyNote>
    </ActionCard>

    <ActionCard title="4. Buy" description="primary: fresh property (treasury exemption, no fee) · secondary: buyer1→buyer2 (2% fee above 50 shares — below that the 1-share floor dominates) · nokyc: deliberate rejection">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="field">
          <option value="primary">primary (operator → buyer)</option>
          <option value="secondary">secondary (buyer1 → buyer2, 2% fee at 100 shares)</option>
          <option value="nokyc">nokyc (operator → nokyc — expect REJECTION)</option>
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={1} max={1000} className="field w-24" />
        <button onClick={doBuy} disabled={busy === "buy" || !Number.isInteger(amount) || amount < 1 || amount > 1000} className="btn btn-primary">
          {busy === "buy" ? "Processing..." : "Buy / attempt"}
        </button>
      </div>

      {buyResult && (
        <div className="mt-3 overflow-hidden rounded-xl border border-emerald-300/70 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="border-b border-emerald-200 bg-emerald-100 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400">
            Transfer settled on Hedera
          </div>
          <div className="p-4">
            <p className="font-mono text-[13px] text-emerald-800 dark:text-emerald-300">
              {buyResult.from} <span className="text-emerald-600/60">→</span> {buyResult.to}
            </p>
            {/* THE THREE NUMBERS — must stay visually separate, this is golden moment #2 */}
            <dl className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-emerald-200 text-center dark:border-emerald-900">
              <div className="border-r border-emerald-200 bg-white/70 p-3 dark:border-emerald-900 dark:bg-black/20">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700/60 dark:text-emerald-400/60">Sent</dt>
                <dd className="tabular mt-1 font-mono text-2xl font-semibold leading-none">{buyResult.amount}</dd>
              </div>
              <div className="border-r border-emerald-200 bg-white/70 p-3 dark:border-emerald-900 dark:bg-black/20">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700/60 dark:text-emerald-400/60">Protocol fee</dt>
                <dd className="tabular mt-1 font-mono text-2xl font-semibold leading-none">{buyResult.assessedCustomFees.reduce((sum, f) => sum + f.amount, 0)}</dd>
              </div>
              <div className="bg-white/70 p-3 dark:bg-black/20">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700/60 dark:text-emerald-400/60">Received</dt>
                <dd className="tabular mt-1 font-mono text-2xl font-semibold leading-none">{buyResult.netAmount}</dd>
              </div>
            </dl>
            {buyResult.assessedCustomFees.length > 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-400/80">
                {buyResult.feeFloorApplied ? `The fee floor applied: 1 share minimum, an effective ${(buyResult.effectiveFeeRate * 100).toFixed(1)}% at this size, not 2%` : "The 2% fee"} was assessed by Hedera itself and routed to {buyResult.assessedCustomFees[0].collectorAccountId} — the app never moves it.
              </p>
            ) : (
              <p className="mt-3 text-xs text-emerald-700/80 dark:text-emerald-400/80">No fee — the treasury is exempt from its own fee schedule.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {buyResult.ensCheck === "match" ? (
                <StatusBadge status="success">ENS confirmed the token before the transfer</StatusBadge>
              ) : buyResult.ensCheck === "stale" ? (
                <StatusBadge status="pending">ENS record still names the previous token (republishing)</StatusBadge>
              ) : (
                <StatusBadge status="idle">ENS unavailable — fell back to local config</StatusBadge>
              )}
            </div>
            {buyResult.replayed && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                Nothing moved: this repeated the previous request within 30 seconds and was not executed again. The transaction below is the earlier one — real, but not new.
              </p>
            )}
            <div className="mt-3"><EvidenceLink href={buyResult.hashscanUrl} label="View on HashScan" /></div>
          </div>
        </div>
      )}
    </ActionCard>

    {error && (
      <ErrorCard error={error} note={error instanceof ApiRequestError && error.code === "KYC_DENIED" && Boolean(error.hederaStatus) ? "Golden scene: the compliance gate runs at the network level — a transfer to an unverified wallet is rejected by the protocol." : undefined} />
    )}
  </div>
);
```

### `app/views/SellerView.tsx`, `VerifierView.tsx`, `AuditTimeline.tsx`, `CapTable.tsx`

Bu dörtü de aynı desenleri kullanıyor (`ActionCard` > başlık/badge/buton/tablo), yapısal olarak `BuyerView` ile aynı diyalektte. Ana farklar:

- `SellerView.tsx`: `StepIndicator` steps = `["Selfie", "Upload", "Review", "Tokenize", "ENS"]`, bir dosya yükleme input'u (`<input type="file" multiple>`), ve `bg-amber-500` gibi hardcoded renkli bir "dev bypass" butonu var (`app/views/SellerView.tsx` satır ~229-235) — bunu da token'lara bağlayabilirsin ama "dev only" görünümünü koru (turuncu/amber tonu kalsın, production'da karışmasın diye kasıtlı çirkin/dikkat çekici tutulmuş).
- `VerifierView.tsx`: Approve/Reject butonları şu an hardcoded `bg-emerald-600` / `bg-red-600` (component class'ı kullanmıyor, `.btn-primary` değil) — bunları `.btn` sistemine taşımak istersen serbestsin, ama "Approve yeşil, Reject kırmızı" ayrımı kalmalı (net insan kararı, renkle pekiştiriliyor). 4 checkbox'lı bir inceleme listesi var, `<input type="checkbox">` native — dilersen custom checkbox stiliyle sarabilirsin ama `checked`/`onChange` prop'larına dokunma.
- `AuditTimeline.tsx`: Kaydırılabilir bir event listesi (`scroll-quiet` class'ı zaten tanımlı, kullan), her satırda `#sequenceNumber`, `StatusBadge`, saat.
- `CapTable.tsx`: Bir "Σ total / TOTAL_SUPPLY shares" invariant kutusu (en üstte, en önemli sayı) + altında tam bir `<table>`. Bu invariant kutusu editorial fintech dilinde büyütülüp öne çıkarılabilir — cap table'ın en güçlü tek cümlesi bu.

Bu dört dosyanın tam JSX'ini istersen ayrıca sorarım; öncelik BuyerView + globals.css + common components, çünkü demo puanını en çok onlar belirliyor ve deadline yakın.

---

## Beklenen çıktı formatı

Lütfen şu formatta yanıt ver, dosya dosya:

```
### app/globals.css
[tam dosya]

### app/components/common/ActionCard.tsx
[değişen kısım, "eski → yeni" net şekilde]

...
```

Her dosya için 1-2 cümlelik "neden" notu ekle. Kod bloklarının dışında uzun açıklama yazma — zamanım kısıtlı, doğrudan uygulanabilir kod istiyorum.
