# Son 12 saat — plan

_Deadline: yarın sabah 09:00. Bu belge sabah uyandığında ne yapacağını söyler._

---

## Durum

**Biten:** Tüm işlevsellik. Seller → Verifier → Tokenize, iki altın sahne, World ID
entegrasyonu (her iki yol da gerçek proof'la doğrulandı), ENS canlı çözümleme, Mirror Node
denetim izi, cap table, tasarım geçişi. Üç temiz prova geçildi — **ama tasarım değişikliği o
sayacı sıfırladı.**

**Kalan zorunlu iki iş:** ETHGlobal submission formu, demo videosu.
**Kalan önemli iş:** bir tur prova, README son okuması.
**Yapmayacağımız:** rental UI, veritabanı geçişi. İkisi de bilinçli kapsam kararı ve
belgelerde öyle yazıyor.

---

## Sabah programı

Süreler gerçekçi, sıkışırsan alttan kes — üstten değil.

### 08:00 · Ortam (20 dk) — Recep + Akif

- Recep: `npm run dev`, tünel aç, **yeni adresi Akif'e at**
- Akif: `.env.local` içindeki `NEXT_PUBLIC_API_BASE_URL`'i güncelle, `npm run dev`
- Akif: `git pull --rebase origin main`
- Recep: `npm run stage` → `npm run preflight` → "All green. Go."

### 08:20 · Prova (30 dk) — Akif

Tasarım değişti, akışın hâlâ çalıştığını görmek şart. Tek tur yeter, ama tam tur.

1. Seller → Selfie → simulator v4 → Session active
2. propertyId `PROP-070` → PDF → Submit
3. Verifier → Load pending → 4 kutu → Approve
4. Verifier → Tamper test → `ATTESTATION_INVALID`
5. Seller → Refresh status → Tokenize → HashScan
6. Buyer → `PROP-001` → Read ENS
7. buyer1 → Identity Check → simulator → KYC_GRANTED
8. primary 100 → Buy → ensCheck rozeti
9. buyer2 → secondary 100 → Buy → **100 / 2 / 98**
10. nokyc → Buy → **`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`**
11. Evidence → audit trail → Raw Mirror JSON
12. Cap table → Σ 1000/1000 ✓

Bir şey patlarsa: Claude'a hangi adım + hata kodu. Patlamazsa Recep `demo-final` etiketini
atar.

**Bu provada ayrıca bakılacak üç şey** (tasarım turu bunları hiç tarayıcıda denemedi):

1. **Tema anahtarı "system" ile başlıyor.** Demo makinesi karanlık moddaysa tasarlanan
   görüntü çıkmayabilir. Her iki temayı da bir kez aç kapa, hangisiyle sunacağına karar ver
   ve sunumdan önce onu sabitle.
2. **`ActionCard` başlığı regex ile ayırıyor.** Eşleşmeyen bir başlıkta düzen bozulabilir —
   numarasız kartlara ("Demo helpers", "Sign in", "Queue is empty") göz at.
3. **Selfie kartı metni.** "No liveness proof, no document upload" cümlesi
   "Proof of a live human, without a document upload" olarak düzeltilecek. Eski hâli World
   katmanının varlık sebebini yalanlıyor gibi okunuyor.

### ETHGlobal'in bağlayıcı kuralları

Formun kendisi bunları yazıyor, üçü de zorunlu:

- **Video 2-4 dakika.** Alt sınır da bağlayıcı — finalist ödüllerine başvurmak için 2
  dakikanın altına düşmemeli. Senaryo 3 dakikayı hedefliyor, iki yönde de payımız var.
- **En az 720p, net ses, müzik yok.** `Cmd+Shift+5` zaten 1080p+ kaydeder. Ama
  **Options → Microphone**'dan cihazını seçmeyi unutma; varsayılan "None" ve bunu atlarsan
  sessiz video çekip baştan başlarsın. Asıl çekimden önce 10 saniyelik deneme çek ve izle.
- **Sık commit, halka açık repo.** Jüri kodu elle inceliyor. Bundan sonra küçük ve sık commit
  at — video linki ayrı, ekran görüntüleri ayrı.

### 08:50 · Demo videosu (60 dk) — Akif

Senaryo `docs/DEMO_VIDEO.md`'de hazır, 8 sahne, hedef 3 dakika.

Çekimden önce: Rahatsız Etmeyin açık, bookmark çubuğu gizli (`Cmd+Shift+B`), sadece üç sekme
açık (uygulama, simulator, HashScan), pencere tam genişlik.

Sahne sahne çek, tek seferde değil. Cümle bozulursa 3 saniye sus ve baştan söyle — kurguda
kesersin. Simulator beklemelerini kurguda hızlandır.

**Süre taşarsa kesme sırası:** belge yükleme → tokenize → açılış. Altın sahnelere (5 ve 6)
asla dokunma.

### 09:50 · README son okuma (30 dk) — Akif + Recep

Jüri README'ye gerçekten bakıyor. Üst yarı Akif'in, alt yarı Recep'in.

Kontrol listesi:

- [ ] Dört ekran görüntüsü GitHub'da görünüyor mu (bozuk link ikonu yok)
- [ ] İlk paragraf ne yaptığımızı bir cümlede söylüyor mu
- [ ] Track tablosundaki her satırın yanında kontrol edilebilir bir bağlantı var mı
- [ ] `docs/EVIDENCE.md` linkleri açılıyor mu
- [ ] Demo video linki eklendi mi ← **çekim biter bitmez ekle**
- [ ] "What we deliberately do not claim" bölümü duruyor mu (dürüstlük bölümü, jürinin en çok
      not aldığı yer)

### 10:20 · Submission formu (40 dk) — Akif

Metinlerin tamamı `docs/SUBMISSION.md`'de, alan alan hazır. Kopyala-yapıştır.

- [ ] Short description
- [ ] Full description
- [ ] How it's made
- [ ] Hedera track açıklaması
- [ ] World track açıklaması + iki FEEDBACK dosyasının linki
- [ ] ENS track açıklaması + `docs/FEEDBACK_ens.md` linki
- [ ] GitHub repo linki
- [ ] Demo video linki
- [ ] Ekran görüntüleri

**Formu erken gönder.** ETHGlobal formu gönderdikten sonra düzenlemeye izin veriyor. Boş
alanlarla bile gönder, sonra doldur — gönderilmemiş mükemmel bir proje sıfır puan alır.

### 11:00 · Tampon (60 dk)

Bir şey patlarsa buradan yersin. Patlamazsa: sunum provası, mentörlerin söylediklerinden
kalan küçük düzeltmeler, ya da dinlenme.

---

## Görev dağılımı

**Recep**
- Sunucu ve tünel ayakta, laptop uyumuyor
- `stage` + `preflight` her provadan önce
- Prova temizse `demo-final` etiketi
- README alt yarısı son okuma
- Video çekimi boyunca sunucu ayakta kalmalı

**Akif**
- Prova
- Video çekimi ve kurgu
- README üst yarısı + video linki
- Submission formu
- Sunum konuşması (`docs/HEDERA_TALK.md`, `docs/MENTOR_PLAN.md`)

---

## Sahnede söylenecek üç cümle

Ezberlenecek tek şey bunlar:

1. **"That string is not in our codebase — it comes back from Hedera's consensus nodes."**
   (KYC reddi anında)
2. **"Turn our server off and this rule still holds."**
   (hemen ardından)
3. **"Two honest caveats, and we'd like your opinion on the first."**
   (HCS bölümünde, kendi zayıflığını önce sen söylüyorsun)

Uzun gerekçeler `docs/MENTOR_PLAN.md` §2.4 ve §2.5'te — sadece soru gelirse aç.

---

## Bilinen sınırlamalar — sorulursa böyle cevapla

**"Veritabanı yok, durum bellekte."**
Doğru ve bilinçli. Üretimde veritabanı var, içinde belge yok — sakladığımız şey Merkle kökü
ve olay kaydı, kişisel veri değil. Hackathon kapsamında kalıcılık eklemek çalışan hiçbir
iddiayı güçlendirmezdi.

**"Sayfayı yenileyince oturum gidiyor."**
World nullifier'ı (kimlik, uygulama, action) fonksiyonu olduğu için aynı kişi ikinci kez
doğrulayamıyor. Tek bir korumaya iki iş yaptırmışız: `verify-buyer` bir kayıt, nullifier'ı
harcamak doğru; `onboard-seller` bir giriş, orada tanıdık nullifier'a yeni oturum vermek
gerekirdi. `docs/FEEDBACK_selfie.md` maddesi 3b.

**"ENS gerçekten kullanılıyor mu?"**
Kontrol ediliyor, henüz yetkili değil. Token id hâlâ sunucunun kaydından geliyor; ENS onun
üzerindeki kontrol — protokolün oluşturmadığı bir token'ı gösteren kayıt
`ENS_CONFIG_MISMATCH` döndürüyor ve hiçbir pay hareket etmiyor. Mutabakat için yetkili kılmak
bir sonraki adım.

**"Belgenin tapudan geldiğini nasıl biliyorsunuz?"**
Bilmiyoruz ve iddia etmiyoruz. Bu MVP bir belgenin bütünlüğünü ve zaman damgasını
kanıtlıyor. Provenans için tapunun servisine karşı zkTLS gerekiyor; mimaride yeri ayrılmış,
hackathon sonrasının asıl işi bu.

---

## Sahne öncesi son kontrol

- [ ] Recep'in laptopu şarjda ve uykuya geçmiyor
- [ ] Tünel ayakta, adres Akif'in `.env.local`'inde güncel
- [ ] `stage` + `preflight` yeşil, kuyruk boş
- [ ] Simulator sekmesi açık
- [ ] HashScan'de token sayfası ayrı sekmede hazır
- [ ] Bildirimler kapalı, bookmark çubuğu gizli
- [ ] Yedek: `docs/img/` altındaki dört ekran görüntüsü (wifi çökerse)
