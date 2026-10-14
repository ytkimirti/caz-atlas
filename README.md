# caz-atlas

Bizim Caz arşivindeki müzisyenleri ve birlikte çaldıkları konserleri gösteren, tam ekran etkileşimli bir graf.

**Canlı:** [caz-atlas.vercel.app](https://caz-atlas.vercel.app)

- Düğüm büyüklüğü konser sayısını, renk enstrümanı gösterir. Bağın ağırlığı iki müzisyenin birlikte çaldığı farklı konser sayısıdır.
- 2D harita sık birlikte çalanları topluluklar halinde yerleştirir ve konser başlıklarından çıkarılan grup adlarını yazar. 3D görünüm de vardır.
- Bir müzisyeni seçince grupları, en çok birlikte çaldığı kişiler, ilk/son konseri, yıllara göre etkinliği, sık çaldığı mekanlar ve konser listesi açılır; başka birinin üzerine gelmek aralarındaki en kısa yolu gösterir.
- Ortak konser sayısına veya haritadaki bağa tıklamak iki müzisyenin birlikte çaldığı konserleri, birlikte çalmadılarsa aralarındaki yolu açar.
- Arama kutusu boşken köprü müzisyenleri, son 12 ayın en aktiflerini ve yeni gelenleri önerir.
- Zaman çizelgesiyle 1956'dan kesit tarihine kadar tarih aralığı seçilir; **Canlı** modda ağ zaman içinde oynatılır.
- Konser eşiği, kişi başına bağ sınırı, şehir ve mekan filtreleri, jam session'ları ve 10+ kişilik kadroları sayma seçenekleri; enstrümana göre vurgulama. Filtreler, tarih, seçim ve görünüm ayarları URL'de saklanır, bağlantı olarak paylaşılabilir.

Kısayollar: `⌘/Ctrl K` arama, `+` / `-` yakınlaştırma, `0` ekrana sığdırma, `Esc` seçimi kapatma.

## Geliştirme

[Bun](https://bun.sh) gerekir. Sunucu, veritabanı veya hesap yoktur; uygulama statik bir Vite sitesidir.

```sh
bun install
bun run dev     # http://localhost:5173, PORT ile değiştirilebilir
bun run build
bun test
```

`dev` ve `build`, depodaki arşivlerden `public/data/runtime.json`, `projects.json` ve `details.json` dosyalarını üretir. Tarayıcı önce küçük çalışma verisini ve önceden hesaplanmış varsayılan yerleşimi yükler, konser sayılarını ve bağları zaman çizelgesinden kendisi çıkarır; konser başlıkları seçim yapılınca yüklenir; diğer yerleşimler Web Worker'da hesaplanır.

| Klasör     | İçerik                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| `src/`     | React arayüzü, canvas çizimi, yerleşim motorları, arama ve zaman çizelgesi |
| `scripts/` | Veri toplama / hazırlama betikleri, tarayıcı testleri ve ölçümler          |
| `data/`    | Kaynak kesitleri ve müzisyen dizini                                        |
| `tests/`   | Birim testleri                                                             |
| `docs/`    | [Yerleşim araştırması](docs/layout-research.md): motor karşılaştırması     |

`main` dalına her push, [deploy workflow](.github/workflows/deploy.yml) ile testleri çalıştırıp Vercel'e yayınlar (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secret'ları gerekir).

## Veri

Kaynak: [Bizim Caz konser arşivi](https://bizimcaz.com/concerts), 14 Eylül 2026 kesiti.

| Kayıt                                |   Sayı |
| ------------------------------------ | -----: |
| Müzisyen profili                     | 14.714 |
| Kesit tarihinden önceki konser       | 35.670 |
| Konser kadrolarıyla eşleşen müzisyen | 12.077 |
| Birlikte çalmış müzisyen çifti       | 95.833 |
| Eşleşen müzisyen içeren mekan        |  1.485 |

Aynı konser ve aynı kadro üyesi tek kez sayılır. Kadro adları arşivdeki benzersiz müzisyen adlarıyla eşleştirilir; belirsiz adlar tahminle atanmaz. Sıfır kayıt, kişinin hiç konser vermediği anlamına gelmez. Grup etiketleri konser başlıklarından türetilir, kalıcı üyelik anlamına gelmez. Topluluklar ve aralarındaki mesafeler yerleşim içindir; tür, coğrafya veya ilişki gücü ölçüsü değildir.

| Dosya                            | İçerik                                            |
| -------------------------------- | ------------------------------------------------- |
| `data/concerts.json.gz`          | Konser tarihi, mekan ve kadrolar                  |
| `public/data/concerts.json`      | Konser sayıları, ortak konser bağları ve mekanlar |
| `public/data/atlas.json`         | Müzisyen profilleri ve önceki kaynak graf arşivi  |
| `data/source-networks.ndjson.gz` | Önceki toplamada indirilen ham ağ yanıtları       |
| `data/manifest.json`             | Önceki ağ arşivinin kapsamı ve checksum'ı         |

### Yeniden üretme

```sh
# Depodaki kesitten uygulama verisini üretir, ağa çıkmaz.
bun run data:concerts --build

# Herkese açık konser sayfalarını okur. Önbellekteki sayfalar yenilenmez;
# güncel veri için önce .cache/concerts/ klasörünü sil.
python3 scripts/collect-concerts.py --fetch
bun run data:concerts --build
```

Veri üreten ve toplayan betikler bayraksız çalıştırılınca yalnızca kullanım bilgisini yazar. Toplama başarısız olursa mevcut kesit değişmez.

## Tarayıcı testleri

`scripts/*-check.ts` testleri çalışan bir geliştirme sunucusuna karşı kurulu Chrome ile çalışır:

```sh
ATLAS_TEST_URL=http://localhost:5173 bun run test:ui
```

Diğerleri: `test:app`, `test:ux`, `test:render`, `test:3d`, `test:focus`, `test:timeline`, `test:layouts`, `test:communities`, `test:progress`, `test:physics`, `test:search`. Ölçümler: `bun run benchmark:layouts`, `bun run benchmark:interaction` (üretim derlemesine karşı; `RUNS`, `ONLY`, `PROFILE`), `bun run benchmark:search --baseline <commit>`, `bun run scripts/layout-quality.ts`.

## Lisans

Kod [MIT](LICENSE) lisanslıdır. Konser ve müzisyen verileri ile portreler Bizim Caz'a aittir.
