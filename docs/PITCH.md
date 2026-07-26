# Pitch — jüri sunumu

_Covenant · ETHGlobal Lisbon 2026 · 3 dakika anlatım + 2 dakika soru_

Her bölümde: **söyleyeceğin İngilizce cümle**, altında **Türkçesi**. Ezberleme — oku, kendi
cümlene çevir. Aksan sorun değil, hız sorun. Yavaş konuş.

**Görev dağılımı:** Akif ekranı sürüyor ve anlatıyor. Recep yanında duruyor, teknik derinlik
sorularını o alıyor. Aynı anda ikiniz konuşmayın.

---

## 0:00 — 0:30 · Problem

Ekranda: uygulamanın genel görünümü, hiçbir şeye tıklamadan.

> **"Fractional real estate asks you to trust two things you can't check.**
>
> **That the property is real and belongs to the person selling it. And that the people you're**
> **trading with are allowed to be there.**
>
> **Today's answer is a company that verified everyone and promises it did — plus a database**
> **of passport scans waiting for a breach.**
>
> **We're Covenant. We replaced both promises with checks that hold without us."**

**Türkçe:** Kesirli gayrimenkul, kontrol edemeyeceğin iki şeye güvenmeni ister: mülkün gerçek
olduğuna ve satıcıya ait olduğuna, ve işlem yaptığın kişilerin orada olmaya hakkı olduğuna.
Bugünün cevabı, herkesi doğruladığını söyleyen bir şirket — ve bir ihlali bekleyen pasaport
taramaları veritabanı. Biz Covenant'ız. İki vaadi de bizsiz ayakta duran kontrollerle
değiştirdik.

**Neden bu açılış:** "Checks that hold without us" cümlesi tüm sunumun tezi. Sonraki her şey
bunun kanıtı.

---

## 0:30 — 1:00 · İki kural

Ekranda: üç kolonu göster, tıklama.

> **"Two rules define the whole protocol.**
>
> **One: no token exists until a human reviewer has signed off on the property documents.**
> **Two: no share can reach a wallet that hasn't proven eligibility.**
>
> **Three columns, three parties, three different amounts of trust. A seller who proves they're**
> **a live human. A reviewer who signs. A buyer who proves eligibility without handing over a**
> **passport.**
>
> **The interesting part is who enforces rule two. Let me show you."**

**Türkçe:** Tüm protokolü iki kural tanımlıyor. Bir: bir insan doğrulayıcı mülk belgelerini
imzalamadan token oluşmuyor. İki: uygunluğunu kanıtlamamış bir cüzdana pay ulaşamıyor. Üç
kolon, üç taraf, üç farklı güven miktarı. Canlı bir insan olduğunu kanıtlayan satıcı.
İmzalayan doğrulayıcı. Pasaport vermeden uygunluğunu kanıtlayan alıcı. İlginç kısım ikinci
kuralı kimin uyguladığı. Göstereyim.

---

## 1:00 — 1:45 · ALTIN SAHNE 1 — reddi ağ veriyor

Ekranda: Buyer → `nokyc` → mod `nokyc` → "Buy / attempt". **Kartın üzerinde dur.**

> **"This account is associated with the token — it opted in. But it has never been granted**
> **KYC.**
>
> _(butona bas)_
>
> **`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. That string is not in our codebase. It comes back from**
> **Hedera's consensus nodes.**
>
> **Our server didn't decide to refuse this. It submitted a transfer and the network rejected**
> **it. Turn our server off and the rule still holds.**
>
> **That's the difference between a compliance feature and a compliance property."**

**Türkçe:** Bu hesap token'a associate — kabul etmiş. Ama hiç KYC verilmemiş.
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. Bu metin bizim kod tabanımızda yok, Hedera'nın consensus
node'larından geliyor. Sunucumuz reddetmeye karar vermedi; bir transfer gönderdi ve ağ
reddetti. Sunucuyu kapatın, kural yine geçerli. Bir uyum özelliği ile bir uyum niteliği
arasındaki fark bu.

**Sunumun en önemli 45 saniyesi. Acele etme, jürinin kartı okuyacağı kadar bekle.**

---

## 1:45 — 2:15 · ALTIN SAHNE 2 — ücret token'ın

Ekranda: `buyer2` → `secondary` → 100 → Buy → üç rakam.

> **"A secondary transfer, buyer to buyer. The sender is debited a hundred. The network takes**
> **two, against the token's own fee schedule — which has no key, so it can never be raised.**
> **Not by us either. The buyer receives ninety-eight.**
>
> **We show sent and received as separate numbers on purpose. The fee is inclusive, so a single**
> **figure would contradict Mirror Node's own record of this same transaction."**

**Türkçe:** İkincil transfer, alıcıdan alıcıya. Gönderenden yüz düşüyor. Ağ, token'ın kendi
ücret tarifesine göre iki alıyor — o tarifenin anahtarı yok, yani asla yükseltilemez, bizim
tarafımızdan da. Alıcı doksan sekiz alıyor. Gönderilen ve alınanı bilerek ayrı gösteriyoruz:
ücret dahil, tek sayı yazsaydık aynı işlemin Mirror Node kaydı bizi yalanlardı.

---

## 2:15 — 2:45 · Kanıt

Ekranda: Evidence → "Read the audit trail" → **"Raw Mirror Node JSON"** linkine tıkla →
Cap table → Σ 1000/1000.

> **"And none of this has to be taken on trust.**
>
> **The audit trail is read from Mirror Node, not from our database. Here's the raw public**
> **endpoint — you can curl it yourself and get the same list without our server in the picture.**
>
> **The cap table is fetched by the browser straight from Hedera. Every share accounted for, and**
> **the token has no supply key — this total can never grow. The un-KYC'd account is right**
> **there, holding zero."**

**Türkçe:** Ve bunların hiçbirine güvenmek zorunda değilsiniz. Denetim izi veritabanımızdan
değil Mirror Node'dan okunuyor. İşte ham genel adres — kendiniz curl'leyip sunucumuz olmadan
aynı listeye ulaşabilirsiniz. Cap table'ı tarayıcı doğrudan Hedera'dan çekiyor. Her pay
hesaplı, ve token'ın supply anahtarı yok — bu toplam asla büyüyemez. KYC'siz hesap orada,
sıfır tutuyor.

---

## 2:45 — 3:00 · Dürüst kapanış

Ekranda: genel görünüme dön.

> **"What we deliberately don't claim: this proves a document's integrity and its timestamp. It**
> **does not prove the document came from the land registry. That needs zkTLS against the**
> **registry's service, and it's the core work after this hackathon.**
>
> **One core, two modes — a sale settles as a KYC-gated transfer, a rental as an escrow release,**
> **over the same verifier, the same World actions, the same ENS records.**
>
> **No token without a verified property. No share without proof of eligibility."**

**Türkçe:** Bilerek iddia etmediğimiz şey: bu, bir belgenin bütünlüğünü ve zaman damgasını
kanıtlıyor; tapu dairesinden geldiğini kanıtlamıyor. Bunun için tapunun servisine karşı zkTLS
gerekiyor ve bu hackathon sonrasının asıl işi. Tek çekirdek, iki mod — satış KYC kapılı bir
transferle, kiralama bir escrow serbest bırakmasıyla sonlanıyor; aynı doğrulayıcı, aynı World
action'ları, aynı ENS kayıtları. Doğrulanmış mülk olmadan token yok, uygunluk kanıtı olmadan
pay yok.

**Neden dürüst kapanış:** Jüri gün boyu "her şey mükemmel" dinliyor. Sınırını kendin
söylersen geri kalan her iddian daha inandırıcı olur — ve ne inşa ettiğini bildiğini gösterir.

---

# Soru-cevap (2 dakika)

Kısa cevap ver, uzatma. Bilmiyorsan **"I don't know"** de — hackathon'da saygı kazandırır,
uydurmak kaybettirir.

### "Neden Hedera? Neden ERC-20 değil?"

> **"Because KYC and the fractional fee are properties of the token itself. In an ERC-20 you'd**
> **write both into a contract — the rule still lives in your code. With HTS the network**
> **enforces it, and we didn't write a line of Solidity."**

**Türkçe:** Çünkü KYC ve kesirli ücret token'ın kendi özelliği. ERC-20'de ikisini de kontrata
yazarsın, kural yine senin kodunda yaşar. HTS'de ağ uyguluyor ve biz tek satır Solidity
yazmadık.

### "World ID'yi neden üç ayrı action ile kullandınız?"

> **"A nullifier is derived from identity plus action. Share one action between buyer and**
> **tenant, and someone who verified as a buyer could never apply as a tenant — their nullifier**
> **is already spent. We worked that out from the definition, not from the docs, and wrote it up**
> **as feedback."**

**Türkçe:** Nullifier kimlik + action'dan türüyor. Alıcı ve kiracı için tek action
paylaşsaydık, alıcı olarak doğrulanan biri asla kiracı olarak başvuramazdı — nullifier'ı
harcanmış olurdu. Bunu tanımdan çıkardık, dokümandan değil, ve geri bildirim olarak yazdık.

### "ENS gerçekten kullanılıyor mu, yoksa isim mi koydunuz?"

> **"ENS is checked before every share transfer and can refuse one. A record naming a token this**
> **protocol did not create returns `ENS_CONFIG_MISMATCH` and nothing moves.**
>
> **To be precise: checked, not yet authoritative. The token id still comes from our record and**
> **ENS is the check on top of it. Making ENS authoritative for settlement is the next step, and**
> **claiming it already is would be an overstatement."**

**Türkçe:** ENS her pay transferinden önce kontrol ediliyor ve bir transferi reddedebiliyor.
Bu protokolün oluşturmadığı bir token'ı gösteren kayıt `ENS_CONFIG_MISMATCH` döndürüyor ve
hiçbir şey hareket etmiyor. Kesin konuşmak gerekirse: kontrol ediliyor, henüz yetkili değil.
Token id hâlâ bizim kaydımızdan geliyor. Yetkili kılmak sonraki adım.

### "Veritabanınız var mı? Durum nerede tutuluyor?"

> **"In memory, deliberately, for this build. Production has a database — with no documents in**
> **it. What we persist is a Merkle root and an event log, not personal data. Adding persistence**
> **during the hackathon wouldn't have strengthened a single claim we're making."**

**Türkçe:** Bu sürümde bilinçli olarak bellekte. Üretimde veritabanı var — içinde belge yok.
Sakladığımız şey Merkle kökü ve olay kaydı, kişisel veri değil. Hackathon sırasında kalıcılık
eklemek yaptığımız hiçbir iddiayı güçlendirmezdi.

### "Belgenin tapudan geldiğini nasıl biliyorsunuz?"

> **"We don't, and we don't claim to. This proves integrity and timestamp. Provenance needs**
> **zkTLS against the registry's own service plus a circuit proving predicates over the**
> **transcript. The architecture reserves its place."**

**Türkçe:** Bilmiyoruz ve iddia etmiyoruz. Bu bütünlüğü ve zaman damgasını kanıtlıyor.
Provenans için tapunun kendi servisine karşı zkTLS ve transkript üzerinde predicate kanıtlayan
bir devre gerekiyor. Mimaride yeri ayrılmış.

### "Doğrulayıcı tek kişi — bu merkezi değil mi?"

> **"It is, and that's the honest limitation. Production expands it to a threshold signature**
> **across multiple notaries. What the gate does enforce today is that tokenization is impossible**
> **without a valid signature — corrupt one field and the mint refuses. Our test suite tries six**
> **different ways."**

**Türkçe:** Öyle, ve bu dürüst sınırlama. Üretimde birden çok noter arasında eşik imzasına
genişliyor. Kapının bugün uyguladığı şey şu: geçerli imza olmadan tokenizasyon imkânsız — tek
alanı boz, mint reddediyor. Test setimiz altı farklı yolu deniyor.

### "Neden simulator kullanıyorsunuz, gerçek telefon değil?"

> **"Our World app is registered as staging, and the environment is a property of the**
> **registration rather than the request — a staging app can only be used with the simulator.**
> **Interestingly, a real phone gets the exact same error a forged proof gets, with no way to**
> **tell them apart. That's written up as feedback."**

**Türkçe:** World uygulamamız staging kayıtlı ve ortam, isteğin değil kaydın özelliği —
staging uygulama sadece simulator ile kullanılabiliyor. İlginç olan: gerçek telefon, sahte bir
proof'un aldığı hatanın aynısını alıyor ve ikisini ayırmanın yolu yok. Bunu geri bildirim
olarak yazdık.

---

# Derin sorular — protokol seviyesinde cevaplar

Yukarıdaki yedi cevap normal bir jüri için yeterli. Kriptografi bilen biri gelirse buradan
devam et. Bu bölümü ezberleme; soru gelirse aç ve oku. Tam teknik metin
`docs/PROTOCOL.md`'de.

## Tek cümlelik tez

> **"Every trust assumption is discharged into an artifact that outlives the party that**
> **produced it. Nobody has to be online, honest, or still in existence for a later party to**
> **check their work."**

**Türkçe:** Her güven varsayımı, onu üreten tarafın ömrünü aşan bir kriptografik nesneye
devrediliyor. Sonradan gelen birinin kontrol edebilmesi için kimsenin çevrimiçi, dürüst, hatta
hayatta olması gerekmiyor.

| Güven varsayımı | Neye devredildi | Sonradan kim kontrol edebilir |
|---|---|---|
| Doğrulayıcı tapuya baktı | Bir taahhüt üzerine Ed25519 imzası | `pk_V`'yi bilen herkes — sonsuza dek, çevrimdışı |
| Alıcı benzersiz bir yetişkin | ZK insanlık kanıtından türeyen nullifier | Protokol, kim olduğunu öğrenmeden |
| Bu transfer izinli | Token'ın üzerindeki KYC anahtarı | Hedera consensus, bizim kodumuz olmadan |
| Bunlar protokol parametreleri | Sahibi olmadığımız bir isim alanındaki kayıtlar | Herkes, ismi çözerek |
| Bu sıra gerçekten yaşandı | Append-only genel konudaki digest'ler | Herkes, doğrudan halka açık uçtan |

## "Belge taahhüdünüz neden tuzlu ve alan ayrımlı?"

> **"Four decisions, each closing a specific attack. Leaf and internal nodes are hashed with**
> **different prefixes, so an internal node can't be presented as a leaf — that's the classic**
> **second-preimage attack. The property id is length-prefixed, so field boundaries can't shift.**
> **Each leaf is bound to its index, so leaves can't be permuted. Odd levels promote instead of**
> **duplicating, so a one-leaf and a two-leaf tree can't share a root.**
>
> **And every leaf is salted with 256 bits — which makes the commitment hiding and unlinkable.**
> **The same deed under two properties produces unrelated roots, so you can't ask 'do these two**
> **listings share a title deed?'"**

**Türkçe:** Dört karar, her biri belirli bir saldırıyı kapatıyor. Yaprak ve iç düğümler farklı
öneklerle hash'leniyor — klasik ikinci-önimge saldırısı. Mülk kimliği uzunluk önekli, alan
sınırları kayamıyor. Her yaprak indeksine bağlı, sıralama değiştirilemiyor. Tek sayılı
seviyeler kopyalamak yerine yukarı taşıyor. Ve her yaprak 256 bit tuzlu — aynı tapu iki farklı
mülkte alakasız kökler üretiyor, yani "bu iki ilan aynı tapuyu mu paylaşıyor?" sorusu
sorulamıyor.

## "Attestation başka bir mülke taşınabilir mi?"

> **"No. The property id, the seller account and the document root are all inside the signed**
> **message, and the verifying side regenerates that message byte-for-byte against a public key**
> **from configuration — never one supplied in the request.**
>
> **The encoding is newline-joined, so injectivity rests on no admissible value containing a**
> **separator: property ids are `[A-Za-z0-9-]`, account ids are `\d+\.\d+\.\d+`, the decision is**
> **a literal, and the root and timestamps are server-generated. Relax one of those validators**
> **and the claim stops holding — we say that in the document rather than hiding it."**

**Türkçe:** Hayır. Mülk kimliği, satıcı hesabı ve belge kökü imzalı mesajın içinde; doğrulayan
taraf mesajı bayt bayt yeniden üretip yapılandırmadaki açık anahtara karşı kontrol ediyor —
istekte gelen anahtara karşı değil. Kodlama satır sonlarıyla birleştirildiği için birebirlik,
hiçbir geçerli değerin ayırıcı içermemesine dayanıyor. O doğrulayıcılardan birini gevşetirsen
iddia düşer — bunu gizlemek yerine belgeye yazdık.

## "Nullifier'ı saklıyor musunuz?"

> **"We store `HMAC(k, action ‖ nullifier)`, never the nullifier. Keyed deliberately — a plain**
> **hash of a nullifier is invertible by anyone who can enumerate the space, which would make**
> **'we don't store identifiers' a technicality. Without the key the digest is meaningless."**

**Türkçe:** Nullifier'ı değil, `HMAC(k, action ‖ nullifier)` saklıyoruz. Bilerek anahtarlı —
düz hash, uzayı tarayabilen biri için tersine çevrilebilir ve "tanımlayıcı saklamıyoruz"
iddiasını teknik bir kılıfa indirger. Anahtar olmadan digest anlamsız.

## "En zayıf halkanız ne?" — bu soruyu sen sor, gelmesini bekleme

> **"Two things, and they're the same thing. The server computes the document root, and the**
> **server decides what the verifier is shown. In this build the reviewer never sees the bytes —**
> **so a malicious server could commit to one document set and describe another.**
>
> **Everything downstream of the signature is already safe from that: once the attestation**
> **exists, the server cannot alter what it authorizes. Closing the gap means moving the root**
> **computation to the verifier — then the signature covers what the reviewer actually saw, and**
> **the server drops out of the trusted set entirely."**

**Türkçe:** İki şey ve ikisi aynı şey. Sunucu belge kökünü hesaplıyor ve doğrulayıcıya ne
gösterileceğine karar veriyor. Bu sürümde inceleyen kişi bayt'ları hiç görmüyor — yani kötü
niyetli bir sunucu bir belge setine taahhüt edip başkasını anlatabilir. İmzadan sonrası bundan
zaten korunuyor: attestation var olduktan sonra sunucu neyi yetkilendirdiğini değiştiremiyor.
Açığı kapatmak için kök hesabını doğrulayıcıya taşımak gerekiyor — o zaman imza, inceleyenin
gerçekten gördüğü şeyi kapsıyor ve sunucu güvenilenler kümesinden tamamen çıkıyor.

**Bunu kendin söylemenin değeri:** Jüri "peki sunucunuza neden güvenelim?" diye soracak.
Cevabı hazır vermek, savunmaya geçmekten çok daha iyi bir izlenim bırakıyor.

## "Attestation'ı ele geçiren mint edebilir mi?"

> **"Yes, once — and that's deliberate but worth stating. The signature is returned to the**
> **client at decision time and `/api/tokenize` takes no session, so whoever holds it can mint.**
> **That's why the property endpoint deliberately does not return it, and why the expiry is**
> **short."**

**Türkçe:** Evet, bir kez — bilinçli ama söylenmesi gereken bir şey. İmza karar anında
istemciye dönüyor ve tokenize çağrısı oturum istemiyor, yani elinde tutan mint edebilir. Bu
yüzden property uç noktası onu bilerek döndürmüyor ve son kullanma süresi kısa.

## "Denetim izinde fiyat var mı? Gizlilik iddianız ne oluyor?"

> **"The transcript does publish commercial terms — rent, deposit, amount, fee. That's**
> **deliberate: a listing is a public offer and a transfer is already public on Hedera, so hiding**
> **them would be theatre, and Mirror Node would contradict us either way.**
>
> **What it never publishes is anyone's private position: no document content, no identity, no**
> **nullifier, no salt, and no income figure at all — the rental threshold is three times the**
> **advertised rent, derivable by anyone from the listing, and the tenant's actual earnings are**
> **never collected. There's nothing to leak."**

**Türkçe:** Denetim izi ticari şartları yayımlıyor — kira, depozito, miktar, ücret. Bu bilinçli:
bir ilan zaten kamuya açık bir teklif ve transfer zaten Hedera'da açık, gizlemek tiyatro olurdu
ve Mirror Node her hâlükârda bizi yalanlardı. Asla yayımlamadığı şey kimsenin özel konumu: belge
içeriği yok, kimlik yok, nullifier yok, tuz yok, ve hiçbir gelir rakamı yok — kiralama eşiği
ilan edilen kiranın üç katı, herkes ilandan türetebiliyor, kiracının gerçek geliri hiç
toplanmıyor. Sızacak bir şey yok.

## "Bunları nasıl test ettiniz?"

Soru gelirse bu tabloyu göster. Her satır çalışan bir komut.

| İddia | Test | Sonuç |
|---|---|---|
| Onay olmadan token yok · attestation taşınamaz | `npm run tamper` — altı bozulmuş attestation | 6/6 reddedildi |
| Belgeler kurtarılamaz · ilanlar bağlanamaz · seçici açıklama | `npm run merkle` | geçiyor |
| Transfer yetkisi uygulamaya bağlı değil | `npm run e2e:sale` + canlı KYC sahnesi | consensus reddi, boş transfer listesi |
| ENS kontrolü | `npm run test:ens-guard` — canlı kayıtlara karşı dört durum | 4/4 |
| Çift mint koruması | `npm run e2e:sale` — ikinci mint denemesi | `ALREADY_TOKENIZED` |
| Denetim izi | `docs/EVIDENCE.md` + herkesin curl'leyebileceği Mirror ucu | — |

## Kanıtlamadığımız üç şey — sorulmadan söyle

1. **Doğrulayıcının dürüstlüğü sınırlandırılmış, kanıtlanmış değil.** Protokol `V`'nin *neyi*
   yetkilendirebileceğini kısıtlıyor — tek mülk, tek belge seti, tek zaman aralığı — ama
   yargısının doğru olmasını zorlamıyor. Doğal tamamlayıcı ekonomik: teminat, dolandırıcılık
   kazancı ve yakalanma olasılığı. Mimarimiz yakalanma olasılığını yapısal olarak yüksek
   tutuyor çünkü attestation kalıcı, herkese açık ve belge köküne bağlı. Slashing yok.
2. **Bir proof hesaba bağlı değil.** Kanıt, benzersiz bir insanın bir eylemi yaptığını
   gösteriyor; belirli bir Hedera hesabının yaptığını değil. Hesap kimliği aynı istekte geliyor
   ve kriptografik olarak proof'a bağlı değil.
3. **Bir predicate kanıtlanmış değil, iddia ediliyor.** Kiralama gelir koşulu
   `incomeProven: false` dönüyor. Eşik gerçek ve ev sahibinin ilanından türüyor, yani başvuran
   kendi barajını koyamıyor; ama kiracının onu aştığı kanıtlanmıyor. zkTLS transkripti ve
   üzerinde bir devre gerekiyor.

---

# Sunum öncesi kontrol

- [ ] Recep'in laptopu şarjda, uykuya geçmiyor, tünel ayakta
- [ ] `npm run stage` → `npm run preflight` → "All green. Go."
- [ ] Buyer → admin secret girili, "Clear World replay guard" basılı
- [ ] Simulator ayrı sekmede açık
- [ ] HashScan'de token sayfası ayrı sekmede hazır
- [ ] Tema sabitlenmiş (karanlık ya da aydınlık, hangisi daha iyi duruyorsa)
- [ ] Bildirimler kapalı, bookmark çubuğu gizli (`Cmd+Shift+B`)
- [ ] Yedek: demo videosu ve `docs/img/` ekran görüntüleri açılabilir durumda

**Bir şey patlarsa:** panikleme. *"The tunnel dropped — let me show you the recorded run"* de
ve videoyu aç. Jüri teknik aksaklığa alışkın; toparlanışına bakar.

---

# Ezberlenecek üç cümle

Başka hiçbir şey aklında kalmasa bunlar kalsın:

1. **"That string is not in our codebase — it comes back from Hedera's consensus nodes."**
2. **"Turn our server off and this rule still holds."**
3. **"What we deliberately don't claim…"**
