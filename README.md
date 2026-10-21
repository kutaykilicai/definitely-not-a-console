<div align="center">

<img src="docs/logo.png" width="120" alt="Definitely Not PS5 Menu simgesi">

# Definitely Not PS5 Menu

*Kesinlikle bir PS5 menüsü değil. Sadece biraz ona benziyor, o kadar.*

[![Sürüm](https://img.shields.io/github/v/release/kutaykilicai/definitely-not-ps5-menu?label=s%C3%BCr%C3%BCm&color=2f6fd6)](https://github.com/kutaykilicai/definitely-not-ps5-menu/releases/latest)
[![İndirme](https://img.shields.io/github/downloads/kutaykilicai/definitely-not-ps5-menu/total?label=indirme&color=2f6fd6)](https://github.com/kutaykilicai/definitely-not-ps5-menu/releases)
[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-3a3f4b)](LICENSE)
[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?logo=windows&logoColor=white)](#kurulum)

<img src="docs/screenshots/gezinme.gif" width="860" alt="Ana ekranda oyunlar arasında gezinme">

</div>

## Nedir

Windows için yazılmış, PS5 ana ekranına benzeyen bir oyun başlatıcı. Bilgisayarındaki oyunları, emülatörleri ve kısayolları büyük kapaklarıyla tek bir ekranda toplar. Kanepeden kumandayla da masa başında klavyeyle de rahat kullanılsın diye yapıldı. Bir oyunu başlattığında yükleme ekranı oyun penceresi hazır olana kadar kalır, sonra menü tamamen kapanır ve oyunun önünde ya da arkasında hiçbir penceresi kalmaz. Oyun kapanınca menü ana ekranda, o oyun seçili hâlde geri gelir. Oyunun ortasında Esc'ye ya da kumandadaki Xbox düğmesine basılı tutarsan oyun olduğu yerde durur ve menü açılır; oradan kaldığın yere dönebilir ya da başka bir oyuna geçebilirsin.

Resmi bir ürün değil, hayran işi bir projedir. Sony ile hiçbir bağı yoktur.

![Ana ekran](docs/screenshots/ana-ekran.png)

## Özellikler

- Oyun ekleme, düzenleme, sıralama ve silme uygulamanın içinden yapılır, dosya düzenlemen gerekmez.
- PS4 dökümlerinin `sce_sys` klasöründen kapak, arka plan ve oyun adı alınır; görseli olmayan oyunlara programın simgesiyle bir kutucuk hazırlanır.
- Xbox kumandası ve klavye desteği.
- Konsoldaki gibi oyun sırasında menüye dönüş: Esc'ye ya da Xbox düğmesine basılı tut, oyun duraklar, menüden **Devam Et** ile kaldığın yerden sürer. Başka bir oyun seçersen açık olan önce kapatılır.
- İstersen oyun Lossless Scaling ile birlikte açılır ve ölçekleme kendiliğinden başlar.
- Açılırken uzun süre shader hazırlayan oyunlarda (Shadow of the Colossus PC portu, shadPS4 ile inFAMOUS) yükleme ekranında ilerleme yüzdesi görünür.
- İkinci menü olarak 2010-2013 dönemi Xbox 360 panosu; yukarı/aşağı ile geçilir.
- Her menünün ilk açılışında konsol açılışına benzeyen bir intro; istersen kendi videonla, sesinle ya da logonla.
- Tek tıkla kurulum, yönetici izni istemez.

## Kurulum

[Releases](https://github.com/kutaykilicai/definitely-not-ps5-menu/releases/latest) sayfasından `Definitely.Not.PS5.Menu.Setup.1.4.0.exe` dosyasını indirip çalıştır. Kurulum birkaç saniye sürer, yönetici izni istemez, masaüstüne ve Başlat menüsüne kısayol koyar ve bitince menüyü açar.

Uygulama imzalı olmadığı için Windows ilk açılışta "Windows bilgisayarınızı korudu" uyarısı gösterebilir. O pencerede **Diğer bilgiler** yazısına, ardından **Yine de çalıştır** düğmesine bas. Bunu yalnızca bir kez yapman gerekir.

Kurmadan denemek istersen aynı sayfadaki `Definitely-Not-PS5-Menu-1.4.0-portable.zip` dosyasını bir klasöre çıkarıp içindeki `Definitely Not PS5 Menu.exe` dosyasını açabilirsin.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/ilk-acilis.png" alt="İlk açılış"><br><sub>İlk açılışta kütüphane boştur, imleç Oyun Ekle kutucuğunda bekler.</sub></td>
<td width="50%"><img src="docs/screenshots/baslatma.png" alt="Oyun başlatılırken"><br><sub>Oyun açılırken menü, oyunun görseliyle karanlığa geçer.</sub></td>
</tr>
</table>

## Oyun ekleme

1. Ana ekrandaki **+** kutucuğuna bas. Dosya seçme penceresi açılır.
2. Oyunun `.exe` dosyasını ya da masaüstündeki kısayolunu seç. Kısayol seçersen içindeki parametreler ve çalışma klasörü de olduğu gibi gelir. Emülatörle açılan bir oyunsa emülatörün exe'sini seçip oyunu açan komutu **Parametreler** satırına yaz, örneğin shadPS4 için `-g "D:\Games\PS4\CUSA00000\eboot.bin"`.
3. **Görsel** satırından bir kapak resmi seç ya da PS4 dökümünün `sce_sys` klasörünü göster, sonra **Kaydet**'e bas.

<img src="docs/screenshots/oyun-duzenle.png" width="860" alt="Oyun düzenleme ekranı">

Sonradan değiştirmek istediğinde oyunun seçeneklerinden **Oyunu Düzenle**'yi aç. Tüm liste Ayarlar'daki **Oyunları Yönet** bölümünde durur; buradan sırayı değiştirebilir ya da bir oyunu silebilirsin. Silmek oyunu yalnızca listeden çıkarır, dosyalarına dokunmaz. Ad ve parametre gibi yazı gereken alanlarda klavye lazım olur, ama kumandayla eklerken bile ad exe'den, kısayoldan ya da `sce_sys` klasöründen kendiliğinden dolar.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/oyun-detay.png" alt="Oyun ayrıntıları"><br><sub>Aşağı inince oyunun bilgileri, dosya konumu ve düzenleme kartı.</sub></td>
<td width="50%"><img src="docs/screenshots/kutuphane.png" alt="Oyun kütüphanesi"><br><sub>Kütüphane bütün oyunları alfabetik olarak gösterir.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/oyunlari-yonet.png" alt="Oyunları yönet"><br><sub>Oyunları Yönet: ekleme, düzenleme, sıralama, silme.</sub></td>
<td width="50%"><img src="docs/screenshots/ayarlar.png" alt="Ayarlar"><br><sub>Ayarlar ekranı.</sub></td>
</tr>
</table>

## Kontroller

| | Xbox kumandası | Klavye |
|---|---|---|
| Gezinme | Sol çubuk ya da yön tuşları | Ok tuşları |
| Seç / Oyna | A | Enter |
| Geri | B | Esc |
| Oyun seçenekleri | Menü (≡) | O |
| Oyunlar / Medya sekmesi | LB, RB | Q, E |
| Ana ekrana dön | Xbox düğmesi ya da Görünüm + Menü | H |
| Oyun açıkken menüye dön | Xbox düğmesine ya da Görünüm + Menü'ye 1 sn basılı tut | Esc'ye 1 sn basılı tut ya da Ctrl+Alt+Home |
| Menüden çık | | Alt+F4 |

## Oyun sırasında menüye dönme

Oyundayken Esc'ye ya da kumandadaki Xbox düğmesine bir saniye kadar basılı tut. Kısa basışlar her zamanki gibi oyuna gider, yani oyunun kendi duraklatma menüsü yine Esc ile açılır. Basılı tuttuğunda:

1. Lossless Scaling ölçekliyorsa durdurulur.
2. Oyunun penceresi simge durumuna alınır ve oyun duraklatılır, sesi de kesilir.
3. Menü açılır; oyunun kutucuğunda küçük bir duraklatma işareti, düğmesinde **Devam Et** yazar.

**Devam Et**'e bastığında oyun kaldığı yerden sürer, tam ekran olarak öne gelir, menü kapanır ve oyunda Lossless Scaling açıksa yeniden başlatılır. Menüdeyken başka bir oyun seçersen "… kapatılacak" uyarısı çıkar; onaylarsan açık oyun kendi kapatma isteğiyle kapatılır, beş saniye içinde kapanmazsa sonlandırılır ve yeni oyun açılır. Kaydetmediğin ilerleme bu yüzden gider, önce oyunun içinde kaydetmeyi unutma.

Geçişler sırasında ekran kısa bir süre siyaha kapanır: Esc'ye ya da Xbox düğmesine basılı tuttuğunda oyun küçültülmeden ve Lossless Scaling durdurulmadan önce, oyunu başlattığında ve Devam Et'e bastığında ise oyun tam ekran çizilene ve Lossless Scaling devreye girene kadar. Böylece arada masaüstü ya da başka bir pencere görünmez. Bu siyah perde tıklamaları ve tuşları almaz, en geç birkaç saniye içinde kendiliğinden kalkar. Menünün Lossless Scaling için açtığı profillerde Auto Scale gecikmesi 1 saniyedir; eski sürümün açtığı 5 saniyelik profiller, Lossless Scaling kapalıyken oyun ilk başlatıldığında 1 saniyeye indirilir (Settings.xml'in yedeği yanına `.bak-ps5menu-…` adıyla alınır).

Oyun açıkken menüyü Alt+F4 ile kapatırsan menü önce sorar: **İkisini de kapat** (varsayılan), **Yalnızca menüyü kapat** ya da **İptal**. Yalnızca menüyü kapatırsan oyun öne gelir ve kendi başına sürer. Menü bundan sonra kendiliğinden yeniden açılmaz.

Ayarlar ekranında Esc ve Xbox düğmesi için ayrı ayrı aç/kapat ve basılı tutma süresi (0,6 / 1 / 1,5 / 2 sn) seçilebilir. Xbox düğmesine basınca Windows'ta Game Bar açılıyorsa onu Windows Ayarlar > Oyun > Game Bar bölümünden kapatabilir ya da Görünüm + Menü'yü birlikte basılı tutabilirsin. Bazı emülatörler duraklatılmayı sevmeyebilir; öyle bir oyunda **Oyunu Düzenle** ekranındaki **Menüdeyken oyunu duraklat** satırını kapat. O zaman oyun menü açıkken simge durumunda çalışmaya devam eder.

## Oyunun kendi yüklemesi

Bazı oyunlar ve portlar ilk görüntüden önce uzun süre hazırlık yapar. Örneğin Shadow of the Colossus PC portu (AjncSystem/ShadowOfTheColossus-PC) her açılışta shader önbelleğini yeniden kurar ve bu sırada penceresi boş kalır. Portun kendi "Loading shaders… %" çubuğu bu aşamada çizilemez, çünkü önbellek görüntü katmanı hazırlanmadan önce okunur. Menü böyle bir oyunda yükleme ekranını açık tutar. Oyunun kapağını, adını ve **Shader'lar hazırlanıyor %NN** satırını gösterir, oyun hazır olunca her zamanki gibi oyuna geçer.

Yüzde, oyunun yazdığı günlük dosyasından okunur. Oyun yüzde yazmıyorsa önbellekteki öğe sayısından ve önceki açılışların süresinden tahmin edilir. Tahmin, oyun "hazırım" demeden %100'e varmaz. Hiçbir bilgi yoksa çubuk yalnızca hareket eder. Shadow of the Colossus portu `SotC.exe --play` ile, inFAMOUS Second Son ya da First Light `shadPS4.exe` ile eklendiyse bu kendiliğinden çalışır. shadPS4'te günlük `user\log\shad_log.txt` (ya da `%APPDATA%\shadPS4\log`) dosyasından okunur. Yüzde ya da "yapılan / toplam" satırı varsa o kullanılır; yükleme "Preloaded N pipelines" satırıyla biter. shadPS4 günlüğünü tamponlayarak yazdığı için bu satır diske geç düşebilir. Satır gelmezse oyun, tahmini süre dolduktan 1,5 saniye sonra uyarı göstermeden, en geç 90 saniyede gösterilir. Kendi günlüğü tamponlu olan başka bir oyun için `loadProgress` içinde `"graceMs": 1500, "graceQuiet": true` yazılabilir. `startMs`, yükleme başlamadan önce geçen süre olarak ilk tahmine eklenir. Lossless Scaling bu oyunlarda oyun gösterildikten sonra devreye girer. Başka bir oyun için `games.json` içinde o oyuna bir `loadProgress` alanı eklenebilir:

```json
"loadProgress": { "log": "logs\\game.log", "percent": "Compiling shaders (\\d+)%", "ready": "Renderer ready" }
```

`log` oyunun klasörüne göre ya da tam yol olarak verilir. `percent` yüzdeyi, `counter` "yapılan / toplam" sayılarını, `ready` yüklemenin bittiğini gösteren satırı yakalar. `count: { "dir": "...", "ext": ".key" }` önbellek dosyalarını sayar. Kapatmak için `"loadProgress": false` yazılır. Günlük dosyası 25 saniye içinde oluşmazsa menü beklemeyi bırakır.

Menü bir oyunu sonsuza kadar beklemez. Tahmini süre dolduktan sonra günlük 20 saniye boyunca hiç büyümezse ya da oyunun kendi yüzdesi o kadar süre ilerlemezse "Yükleme beklenenden uzun sürdü" yazar ve oyunu olduğu gibi gösterir. Oyunun penceresi 10 saniye yanıt vermezse "Oyun yanıt vermiyor" yazar ve yine oyunu gösterir. İki durumda da Esc'ye ya da Xbox düğmesine basılı tutarak menüye dönüp oyunu kapatabilirsin. Oyun yüklenirken kapanırsa menü ana ekrana döner. En uzun bekleme, beklenen sürenin iki katı artı 30 saniyedir (en az bir, en çok üç dakika).

## Lossless Scaling

Steam'den [Lossless Scaling](https://store.steampowered.com/app/993090/Lossless_Scaling/) kuruluysa menü onu kendisi bulur ve oyun düzenleme ekranında **Lossless Scaling ile başlat** seçeneği görünür. Açtığında LS'e o oyuna ait bir profil eklenir (Auto Scale açık, bir saniye gecikmeli). Oyunu başlattığında LS yükleme ekranının arkasında simge durumunda açılır, penceresi öne çıkarsa menü onu geri indirir. Oyun açıldıktan sonra odak oyunda tutulur, böylece kumanda oyunu kullanmaya devam eder ve ölçekleme birkaç saniye içinde kendiliğinden başlar. Auto Scale bir sebeple devreye girmezse menü, oyun ön planda ve tam ekranken ve ortada hiçbir LS penceresi yokken LS'in ölçekleme kısayoluna bir kez basar, ardından odağı oyuna geri verir. Profil eklenmeden önce LS'in ayar dosyası yedeklenir; LS o sırada açıksa profil eklenmez; LS kapalıyken oyunu başlattığında menü onu kendisi ekler. LS kurulu değilse seçeneğin yerine kısa bir not çıkar.

LS, tam ekran özel (exclusive fullscreen) modda çalışan oyunları ölçekleyemez. Bu yüzden oyunu pencereli ya da kenarlıksız tam ekran moduna alman gerekir.

## Xbox 360 menüsü

PS5 ana ekranının yanında ikinci bir menü olarak 2010-2013 dönemi Xbox 360 panosuna benzeyen bir ekran var. PS5 menüsünde en üst ya da en alt satırdayken yukarı veya aşağı basınca menüler kayarak yer değiştirir, Xbox 360 menüsünde ızgaranın en üstünde yukarıya ya da en altında aşağıya basınca PS5 menüsüne dönülür. Oyun listesi iki menüde ortaktır, son kullandığın menü bir sonraki açılışta yine gelir. Oyundan dönünce hangi menüden başlattıysan o açılır.

## Açılış introları

Her menünün ilk açılışında konsolun açılış animasyonuna benzeyen kısa bir intro oynar: program açılırken son kullandığın menünün introsu, o oturumda diğer menüye ilk geçişte de onunki. Her intro bir oturumda bir kez oynar, sonraki geçişler normal kaymayla olur, oyundan dönüşte intro oynamaz. A, Enter ya da tıklama introyu geçer; intro sürerken yukarı/aşağı menü değiştirmez. Ayarlar > **Açılış introsu** satırından kapatılabilir (Bir kez / Kapalı).

İstersen introları kendi dosyalarınla değiştirebilirsin. Dosyalar `%APPDATA%\Definitely Not PS5 Menu\intro\` klasörüne konur (klasör yoksa program ilk açılışta oluşturur). Her konsol için sıra şöyledir:

1. `ps5-boot.mp4` / `ps5-boot.webm` ya da `x360-boot.mp4` / `x360-boot.webm` varsa video kendi sesiyle tam ekran oynar. Videonun sonu menüye kararmadan geçer (son kare oynamaya devam ederken menünün üstünden yavaşça çekilir, arada siyah kare ya da parlama olmaz). PS5 videosu konsolun "PS düğmesine bas" ekranını da içerdiği için o zaman menünün kendi giriş ekranı ayrıca gösterilmez.
2. Video yoksa program introyu kendisi çizer. Ses için `ps5-boot.wav/.mp3/.ogg` ya da `x360-boot.wav/.mp3/.ogg`, logo için `ps5-logo.png` ya da `x360-logo.png` (arka planı saydam PNG) kullanılır.
3. Bunlar da yoksa programın kendi sesi ve kendi işareti kullanılır.

Logo dosyaları introdan başka yerlerde de kullanılır: `ps5-logo.png`'nin sol taraftaki sembolü (beyaza boyanarak) PS5 giriş ekranındaki işaretin yerine geçer (kendi `boot.png`'n varsa o önceliklidir); `x360-logo.png`'nin üstteki küresi Xbox 360 menüsünün düğme ipuçlarında Rehber (Xbox) düğmesinin simgesi olarak ayarlanır; intronun sonunda küre ve yazı ayrı ayrı belirir.

Videonun başını ve sonunu dosyaya dokunmadan kırpmak için aynı klasöre `intro.json` koy, saniye cinsinden:

```json
{ "ps5": { "start": 1.02, "end": 13.8 }, "x360": { "start": 0.1, "end": 7.6 } }
```

`start` videonun başındaki siyah ya da gereksiz kısmı atlar, `end` geldiğinde menüye geçiş başlar. Video açılamazsa (bozuk dosya, desteklenmeyen biçim) 2,5 saniye içinde çizilen introya geçilir.

## Kaldırma

Windows Ayarlar > Uygulamalar > Yüklü uygulamalar listesinde **Definitely Not PS5 Menu** satırını bulup Kaldır'a bas. Oyun listen ve ayarların `%APPDATA%\Definitely Not PS5 Menu` klasöründe kalır, yeniden kurarsan her şey olduğu gibi geri gelir. Hiç iz kalmasın istiyorsan o klasörü de sil.

## SSS

**Oyunlarım nerede saklanıyor?**
Liste, ayarlar ve seçtiğin görseller `%APPDATA%\Definitely Not PS5 Menu` klasöründe durur. Eski "PS5 Menu" sürümünü kullandıysan oyunların ilk açılışta oraya kendiliğinden taşınır.

**Windows açılınca kendiliğinden başlasın istiyorum.**
Ayarlar'daki **Windows ile Başlat** satırını aç.

**Bir oyun başlıyor ama menü hemen geri geliyor.**
Bazı oyunlar önce kısa ömürlü bir başlatıcı açar. Menü normalde asıl oyunun penceresini bekler; yine de olmuyorsa oyunun kendi exe'sini seçmeyi dene.

**Oyun kapağı bulanık ya da yok.**
Görsel satırından kare bir kapak (en az 512x512) ve 16:9 bir arka plan seçebilirsin.

**Kumandam çalışmıyor.**
Menü, Windows'un Xbox kumandası desteğini kullanır. Kumanda başka bir oyunda çalışıyorsa menüde de çalışır; Steam açıksa Steam Input'un kumandayı yakalamadığından emin ol.

## Geliştirme

Uygulama Electron ile yazıldı. Oyun pencerelerini izleyen küçük yardımcı program `native/ps5winhelper.c` içinde, mingw ile derlenir. Testler `node test/unit.test.js`, `node test/winwatch.test.js`, `node test/homeflow.test.js` `node test/loadprogress.test.js` ve `node test/x360.test.js` ile çalışır; intro akışı `tools/x360/boot_e2e.sh synth|logo|video` ile Xvfb altında uçtan uca denenir; yardımcının basılı tutma mantığı `gcc native/hold_test.c` ile ayrıca denenir, geçişlerde ekrana başka bir pencere sızmadığı Linux üzerinde gerçek pencerelerle kaydedilip kare kare `tools/frame_test.sh` ile denetlenir (`tools/frame_test.sh <klasör> progress` yükleme ilerlemesini dener) (Xvfb, ffmpeg, ffplay, xdotool gerekir), kurulum dosyaları `node tools/build.js` ile `dist/` klasörüne çıkar.

```
cd app && npm install && npx electron . --windowed
```

## Lisans ve uyarı

Kod MIT lisansıyla dağıtılır, ayrıntılar [LICENSE](LICENSE) dosyasında. Yazı tipi Noto Sans, SIL Open Font License ile gelir.

Bu proje resmi değildir; Sony Interactive Entertainment ya da Microsoft ile bağlantısı yoktur, onlar tarafından desteklenmez ya da onaylanmaz. PlayStation ve PS5, Sony Interactive Entertainment Inc.'in; Xbox ve Xbox 360, Microsoft Corporation'ın ticari markalarıdır. Uygulamada Sony'ye ya da Microsoft'a ait kod, yazı tipi, ses, video, logo ya da görsel bulunmaz; açılış introları ve sesleri programın kendi çizimi ve sentezidir, intro klasörüne konan dosyalar kullanıcınındır; arayüzdeki her şey sıfırdan çizildi. Ekran görüntülerinde görünen oyun kapakları sahiplerine aittir ve yalnızca menünün nasıl göründüğünü göstermek için kullanıldı, depoda ya da kurulum dosyasında yer almaz.

## English

*Definitely not a PS5 menu. It just looks a bit like one.*

A game launcher for Windows that looks like the PS5 home screen. You add games, emulators or shortcuts from inside the app (the **+** tile, or Settings > Oyunları Yönet), pick a cover image or point it at a PS4 dump's `sce_sys` folder, and launch everything with a keyboard or an Xbox controller. While a game runs the menu window is closed completely and comes back when the game exits. Hold Esc or the Xbox button for about a second during a game to pause it and open the menu, then pick Devam Et to continue where you left off; starting another game closes the open one first, like on a console. If Lossless Scaling is installed through Steam, any game can start with it and scale automatically. Games that prepare shaders for a long time before their first picture (such as the Shadow of the Colossus PC port) show their progress on the launch screen. A second menu styled after the 2010-2013 Xbox 360 dashboard is one up/down press away. Each menu plays a short boot intro the first time it comes up in a session (Settings > Açılış introsu: once / off); put your own `ps5-boot.mp4` / `x360-boot.mp4`, `*-boot.wav/.mp3/.ogg` or `ps5-logo.png` / `x360-logo.png` into `%APPDATA%\Definitely Not PS5 Menu\intro\` to replace the video, the sound or the logo, and trim a video with `intro.json` (`{"x360": {"start": 0.1, "end": 7.6}}`).

Download `Definitely.Not.PS5.Menu.Setup.1.4.0.exe` from the [Releases](https://github.com/kutaykilicai/definitely-not-ps5-menu/releases/latest) page and run it. It installs per user, needs no admin rights and adds Start Menu and desktop shortcuts. The app is not code signed, so SmartScreen may warn you the first time: click **More info**, then **Run anyway**. A portable zip is available as well. To uninstall, use Windows Settings > Apps. The interface is in Turkish by default; switch it under Ayarlar > Dil / Language.

This is an unofficial fan project and is not affiliated with, endorsed or sponsored by Sony Interactive Entertainment or Microsoft. PlayStation and PS5 are trademarks of Sony Interactive Entertainment Inc.; Xbox and Xbox 360 are trademarks of Microsoft Corporation. No Sony or Microsoft code, fonts, sounds, videos, logos or artwork are included (the boot intros are drawn and synthesized by the app; files you put in the intro folder stay yours); game covers in the screenshots belong to their owners and are not part of the repository or the installer. MIT License, Copyright (c) 2026 Kutay Kılıç.
