Bu dosyayı olduğu gibi ChatGPT'ye yapıştır. Aşağıda hem projenin ne olduğu hem de şu anki gerçek kodun tamamı var — bu kod zaten bir tasarım turundan geçti (Stone + Glass Protocol yönü + Wandor'dan alınan pill-buton/mikro-etkileşim cilası), yani sıfırdan değil, bu baseline'ın üzerine çalışacaksın. Uydurma dosya/component/prop yok — yalnızca aşağıdaki gerçek koddan çalış.

---

## Projeyi tanıyalım

PPREV — parçalı gayrimenkul tokenizasyonu, ETHGlobal Lisbon 2026 için yapılmış, **çalışan ve test edilmiş** bir dApp. Next.js 16 (App Router, React 19, TypeScript strict, Tailwind v4). İki kural protokolü tanımlıyor:

1. Bir insan mülk belgelerini doğrulamadan hiçbir token oluşmaz (Verifier onayı).
2. Bir cüzdan uygunluğunu (KYC) kanıtlamadan hiçbir pay o cüzdana ulaşamaz.

İkinci kural uygulama kodu tarafından değil **Hedera ağı tarafından** zorlanıyor — bunu kanıtlamak pitch'in tamamı.

Backend (`lib/apiClient.ts`, `lib/realApi.ts`, `lib/mockApi.ts`, `lib/api-types.ts`) çalışıyor, gerçek Hedera testnet'e bağlı, üç kez uçtan uca prova geçti. **Bu dosyaları sana vermiyorum bile çünkü onlara hiç dokunulmayacak.**

### Mimari — neden tek sayfa (ÇOK ÖNEMLİ)

`app/page.tsx` tek bir sayfa. Üç kolon (Seller/Verifier/Buyer) + iki alt panel (Audit timeline, Cap table). Bu bilinçli bir tasarım:

- Seller ve Verifier state'i (`attestations`) `page.tsx`'te lifted tutuluyor. Gerçek hayatta bu iki rol ayrı oturumlar/kullanıcılar ama demo'da **Verifier onayladığında Seller'ın tokenize edebilmesi için** bu paylaşılan state kullanılıyor — backend'de "attestation'ımı getir" diye bir endpoint yok, sayfa kendisi bu bildirim kanalı.
- Üç view de **her zaman mount edilmiş kalıyor**, mobilde CSS ile gizleniyor (`block`/`hidden`). Koşullu render (`{activeTab === X && <View/>}`) yapılsaydı, görünmeyen view'ların state'i sıfırlanırdı — örneğin Verifier'a bakarken Seller'ın oturumu silinirdi.

**Bunu asla değiştirme.** Sayfayı bölmek, route eklemek, view'ları koşullu render etmek — hepsi bu paylaşılan state mekanizmasını kırar ve backend ile senkronizasyonu bozar. İstediğin kadar görsel olarak "tek akış" hissi verebilirsin (zaten aşağıda bahsedeceğim bir "flow strip" var), ama teknik olarak tek sayfa, tek mount, kalacak.

### Demo'yu taşıyan iki an

1. **Reddediliş.** Bilerek KYC'siz bırakılmış bir hesapla satın alma, `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` hatasıyla başarısız oluyor — bu string Hedera'nın konsensüs node'ları tarafından üretiliyor. `hederaStatus` mevcut olduğunda bu string ekrandaki en büyük şey olmalı. (`ErrorCard.tsx`, `fromNetwork` mantığı.)
2. **Ücret.** 100 payın ikincil transferi: 100 gönderilir, ağ 2 alır, alıcı 98 alır. Bu üç sayı ayrı gösterilmeli. (`BuyerView.tsx`, Sent/Protocol fee/Received üçlü `metric-tile` grid'i.)

---

## KESİN KURALLAR — mutlaka uy

Bu proje **çalışan ve test edilmiş** durumda. Kuralların amacı bunu böyle tutmak; ihlal edilirse çıktın kullanılamaz.

**Değiştirebileceklerin (sadece bunlar):**
- `app/globals.css` (CSS, tasarım token'ları, `@layer components`)
- `className` string'leri, her yerde
- Bir component'in `return` ifadesi içindeki markup yapısı (wrapper, grid, görsel elemanların sırası)
- `app/components/` altında kendi oluşturacağın yeni, salt-görsel component'ler

**Asla değiştiremeyeceklerin:**
- `lib/` klasöründeki hiçbir şey — backend bağlantısı, API client, tip tanımları. Bunlar sana verilmedi, var olduklarını bil ama dokunma.
- Hiçbir `useState`, `useEffect`, handler fonksiyonu, `async` çağrısı, prop imzası.
- Bileşen isimleri, export isimleri.
- Sayfa/route yapısı — yeni sayfa yok, yeni route yok, `app/page.tsx`'in tek-sayfa/tek-mount mimarisi aynen kalacak (yukarıdaki "neden tek sayfa" bölümüne bak).
- Koşullu render mantığı (`{x && <Y/>}` içindeki `x` koşulunun kendisi) — görsel çıktıyı değiştirebilirsin, koşulu değil.
- **Ekrandaki hiçbir metin.** Her cümle bilinçli yazıldı, bazıları protokolün ne yaptığına dair kanıt niteliğinde iddialar taşıyor. Bir metin yanlış görünüyorsa değiştirme, not düş.
- Yeni paket/kütüphane — ikon paketi yok, animasyon kütüphanesi yok, UI kit yok, farklı bir framework/build tool (Vite vb.) yok. Sadece inline SVG ve CSS, mevcut Next.js/Tailwind kurulumu içinde.

**Diğer zorunluluklar:**
- Hem açık hem koyu tema çalışmalı (`@media (prefers-color-scheme: dark)` deseni korunacak).
- Ekran projeksiyonla gösterilecek: 11px altı yazı yok, düşük kontrast yok.
- İçerik uzunluğu sabit — bazı kartlarda uzun açıklamalar var, kısaltamazsın.
- Test/prova güvenliği: buton `disabled` durumları, form alanlarının `value`/`onChange` bağları, hata/başarı koşulları bire bir korunmalı — bunlardan biri bile kaymışsa bir sonraki prova kırılır.

---

## Şu anki tasarım dili (baseline — buradan devam edeceksin)

**"Stone + Glass Protocol"**: taş/mermer/azulejo-mavisi mimari doku + cam yüzeyler + editorial fintech tipografi. Palet: kırık-beyaz/neredeyse-siyah/taş grisi/azulejo mavisi/oker vurgu. `app-shell` class'ı sayfa arkaplanına soyut mimari doku veriyor, `glass-panel`/`evidence-panel` yarı saydam blur'lu yüzeyler, `metric-tile` tekil büyük sayı kutuları için.

Buna ek olarak Wandor referansından alınan bir cila katmanı var: tüm butonlar (`.btn` ailesi) artık **pill şeklinde** (tam yuvarlak), hover'da hafif büyüyor (`scale(1.02)`), basınca hafif küçülüyor (`scale(0.97)`) — dokunsal bir his için. Üç kolonu bağlayan, salt-görsel bir "flow strip" var (`page.tsx`, masaüstünde: "Seller submits → Verifier approves → Buyer settles on Hedera").

Bu baseline'ı **daha da geliştirmeni** istiyorum — daha profesyonel, daha sade, daha "stüdyo kalitesinde" hissettirsin. Ama sıfırdan başlamıyorsun; aşağıdaki gerçek koddan diff üreteceksin.

### Yeni istek: güçlü bir hero/giriş bölümü — AMA yeni sayfa/route YOK

Görsel etki için `app/page.tsx`'in en üstüne, mevcut küçük header'ın yerine (veya onu genişleterek) **daha büyük, daha çarpıcı bir hero bölümü** ekle: PPREV'in ne olduğunu, iki kuralı (verified property / proof of eligibility) bir bakışta anlatan, tipografik olarak güçlü bir giriş. Bunu şu şekilde düşün: bir jüri üyesi sayfayı açtığında ilk 2 saniyede "bu ciddi bir protokol" hissini alsın, sonra hemen altında (kaydırmadan, aynı ekranda ya da bir kaydırışla) çalışan üç kolon başlasın.

**Kesin sınır: bu yeni bir sayfa/route değil.** `app/page.tsx` tek dosya, tek component, tek mount olarak kalacak — sadece görsel olarak üstüne daha güçlü bir hero eklenmiş hali. Jüri hiçbir ekstra tıklama yapmadan, ilk saniyede zaten çalışan demoya (Seller/Verifier/Buyer kolonlarına) erişebilmeli. Ayrı bir `/`, `/landing`, `/app` gibi route yapısı, navigasyon, "Try the demo" butonu ile geçiş — hiçbiri yok. Hero, aynı sayfanın en üstünde bir bölüm, o kadar.

İçerik olarak yeni cümleler uydurma — mevcut başlık ("PPREV") ve alt yazı ("A fractional real-estate protocol: no token without a verified property, no share without proof of eligibility.") zaten var, bunları büyütüp güçlendirmen yeterli. İstersen görsel olarak Hedera/World ID/ENS rozetlerini ve az önce eklenen "Seller submits → Verifier approves → Buyer settles on Hedera" akış şeridini bu hero'nun bir parçası gibi göster.

---

## Şu anki tam dosya içerikleri

### `app/globals.css`

```css
@import "tailwindcss";

/*
 * PPREV Stone + Glass Protocol.
 * Abstract Lisbon architecture in the background; protocol evidence in the foreground.
 */
:root {
  --background: #f6f3ed;
  --surface: rgba(255, 255, 255, 0.78);
  --surface-sunken: rgba(238, 234, 226, 0.86);
  --foreground: #151514;
  --muted: #625f58;
  --faint: #8f8a7f;
  --border: rgba(32, 40, 48, 0.12);
  --border-strong: rgba(32, 40, 48, 0.22);
  --accent: #101820;
  --accent-foreground: #fffdf8;
  --ring: rgba(34, 91, 122, 0.18);

  --glass: rgba(255, 255, 255, 0.62);
  --glass-strong: rgba(255, 255, 255, 0.82);
  --tile: rgba(255, 253, 248, 0.7);
  --azulejo: #225b7a;
  --azulejo-soft: rgba(34, 91, 122, 0.12);
  --ochre: #b8782f;

  --success: #116149;
  --success-soft: rgba(17, 97, 73, 0.1);
  --success-border: rgba(17, 97, 73, 0.25);
  --warning: #9a5b12;
  --warning-soft: rgba(154, 91, 18, 0.12);
  --warning-border: rgba(154, 91, 18, 0.28);
  --danger: #9f1d2f;
  --danger-soft: rgba(159, 29, 47, 0.1);
  --danger-border: rgba(159, 29, 47, 0.3);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #080b0d;
    --surface: rgba(18, 22, 25, 0.78);
    --surface-sunken: rgba(27, 32, 36, 0.88);
    --foreground: #f5f1e8;
    --muted: #bbb4a6;
    --faint: #867f74;
    --border: rgba(245, 241, 232, 0.12);
    --border-strong: rgba(245, 241, 232, 0.22);
    --accent: #f5f1e8;
    --accent-foreground: #080b0d;
    --ring: rgba(101, 171, 208, 0.2);

    --glass: rgba(16, 21, 25, 0.66);
    --glass-strong: rgba(24, 29, 33, 0.86);
    --tile: rgba(12, 16, 19, 0.72);
    --azulejo: #65abd0;
    --azulejo-soft: rgba(101, 171, 208, 0.13);
    --ochre: #d99a46;

    --success: #6fd3af;
    --success-soft: rgba(111, 211, 175, 0.12);
    --success-border: rgba(111, 211, 175, 0.28);
    --warning: #e0a85a;
    --warning-soft: rgba(224, 168, 90, 0.13);
    --warning-border: rgba(224, 168, 90, 0.3);
    --danger: #ff7b8d;
    --danger-soft: rgba(255, 123, 141, 0.13);
    --danger-border: rgba(255, 123, 141, 0.34);
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

html {
  min-height: 100%;
}

body {
  min-height: 100%;
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
  outline: 2px solid var(--azulejo);
  outline-offset: 2px;
}

.scroll-quiet::-webkit-scrollbar {
  width: 7px;
}
.scroll-quiet::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}
.scroll-quiet::-webkit-scrollbar-track {
  background: transparent;
}

@layer components {
  .app-shell {
    position: relative;
    isolation: isolate;
    min-height: 100svh;
    overflow: hidden;
    background:
      radial-gradient(circle at 16% 8%, var(--azulejo-soft), transparent 30rem),
      radial-gradient(circle at 84% 0%, rgba(184, 120, 47, 0.12), transparent 26rem),
      linear-gradient(180deg, rgba(255, 255, 255, 0.5), transparent 26rem),
      var(--background);
  }

  .app-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -2;
    pointer-events: none;
    background-image:
      linear-gradient(to right, var(--border) 1px, transparent 1px),
      linear-gradient(to bottom, var(--border) 1px, transparent 1px),
      linear-gradient(135deg, transparent 0 44%, var(--azulejo-soft) 44% 45%, transparent 45% 100%);
    background-size: 88px 88px, 88px 88px, 176px 176px;
    mask-image: linear-gradient(180deg, black 0%, rgba(0, 0, 0, 0.72) 42%, transparent 100%);
    opacity: 0.72;
  }

  .app-shell::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    backdrop-filter: blur(0.2px);
    background:
      linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent),
      radial-gradient(circle at 50% -10%, rgba(255, 255, 255, 0.42), transparent 36rem);
  }

  .architectural-bg {
    background:
      linear-gradient(180deg, var(--glass-strong), var(--glass)),
      repeating-linear-gradient(90deg, transparent 0 30px, var(--azulejo-soft) 30px 31px);
  }

  .glass-panel {
    background: var(--glass);
    border: 1px solid var(--border);
    box-shadow: 0 24px 80px rgba(10, 12, 14, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    backdrop-filter: blur(18px) saturate(1.08);
  }

  .evidence-panel {
    background: linear-gradient(180deg, var(--glass-strong), var(--glass));
    border: 1px solid var(--border-strong);
    box-shadow: 0 18px 60px rgba(10, 12, 14, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(16px) saturate(1.05);
  }

  .metric-tile {
    background: var(--tile);
    border: 1px solid var(--border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .btn {
    @apply inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold
           transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40;
    min-height: 38px;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-foreground);
    box-shadow: 0 10px 26px rgba(10, 12, 14, 0.14);
  }
  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.02);
    opacity: 0.92;
  }
  .btn-primary:active:not(:disabled) {
    transform: scale(0.97);
  }
  .btn-secondary {
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid var(--border-strong);
    color: var(--foreground);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-sunken);
    transform: translateY(-1px) scale(1.02);
  }
  .btn-secondary:active:not(:disabled) {
    transform: scale(0.97);
  }
  .btn-sm {
    @apply rounded-full px-3 py-1.5 text-xs;
    min-height: 32px;
  }

  .field {
    @apply rounded-lg px-3 py-2 text-sm transition-all duration-150;
    min-height: 38px;
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    color: var(--foreground);
  }
  .field::placeholder {
    color: var(--faint);
  }
  .field:focus {
    border-color: var(--azulejo);
    outline: none;
    box-shadow: 0 0 0 4px var(--ring);
  }

  .panel {
    @apply rounded-2xl p-5;
    background: var(--glass);
    border: 1px solid var(--border);
    backdrop-filter: blur(16px) saturate(1.05);
  }

  .label-eyebrow {
    @apply text-[11px] font-semibold uppercase tracking-[0.1em];
    color: var(--faint);
  }
}
```

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

function FlowArrow() {
  return (
    <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0 fill-none stroke-current stroke-[1.5] text-[var(--faint)]" aria-hidden>
      <path d="M1 5h13" />
      <path d="M9.5 1 14 5l-4.5 4" />
    </svg>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("seller");

  // Lifted here because Seller and Verifier are separate components/sessions in
  // real life; in this single-page demo they share state through the parent.
  // The Verifier issues the attestation, the Seller needs it to call tokenize —
  // docs/API.md has no dedicated "fetch my attestation" endpoint, so the page
  // itself acts as the notification channel between the two roles.
  const [attestations, setAttestations] = useState<Record<string, Attestation>>({});

  function handleApproved(propertyId: string, attestation: Attestation) {
    setAttestations((prev) => ({ ...prev, [propertyId]: attestation }));
  }

  return (
    <div className="app-shell flex flex-1 flex-col">
      <header className="px-4 pt-5 sm:px-8 sm:pt-7">
        <div className="glass-panel rounded-2xl px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-[34px] font-semibold leading-none tracking-[-0.05em] sm:text-[42px]">PPREV</h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">
                A fractional real-estate protocol: no token without a verified property, no share without proof
                of eligibility.
              </p>
            </div>
            {/* Which chains are actually load-bearing, stated once and without explanation. */}
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5">Hedera</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5">World ID</span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5">ENS</span>
            </div>
          </div>
        </div>
      </header>

      {/*
        Desktop-only: a purely decorative strip framing the three columns as one
        pipeline rather than three unrelated cards. No state, no links — just the
        story the layout below already tells, said once at a glance.
      */}
      <div className="mx-4 mt-3 hidden items-center justify-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--glass)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] backdrop-blur sm:mx-6 lg:flex">
        <span className="text-[var(--foreground)]">Seller submits</span>
        <FlowArrow />
        <span className="text-[var(--foreground)]">Verifier approves</span>
        <FlowArrow />
        <span className="text-[var(--foreground)]">Buyer settles on Hedera</span>
      </div>

      {/* Mobile: tab switcher */}
      <nav className="mx-4 mt-3 flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--glass)] p-1.5 backdrop-blur lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
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
        Rendering them conditionally per tab would unmount the inactive ones and
        wipe their state — e.g. the seller would lose their session just by
        looking at the verifier tab. Below `lg` only the active tab is visible;
        from `lg` up all three sit side by side.
      */}
      <main className="flex-1 p-4 sm:p-6 lg:grid lg:grid-cols-3 lg:gap-5 lg:p-6">
        <div
          className={`${activeTab === "seller" ? "block" : "hidden"} lg:block glass-panel rounded-2xl p-4 sm:p-5`}
        >
          <SellerView attestations={attestations} />
        </div>
        <div
          className={`${activeTab === "verifier" ? "block" : "hidden"} lg:block glass-panel rounded-2xl p-4 sm:p-5`}
        >
          <VerifierView onApproved={handleApproved} />
        </div>
        <div
          className={`${activeTab === "buyer" ? "block" : "hidden"} lg:block evidence-panel rounded-2xl p-4 sm:p-5`}
        >
          <BuyerView />
        </div>
      </main>

      {/*
        Full width and always visible, below all three roles: this panel is the
        claim that none of the above has to be taken on trust, and it reads from
        a public source rather than from anything the three columns own.
      */}
      <section className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="flex flex-col gap-5">
          <div className="glass-panel rounded-2xl p-4 sm:p-5">
            <AuditTimeline />
          </div>
          <div className="glass-panel rounded-2xl p-4 sm:p-5">
            <CapTable />
          </div>
        </div>
      </section>
    </div>
  );
}
```

### `app/components/common/ActionCard.tsx`

```tsx
export function ActionCard({ title, description, disabledReason, techNote, children }) {
  const match = /^(\d+(?:-\d+)?\.)\s*(.*)$/.exec(title);
  const [step, heading] = match ? [match[1], match[2]] : [null, title];

  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {step && (
          <span className="tabular mt-0.5 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-[11px] font-semibold text-[var(--azulejo)]">
            {step}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-tight tracking-[-0.01em]">{heading}</h3>
          {description && (
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {disabledReason && (
        <p className="mt-4 flex items-start gap-2 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
          <LockIcon /><span>{disabledReason}</span>
        </p>
      )}
      {techNote && <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--faint)]">{techNote}</p>}
    </section>
  );
}
// LockIcon: small inline SVG, unchanged.
```

### `app/components/common/StatusBadge.tsx`

```tsx
type Status = "idle" | "pending" | "success" | "error" | "info";

const STYLES: Record<Status, { chip: string; dot: string }> = {
  idle: { chip: "bg-[var(--surface-sunken)] text-[var(--muted)] ring-1 ring-[var(--border)]", dot: "bg-[var(--faint)]" },
  pending: { chip: "bg-[var(--warning-soft)] text-[var(--warning)] ring-1 ring-[var(--warning-border)]", dot: "bg-[var(--warning)]" },
  success: { chip: "bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[var(--success-border)]", dot: "bg-[var(--success)]" },
  error: { chip: "bg-[var(--danger-soft)] text-[var(--danger)] ring-1 ring-[var(--danger-border)]", dot: "bg-[var(--danger)]" },
  info: { chip: "bg-[var(--azulejo-soft)] text-[var(--azulejo)] ring-1 ring-[color:rgba(34,91,122,0.24)] dark:ring-[color:rgba(101,171,208,0.28)]", dot: "bg-[var(--azulejo)]" },
};

export function StatusBadge({ status, children }) {
  const style = STYLES[status];
  return (
    <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
      {children}
    </span>
  );
}
```

### `app/components/common/StepIndicator.tsx`

```tsx
export function StepIndicator({ steps, activeIndex }) {
  return (
    <ol className="flex flex-wrap items-center justify-end gap-1">
      {steps.map((label, i) => {
        const state = i === activeIndex ? "active" : i < activeIndex ? "done" : "todo";
        const styles = state === "active" ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold shadow-sm"
          : state === "done" ? "bg-[var(--azulejo-soft)] text-[var(--azulejo)]" : "text-[var(--faint)] ring-1 ring-[var(--border)]";
        return (
          <li key={label} className={`flex min-h-7 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${styles}`}>
            <span className="tabular" aria-hidden>{state === "done" ? "✓" : i + 1}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

### `app/components/common/ErrorCard.tsx` (altın an — özenle tasarla)

```tsx
export function ErrorCard({ error, note }) {
  const isApiError = error instanceof ApiRequestError;
  const fromNetwork = isApiError && Boolean(error.hederaStatus);
  const headline = fromNetwork ? error.hederaStatus : isApiError ? error.code : "ERROR";

  return (
    <div className="evidence-panel overflow-hidden rounded-2xl border-[var(--danger-border)]">
      {fromNetwork && (
        <div className="border-b border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
          Rejected by the Hedera network
        </div>
      )}
      <div className={fromNetwork ? "p-5 sm:p-6" : "p-5"}>
        <p className={`break-all font-mono font-bold leading-[0.98] tracking-[-0.04em] text-[var(--danger)] ${fromNetwork ? "text-[30px] sm:text-[36px]" : "text-base"}`}>{headline}</p>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--danger)]">{error.message}</p>
        {fromNetwork && <p className="mt-4 font-mono text-[11px] text-[var(--muted)]">code: {error.code}</p>}
        {note && <p className="mt-4 border-t border-[var(--danger-border)] pt-4 text-xs leading-relaxed text-[var(--muted)]">{note}</p>}
      </div>
    </div>
  );
}
```

### `app/components/common/EvidenceLink.tsx`, `PrivacyNote.tsx`

```tsx
// EvidenceLink.tsx
export function EvidenceLink({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-3 py-1 text-[13px] font-semibold text-[var(--azulejo)] transition-all hover:border-[var(--azulejo)] hover:bg-[var(--azulejo-soft)]">
      {label}
      <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 fill-none stroke-current stroke-[1.75]" aria-hidden>
        <path d="M4 2h6v6" /><path d="M10 2 2.5 9.5" />
      </svg>
    </a>
  );
}

// PrivacyNote.tsx
export function PrivacyNote({ children }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
      <svg viewBox="0 0 16 16" className="mt-[2px] h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.5] text-[var(--azulejo)]" aria-hidden>
        <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
```

### `app/views/BuyerView.tsx` — en kritik dosya, tam `return` bloğu

State/handler kısmı (dosyanın üst yarısı) burada verilmedi çünkü dokunulmayacak. `useState`'ler: `propertyId, buyerKey, mode, amount, accounts, ens, kyc, buyResult, seedResult, adminSecret, clearedCount, busy, error`. Handler'lar: `handleSeed, handleClearReplay, loadEns, handleBuyerProof, doDevKyc, doBuy`. `step` hesaplaması: `!ens ? 0 : !buyerAccountId ? 1 : !kyc ? 2 : !buyResult ? 3 : 4`.

```tsx
return (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Buyer</h2>
        <StepIndicator steps={STEPS} activeIndex={step} />
      </div>
    </div>

    <ActionCard title="Demo helpers" description="Seed PROP-001 (the KYC-denied and secondary-fee golden scenes run on top of it)." techNote="Development only — returns 404 in production. Re-seed before the secondary scene: each run permanently moves shares from buyer1 to buyer2.">
      <button onClick={handleSeed} disabled={busy === "seed" || !adminSecret.trim()} className="btn btn-secondary btn-sm">
        {busy === "seed" ? "Seeding..." : "Seed PROP-001"}
      </button>
      {seedResult && (
        <p className="mt-2 text-xs text-[var(--success)]">
          Seeded {seedResult.properties.join(", ")} · token {seedResult.tokenId} · {seedResult.elapsedMs}ms
          {!seedResult.rebalanced.ok && <span className="block text-[var(--warning)]">Share reservoir exhausted — the secondary scene will fail. Run `npm run stage` before presenting.</span>}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <input type="password" value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} placeholder="admin secret" className="field" />
        <button onClick={handleClearReplay} disabled={busy === "replay" || !adminSecret} className="btn btn-secondary btn-sm">
          {busy === "replay" ? "Clearing..." : "Clear World replay guard"}
        </button>
        {clearedCount !== null && <span className="text-xs text-[var(--success)]">{clearedCount} proof digest(s) forgotten.</span>}
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
        <div className="evidence-panel mt-4 rounded-2xl p-4 text-xs">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status="info">{ens.name}</StatusBadge>
            <StatusBadge status="success">Source: {ens.source === "ens" ? "ENS Sepolia · live" : "env-fallback"}</StatusBadge>
            <StatusBadge status={ens.mode === "SALE" ? "idle" : "pending"}>{ens.mode}</StatusBadge>
          </div>
          <table className="w-full text-left text-[12px]">
            <tbody>
              {Object.entries(ens.records).map(([k, v]) => (
                <tr key={k} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3 font-mono text-[var(--faint)]">{k}</td>
                  <td className="py-2 font-mono break-all text-[var(--foreground)]">{v}</td>
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
          <label key={k} className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold transition-all ${buyerKey === k ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border-strong)] bg-[var(--surface-sunken)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}>
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
          <button onClick={doDevKyc} disabled={!ens || !adminSecret || !buyerAccountId || busy === "kyc"} title="Requires the admin secret entered in Demo helpers above." className="rounded-lg border border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--warning)] disabled:opacity-50">
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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="field w-full">
          <option value="primary">primary (operator → buyer)</option>
          <option value="secondary">secondary (buyer1 → buyer2, 2% fee at 100 shares)</option>
          <option value="nokyc">nokyc (operator → nokyc — expect REJECTION)</option>
        </select>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={1} max={1000} className="field w-full" />
        <button onClick={doBuy} disabled={busy === "buy" || !Number.isInteger(amount) || amount < 1 || amount > 1000} className="btn btn-primary">
          {busy === "buy" ? "Processing..." : "Buy / attempt"}
        </button>
      </div>

      {buyResult && (
        <div className="evidence-panel mt-5 overflow-hidden rounded-2xl border-[var(--success-border)]">
          <div className="border-b border-[var(--success-border)] bg-[var(--success-soft)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--success)]">
            Transfer settled on Hedera
          </div>
          <div className="p-5">
            <p className="break-all font-mono text-[13px] leading-relaxed text-[var(--success)]">
              {buyResult.from} <span className="text-[var(--faint)]">→</span> {buyResult.to}
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="metric-tile rounded-xl p-4">
                <dt className="label-eyebrow text-[var(--muted)]">Sent</dt>
                <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">{buyResult.amount}</dd>
              </div>
              <div className="metric-tile rounded-xl border-[var(--success-border)] bg-[var(--success-soft)] p-4">
                <dt className="label-eyebrow text-[var(--success)]">Protocol fee</dt>
                <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">{buyResult.assessedCustomFees.reduce((sum, f) => sum + f.amount, 0)}</dd>
              </div>
              <div className="metric-tile rounded-xl p-4">
                <dt className="label-eyebrow text-[var(--muted)]">Received</dt>
                <dd className="tabular mt-2 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">{buyResult.netAmount}</dd>
              </div>
            </dl>
            {buyResult.assessedCustomFees.length > 0 ? (
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                {buyResult.feeFloorApplied ? `The fee floor applied: 1 share minimum, an effective ${(buyResult.effectiveFeeRate * 100).toFixed(1)}% at this size, not 2%` : "The 2% fee"} was assessed by Hedera itself and routed to {buyResult.assessedCustomFees[0].collectorAccountId} — the app never moves it.
              </p>
            ) : (
              <p className="mt-4 text-xs text-[var(--muted)]">No fee — the treasury is exempt from its own fee schedule.</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {buyResult.ensCheck === "match" ? (
                <StatusBadge status="success">ENS confirmed the token before the transfer</StatusBadge>
              ) : buyResult.ensCheck === "stale" ? (
                <StatusBadge status="pending">ENS record still names the previous token (republishing)</StatusBadge>
              ) : (
                <StatusBadge status="idle">ENS unavailable — fell back to local config</StatusBadge>
              )}
            </div>
            {buyResult.replayed && (
              <p className="mt-4 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3 text-xs leading-relaxed text-[var(--warning)]">
                Nothing moved: this repeated the previous request within 30 seconds and was not executed again. The transaction below is the earlier one — real, but not new.
              </p>
            )}
            <div className="mt-4"><EvidenceLink href={buyResult.hashscanUrl} label="View on HashScan" /></div>
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

Bunların `return` JSX'i BuyerView ile aynı desenlerde (ActionCard/StatusBadge/StepIndicator kullanımı). Önemli noktalar:

- **SellerView**: `StepIndicator` steps = `["Selfie", "Upload", "Review", "Tokenize", "ENS"]`. Dev bypass butonu `rounded-full bg-[var(--warning)] ... hover:scale-[1.02] active:scale-[0.97]`. Dosya input'u `file:` pseudo-class utilities ile stilize edilmiş. Bazı satırlarda hâlâ hardcoded `text-red-600`/`text-amber-600` var (reject reason, attestation uyarısı) — istersen bunları da token'lara bağlayabilirsin, kırık değil sadece tutarsız.
- **VerifierView**: Approve/Reject butonları `rounded-full bg-[var(--success)]` / `bg-[var(--danger)]`, hover/active scale ile. 4 checkbox'lı inceleme listesi var (`readable/matchesForm/ownerMatch/sufficient`), her checkbox artık `rounded-lg border ... bg-[var(--surface-sunken)]` kutusu içinde.
- **AuditTimeline**: `scroll-quiet` class'ı kullanılan bir event listesi, her satır `rounded-xl border ... bg-[var(--surface-sunken)]`.
- **CapTable**: `Σ total / TOTAL_SUPPLY shares` invariant kutusu `evidence-panel` ile büyütülmüş (`text-[30px]`), tablo `overflow-x-auto` wrapper içinde, `min-w-[720px]`.

Bu dördünün tam kodunu istersen ayrıca isteyeceğim; öncelik globals.css + common component'ler + BuyerView, çünkü demo puanını en çok onlar belirliyor.

---

## Beklenen çıktı formatı

Dosya dosya, "şurayı bununla değiştir" formatında, her dosya için 1-2 cümlelik "neden" notuyla. Mantık/state/copy/lib'e dokunmadığını cevabını bitirmeden önce kendi kontrol et. Kod bloklarının dışında uzun açıklama yazma.
