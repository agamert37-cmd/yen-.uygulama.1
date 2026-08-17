# Hosting Panel

Kendi kendine barındırılan (self-hosted) bir dağıtım/hosting kontrol paneli
MVP'si: sunucudaki projeleri (Docker veya Node.js) web arayüzünden içeri
aktarır, türünü otomatik tespit eder, build/run eder, canlı log ve kaynak
kullanımı gösterir, basit bir dosya yöneticisi/editörü sunar, ve çalışan bir
projeyi tek tuşla kendi subdomain'inde (Cloudflare Tunnel üzerinden) herkese
açık yayınlayabilir.

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
| `PANEL_DOMAIN` | Projelerin yayınlanacağı taban domain (`https://{subdomain}.PANEL_DOMAIN`). Boş bırakılırsa yayınlama tamamen devre dışı kalır (yerel/dev varsayılanı) |

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
- **Vhost reverse proxy** (`backend/src/modules/proxy`): panel tek bir
  Express sunucusu olarak kalır — ayrı bir Nginx/Caddy process'i yok. `Host`
  header'ı `PANEL_DOMAIN`'e veya bir alt subdomain'ine göre incelenir;
  panelin kendi domain'i normal işleyişe devam eder, bir subdomain
  `status === 'running'` bir projeye aitse istek o projenin portuna
  (`http://127.0.0.1:{port}`) canlı olarak (her istekte yeniden kontrol
  edilerek) proxy'lenir, eşleşme yoksa 404 döner. `PANEL_DOMAIN`
  tanımlanmadıkça bu katman tamamen devre dışıdır (sıfır davranış
  değişikliği). Genel internet erişimi ve otomatik TLS, ayrı çalışan bir
  Cloudflare Tunnel ile sağlanır (bkz. "Projeleri Herkese Açık Yayınlama").

## Projeleri Herkese Açık Yayınlama (Cloudflare Tunnel)

Bir proje `running` durumuna geçtikten sonra, Genel Bakış sekmesindeki
"Herkese Açık Yayın" bölümünden tek tuşla kendi subdomain'inde
(`https://{subdomain}.PANEL_DOMAIN`) yayınlanabilir — link kopyalanabilir
veya QR kod ile telefondan doğrudan açılabilir.

Genel internetten erişim, sunucuda **operatörün kendisinin çalıştırdığı**
bir [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(`cloudflared`) ile sağlanır — panel uygulaması cloudflared'i başlatmaz,
Cloudflare kimlik bilgisi saklamaz/yönetmez, bu bilinçli bir kapsam kararı.

```bash
# 1. cloudflared kurulumu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# 2. Cloudflare hesabınızla kimlik doğrulama
cloudflared tunnel login

# 3. Adlandırılmış bir tünel oluşturun
cloudflared tunnel create hosting-panel

# 4. DNS yönlendirme - bare domain VE wildcard AYRI kayıtlardır
cloudflared tunnel route dns hosting-panel panel.example.com
cloudflared tunnel route dns hosting-panel '*.panel.example.com'

# 5. ~/.cloudflared/config.yml
# tunnel: hosting-panel
# credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
# ingress:
#   - hostname: panel.example.com       # panelin kendisi
#     service: http://localhost:4000
#   - hostname: "*.panel.example.com"   # yayınlanan projeler
#     service: http://localhost:4000
#   - service: http_status:404          # zorunlu catch-all

# 6. Önce ön planda test edin, sonra servis olarak kurun
cloudflared tunnel run hosting-panel
cloudflared service install && systemctl enable --now cloudflared
```

Ardından `backend/.env`'de `PANEL_DOMAIN=panel.example.com` ayarlayıp
paneli yeniden başlatın. Kritik nokta: `*.panel.example.com` kuralı bare
`panel.example.com`'u **kapsamaz** — iki ayrı `route dns` ve iki ayrı
ingress satırı şart. Hangi host'un panelin kendisi, hangisinin yayınlanan
bir proje olduğu ayrımını cloudflared değil, panelin kendi vhost proxy'si
(`Host` header'ına bakarak) yapar — bu yüzden yeni bir proje yayınlamak
cloudflared config'ini hiç değiştirmez, TLS her iki host türünde de
otomatiktir (Let's Encrypt/Certbot adımı yok).

**Bilinen sınırlamalar:**
- `port` alanı zaten manuel/güvenilmeyen bir alan (bkz. yukarıdaki not) —
  proje gerçekte o portu dinlemiyorsa yayınlama "başarılı" görünür ama
  proxy 502 döner.
- Yayınlanan bir projenin kendi WebSocket endpoint'i tam olarak
  `/socket.io/` path'indeyse, panelin kendi Socket.io dinleyicisi (path
  bazlı, Host bazlı değil) bu upgrade isteğini yanlışlıkla yakalayabilir —
  dar bir kenar durum, bu sürümde çözülmedi.

## Kapsam Dışı Bırakılan Özellikler (Bilinçli MVP Sınırları)

Aşağıdakiler UI'da "bu sürümde desteklenmiyor" olarak işaretlenir, sessizce
atlanmaz:

- ~~Nginx/Caddy reverse proxy + otomatik Let's Encrypt SSL~~ — artık
  uygulandı, ama Nginx/Caddy/Certbot yerine uygulama-içi vhost proxy +
  Cloudflare Tunnel ile (bkz. "Projeleri Herkese Açık Yayınlama").
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

### Sonraki Adım Adayları (M9+, henüz tasarlanmadı)

- Proje başına health/uptime kontrolü (çalışıyor mu, ne kadar süredir)
- Cloudflare Analytics entegrasyonu (yayınlanan projelere kaç ziyaretçi geldiği)
- Dosya/proje yedekleme
- Proje listesinde durum/sağlığa göre sıralama
- "Otomatik kod ekleme" — henüz ne anlama geldiği netleşmedi

## Doğrulama Durumu

**Bu geliştirme ortamında gerçekten doğrulanan:**
- Backend: 141 unit/integration testi (`npm test -w backend`) - tespit
  motoru, dosya yöneticisi, path-traversal/zip-slip/tar-slip koruması, git
  URL doğrulayıcı, tüm REST rotaları, gerçek bir `socket.io-client` ile
  auth + oda + log/stats akışı; ayrıca vhost proxy - **gerçek bir
  `http.createServer` hedefine** karşı gerçek Host-header routing +
  proxy'leme, canlı `status === 'running'` yeniden kontrolü, ve
  publish/unpublish rotaları (PANEL_DOMAIN set/unset her iki durumda da).
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

**Gerçek bir domain + Cloudflare hesabı gerektirir (bu sandbox'ta
doğrulanamadı):** gerçek DNS wildcard yayılımı; gerçek bir Cloudflare
Tunnel üzerinden genel internetten (örn. mobil veri ile) erişilebilirlik;
yayınlanan bir projeye WebSocket upgrade'lerinin proxy'lenmesi (otomatik
testte kapsanmadı, sadece kod incelemesiyle doğrulandı); QR kodu taratıp
telefonda linkin gerçekten açılması.

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
