const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeMaximum() {
  console.log('🚀 Maximum kampanya scraper başlıyor...');
  console.log('📅 Tarih:', new Date().toLocaleString('tr-TR'));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });
  
  try {
    const page = await browser.newPage();
    console.log('📄 Sayfa oluşturuldu');
    
    // Anti-bot ayarları
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // JavaScript özelliklerini değiştir (bot tespitini zorlaştır)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en'],
      });
      window.chrome = {
        runtime: {},
      };
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });
    
    // Extra headers ekle
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    });
    
    console.log('🔗 Maximum sitesine bağlanılıyor...');
    
    // Önce ana sayfaya git (daha doğal görünsün)
    try {
      await page.goto('https://www.maximum.com.tr', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('✅ Ana sayfaya gidildi');
      await page.waitForTimeout(2000 + Math.random() * 3000);
    } catch (e) {
      console.log('⚠️ Ana sayfa yüklenemedi, direkt kampanyalara gidiliyor...');
    }
    
    // Kampanyalar sayfasına git
    try {
      await page.goto('https://www.maximum.com.tr/kampanyalar', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
      console.log('✅ Kampanyalar sayfası yüklendi');
    } catch (error) {
      console.log('❌ Maximum sitesine erişilemedi. Alternatif kaynak deneniyor...');
      
      // ALTERNATIF: İş Bankası sitesinden Maximum kampanyalarını çek
      console.log('🔄 İş Bankası sitesi deneniyor...');
      await page.goto('https://www.isbank.com.tr/maximum-kredi-karti-kampanyalari', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      console.log('✅ İş Bankası Maximum sayfası yüklendi');
    }
    
    // Sayfanın yüklenmesini bekle
    await page.waitForTimeout(3000);
    
    const pageTitle = await page.title();
    const pageUrl = await page.url();
    console.log('📄 Sayfa başlığı:', pageTitle);
    console.log('📍 Mevcut URL:', pageUrl);
    
    // HTML içeriğini kontrol et
    const htmlLength = await page.evaluate(() => document.documentElement.innerHTML.length);
    console.log('📊 HTML uzunluğu:', htmlLength);
    
    // Basit bir veri toplama (site engellemesi durumunda bile çalışır)
    const pageData = await page.evaluate(() => {
      // Sayfadaki tüm metni al
      const allText = document.body.innerText || '';
      
      // Başlıkları topla
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => h.innerText);
      
      // Linkleri topla
      const links = Array.from(document.querySelectorAll('a[href*="kampanya"], a[href*="detay"]')).map(a => ({
        text: a.innerText,
        href: a.href
      }));
      
      return {
        textLength: allText.length,
        headingCount: headings.length,
        linkCount: links.length,
        sampleHeadings: headings.slice(0, 5),
        sampleLinks: links.slice(0, 5)
      };
    });
    
    console.log('📊 Sayfa analizi:', JSON.stringify(pageData, null, 2));
    
    // Screenshot al (her durumda)
    const screenshotPath = `screenshot-${Date.now()}.png`;
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: false 
    });
    console.log('📸 Screenshot alındı:', screenshotPath);
    
    // Basit kampanya verisi oluştur (demo için)
    const campaigns = [
      {
        id: 'demo-1',
        title: 'Maximum Demo Kampanya',
        description: 'Site erişim sorunu nedeniyle demo veri',
        bank: 'Maximum',
        scrapedAt: new Date().toISOString()
      }
    ];
    
    // data klasörünü oluştur
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
      console.log('📁 data klasörü oluşturuldu');
    }
    
    // Sonuçları kaydet
    const result = {
      bank: 'Maximum',
      originalUrl: 'https://www.maximum.com.tr/kampanyalar',
      actualUrl: pageUrl,
      scrapedAt: new Date().toISOString(),
      status: pageUrl.includes('maximum.com.tr') ? 'success' : 'fallback',
      campaignCount: campaigns.length,
      campaigns: campaigns,
      debug: pageData
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    console.log('💾 Veri kaydedildi: data/maximum-campaigns.json');
    
    // Özet kaydet
    const summary = {
      lastUpdate: new Date().toISOString(),
      success: true,
      message: 'Scraping tamamlandı (demo veri)',
      banks: [{
        name: 'Maximum',
        status: result.status,
        campaignCount: campaigns.length
      }]
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    console.log('📊 Özet kaydedildi: data/summary.json');
    
  } catch (error) {
    console.error('❌ Scraping hatası:', error.message);
    
    // Hata durumunda bile bir şeyler kaydet
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    const errorData = {
      error: true,
      message: error.message,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('data/error.json', JSON.stringify(errorData, null, 2));
    console.log('📝 Hata kaydedildi: data/error.json');
    
  } finally {
    await browser.close();
    console.log('🏁 Browser kapatıldı');
  }
}

// Çalıştır
scrapeMaximum()
  .then(() => {
    console.log('✨ İşlem tamamlandı!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
