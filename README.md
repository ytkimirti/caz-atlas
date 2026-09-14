# cazgraf

Bizim Caz arşivindeki müzisyenleri ve birlikte çaldıkları konserleri keşfetmek için tam ekran, açık temalı bir graf.

## Çalıştırma

```sh
bun install
bun run dev
bun run build
```

Varsayılan port 5173; `PORT` ile değiştirilebilir. Yönetilen worktree önizlemesi için `pw wait` kullanılır. Hesap, uygulama sunucusu veya veritabanı gerekmez.

## Kullanım

- Başlangıçta **10 konserden fazla** çalmış müzisyenler görünür. Filtreyi kaldırınca arşivdeki tüm isimler görünür.
- Genel görünümde her iki müzisyenin de en güçlü iki bağı arasında bulunan ilişkiler çizilir. Filtrelerden sınır 1, 2, 3 veya 5 yapılabilir. Böylece tek bir kişi bütün grafı çizgilerle kaplamaz.
- Bir müzisyenin üzerine gelince filtrelenmiş graf içindeki tüm doğrudan bağları görünür. Tıklayınca seçim sabitlenir.
- Biri seçiliyken başka bir müzisyenin üzerine gelmek aralarındaki **en az bağlantılı yolu** vurgular. Bu hesap, normalde gizlenen zayıf bağları da içerir. Yol mevcut filtrelere uyar.
- Arama sonuçlarında ve seçili kişinin bağlantı listesinde hover veya klavye odağı da yol gösterir. Türkçe karakter kullanmadan arama yapılabilir.
- Mekan seçimi, yalnızca o mekanda **aynı konserde** çalan kişilerin bağlarını gösterir. Konser eşiği de seçilen mekandaki konser sayısına uygulanır.
- Enstrüman filtresi diğer filtrelerle birlikte çalışır. Filtreler ve seçili kişi URL'de saklanır.
- **Yerleşim** menüsünden Topluluklar (varsayılan), ForceAtlas2, D3 veya ngraph seçilebilir. Topluluklar, sık birlikte çalan gruplara ayrı alan açar. **Aralık** ile sıkı, dengeli veya ferah görünüm seçilir; bu tercihler URL'de saklanır.
- Sürükleyerek taşı, kaydırarak veya iki parmakla yakınlaş. Mobilde filtreler kaydırılabilir bir overlay'dir.

Kısayollar: `⌘/Ctrl K` arama, `+` / `-` yakınlaştırma, `0` ekrana sığdırma, `Esc` seçimi veya açık kontrolü kapatma.

Yerleşim Web Worker'da hesaplanır; motor veya filtre değişince önceki hesap iptal edilir. Topluluklar görünümü tam filtrelenmiş konser grafından gruplar bulur ve her gruba ayrı alan ayırır. Diğer motorlar güçlü ilişkilerle birlikte toplulukları birleştiren zayıf köprüleri korur. Bağlantısız kişiler ayrı alanlara yerleştirilir. Gruplar resmi müzik grupları değildir; gruplar arası uzaklık ilişki gücünü ölçmez. Çizgileri sadeleştirmek bağlantı verisini silmez. Düğüm büyüklüğü konser sayısını, renk enstrümanı gösterir. Mesafeler coğrafya veya zaman ifade etmez.

Motor karşılaştırması, seçim gerekçesi ve ölçümler: [yerleşim araştırması](docs/layout-research.md). Tüm arşiv ekrana sığdırıldığında yoğun grupları incelemek için yakınlaştırma veya filtreler gerekir.

## Veri

14 Eylül 2026 kesiti:

| Kayıt                                |   Sayı |
| ------------------------------------ | -----: |
| Müzisyen profili                     | 14.714 |
| İndirilen konser                     | 35.924 |
| Kesit tarihinden önceki konser       | 35.670 |
| Konser kadrolarıyla eşleşen müzisyen | 12.077 |
| Geçmiş konserlerdeki müzisyen çifti  | 95.833 |
| Eşleşen müzisyen içeren mekan        |  1.485 |

Kaynak: [Bizim Caz konser arşivi](https://bizimcaz.com/concerts). Tarihi kesit gününden önce olan konserler sayılır; bugünün ve geleceğin programları hariçtir. Aynı konser ve aynı kadro üyesi tek kez sayılır. Bir çiftin ağırlığı **birlikte yer aldıkları farklı konser sayısıdır**. Kadro adları, arşivdeki benzersiz müzisyen adlarıyla eşleştirilir. Eşleşmeyen veya birden fazla kişiye karşılık gelen altı ad tahminle bir kişiye atanmaz.

Bu sayılar kaynağın kayıt kapsamını gösterir. Sıfır kayıt, kişinin hiç konser vermediği anlamına gelmez. Mekan kimliği kaynak konser anahtarından alınır. Arşiv; mekan adları, kadrolar veya kişi kimliklerinde kaynak hataları içerebilir.

| Dosya                            | İçerik                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `data/concerts.json.gz`          | Kaynaktan çıkarılan konser tarihi, mekan ve kadrolar; yeniden üretilebilir sıkıştırılmış kesit |
| `public/data/concerts.json`      | Konser sayıları, ortak konser bağları ve mekanlara göre aynı bilgiler                          |
| `public/data/atlas.json`         | 14.714 profil ve önceki kaynak graf arşivi                                                     |
| `data/source-networks.ndjson.gz` | Önceki toplamada indirilen 14.714 ham ağ yanıtı                                                |
| `data/manifest.json`             | Önceki ağ arşivinin kapsamı ve checksum'ı                                                      |

Önceki ağ arşivindeki 118.563 ilişki grup, albüm ve konser ilişkilerini birlikte içerir; kaynak ağırlıkları konser sayısı değildir. Bu arşiv korunur. Yeni arayüzün bağları ve filtreleri ayrı konser kesitini kullanır.

## Veriyi yeniden üretme

```sh
# Kaynağı okumaz; depodaki konser kesitinden yerel uygulama verisini üretir.
bun run data:concerts --build

# Halka açık konser sayfalarını GET ile okur. Dört işçi, yerel önbellek.
python3 scripts/collect-concerts.py --fetch
bun run data:concerts --build
```

Her iki komut da gerekli bayrak olmadan kullanım bilgisini yazıp çıkar. Veritabanına erişmezler. Toplama başarısız olursa mevcut kesit değiştirilmez; yeniden çalıştırmak önbellekten devam eder. `.cache/concerts/` önbelleği mevcut sayfaları yenilemez. Kesit zamanı ve kapsamı çıktıda saklanır.

Önceki ağ arşivini doğrulamak için `bun run data:validate`; arşivden yerel önbellek çıkarmak için `bun run data:restore --restore` kullanılır. Bunlar yeni konser kesitini değiştirmez.

## Kontroller

```sh
bun test
bun run build
ATLAS_TEST_URL=http://localhost:5173 bun run test:ui
ATLAS_TEST_URL=http://localhost:5173 bun run test:layouts
bun run benchmark:layouts
```

Birim testleri; bağ seyrekleştirmeyi, en kısa yolu, eşik sınırını, birlikte uygulanan filtreleri, konser tekilleştirmeyi, tarih kapsamını, ad belirsizliğini ve mekandaki gerçek ortak kadroları kontrol eder.

UI testi yalnızca yerel sunucuda, kurulu Chrome ile çalışır. Canvas hover, seçiliyken hover yolu, filtreler, URL'den geri yükleme, mobil overlay'ler, klavye kullanımı ve veri yükleme hatasından dönüşü doğrular. Ekran görüntüleri `.cache/minimal-*.png` altında tutulur.
