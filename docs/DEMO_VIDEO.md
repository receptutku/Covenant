# Demo videosu — çekim senaryosu

_Covenant · ETHGlobal Lisbon 2026 · hedef süre: 3 dakika_

## ETHGlobal'in bağlayıcı şartları

Finalist ödüllerine başvurabilmek için video şunları sağlamak **zorunda**:

- **2-4 dakika arası.** Alt sınır da bağlayıcı — 2 dakikanın altına düşersen başvuru geçersiz.
  Senaryo 3 dakikayı hedefliyor, iki yönde de payımız var. Kurguda fazla kesme.
- **En az 720p.** `Cmd+Shift+5` ile tam ekran kaydı zaten 1080p+ verir.
- **Net ses, müzik değil.** Arka plan müziği koyma; konuşma anlaşılır olmalı.

⚠️ **Mikrofon tuzağı:** `Cmd+Shift+5` → **Options** → **Microphone** → cihazını seç.
Varsayılan **None**. Bunu atlarsan sessiz bir video çekmiş olursun ve baştan başlarsın. Asıl
çekimden önce 10 saniyelik deneme çek, izle, sesin duyulduğunu doğrula.

---

## Çekimden önce — 10 dakikalık hazırlık

**Recep'in tarafı:**

- [ ] `npm run dev` çalışıyor, tünel açık, adres sende güncel
- [ ] `npm run stage` → `npm run preflight` → "All green. Go."
- [ ] Laptop uykuya geçmiyor, şarjda

**Senin tarafın:**

- [ ] Buyer → admin secret → **"Clear World replay guard"** ← bu olmadan Selfie ilk adımda ölür
- [ ] Pencere tam genişlik, üç kolon yan yana
- [ ] Tarayıcı zoom %100, bookmark çubuğu gizli (`Cmd+Shift+B`)
- [ ] Sadece üç sekme açık: uygulama, simulator, HashScan
- [ ] Rahatsız Etmeyin **açık**, telefon sessizde
- [ ] Masaüstünde dağınıklık görünmüyor

**Kayıt:** `Cmd+Shift+5` → "Record Entire Screen" → Options → mikrofon seç.

**Tek seferde mükemmel çekmeye çalışma.** Sahne sahne çek, sonra birleştir. Bir cümleyi
bozarsan 3 saniye sus ve o cümleyi baştan söyle — kurguda temiz kesersin.

---

## SAHNE 1 — Problem (0:00 – 0:20)

**Ekran:** Üç kolonlu genel görünüm, hiçbir şeye tıklamadan.

> **"Fractional real-estate platforms ask you to trust two things you can't check: that the**
> **property is real and belongs to the seller, and that the people you're trading with are**
> **allowed to be there.**
>
> **The usual answer is a company that verified everyone and promises it did — plus a database**
> **of passport scans waiting for a breach.**
>
> **Covenant replaces both promises with checks that hold without us."**

**Türkçe:** Kesirli gayrimenkul platformları kontrol edemeyeceğin iki şeye güvenmeni ister:
mülkün gerçek olduğuna ve satıcıya ait olduğuna, ve işlem yaptığın kişilerin orada olmaya
hakkı olduğuna. Alışılmış cevap, herkesi doğruladığını söyleyen bir şirket — ve bir ihlali
bekleyen pasaport taramaları veritabanı. Covenant her iki vaadi de bizsiz ayakta duran
kontrollerle değiştiriyor.

---

## SAHNE 2 — Satıcı kapısı (0:20 – 0:45)

**Ekran:** Seller → "Verify with Selfie (World ID)" → QR → simulator (v4) → "Session active"

⚠️ Simulator adımı ~20 saniye sürüyor. **Kurguda hızlandır veya kes** — izleyici QR'ı
beklemesin. Ama toplam süreyi 2 dakikanın altına düşürme.

> **"Before anyone can list a property, they pass World ID's Selfie Check. This does not prove**
> **ownership — it prevents one actor from posting forty plausible listings to farm deposits.**
>
> **We receive a proof of humanity and a session token. Never an identity."**

**Türkçe:** Kimse mülk ilanı veremeden önce World ID'nin Selfie Check'inden geçiyor. Bu
sahipliği kanıtlamıyor — tek bir aktörün depozito toplamak için kırk makul ilan açmasını
engelliyor. Biz bir insanlık kanıtı ve oturum anahtarı alıyoruz. Kimlik değil.

---

## SAHNE 3 — Doğrulayıcı + kurcalama testi (0:45 – 1:15)

**Ekran:** Belge yükle → Submit → Verifier'da Load pending → 4 kutu → Approve → sonra
**"Tamper test"**.

> **"Documents go to a human reviewer. Approval is an Ed25519 signature binding the property,**
> **the seller, the document root and an expiry into one payload.**
>
> **Watch what happens if we corrupt one field of that attestation and try to mint anyway."**
>
> _(Tamper test'e bas)_
>
> **"Rejected. And the documents themselves never leave the server — only a Merkle root goes on**
> **chain."**

**Türkçe:** Belgeler bir insan doğrulayıcıya gidiyor. Onay, mülkü, satıcıyı, belge kökünü ve
son kullanma tarihini tek bir yükte birleştiren bir Ed25519 imzası. Bu attestation'ın tek bir
alanını bozup yine de basmayı denersek ne oluyor, bakın. Reddedildi. Ve belgelerin kendisi
sunucudan hiç çıkmıyor — zincire sadece bir Merkle kökü gidiyor.

---

## SAHNE 4 — Tokenizasyon (1:15 – 1:30)

**Ekran:** Seller → Refresh status → Approved → **Tokenize (HTS)** → tokenId + HashScan.
Linke tıkla, token sayfasını göster.

> **"Now the token exists. A thousand shares, decimals zero, with a KYC key and a two percent**
> **fractional fee — and no fee-schedule key, so that fee can never be raised. Not by us either."**

**Türkçe:** Artık token var. Bin pay, decimals sıfır, KYC anahtarlı ve %2 kesirli ücretli — ve
fee-schedule anahtarı yok, yani o ücret asla yükseltilemez. Bizim tarafımızdan da.

---

## SAHNE 5 — ALTIN SAHNE 1, KYC reddi (1:30 – 1:55)

**Ekran:** Buyer → `nokyc` → mod `nokyc` → "Buy / attempt" → kırmızı kart.
**Kartın üzerinde birkaç saniye dur**, izleyici okusun.

> **"This account is associated with the token. It opted in. But it has never been granted KYC.**
>
> _(butona bas)_
>
> **`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. That string is not in our codebase. It comes back from**
> **Hedera's consensus nodes.**
>
> **Turn our server off, and this rule still holds. That's the difference between a compliance**
> **feature and a compliance property."**

**Türkçe:** Bu hesap token'a associate — kabul etmiş. Ama hiç KYC verilmemiş.
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. Bu metin bizim kod tabanımızda yok, Hedera'nın consensus
node'larından geliyor. Sunucumuzu kapatın, bu kural yine geçerli. Bir uyum özelliği ile bir
uyum niteliği arasındaki fark bu.

---

## SAHNE 6 — ALTIN SAHNE 2, %2 ücret (1:55 – 2:20)

**Ekran:** `buyer2` → mod `secondary` → 100 → Buy → **Sent 100 / Fee 2 / Received 98**.
Altındaki yeşil ENS rozetini de göster.

> **"A secondary transfer. The sender is debited a hundred, the network takes two against the**
> **token's own immutable schedule, and the buyer receives ninety-eight.**
>
> **We show sent and received separately because the fee is inclusive — a single number would**
> **contradict Mirror Node's own transfer list for this exact transaction.**
>
> **And ENS was checked before the shares moved: a record naming a token this protocol did not**
> **create returns `ENS_CONFIG_MISMATCH`, and nothing moves."**

**Türkçe:** İkincil transfer. Gönderenden yüz düşüyor, ağ token'ın kendi değiştirilemez
tarifesine göre iki alıyor, alıcı doksan sekiz alıyor. Gönderilen ve alınanı ayrı gösteriyoruz
çünkü ücret dahil — tek sayı, tam bu işlemin Mirror Node'daki transfer listesiyle çelişirdi. Ve
paylar hareket etmeden önce ENS kontrol edildi: bu protokolün oluşturmadığı bir token'ı
gösteren kayıt `ENS_CONFIG_MISMATCH` döndürür ve hiçbir şey hareket etmez.

---

## SAHNE 7 — Kanıt (2:20 – 2:45)

**Ekran:** Evidence → "Read the audit trail" → olayları göster → **"Raw Mirror Node JSON"**
linkine tıkla, ham JSON'u göster → geri dön → Cap table → "Read holders" → **Σ 1000 / 1000 ✓**.

> **"None of this has to be taken on trust. The audit trail is read from Mirror Node, not from**
> **our database, and the raw endpoint is one click away.**
>
> **The cap table is fetched by the browser straight from Hedera. Every share is accounted for —**
> **and the token has no supply key, so this total can never grow. The un-KYC'd account is right**
> **there, holding zero."**

**Türkçe:** Bunların hiçbirine güvenmek zorunda değilsiniz. Denetim izi veritabanımızdan değil
Mirror Node'dan okunuyor ve ham adres bir tık ötede. Cap table'ı tarayıcı doğrudan Hedera'dan
çekiyor. Her pay hesaplı — ve token'ın supply anahtarı yok, yani bu toplam asla büyüyemez.
KYC'siz hesap orada, sıfır tutuyor.

---

## SAHNE 8 — Dürüst kapanış (2:45 – 3:00)

**Ekran:** Genel görünüme dön.

> **"What we deliberately don't claim: this proves a document's integrity and its timestamp. It**
> **does not prove the document came from the land registry — that needs zkTLS against the**
> **registry's service, and it's the core work after this hackathon.**
>
> **One core, two modes: a sale settles as a KYC-gated share transfer, a rental as an escrow**
> **release. Same verifier, same World actions, same ENS records.**
>
> **Covenant. No token without a verified property, no share without proof of eligibility."**

**Türkçe:** Bilerek iddia etmediğimiz şey: bu, bir belgenin bütünlüğünü ve zaman damgasını
kanıtlıyor. Belgenin tapu dairesinden geldiğini kanıtlamıyor — bunun için tapunun servisine
karşı zkTLS gerekiyor ve bu hackathon sonrasının asıl işi. Tek çekirdek, iki mod: satış KYC
kapılı bir pay transferiyle, kiralama bir escrow serbest bırakmasıyla sonlanıyor. Aynı
doğrulayıcı, aynı World action'ları, aynı ENS kayıtları. Covenant. Doğrulanmış mülk olmadan token
yok, uygunluk kanıtı olmadan pay yok.

---

## Kurgu notları

- **Simulator beklemelerini kes** (Sahne 2 ve varsa buyer KYC). İzleyici QR beklemesin.
- **Kırmızı ve yeşil kartlarda 2-3 saniye dur.** Jüri okuyacak.
- **Sonuna 3 saniyelik kapanış karesi koy:** proje adı + GitHub linki.
- **Süre kontrolü:** 2 dakikanın altına düşme — düşerse Sahne 3'ün belge yükleme kısmını geri
  ekle. 4 dakikayı aşarsa ilk kesilecek yer yine belge yükleme, sonra Sahne 4.
- **Altın sahnelere (5 ve 6) asla dokunma.** Video onlar için var.

## Konuşma notları

- Yavaş konuş. Aksan sorun değil, hız sorun.
- Her cümleden sonra yarım saniye dur — kurguyu kolaylaştırır.
- Cümle bozulursa panikleme: 3 saniye sus, aynı cümleyi baştan söyle, kurguda kes.
- Okuduğun belli olsun sorun değil; anlaşılmaman sorun.

## Çekimden sonra

- [ ] Videoyu izle: ses duyuluyor mu, süre 2-4 dakika arasında mı
- [ ] YouTube'a yükle (unlisted yeterli)
- [ ] Linki **README**'ye ekle
- [ ] Linki **ETHGlobal submission formuna** ekle
- [ ] Ayrı bir commit at: `docs: demo video link`
