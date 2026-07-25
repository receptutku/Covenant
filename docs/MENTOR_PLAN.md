# Mentor & Sponsor Conversation Plan — PPREV

_ETHGlobal Lisbon 2026 · Akif + Recep_

Her bölümde önce **söyleyeceğin İngilizce cümle**, altında **Türkçe açıklaması** var.
Ezberleme — okuyup kendi cümlene çevir. Aksan önemli değil, netlik önemli.

---

## 0. Gitmeden önce: 3 dakikalık teknik kontrol

⚠️ **En büyük risk bu.** Demo senin tarayıcında çalışıyor ama **backend Recep'in
bilgisayarında**. Aranızdaki tünel koparsa demo ölür.

- [ ] Recep'in laptopu **açık ve uykuya geçmiyor** olmalı (Sistem Ayarları → Ekran Kilidi → asla)
- [ ] Recep'te `npm run dev` çalışıyor
- [ ] Recep'te tünel açık, adres sende güncel
- [ ] Recep `npm run preflight` çalıştırdı, "All green. Go." gördü
- [ ] Sen: Buyer → "Clear World replay guard" → "Seed PROP-001"
- [ ] Sen: simulator sekmesi açık (`simulator.worldcoin.org`)
- [ ] İkinizin de wifi'si çalışıyor

**Demoyu kimin bilgisayarından göstermeli:** Senin. Frontend sende, üç kolon tek ekranda
duruyor, en iyi görüntü sende. Recep yanında dursun — backend sorusu gelirse o cevaplar.

Eğer wifi kötüyse **B planı**: ekran görüntüleri `docs/img/` klasöründe. Onları göster,
"our backend runs on my teammate's machine, the wifi is unstable here" de.

---

## 1. 30 saniyelik açılış — herkese aynısını söyle

> **"Hi — we're building PPREV, fractional real-estate on Hedera.**
> **The idea is simple: no token exists until a human has verified the property documents,**
> **and no share can move to a wallet that hasn't proven eligibility.**
> **The interesting part is that the second rule is enforced by Hedera itself, not by our**
> **code. Can I show you in one minute?"**

**Türkçesi:** Merhaba, Hedera üzerinde kesirli gayrimenkul yapıyoruz. Fikir basit: bir insan
mülk belgelerini doğrulamadan token oluşmuyor, ve uygunluğunu kanıtlamamış bir cüzdana pay
gidemiyor. İlginç kısmı, ikinci kuralı bizim kodumuz değil Hedera'nın kendisi uyguluyor. Bir
dakikada gösterebilir miyim?

**Neden bu cümle:** "Enforced by Hedera itself, not by our code" cümlesi mentörün kafasını
kaldırtan cümle. Herkes "biz kontrol ediyoruz" diyor; "ağ kontrol ediyor" demek farklı.

---

## 2. Bir dakikalık demo — ezberlenecek tek sıra

Üç şey göster, sırayla. Fazlasını gösterme.

**① KYC reddi (altın sahne 1)**
`nokyc` hesabını seç → mod `nokyc` → "Buy / attempt" → kırmızı kart.

> **"This account is associated with the token but has no KYC grant.**
> **Watch — the error is `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. That's not our error message.**
> **That comes from Hedera's consensus nodes. If we turned this server off, the rule would**
> **still hold."**

**Türkçesi:** Bu hesap token'a bağlı ama KYC izni yok. Bakın — hata
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. Bu bizim hata mesajımız değil, Hedera'nın consensus
node'larından geliyor. Sunucuyu kapatsak bile kural geçerli kalır.

**② %2 ücret (altın sahne 2)**
`buyer2` → mod `secondary` → 100 → Buy → Sent 100 / Fee 2 / Received 98.

> **"A secondary transfer: the sender is debited 100, the network takes 2 as a fractional**
> **fee against the token's own immutable fee schedule, and the buyer receives 98.**
> **We show sent and received separately, because the fee is inclusive — if we printed one**
> **number, Mirror Node's own transfer list would contradict us."**

**Türkçesi:** İkincil transfer: gönderenden 100 düşüyor, ağ token'ın kendi değiştirilemez
ücret tarifesine göre 2 alıyor, alıcıya 98 geçiyor. Gönderilen ve alınanı ayrı gösteriyoruz
çünkü ücret dahil — tek sayı yazsaydık Mirror Node'un kendi transfer listesi bizi yalanlardı.

**③ Kanıt paneli**
En alttaki Evidence panelinde "Read the audit trail" → **"Raw Mirror Node JSON"** linkini
göster.

> **"And you don't have to trust any of it. This is the raw Mirror Node endpoint —**
> **you can curl it yourself and get the same list without going through our server."**

**Türkçesi:** Ve hiçbirine güvenmek zorunda değilsiniz. Bu ham Mirror Node adresi — kendiniz
curl'leyip bizim sunucumuzdan geçmeden aynı listeye ulaşabilirsiniz.

---

## 2.4 Üç ağ, üç cümle — ezberlenecek kısa hâl

Recep'in yazdığı, doğrulanabilir kısa versiyonlar. Sunumda **kelimesi kelimesine** bunları
söyle; uzun gerekçeler bir sonraki bölümde, sadece soru gelirse aç.

> **Hedera — The asset and the rule.** An HTS token with a KYC key: a transfer to an
> unverified account is refused by consensus, not by our code. HCS carries the audit trail.

> **World ID — The person.** Proves a unique human over 18. We receive a nullifier, never an
> identity.

> **ENS — ENS is checked before every share transfer and can refuse one. A record naming a
> token this protocol did not create returns `ENS_CONFIG_MISMATCH`, and nothing moves.**

⚠️ **"ENS is the source of truth" deme.** Token id hâlâ sunucunun kaydından geliyor; ENS onun
üzerindeki kontrol. Doğru kelime **checked**, "authoritative" değil. Jüri bu farkı sorarsa
hazırlıksız yakalanma:

> **"Checked, not yet authoritative — the token id still comes from our record, and ENS is**
> **the check on top of it. Making ENS authoritative for settlement is the next step."**

**Türkçe:** Kontrol ediliyor, henüz yetkili değil — token id hâlâ bizim kaydımızdan geliyor,
ENS onun üzerindeki kontrol. ENS'i mutabakat için yetkili kılmak bir sonraki adım.

---

## 2.5 "Neden bu ağı kullandınız?" — uzun gerekçeler, soru gelirse

ETHGlobal mentörü bunun altını özellikle çizdi: her entegrasyonun **hangi ihtiyaca** cevap
verdiğini açıkça söylememizi bekliyorlar. Ekranda yazmıyor, **sen söyleyeceksin.**

### ENS — en çok sorulan, en çok puan getiren

> **"A buyer has to know which token represents this property, which topic carries its audit**
> **trail, and whose key signs its approvals — before trusting any of them. Asking our own**
> **API for that is circular: it would let us name our own auditor.**
>
> **So each property owns an ENS subname, and the config lives in its text records, resolved**
> **live from Sepolia before the buyer flow renders anything. Change the token, and the record**
> **changes on chain, in public.**
>
> **This is the one piece of the system that could not sensibly be a database row."**

**Türkçe:** Bir alıcının, herhangi birine güvenmeden önce şunu bilmesi gerekir: bu mülkü hangi
token temsil ediyor, denetim izini hangi konu taşıyor, onayları kimin anahtarı imzalıyor.
Bunu kendi API'mize sormak döngüsel — kendi denetçimizi kendimiz atamış oluruz. Bu yüzden her
mülkün bir ENS alt adı var ve yapılandırma text kayıtlarında; alıcı akışı hiçbir şey
göstermeden önce Sepolia'dan canlı çözüyor. Token değişirse kayıt zincirde, herkesin
gözü önünde değişiyor. Bu sistemde makul olarak veritabanı satırı olamayacak tek parça bu.

**Son cümle önemli:** Database eleştirisine de aynı anda cevap veriyor.

### Hedera — HTS

> **"Both rules that matter live in the token, not in our application. The KYC key is why a**
> **transfer to an unverified account is refused by consensus nodes rather than by an if**
> **statement. The fractional fee is assessed against a schedule with no fee-schedule key, so**
> **it can't be raised after minting — not by us either. Turn our server off and both hold."**

**Türkçe:** Önemli olan iki kural da token'da yaşıyor, uygulamamızda değil. KYC anahtarı,
doğrulanmamış bir hesaba transferin bir if bloğu tarafından değil consensus node'ları
tarafından reddedilmesinin sebebi. Kesirli ücret, fee-schedule anahtarı olmayan bir tarifeye
göre kesiliyor, yani mint'ten sonra yükseltilemez — bizim tarafımızdan da. Sunucuyu kapatın,
ikisi de geçerli.

### Hedera — HCS + Mirror Node

> **"A log the operator can rewrite proves nothing about the operator. Ordering comes from**
> **consensus, and the read path is Mirror Node — so a reviewer checking our claims never has**
> **to ask us anything."**

**Türkçe:** Operatörün yeniden yazabildiği bir log, operatör hakkında hiçbir şey kanıtlamaz.
Sıralama consensus'tan geliyor, okuma yolu Mirror Node — yani iddialarımızı kontrol eden biri
bize hiçbir şey sormak zorunda değil.

### World ID

Satıcı tarafı:
> **"A listing platform's cheapest attack is volume — one actor posting forty plausible**
> **properties. Nothing downstream catches it: the document reviewer sees one property at a**
> **time and can't tell they came from the same person."**

**Türkçe:** Bir ilan platformunun en ucuz saldırısı hacim — tek bir aktörün kırk makul ilan
açması. Aşağıdaki hiçbir katman bunu yakalamıyor: belge doğrulayıcı her seferinde tek mülk
görüyor ve aynı kişiden geldiklerini anlayamıyor.

Alıcı tarafı:
> **"The transaction needs a decision — is this counterparty eligible — not a dossier. The**
> **industry answer is a passport scan, a payslip and a proof of address, stored forever. We**
> **get the predicate result and not the facts behind it, so we couldn't produce this buyer's**
> **name under compulsion. We never received one."**

**Türkçe:** İşlemin ihtiyacı bir karar — bu karşı taraf uygun mu — dosya değil. Sektörün cevabı
pasaport taraması, maaş bordrosu ve adres kanıtı, sonsuza kadar saklanmış. Biz sonucu alıyoruz,
arkasındaki bilgileri değil; bu yüzden zorlansak bile bu alıcının adını üretemeyiz. Hiç
almadık.

---

## 3. Kiminle konuşulacak — öncelik sırası

### 🥇 Hedera standı — EN ÖNCELİKLİ

En büyük ödül potansiyeli ve en güçlü olduğumuz yer.

**Söyle:**
> **"We use HTS with a KYC key and an immutable 2% fractional fee, HCS as an append-only**
> **audit topic, and Mirror Node as the read path for everything the UI claims.**
> **No Solidity anywhere — every operation is a native SDK transaction."**

**Türkçesi:** KYC anahtarlı ve değiştirilemez %2 kesirli ücretli HTS kullanıyoruz, HCS'yi
append-only denetim konusu olarak, Mirror Node'u da arayüzün iddia ettiği her şeyin okuma
yolu olarak. Hiç Solidity yok — her işlem native SDK işlemi.

**Sor:**
> **"Two questions. First — is there anything in our token setup that would look wrong to**
> **someone who works on HTS every day? Second — what do the judges on this track usually**
> **find most convincing?"**

**Türkçesi:** İki sorum var. Birincisi — token kurulumumuzda, her gün HTS ile çalışan birine
yanlış görünecek bir şey var mı? İkincisi — bu track'in jürisi genelde neyi en ikna edici
buluyor?

**Dürüstçe söyle (bu iyi izlenim bırakır):**
> **"One honest caveat: our HCS topic has an admin key and no submit key, so it's**
> **append-only rather than immutable, and anyone can publish to it. We filter on**
> **`payer_account_id` when reading. Is that the right trade-off for a demo, or should we**
> **have used a submit key?"**

**Türkçesi:** Dürüst bir çekince: HCS konumuzun admin anahtarı var ve submit anahtarı yok,
yani değiştirilemez değil append-only ve herkes yazabilir. Okurken `payer_account_id`
filtreliyoruz. Bir demo için doğru denge mi, submit anahtarı mı kullanmalıydık?

---

### 🥈 World standı

**Söyle:**
> **"We use World ID 4.0 with three separate actions — one for the seller's liveness check,**
> **one for buyer eligibility, one for tenant eligibility. Separate, because the nullifier**
> **is derived from identity plus action, so sharing one would mean a person who verified**
> **as a buyer could never apply as a tenant."**

**Türkçesi:** World ID 4.0'ı üç ayrı action ile kullanıyoruz — biri satıcının canlılık
kontrolü, biri alıcı uygunluğu, biri kiracı uygunluğu. Ayrı, çünkü nullifier kimlik + action
'dan türüyor; paylaşsaydık alıcı olarak doğrulanan biri asla kiracı olarak başvuramazdı.

**Sor (bu soru puan getirir):**
> **"We wrote detailed feedback for both checks, with timed runs. One thing we'd like your**
> **view on: our app is registered as staging, so a real World App on a phone gets**
> **`WORLD_PROOF_INVALID` — the exact same error a forged proof gets. Is there any way for**
> **a developer to detect an environment mismatch? We couldn't find one."**

**Türkçesi:** Her iki kontrol için de ölçümlü, ayrıntılı geri bildirim yazdık. Bir konuda
görüşünüzü almak isteriz: uygulamamız staging kayıtlı, o yüzden gerçek telefondaki World App
`WORLD_PROOF_INVALID` alıyor — sahte bir proof'un aldığı hatanın aynısı. Geliştiricinin ortam
uyuşmazlığını tespit etmesinin bir yolu var mı? Biz bulamadık.

**Neden bu soru güçlü:** Şikayet gibi değil, gerçek bir DX bulgusu gibi duruyor ve World
track'i tam olarak bunu ödüllendiriyor. Ayrıca cevabı ne olursa olsun kazanıyorsun — yol
varsa öğrenirsin, yoksa bulgun doğrulanmış olur.

---

### 🥉 ENS standı

**Söyle:**
> **"Each property has a subname on the ENSv2 alpha, and its text records carry the**
> **protocol config — token id, audit topic, verifier public key, policy hash.**
> **The buyer flow resolves them live from Sepolia before it renders anything, so a client**
> **learns which token a property uses by asking ENS, not by trusting our API."**

**Türkçesi:** Her mülkün ENSv2 alpha'da bir alt adı var ve text kayıtları protokol
yapılandırmasını taşıyor — token id, denetim konusu, doğrulayıcı açık anahtarı, politika
hash'i. Alıcı akışı hiçbir şey göstermeden önce bunları Sepolia'dan canlı çözüyor, yani
istemci bir mülkün hangi token'ı kullandığını bizim API'mize güvenerek değil ENS'e sorarak
öğreniyor.

**Dürüstçe ekle:**
> **"To be precise: discovery is live, settlement is not — transfers still read the token**
> **from our own record. Making ENS authoritative for settlement is the honest next step."**

**Türkçesi:** Kesin konuşmak gerekirse: keşif canlı, mutabakat değil — transferler token'ı
hâlâ bizim kendi kaydımızdan okuyor. ENS'i mutabakat için yetkili kılmak dürüst bir sonraki
adım.

**Sor:**
> **"Does this count as real ENS usage in your view, or does it read as naming on top of**
> **something that doesn't need it? We'd rather hear it now than from a judge."**

**Türkçesi:** Sizce bu gerçek bir ENS kullanımı mı, yoksa ihtiyacı olmayan bir şeyin üstüne
isim koymak gibi mi duruyor? Jüriden duymaktansa şimdi duymayı tercih ederiz.

---

## 4. İngilizcen yetmediğinde kullanacağın cümleler

| Durum | Söyleyeceğin |
|---|---|
| Anlamadın | **"Sorry, could you say that again more slowly?"** |
| Kelime bulamadın | **"How do you say... when the network refuses the transfer itself?"** |
| Zaman kazanmak | **"That's a good question — let me show you instead."** _(ve ekranı göster)_ |
| Recep'e devret | **"My teammate built the backend — Recep, can you take this one?"** |
| Bilmiyorsun | **"I don't know — that's honest. How would you approach it?"** |
| Kapanış | **"Thank you, that was really useful."** |

**En önemli kural:** Bilmediğin şeye "yes" deme. **"I don't know"** demek hackathon'da
saygı kazandırır, uydurmak kaybettirir. Mentörler her gün onlarca takım görüyor, blöfü
anında anlıyorlar.

---

## 5. Her mentörden çıkarken sor

> **"If you were judging this, what's the one thing you'd want to see that we haven't shown**
> **you?"**

**Türkçesi:** Bunu siz jürilese ydiniz, size göstermediğimiz hangi tek şeyi görmek isterdiniz?

Bu soru altın değerinde. Cevabı **hemen not al** ve bana getir — kalan zamanda tam olarak
onu yaparız.

---

## 6. Konuşma sonrası

Her mentör görüşmesinden sonra, hemen telefonuna şunu yaz:

- Kiminle konuştun (stand + isim)
- Ne önerdi
- "Görmek isterdim" dediği şey

Hepsini bana getir; hangisini yapmaya zaman var, birlikte karar veririz.

---

## 7. Yapma

- ❌ Rental modundan uzun uzun bahsetme — arayüzü yok, "we also support rentals, the backend
  is done" deyip geç
- ❌ "We ran out of time" deme — bunun yerine **"we scoped it deliberately"**
- ❌ Kodu satır satır gösterme — mentör 5 dakikada 3 takım görüyor
- ❌ İki kişi aynı anda konuşma — biriniz anlatır, diğeri sorulara cevap verir
- ❌ Simulator'ı gizleme — sorulursa **"staging environment, so we use the World Simulator"**
  de, tamamen normal
