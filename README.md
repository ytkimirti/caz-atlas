# caz-atlas

Bizim Caz arşivindeki müzisyenleri ve birlikte çaldıkları konserleri keşfetmek için tam ekran, açık temalı bir graf.

## Çalıştırma

```sh
bun install
bun run dev
bun run build
```

Varsayılan port 5173; `PORT` ile değiştirilebilir. Yönetilen worktree önizlemesi için `pw wait` kullanılır. Hesap, uygulama sunucusu veya veritabanı gerekmez.

`dev` ve `build`, yerel arşivlerden `public/data/runtime.json` ve `public/data/projects.json` dosyalarını otomatik üretir. Tarayıcı önce yalnızca küçük çalışma verisini yükler; grup / proje detayları yerleşim hazır olunca veya bir müzisyen seçilince ayrıca yüklenir. Proje verisi yüklenemese de graf çalışır; seçim ve görünüm panellerinden tekrar denenebilir. Kaynak arşivler değiştirilmez. Veriyi güncelledikten sonra sunucuyu yeniden başlat veya `bun run data:runtime --build` çalıştır.

## Kullanım

- Başlangıçta **10 konserden fazla** çalmış müzisyenler görünür. Filtreyi kaldırınca seçilen tarihlerde konser kaydı bulunan tüm isimler görünür.
- Genel görünümde her müzisyenin **en çok birlikte çaldığı ilk 5 kişiye** bağlantısı çizilir. Kişi sayısı 1, 3, 5 veya 10 seçilebilir; Tümü bağlantı sınırını kaldırır. Bir bağın iki kişiden birinin listesine girmesi yeterlidir, bu yüzden popüler müzisyenlerin görünür bağ sayısı X'i aşabilir. Sıralama mevcut filtrelerdeki kişiler arasında, mekan seçiliyse o mekandaki ortak konser sayısıyla hesaplanır. Eşitlikler müzisyen kimliğine göre çözülür. Seçim URL'de `top` parametresinde saklanır (`all` tüm bağlar); eski `shared` parametresi yerine varsayılan ilk 5 kullanılır.
- Bir müzisyenin üzerine gelince filtrelenmiş graf içindeki tüm doğrudan bağları görünür. Tıklayınca seçim sabitlenir.
- Biri seçiliyken başka bir müzisyenin üzerine gelmek aralarındaki **en az bağlantılı yolu** vurgular. Bu hesap, normalde gizlenen zayıf bağları da içerir. Yol mevcut filtrelere uyar.
- Arama sonuçlarında ve seçili kişinin bağlantı listesinde hover veya klavye odağı da yol gösterir. Türkçe karakter kullanmadan arama yapılabilir.
- Mekan seçimi, yalnızca o mekanda **aynı konserde** çalan kişilerin bağlarını gösterir. Konser eşiği de seçilen mekandaki konser sayısına uygulanır.
- **Enstrüman vurgula**, mevcut ağdaki ilgili müzisyenleri halkalarla işaretler; kişileri, bağlantıları, yerleşimi veya yakınlaştırmayı değiştirmez. Listede konser sayısı en yüksek kişiler önce gelir; seçili tarih aralığı ve mekandaki sayılar kullanılır. Bir isme tıklayınca en çok birlikte çaldığı kişiler açılır. Arama tüm görünür müzisyenleri kapsar. Veride trompet ayrı tutulmadığı için **Bakır üflemeli** grubu kullanılır. Vurgulama, filtreler ve seçili kişi URL'de saklanır.
- Alttaki zaman çizelgesi 1956'dan kesit tarihine kadar aylık konser yoğunluğunu gösterir. Uçları sürükleyerek veya ay alanlarını girerek aralık seçilir; alt kenarından tutarak aralık taşınır. Çizgiye tıklamak veya sürüklemek gösterilen tarihi değiştirir.
- Zaman çizelgesindeki **Keşfet / Canlı** seçimi grafın davranışını belirler. Keşfet sabit yerleşimle açılır; tarih ve filtre değişince yeni dönem hesaplanır. Canlı seçildiği anda fizik sürekli çalışır. Oynat ve duraklat yalnızca tarih akışını kontrol eder; tarih sabitken veya aralığın sonuna gelindiğinde fizik devam eder. Yoğun müzisyen girişlerinde tarih akışı yavaşlar. 0,5× / 1× / 2× / 4× hız seçenekleri Canlı modunda görünür.
- Mod değiştirirken tarih ve filtreler korunur. Tarih veya filtre değiştirmek oynatmayı duraklatır, modu değiştirmez. Canlı seçimi URL’de `experience=live` ile saklanır; sayfa yenilenince tarih sabit kalırken fizik çalışmaya başlar. Keşfet’e dönmek simülasyonu kapatır ve seçili tarihin sabit yerleşimini hesaplar.
- Aralık uçları klavyeyle birer ay, Shift ile birer yıl değişir; Home ve End sınıra götürür. Tarih aralığı ve oynatma konumu `from`, `to`, `at` parametreleriyle URL'de saklanır. Konser eşiği, mekan filtresi ve enstrüman vurgulaması aynı tarih görünümüne uygulanır.
- Keşfet modunda üst çubuktaki **Görünüm** menüsünün **Yerleşim** alanından Topluluklar (varsayılan), ForceAtlas2, D3 veya ngraph seçilebilir. Topluluklar, sık birlikte çalanlara ayrı alan açar ve ilişkili toplulukları yakına yerleştirir. **Gruplama** ile geniş, dengeli veya ayrıntılı topluluklar seçilebilir. **Aralık** ile sıkı, dengeli veya ferah görünüm seçilir; bu tercihler URL'de saklanır.
- Graf tüm ekranı kaplar; arama, filtreler, görünüm ayarları, enstrüman vurgulaması ve zaman çizelgesi grafın üzerinde yüzen panellerdir. Filtreler ve görünüm ayrı panellerde açılır. İsim ve grup etiketi seçenekleri Görünüm menüsündedir.
- Sürükleyerek taşı, kaydırarak veya iki parmakla yakınlaş. Sağ alttaki + / − ve ekrana sığdır düğmeleri de kullanılabilir. Harita rehberi renkleri ve bağlantıları açıklar; bir enstrümana tıklayarak vurgulama açılabilir. Mobilde detaylar alt panelde, filtreler ise sabit sonuç düğmesi olan kaydırılabilir panelde açılır.
- **2D / 3D** düğmeleriyle görünümü değiştir. 3D modunda ağı sürükleyerek veya graf odaktayken ok tuşlarıyla döndür; Shift + sürükle veya Shift + ok tuşlarıyla taşı. Kaydırarak yakınlaş; dokunmatik ekranda bir parmakla döndür, iki parmakla taşı ve yakınlaş. **Görünümü sıfırla** veya `0` başlangıç açısına döner ve ağı ekrana sığdırır. Arama, seçim, en kısa yol, enstrüman vurgulama ve zaman çizelgesi iki modda da çalışır. 3D modunda bir müzisyene tıklamak veya aramadan seçmek kamerayı onun doğrudan bağlantılarına odaklar; diğer müzisyenler silikleşir. Döndürme seçilen kişinin etrafında yapılır, yakınlaşırken kişi merkezde kalır. Kamera geçişleri yumuşaktır; sürükleme bırakılınca hareket kısa sürede yavaşlar. Azaltılmış hareket tercihinde geçiş ve süzülme kapatılır. Seçimi kaldırmak genel görünüme döner; sıfırlama seçili kişinin ağını yeniden çerçeveler. Görünüm URL'de `view=3d` ile saklanır; 2D'ye dönünce önceki yerleşim motoru korunur. 3D yerleşimi ngraph ile Web Worker'da üç eksende hesaplanır; derinlik mesafeleri de coğrafya veya zaman ifade etmez.


Kısayollar: `⌘/Ctrl K` arama, `+` / `-` yakınlaştırma, `0` ekrana sığdırma, `Esc` seçimi veya açık kontrolü kapatma.

`⌘/Ctrl K` açık ayar panelini kapatıp aramaya odaklanır. Arama sonuçları kapalıyken kutuya yeniden tıklamak sonuçları açar; aşağı / yukarı ok ilk / son sonuçtan başlar. Arama açıkken ilk `Esc` sonuçları kapatır, sonraki `Esc` seçimi kaldırabilir.

`Esc` önce açık ayar panelini veya rehberi kapatır; müzisyen seçimi korunur. Mobil ayar panelleri açıkken klavye odağı panelde kalır ve kapanınca açan düğmeye döner. 2D seçimler detay panelinin dışında görünür tutulur.

Yerleşim Web Worker'da hesaplanır; motor veya filtre değişince önceki hesap iptal edilir. Topluluklar görünümü tam filtrelenmiş konser grafından bağlı gruplar bulur. Müzisyenler kendi topluluklarında yerleşir; ardından topluluklar aralarındaki ortak konserlere göre konumlanır. Her topluluğun boyutuna göre boşluk ayrılır, bağlantısız ağlar iç düzenleri korunarak dairesel biçimde yerleştirilir. Diğer motorlar güçlü ilişkilerle birlikte toplulukları birleştiren zayıf köprüleri korur. Bağlantısız kişiler ayrı alanlara yerleştirilir. Gruplar resmi müzik grupları değildir; gruplar arası uzaklık ilişki gücünü ölçmez. Çizgileri sadeleştirmek bağlantı verisini silmez. Düğüm büyüklüğü konser sayısını, renk enstrümanı gösterir. Mesafeler coğrafya veya zaman ifade etmez.

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
| `public/data/concerts.json`      | Konser sayıları, ortak konser bağları, mekanlar ve tarihli sayısal kadrolar                    |
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

Önceki ağ verisini yeniden üretmek için `bun run data:build --build`, önbelleği arşivlemek için `bun run data:archive --archive` kullanılır. Bu komutlar mevcut atlası veya arşivi değiştirir; bayrak olmadan yalnızca kullanım bilgisini yazıp çıkar. Boş veya eksik ağ önbelleğiyle atlas yeniden üretilmez. Yeniden üretim yalnızca `.cache/keys.json` içindeki ağ dosyalarını okur; eski önbellek dosyaları dahil edilmez.

## Kontroller

```sh
bun test
bun run build
ATLAS_TEST_URL=http://localhost:5173 bun run test:app
ATLAS_TEST_URL=http://localhost:5173 bun run test:ui
ATLAS_TEST_URL=http://localhost:5173 bun run test:ux
ATLAS_TEST_URL=http://localhost:5173 bun run test:3d
ATLAS_TEST_URL=http://localhost:5173 bun run test:focus
ATLAS_TEST_URL=http://localhost:5173 bun run test:timeline
ATLAS_TEST_URL=http://localhost:5173 bun run test:layouts
ATLAS_TEST_URL=http://localhost:5173 bun run test:communities
ATLAS_TEST_URL=http://localhost:5173 bun run test:progress
bun run benchmark:layouts
```

Birim testleri; kişi başına en güçlü bağlantı seçimini, en kısa yolu, eşik sınırını, birlikte uygulanan filtreleri, konser tekilleştirmeyi, tarih kapsamını, ad belirsizliğini ve mekandaki gerçek ortak kadroları kontrol eder.

UI testi yalnızca yerel sunucuda, kurulu Chrome ile çalışır. Canvas hover, seçiliyken hover yolu, filtreler, URL'den geri yükleme, mobil overlay'ler, klavye kullanımı ve veri yükleme hatasından dönüşü doğrular. Ekran görüntüleri `.cache/minimal-*.png` altında tutulur.

Zaman çizelgesi testi, gerçek veriden beklenen tarih ve mekan sonuçlarını, yeniden hesaplanan düğüm konumlarını, hesaplama göstergesini, oynat/duraklat davranışını, URL geri yüklemeyi, aralık sürüklemeyi ve mobil dokunmayı doğrular. Ekran görüntüleri `.cache/timeline-*.png` altında tutulur.

Grup / proje adları grafın üzerinde etiketlenir. Bir müzisyen seçildiğinde veya üzerine gelindiğinde ilgili etiketler ve kadroya uzanan kesikli çizgiler belirginleşir. Seçim paneli ilgili tüm projeleri ve konser sayılarını listeler. Görünüm menüsünde grup etiketleri kapatılabilir; mekan filtresi yalnızca o mekandaki kadroları kullanır.

Etiketler konser başlıklarından alınır, kalıcı grup üyeliği anlamına gelmez. Tek müzisyenin adıyla verilen konserler, genel jam session / açık sahne başlıkları ve iki müzisyenle eşleşmeyen kadrolar etiket oluşturmaz. Yakınlaşınca daha fazla etiket görünür; seçili müzisyen için graf üzerinde en fazla üç proje, panelde tamamı gösterilir.

Başlıkları mevcut HTML önbelleğinden, ağ erişimi olmadan yeniden çıkarmak için:

```sh
python3 scripts/collect-concerts.py --from-cache
bun run data:concerts --build
```

Bu işlem kesit tarihini korur ve eksik önbellekte durur.

Arama kutusu müzisyenleri ve konser başlıklarından türetilen grupları birlikte arar. Tümü / Müzisyenler / Gruplar seçenekleri ve Türkçe karakter kullanmadan arama desteklenir. Grup sonuçları seçili tarih ve mekana uyar; konser eşiğinin gizlediği kadro üyeleri panelden görünür hale getirilebilir. Seçili grubun kadrosu haritada vurgulanır ve `g` URL parametresiyle paylaşılır. Kadrodaki bir isme tıklamak müzisyenin bağlantılarını açar.

Seçili müzisyenin portresi Bizim Caz profil görselinden doğrudan yüklenir; fotoğraf bulunamaz veya yüklenemezse baş harfleri gösterilir. Görselin altındaki kaynak bağlantısı müzisyenin profilini açar. Portreler yalnızca seçim yapıldığında istenir; başlangıç veri paketine eklenmez.

`ATLAS_TEST_URL=http://localhost:5173 bun run test:search` masaüstü ve mobil portreleri, fotoğraf hatasından dönüşü, grup aramasını, klavye seçimini, kadrodan müzisyene geçişi, URL geri yüklemeyi ve grup verisi yükleme hatasından dönüşü kontrol eder.
