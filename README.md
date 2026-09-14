# Caz atlası

Bizim Caz'ın halka açık müzisyen arşivinin tamamını tek bir interaktif graf üzerinde keşfetmek için bağımsız bir uygulama.

14 Eylül 2026 veri kesiti: **14.714 müzisyen**, **118.563 benzersiz ilişki**. Kaynak arama menüsündeki 796 kişiyle sınırlı değildir. Site haritasındaki her müzisyenin ağ kaydı istendi; başarısız veya bekleyen istek yoktur. Kaynak 1.240 kişi için graf sunmuyor (HTTP 404). Bu kişilerin halka açık profil bilgileri de arşive alındı ve isimleri grafın dış halkasında korunuyor.

## Çalıştırma

```sh
bun install
bun run dev
```

Uygulama varsayılan olarak http://localhost:5173 adresinde açılır. `PORT` ortam değişkenini destekler. Bu worktree'nin yönetilen önizlemesi: http://localhost:18830.

```sh
bun run build
bun run preview
```

Sunucu, hesap veya veritabanı gerekmez. Uygulama `public/data/atlas.json` dosyasını okur. Google Fonts kullanılamadığında sistem yazı tiplerine geçer.

## Keşif araçları

- **Takımyıldız:** Gerçek ilişkilerden önceden hesaplanmış force-directed yerleşim. Başlangıçta herkes görünür.
- **Enstrüman adaları:** Dokuz ses ailesine göre gruplanmış tüm müzisyenler.
- **Plak koleksiyonu:** Bağlantı sayısı yüksek isimler merkeze yakın olacak şekilde plak görünümü.
- **Aramızda kaç nota?:** İki müzisyen arasındaki en az bağlantılı yol. Bağlantı bulunamazsa bunu açıkça belirtir.
- Türkçe karakterlere toleranslı arama, sıralanabilir ve sayfalanabilir tam arşiv, müzisyen detayları, ortak konser kayıtlarına kaynak bağlantıları.
- Kaydırarak/pinch ile yakınlaşma, sürükleyerek taşıma, düğüm sürükleme, tam ekran, PNG dışa aktarma ve JSON indirme.
- **Beni şaşırt:** Rastgele bir müzisyeni keşfet.
- **Jam session:** Bağlantılarda hareket eden notalar ve isteğe bağlı, uygulamada sentezlenen caz döngüsü. Ses kullanıcı açmadıkça çalmaz. Sanatçılara ait ses kayıtları içermez.
- Paylaşılabilir URL'ler, klavye kullanımı ve azaltılmış hareket tercihi desteği.

Kısayollar: `⌘/Ctrl K` arama, `+` / `-` yakınlaştırma, `0` tüm ağı sığdırma, `Esc` seçimi temizleme.

## İndirilen veri

| Dosya                            | İçerik                                                                  |
| -------------------------------- | ----------------------------------------------------------------------- |
| `data/source-networks.ndjson.gz` | 14.714 ham API yanıtı, profil anahtarı, kaynak URL'si ve indirme zamanı |
| `data/manifest.json`             | Kapsam, zaman aralığı, sorgu parametreleri ve SHA-256 doğrulaması       |
| `data/musician-keys.json`        | Taranan tüm profil anahtarları                                          |
| `data/directory.json`            | Kaynağın müzisyen arama listesi                                         |
| `public/data/atlas.json`         | Tekilleştirilmiş kişiler, ilişkiler, yerleşimler ve kapsam bilgisi      |

Ham arşiv de bu depoya dahil edilmiştir. İndirme önbelleği `.cache/networks/` altında yerel olarak tutulur; uygulamanın çalışması için gerekli değildir.

```sh
# Dahil edilen ham yanıtları ağ erişimi olmadan önbelleğe çıkar.
# Var olan önbellek dosyalarını korur.
bun run data:restore --restore

# Yerel önbellekten graf yerleşimlerini yeniden hesapla.
bun run data:build

# Ham arşivin checksum'ını, tüm kişi ve ilişkilerin kapsamını doğrula.
bun run data:validate
```

Yeni kaynak kayıtlarını indirmek veya eksik indirmeleri tamamlamak için:

```sh
bun run data:fetch --fetch
bun run data:archive
bun run data:build
bun run data:validate
```

`data:fetch`, `--fetch` olmadan kullanım bilgisini yazıp çıkar. Yalnızca halka açık GET istekleri kullanır, dört işçiyle çalışır ve mevcut yerel kayıtları yeniden indirmez. Herhangi bir canlı veritabanına erişmez. Mevcut dosyalar eski kesitten kaldıysa indirme zamanı ham arşivde görülebilir; bu komut bunları otomatik olarak yenilemez.

## Veri yöntemi

Kaynak: [Bizim Caz grafı](https://bizimcaz.com/graph/AsudeSasmaz), [müzisyen listesi](https://bizimcaz.com/api/musicians-list), [site haritası](https://bizimcaz.com/pug5092/sitemap.xml).

Tüm müzisyenler için `musician-network-cached` uç noktası `years_back=150`, `min_weight=0`, `max_musicians=20000` ile sorgulandı. Her yanıtın `cached_period=all_time` olduğu ve kişi sınırına ulaşmadığı doğrulanır. Bir bağlantı, kaynakta kayıtlı ortak grup, albüm veya konser ilişkisini gösterir. Ağırlık bir kaynak puanıdır, konser sayısı değildir. Aynı ilişki iki taraftan geldiğinde ağırlıklar toplanmaz; büyük olan korunur.

Kaynağın önbelleklerinde aynı sayısal kimlik bazen farklı kişilere ait. Aynı kişinin birden fazla sayısal kimliği de var. Uygulama, **profil anahtarını kimlik kabul eder**, bağlantıları profil anahtarlarıyla birleştirir ve kendi iç kimliklerini üretir. 89 ek tarihsel kimlik bu şekilde birleştirildi. Ham yanıtlar değiştirilmeden korunur.

Bu kesit, kaynağın herkese açık grafının tamamıdır. Konser, albüm ve grup sayfalarının ayrı içerikleri indirilmez; ilişkileri sağlayan graf yanıtları saklanır. Graf servisi olmayan kayıtlar, ilişkilerin hiç yaşanmadığı anlamına gelmez. Takımyıldızdaki mesafeler ve görsel kümeler yerleşim algoritmasının sonucudur; zaman veya coğrafya ifade etmez.

## Kontroller

```sh
bun test
bun run data:validate
bun run test:ui
```

UI testi yerel sunucuyu ve kurulu Google Chrome'u kullanır. Farklı yerel port için `ATLAS_TEST_URL=http://localhost:5173 bun run test:ui`. Test; tam veri, arama, bağlantı kartı, keşif modları, URL'den geri yükleme, en kısa yol, PNG indirme, arşiv, klavye ile pencere kapatma, Jam session ve telefon düzenini doğrular. Ekran görüntüleri `.cache/` altına yazılır.
