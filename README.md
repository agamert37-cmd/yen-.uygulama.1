# Hosting Panel

Kendi kendine barındırılan (self-hosted) bir dağıtım/hosting kontrol paneli
MVP'si: sunucudaki projeleri (Docker veya Node.js) web arayüzünden içeri
aktarır, türünü otomatik tespit eder, build/run eder, canlı log ve kaynak
kullanımı gösterir, basit bir dosya yöneticisi/editörü sunar.

Bu depo bir npm workspaces monorepo'sudur:

```
backend/    Node.js + Express + TypeScript + SQLite + Socket.io
frontend/   Vite + React + TypeScript + Tailwind CSS
```

## Hızlı Başlangıç (Geliştirme)

```bash
npm install                       # kök dizinde, tüm workspace'leri kurar
cp backend/.env.example backend/.env
# backend/.env içinde PANEL_AUTH_TOKEN'ı uzun/rastgele bir değerle değiştirin

npm run dev                       # backend (4000) + frontend (5173) birlikte
```

Frontend'in geliştirme sunucusu (`vite`), `/api` ve `/socket.io` isteklerini
`frontend/vite.config.ts` içindeki proxy ayarıyla backend'e (varsayılan
`http://localhost:4000`) yönlendirir. Backend farklı bir portta çalışıyorsa
`BACKEND_DEV_URL` ortam değişkeniyle değiştirilebilir.

## Üretim (Production) Kullanımı

```bash
npm run build                     # backend + frontend derlenir
cd backend && npm run start       # Express, frontend/dist'i de aynı porttan sunar
```

Tek bir port (varsayılan `4000`) hem `/api/*` hem de arayüzü sunar; ayrı bir
web sunucusuna veya reverse proxy'ye gerek yoktur (bkz. Ertelenen Özellikler).

## Ortam Değişkenleri (`backend/.env`)

| Değişken | Açıklama |
|---|---|
| `PORT` | Panelin dinleyeceği port (varsayılan `4000`) |
| `WORKSPACES_ROOT` | Her projenin izole klasörünün oluşturulacağı kök dizin |
| `DB_PATH` | SQLite veritabanı dosya yolu |
| `PANEL_DRIVER` | `mock` (Docker/PM2 simülasyonu) veya `real` (gerçek Docker Engine + PM2) |
| `PANEL_AUTH_TOKEN` | Tüm `/api/*` isteklerinde ve socket bağlantısında gereken paylaşılan token |

`PANEL_DRIVER=real` için sunucuda Docker (`/var/run/docker.sock` erişimi ile)
ve PM2'nin kurulu/erişilebilir olması gerekir.

## Mimari Özeti

- **Akıllı tespit** (`backend/src/modules/detection`): proje kökünde sırasıyla
  `docker-compose.yml`/`Dockerfile` → `package.json` → `requirements.txt`/
  `pyproject.toml` → `index.html` kontrol edilir (spesifikasyondaki öncelik
  sırasıyla birebir).
- **Durum makinesi** (`backend/src/modules/lifecycle/projectStateMachine.ts`):
  `idle → importing → detecting → [installing → building] → starting →
  running → stopping → stopped`. Start/stop/restart REST çağrıları ilk durum
  geçişinden hemen sonra döner; gerçek `npm install`/`docker compose up`
  arka planda çalışmaya devam eder ve ilerleme Socket.io üzerinden akar.
- **Driver soyutlaması** (`backend/src/drivers`): `ProjectDriver` arayüzünün
  `real` (gerçek `dockerode`/`docker compose` CLI/PM2) ve `mock` (zamanlayıcı
  tabanlı simülasyon, ama gerçek `package.json` script'lerini okuyarak hata
  yollarını da doğru simüle eder) uygulamaları vardır. Bu sayede tüm uygulama
  gerçek bir Docker daemon'ı veya PM2 süreç ağacı olmadan da uçtan uca
  denenebilir/test edilebilir.
- **Canlı akış** (`backend/src/sockets`): `project:<id>` odaları; bir proje
  sadece "çalışıyor" durumundayken VE odada en az bir istemci varken
  istatistik anketi (polling) yapılır.
- **Dosya yöneticisi** (`backend/src/modules/files`): tüm yollar
  `resolveWithinRoot` ile projenin kendi dizini dışına çıkamayacak şekilde
  doğrulanır; aynı koruma arşiv çıkarma (zip/tar-slip) ve workspace
  yönetiminde de paylaşılır.

## Kapsam Dışı Bırakılan Özellikler (Bilinçli MVP Sınırları)

Aşağıdakiler UI'da "bu sürümde desteklenmiyor" olarak işaretlenir, sessizce
atlanmaz:

- Nginx/Caddy reverse proxy + otomatik Let's Encrypt SSL
- systemd birim yönetimi (sadece PM2)
- Python/statik proje çalıştırma (sadece tespit edilir)
- "Ağ Ayarları" sekmesinden restart tetikleyen dinamik port değişimi
  (mevcut Genel Bakış sekmesindeki port alanı bir sonraki manuel başlatmada
  uygulanır, otomatik restart yapmaz)
- Sürükle-bırak yükleme cilası, UI'dan zip sıkıştırma
- Ağ trafiği (bytes in/out) izleme, disk kullanım dökümü
- Aranabilir tam log geçmişi (sadece son ~500 satırlık bellek-içi tampon +
  son ~50 olaylık `deploy_events` özeti var)
- Çok kullanıcılı kimlik doğrulama/yetkilendirme (tek paylaşılan token var)

## Doğrulama Durumu

**Bu geliştirme ortamında gerçekten doğrulanan:**
- Backend: 110 unit/integration testi (`npm test -w backend`) - tespit
  motoru, dosya yöneticisi, path-traversal/zip-slip/tar-slip koruması, git
  URL doğrulayıcı, tüm REST rotaları, gerçek bir `socket.io-client` ile
  auth + oda + log/stats akışı.
- **Gerçek PM2 ile canlı doğrulama** (mock değil): gerçek bir zip yüklendi,
  gerçek `npm install` çalıştı, gerçek PM2 süreci başlatıldı, uygulama
  gerçekten kendi portunda yanıt verdi, `pm2.describe()`'dan gerçek CPU/RAM
  okundu, restart/stop ile PM2 süreci gerçekten kaldırıldı.
- **Gerçek tarayıcı ile uçtan uca doğrulama** (Playwright): giriş → proje
  listesi → içe aktarma → tespit → başlatma → canlı log/istatistik → dosya
  gezgini + Monaco editör → ortam değişkenleri → durdurma → listeye dönüş
  akışının tamamı hem geliştirme (Vite dev + proxy) hem de üretim
  (`npm run build` + tek portlu Express) modunda test edildi.

**Gerçek bir Docker host'u gerektirir (bu sandbox'ta doğrulanamadı):**
Bu ortamda Docker CLI ve Compose eklentisi kurulu ama çalışan bir daemon yok
(`/var/run/docker.sock` yok). Docker orkestrasyon kodu (`dockerOrchestrator.ts`)
gözden geçirildi ve mock driver ile tüm akış (UI dahil) simüle edilerek
denendi, ancak gerçek `docker compose up -d --build` çalıştırması ve gerçek
`docker stats` sayıları doğrulanamadı.

### Gerçek Sunucuda Elle Doğrulama Kontrol Listesi

Docker + Node.js + PM2 kurulu bir Linux sunucuda:

1. `git clone` + `npm install` + `cp backend/.env.example backend/.env`,
   `PANEL_AUTH_TOKEN`'ı ayarlayın, `PANEL_DRIVER=real` yapın.
2. `npm run build && cd backend && npm run start`.
3. Panele girin, bir `docker-compose.yml` içeren örnek bir proje zip'i
   yükleyin; "Docker" olarak tespit edildiğini doğrulayın.
4. "Başlat" deyin; Loglar sekmesinde gerçek `docker compose up -d --build`
   çıktısının aktığını izleyin; Genel Bakış'ta gerçek `docker stats`
   sayılarının göründüğünü doğrulayın.
5. Aynısını `package.json` + `"start"` script'i olan bir Node.js projesiyle
   tekrarlayın (bu yol zaten bu ortamda gerçek PM2 ile doğrulandı, ama gerçek
   bir sunucuda da tekrar teyit edilmesi faydalı).
6. Durdur/Yeniden Başlat'ı deneyin, `docker ps` / `pm2 list` ile sunucu
   tarafında da süreçlerin gerçekten durduğunu/başladığını doğrulayın.
7. `Durdur` sonrası projeyi silip workspace dizininin gerçekten silindiğini
   kontrol edin.
