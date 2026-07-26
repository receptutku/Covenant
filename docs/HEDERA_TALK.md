# Hedera Standı — Konuşma Metni

_Covenant · ETHGlobal Lisbon 2026 · Akif + Recep_

Her bölümde: **İngilizce söyleyeceğin cümle**, altında **Türkçe açıklama**, gerektiğinde
**neden bu cümle** notu.

Hedefin ezber okumak değil. Bu üç şeyi anlatabilirsen görüşme başarılıdır:

1. Reddi **ağ** yapıyor, biz değil
2. Ücreti **token'ın kendi tarifesi** kesiyor, biz değil
3. Söylediğimiz her şey **halka açık veriden** doğrulanabilir

---

## HEDERA'NIN HANGİ TEKNOLOJİLERİNİ KULLANIYORUZ

Dördü, her biri farklı bir iş yapıyor. Mentör sorarsa bunları sayabilmelisin.

**1. HTS — Hedera Token Service**
Her mülk için bir fungible token. 1000 pay, `decimals=0`. Üzerinde **KYC key** ve **freeze
key** var, **fee schedule key yok** — yani %2'lik kesirli ücret değiştirilemez.
İşlemler: `TokenCreateTransaction`, `TokenAssociateTransaction`, `TokenGrantKycTransaction`,
`TransferTransaction`.

**2. HCS — Hedera Consensus Service**
Tek bir konu (`0.0.9734777`) protokolün tüm olaylarını taşıyor: mülk gönderildi, sahiplik
onaylandı/reddedildi, token oluşturuldu, transfer yapıldı, kiralama olayları. Append-only
defter. İşlemler: `TopicCreateTransaction`, `TopicMessageSubmitTransaction`.

**3. Mirror Node**
Arayüzün okuma yolu. Evidence panelindeki her şey buradan geliyor, kendi veritabanımızdan
değil. Halka açık REST API — herkes aynı adrese gidip aynı listeyi alabilir.

**4. HBAR transferleri (kiralama modunda)**
Depozito kilidi, temiz iade, izinsiz süre aşımı. Backend'de çalışıyor, arayüzü yok.

**Solidity yok.** Hiç `.sol` dosyası, hiç EVM deploy adımı yok. Her şey native SDK.

---

## NEYİ GÖSTER, NEYİ GÖSTERME

**Tokenizasyon akışını gösterme.** 2 dakika sürüyor ve Hedera'nın sorduğu hiçbir soruya cevap
vermiyor. Onlar "token nasıl oluştu" ile değil, **"token ne yapıyor"** ile ilgileniyor.
Yerine sonucu göster: HashScan'de `0.0.9734808`.

Sorarlarsa ("how does a property become a token?") tam akışı çalıştırma — Verifier
kolonundaki **"Tamper test"** butonuna bas. 10 saniye, `ATTESTATION_INVALID`, aynı noktayı
akışın tamamından daha güçlü kanıtlıyor.

**Gösterme sırası ve her birinin cevapladığı soru:**

| # | Ne | Süre | Hangi soruya cevap |
|---|---|---|---|
| ① | HashScan token sayfası | 30 sn | "Bu gerçekten zincirde mi, yoksa uygulama kontrolü mü?" |
| ② | KYC reddi canlı | 60 sn | "Uyum kuralını kim uyguluyor?" |
| ③ | Ham Mirror Node JSON | 45 sn | "Bunları arayüzde siz yazdırıyorsunuz, nereden bileyim?" |
| ④ | %2 ücret | 45 sn | "Ücreti nasıl alıyorsunuz?" |
| ⑤ | HCS + dürüst çekince | 30 sn | — (sohbeti başlatan soru) |

---

## AÇILIŞ (30 saniye)

> **"Hi — we're Covenant, fractional real estate on Hedera. Two rules define the whole**
> **protocol: no token exists until a human has verified the property documents, and no**
> **share can reach a wallet that hasn't proven eligibility.**
>
> **The part we'd like your opinion on is that the second rule isn't enforced by our code.**
> **It's enforced by Hedera. Can I show you three transactions?"**

**Türkçe:** Merhaba, biz Covenant — Hedera üzerinde kesirli gayrimenkul. Tüm protokolü iki kural
tanımlıyor: bir insan mülk belgelerini doğrulamadan token oluşmuyor, ve uygunluğunu
kanıtlamamış bir cüzdana pay ulaşamıyor. Görüşünüzü almak istediğimiz kısım şu: ikinci kuralı
bizim kodumuz uygulamıyor, Hedera uyguluyor. Size üç işlem gösterebilir miyim?

**Neden:** "Can I show you three transactions" demek, "can I show you my project" demekten
çok daha iyi karşılanır. Somut ve sınırlı.

---

## 1. TOKEN TASARIMI

Ekranda HashScan'de token sayfasını aç: `0.0.9734808`

> **"Each property is one fungible HTS token. A thousand shares, decimals zero — so a share**
> **is a whole unit and you can't hold a fraction of a fraction.**
>
> **Three things on the key list matter. There's a KYC key, which is what makes the**
> **compliance rule enforceable at the network level. There's a freeze key. And the fee**
> **schedule key is null — the two percent fractional fee is immutable. We can't change it**
> **after the fact, and neither can anyone else."**

**Türkçe:** Her mülk tek bir fungible HTS token'ı. Bin pay, decimals sıfır — yani bir pay tam
birim, kesrin kesrini tutamıyorsun. Anahtar listesinde üç şey önemli: KYC anahtarı var, uyum
kuralını ağ seviyesinde uygulanabilir kılan şey bu. Freeze anahtarı var. Ve fee schedule
anahtarı null — %2'lik kesirli ücret değiştirilemez. Sonradan biz de değiştiremeyiz, başkası
da.

**Sorarlarsa — "why decimals zero?"**
> **"Because a share of a property is a legal unit, not a quantity. Fractional decimals**
> **would let someone hold 0.4 of a share, which doesn't correspond to anything real."**

**Türkçe:** Çünkü bir mülk payı miktar değil, hukuki bir birim. Ondalık olsaydı biri payın
0.4'ünü tutabilirdi, bu gerçekte hiçbir şeye karşılık gelmiyor.

---

## 2. ALTIN SAHNE — KYC REDDİ (en önemli bölüm)

Bunu **canlı göster.** Uygulamada: `nokyc` hesabı → mod `nokyc` → "Buy / attempt".

> **"This account is associated with the token — it opted in. But it has never been granted**
> **KYC. Watch what happens."**
>
> _(kırmızı kart çıkar)_
>
> **"`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. That string is not in our codebase. It comes back**
> **from the consensus nodes. Our server didn't decide to refuse this — it submitted a**
> **transfer and the network rejected it.**
>
> **The distinction we care about is association versus KYC. If the account weren't**
> **associated, we'd get `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, which just means 'never opted**
> **in'. That's a different and much weaker claim. Associated but not KYC-granted is the**
> **precise statement: the account accepted the token and still cannot receive it without**
> **identity verification."**

**Türkçe:** Bu hesap token'a associate — kabul etmiş. Ama hiç KYC verilmemiş. Bakın ne
oluyor. `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. Bu metin bizim kod tabanımızda yok. Consensus
node'larından geliyor. Sunucumuz reddetmeye karar vermedi — bir transfer gönderdi ve ağ
reddetti. Önemsediğimiz ayrım association ile KYC arasında. Hesap associate olmasaydı
`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` alırdık, o sadece "hiç kabul etmemiş" demek — çok daha zayıf
bir iddia. Associate ama KYC'siz olmak asıl ifade: hesap token'ı kabul etmiş ve hâlâ kimlik
doğrulaması olmadan alamıyor.

**Sonra kanıtı göster.** Ham Mirror Node linkini aç:

> **"And here's the same thing on Mirror Node, without our server in the way. The result**
> **field says `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, the token transfers array is empty, and**
> **a fee was still charged to the operator for a transfer that never happened. You can**
> **curl this yourself."**

**Türkçe:** Ve aynı şey Mirror Node'da, arada bizim sunucumuz olmadan. Result alanı
`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` diyor, token transfers dizisi boş, ve hiç gerçekleşmemiş
bir transfer için operator'dan yine de ücret kesilmiş. Bunu kendiniz curl'leyebilirsiniz.

**Cümlenin vurucu hali — bunu mutlaka söyle:**
> **"Turn our server off and this rule still holds. That's the difference between a**
> **compliance feature and a compliance property."**

**Türkçe:** Sunucumuzu kapatın, bu kural yine geçerli. Bir uyum özelliği ile bir uyum
niteliği arasındaki fark bu.

---

## 3. ALTIN SAHNE — KESİRLİ ÜCRET

Uygulamada: `buyer2` → mod `secondary` → miktar 100 → Buy.

> **"A secondary transfer, buyer to buyer. The sender is debited one hundred. The network**
> **takes two as a fractional fee, assessed against the token's own schedule. The recipient**
> **receives ninety-eight.**
>
> **We show sent and received as separate numbers deliberately. The fee is inclusive, so if**
> **we printed a single 'transferred 100', Mirror Node's own transfer list for that same**
> **transaction would contradict us — and that contradiction is exactly what an auditor is**
> **supposed to catch."**

**Türkçe:** İkincil transfer, alıcıdan alıcıya. Gönderenden yüz düşüyor. Ağ, token'ın kendi
tarifesine göre iki kesiyor. Alıcı doksan sekiz alıyor. Gönderilen ve alınanı bilerek ayrı
sayı olarak gösteriyoruz. Ücret dahil, yani tek bir "100 transfer edildi" yazsaydık aynı
işlemin Mirror Node'daki transfer listesi bizi yalanlardı — ve o çelişki tam olarak bir
denetçinin yakalaması gereken şey.

**Bunu da ekle — ince detay, mentörler sever:**
> **"One thing we found on testnet: the chain charges `max(1, floor(amount × 2%))`, and**
> **shares are whole units. So below fifty shares the floor dominates — ten shares are**
> **charged ten percent, and one share is charged everything. Our UI doesn't say '2%' in**
> **that case, it says the effective rate. Printing 2% there would have been false."**

**Türkçe:** Testnet'te fark ettiğimiz bir şey: zincir `max(1, floor(miktar × %2))` kesiyor ve
paylar tam birim. Yani elli payın altında taban baskın geliyor — on paya %10 kesiliyor, tek
paya her şeyi. Arayüzümüz o durumda "%2" demiyor, gerçek efektif oranı yazıyor. Orada %2
yazmak yalan olurdu.

**Neden bu detay:** Bir hackathon takımının testnet'te gerçekten koştuğunu ve sonuçlara
baktığını kanıtlayan tek şey bu tür ayrıntılar. Slaytta olmayan, ancak çalışırken çıkan bilgi.

---

## 4. HCS DENETİM İZİ + DÜRÜSTLÜK

En alttaki Evidence panelini aç, "Read the audit trail".

> **"Every protocol event goes to one HCS topic — property submitted, ownership approved or**
> **rejected, token created, transfer, and the rental events. This panel isn't reading our**
> **database; it's reading Mirror Node. The raw endpoint is right there as a link."**

**Türkçe:** Her protokol olayı tek bir HCS konusuna gidiyor — mülk gönderildi, sahiplik
onaylandı veya reddedildi, token oluşturuldu, transfer, ve kiralama olayları. Bu panel bizim
veritabanımızı okumuyor, Mirror Node'u okuyor. Ham adres orada, link olarak duruyor.

**Sonra kendi zayıflığını sen söyle — bu güven kazandırır:**
> **"Two honest caveats, and we'd genuinely like your opinion on the first.**
>
> **One: our topic has an admin key and no submit key. So it's append-only, not immutable —**
> **and anyone can publish to it. Our defence is on the read side: we only keep messages**
> **paid for by our operator account. Is that the right trade-off, or should we have used a**
> **submit key?**
>
> **Two: our payload guard matches key names, not values, so some early messages permanently**
> **contain a city field that shouldn't be there. We left them and documented them. A log**
> **that still shows our own mistake seemed like the honest version of the claim."**

**Türkçe:** İki dürüst çekince, birincisinde gerçekten görüşünüzü istiyoruz. Bir: konumuzun
admin anahtarı var, submit anahtarı yok. Yani append-only, değiştirilemez değil — ve herkes
yazabilir. Savunmamız okuma tarafında: sadece operator hesabımızın ödediği mesajları
tutuyoruz. Doğru denge mi, yoksa submit anahtarı mı kullanmalıydık? İki: payload
korumamız anahtar isimlerini eşleştiriyor, değerleri değil, o yüzden bazı erken mesajlarda
kalıcı olarak olmaması gereken bir city alanı var. Sildirmedik, belgeledik. Kendi hatasını
hâlâ gösteren bir log, iddianın dürüst hali gibi geldi.

**Neden bu bölüm önemli:** Mentörler her takımın "her şey mükemmel" demesine alışkın. Kendi
zayıflığını önce sen söylersen, geri kalan her iddian daha inandırıcı olur.

---

## 5. NO SOLIDITY

> **"There's no Solidity in this project at all. No .sol files, no EVM deploy step —**
> **you can check with a single find command. Every on-chain operation is a native Hedera**
> **SDK transaction: TokenCreate, TokenGrantKyc, Transfer, TopicCreate,**
> **TopicMessageSubmit. The only EVM code anywhere reads and writes ENS records on Sepolia."**

**Türkçe:** Bu projede hiç Solidity yok. .sol dosyası yok, EVM deploy adımı yok — tek bir find
komutuyla kontrol edebilirsiniz. Her zincir işlemi native Hedera SDK işlemi: TokenCreate,
TokenGrantKyc, Transfer, TopicCreate, TopicMessageSubmit. Projedeki tek EVM kodu Sepolia'da
ENS kayıtlarını okuyup yazan kısım.

---

## 6. TESTLER (sorarlarsa)

> **"Everything we've claimed is asserted in code against real testnet, not mocked.**
> **`npm run golden` mints a fresh token and drives all three moments. `npm run tamper`**
> **tries six different ways of doctoring an attestation and expects every one to be**
> **rejected. `npm run e2e:sale` runs the whole flow over HTTP. And `npm run preflight`**
> **checks every scene precondition from public data before we go on stage."**

**Türkçe:** İddia ettiğimiz her şey gerçek testnet'e karşı kodda assert ediliyor, mock değil.
`npm run golden` taze bir token basıp üç anı da çalıştırıyor. `npm run tamper` bir
attestation'ı bozmanın altı farklı yolunu deniyor ve hepsinin reddedilmesini bekliyor.
`npm run e2e:sale` tüm akışı HTTP üzerinden koşuyor. `npm run preflight` de sahneye
çıkmadan önce her sahne ön koşulunu halka açık veriden kontrol ediyor.

---

## 7. DEMO HESAPLARI — farkı bil, sorulacak

| Hesap | ID | Rolü |
|---|---|---|
| **buyer1** | `0.0.9734741` | Birincil alıcı. Hazineden pay alır. İkincil satışta **gönderen**. Kiralamada kiracı. |
| **buyer2** | `0.0.9734742` | İkincil piyasa karşı tarafı. buyer1'den alır — %2 ücretin göründüğü sahnenin **alıcısı**. |
| **nokyc** | `0.0.9734743` | Token'a associate, ama kasıtlı olarak KYC verilmemiş. Altın sahne 1'in reddedilen tarafı. |

**Neden iki ayrı alıcı gerekiyor:** Ücret sahnesi için hazine **olmayan** bir gönderen lazım.
Hazine kendi ücretinden muaf, o yüzden hazineden yapılan transferde ücret çıkmıyor. Gerçek
%2'yi görebilmek için pay önce buyer1'e gitmeli, sonra buyer1'den buyer2'ye geçmeli.

Tek cümlede:
> **"buyer1 buys from the treasury with no fee — the treasury is exempt from its own fee.**
> **buyer2 buys from buyer1, and that's where the 2% actually appears."**

---

## 8. SORULURSA HAZIR OL

**"Why HTS and not an ERC-20?"**
> **"Because KYC and the fractional fee are properties of the token itself. In an ERC-20**
> **you'd write both into the contract — so the rule still lives in your code. With HTS the**
> **network enforces it."**

**Türkçe:** Çünkü KYC ve kesirli ücret token'ın kendi özelliği. ERC-20'de ikisini de kontrata
yazarsın, yani kural yine senin kodunda yaşar. HTS'de ağ uyguluyor.

**"Why decimals zero?"**
> **"A share of a property is a legal unit, not a quantity. 0.4 of a share doesn't**
> **correspond to anything real."**

**Türkçe:** Mülk payı miktar değil, hukuki birim. Payın 0.4'ü gerçekte hiçbir şeye karşılık
gelmiyor.

**"Who grants the KYC?"**
> **"Our server, after a World ID verification passes — it submits a**
> **`TokenGrantKycTransaction`. That's the moment an identity signal becomes a**
> **network-enforced permission."**

**Türkçe:** Sunucu, World ID doğrulaması geçtikten sonra `TokenGrantKycTransaction`
gönderiyor. Kimlik sinyalinin ağ tarafından uygulanan bir izne dönüştüğü an bu.

**"Where does the fee go?"**
> **"To the treasury account, `0.0.9695718`, routed by the chain. The application never**
> **touches it."**

**Türkçe:** Hazine hesabına, zincir tarafından yönlendiriliyor. Uygulama o paraya hiç
dokunmuyor.

**"Why is the nokyc account associated at all?"**
> **"Deliberately. Without association we'd get `TOKEN_NOT_ASSOCIATED` — which only means**
> **'never opted in'. Associated but not KYC-granted is the precise statement: the account**
> **accepted the token and still cannot receive it without identity verification."**

**Türkçe:** Kasıtlı. Associate olmasaydı `TOKEN_NOT_ASSOCIATED` alırdık — o sadece "hiç kabul
etmemiş" demek. Associate ama KYC'siz olmak asıl ifade: kabul etmiş, yine de kimlik
doğrulaması olmadan alamıyor.

---

## 9. SORACAĞIN SORULAR

Görüşmenin sonunda mutlaka sor. Not al.

**1.**
> **"Is there anything in our token setup that would look wrong to someone who works with**
> **HTS every day?"**

**Türkçe:** Token kurulumumuzda, her gün HTS ile çalışan birine yanlış görünecek bir şey var mı?

**2.**
> **"On the topic: admin key with no submit key, filtering on payer account when we read.**
> **Would you have done it differently for a demo like this?"**

**Türkçe:** Konu hakkında: admin anahtarı var, submit anahtarı yok, okurken payer hesabına
göre filtreliyoruz. Böyle bir demo için siz farklı yapar mıydınız?

**3.**
> **"What do judges on this track usually find most convincing? We have limited time left**
> **and we'd rather spend it on the right thing."**

**Türkçe:** Bu track'in jürisi genelde neyi en ikna edici buluyor? Az zamanımız kaldı, doğru
şeye harcamak isteriz.

**4. — En değerlisi**
> **"If you were judging this, what's the one thing you'd want to see that we haven't shown**
> **you?"**

**Türkçe:** Bunu siz jürilese ydiniz, size göstermediğimiz hangi tek şeyi görmek isterdiniz?

---

## HAZIR BULUNDURULACAK SAYILAR

Sorulursa hemen söyleyebilmelisin:

| | |
|---|---|
| Token | `0.0.9734808` |
| HCS konusu | `0.0.9734777` |
| Operator / hazine | `0.0.9695718` |
| nokyc hesabı | `0.0.9734743` |
| Arz | 1000 pay, decimals 0 |
| Ücret | %2 kesirli, min 1, tarife değiştirilemez |
| Ağ | Hedera testnet |

---

## GÖREV DAĞILIMI

- **Akif:** ekranı sen sürüyorsun, üç sahneyi sen gösteriyorsun
- **Recep:** SDK, anahtar tasarımı, Mirror filtreleme, HCS payload'ları — teknik derinlik
  sorularını o alıyor

Aynı anda ikiniz konuşmayın. Bir soru geldiğinde biriniz cevaplayana kadar diğeri beklesin.

**Bilmediğin bir şeye "yes" deme.** _"I don't know — how would you approach it?"_ demek
hackathon'da saygı kazandırır.
