const puppeteer = require('puppeteer');
const fs = require('fs');

// Basit bekleme fonksiyonu
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeMaximum() {
  console.log('🚀 Maximum kampanya scraper başlıyor...');
  console.log('📅 Tarih:', new Date().toLocaleString('tr-TR'));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  try {
    const page = await browser.newPage();
    console.log('📄 Sayfa oluşturuldu');
    
    // User agent ayarla
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🔗 Maximum sitesine bağlanılıyor...');
    
    // Maximum kampanyalar sayfasına git
    let pageLoaded = false;
    let pageContent = null;
    
    try {
      await page.goto('https://www.maximum.com.tr/kampanyalar', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      pageLoaded = true;
      console.log('✅ Maximum kampanyalar sayfası yüklendi');
    } catch (error) {
      console.log('⚠️ Maximum sitesi erişim hatası:', error.message);
      console.log('🔄 Alternatif: İş Bankası sitesi deneniyor...');
      
      try {
        await page.goto('https://www.isbank.com.tr', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        pageLoaded = true;
        console.log('✅ İş Bankası sitesi yüklendi');
      } catch (error2) {
        console.log('❌ Her iki site de erişilemedi');
      }
    }
    
    // Sayfa yüklendiyse devam et
    if (pageLoaded) {
      // 3 saniye bekle (sayfa tam yüklensin)
      await delay(3000);
      
      const pageTitle = await page.title();
      const pageUrl = await page.url();
      console.log('📄 Sayfa başlığı:', pageTitle);
      console.log('📍 URL:', pageUrl);
      
      // Sayfadan veri topla
      pageContent = await page.evaluate(() => {
        // Tüm text içeriğini al
        const bodyText = document.body ? document.body.innerText : '';
        
        // Kampanya kelimesi geçen elementleri bul
        const campaignElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.innerText || el.textContent || '';
          return text.toLowerCase().includes('kampanya') || 
                 text.toLowerCase().includes('indirim') ||
                 text.toLowerCase().includes('fırsat');
        });
        
        // İlk 10 kampanya benzeri içeriği topla
        const campaigns = [];
        for (let i = 0; i < Math.min(10, campaignElements.length); i++) {
          const el = campaignElements[i];
          const text = (el.innerText || el.textContent || '').substring(0, 200);
          if (text.length > 20) {
            campaigns.push({
              text: text,
              tag: el.tagName
            });
          }
        }
        
        return {
          title: document.title,
          url: window.location.href,
          bodyTextLength: bodyText.length,
          campaignElementCount: campaignElements.length,
          sampleCampaigns: campaigns,
          allLinks: Array.from(document.querySelectorAll('a')).slice(0, 20).map(a => ({
            text: (a.innerText || '').substring(0, 50),
            href: a.href
          }))
        };
      });
      
      console.log('📊 Sayfa analizi tamamlandı');
      console.log('- Text uzunluğu:', pageContent.bodyTextLength);
      console.log('- Kampanya elementi sayısı:', pageContent.campaignElementCount);
      
      // Screenshot al
      await page.screenshot({ 
        path: 'screenshot.png',
        fullPage: false
      });
      console.log('📸 Screenshot alındı');
    }
    
    // data klasörünü oluştur
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
      console.log('📁 data klasörü oluşturuldu');
    }
    
    // Kampanya verilerini hazırla (demo)
    const campaigns = [];
    
    if (pageContent && pageContent.sampleCampaigns) {
      // Gerçek veriden kampanya oluştur
      pageContent.sampleCampaigns.forEach((item, index) => {
        campaigns.push({
          id: `campaign-${index + 1}`,
          title: item.text.split('\n')[0] || `Kampanya ${index + 1}`,
          description: item.text,
          bank: 'Maximum',
          source: pageContent.url,
          scrapedAt: new Date().toISOString()
        });
      });
    }
    
    // Eğer hiç kampanya bulunamadıysa demo veri ekle
    if (campaigns.length === 0) {
      campaigns.push({
        id: 'demo-1',
        title: 'Maximum Demo Kampanya',
        description: 'Gerçek veri çekilemedi, demo kampanya',
        bank: 'Maximum',
        note: 'Site erişim sorunu veya veri bulunamadı',
        scrapedAt: new Date().toISOString()
      });
    }
    
    // Ana veri dosyasını kaydet
    const result = {
      success: pageLoaded,
      bank: 'Maximum',
      sourceUrl: pageContent ? pageContent.url : 'https://www.maximum.com.tr/kampanyalar',
      scrapedAt: new Date().toISOString(),
      campaignCount: campaigns.length,
      campaigns: campaigns,
      debug: {
        pageTitle: pageContent ? pageContent.title : null,
        textLength: pageContent ? pageContent.bodyTextLength : 0,
        foundElements: pageContent ? pageContent.campaignElementCount : 0
      }
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    console.log('💾 Kampanyalar kaydedildi: data/maximum-campaigns.json');
    console.log(`📊 Toplam ${campaigns.length} kampanya`);
    
    // Özet dosyası
    const summary = {
      lastUpdate: new Date().toISOString(),
      success: true,
      totalCampaigns: campaigns.length,
      banks: [
        {
          name: 'Maximum',
          url: result.sourceUrl,
          campaignCount: campaigns.length,
          status: pageLoaded ? 'success' : 'error'
        }
      ]
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    console.log('📋 Özet kaydedildi: data/summary.json');
    
  } catch (error) {
    console.error('❌ Beklenmeyen hata:', error.message);
    console.error('Stack:', error.stack);
    
    // Hata durumunda da data klasörü oluştur
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // Hata dosyası
    const errorData = {
      error: true,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('data/error.json', JSON.stringify(errorData, null, 2));
    console.log('📝 Hata detayları kaydedildi: data/error.json');
    
    // Yine de boş bir kampanya dosyası oluştur
    const emptyResult = {
      success: false,
      error: error.message,
      bank: 'Maximum',
      campaigns: [],
      scrapedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(emptyResult, null, 2));
    
  } finally {
    await browser.close();
    console.log('🏁 Browser kapatıldı');
  }
}

// Ana fonksiyonu çalıştır
console.log('🎬 Scraper başlatılıyor...');

scrapeMaximum()
  .then(() => {
    console.log('✨ İşlem başarıyla tamamlandı!');
    console.log('📂 data/ klasörünü kontrol edin');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
