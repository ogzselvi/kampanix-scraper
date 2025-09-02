const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeMaximum() {
  console.log('🚀 Maximum kampanya scraper başlıyor...');
  
  // Browser'ı başlat
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    console.log('📄 Yeni sayfa açıldı');
    
    // Sayfaya git
    await page.goto('https://www.maximum.com.tr/kampanyalar', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('✅ Maximum kampanyalar sayfasına gidildi');
    
    // Sayfanın yüklenmesini bekle
    await page.waitForTimeout(3000);
    
    // Kampanyaları çek
    const campaigns = await page.evaluate(() => {
      const campaignElements = document.querySelectorAll('.campaign-card, .kampanya-item, [class*="campaign"], [class*="kampanya"]');
      
      const campaigns = [];
      
      campaignElements.forEach((element) => {
        // Başlık bul
        const titleElement = element.querySelector('h2, h3, h4, .title, .baslik, [class*="title"], [class*="heading"]');
        const title = titleElement ? titleElement.innerText.trim() : 'Başlık bulunamadı';
        
        // Açıklama bul
        const descElement = element.querySelector('p, .description, .aciklama, [class*="desc"], [class*="content"]');
        const description = descElement ? descElement.innerText.trim() : '';
        
        // Link bul
        const linkElement = element.querySelector('a');
        const link = linkElement ? linkElement.href : '';
        
        // Resim bul
        const imgElement = element.querySelector('img');
        const image = imgElement ? imgElement.src : '';
        
        if (title !== 'Başlık bulunamadı') {
          campaigns.push({
            title,
            description,
            link,
            image,
            scrapedAt: new Date().toISOString()
          });
        }
      });
      
      return campaigns;
    });
    
    console.log(`📊 ${campaigns.length} kampanya bulundu`);
    
    // Eğer kampanya bulunamadıysa, sayfanın HTML'ini kontrol için logla
    if (campaigns.length === 0) {
      const pageContent = await page.content();
      console.log('⚠️ Kampanya bulunamadı. Sayfa yapısı kontrol ediliyor...');
      
      // Sayfa başlığını kontrol et
      const pageTitle = await page.title();
      console.log('Sayfa başlığı:', pageTitle);
      
      // Sayfada text var mı kontrol et
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('Sayfa text uzunluğu:', bodyText.length);
      
      // Debug için screenshot al
      await page.screenshot({ path: 'debug-screenshot.png' });
      console.log('📸 Debug screenshot alındı: debug-screenshot.png');
    }
    
    // JSON dosyasına kaydet
    const data = {
      bank: 'Maximum',
      url: 'https://www.maximum.com.tr/kampanyalar',
      scrapedAt: new Date().toISOString(),
      campaignCount: campaigns.length,
      campaigns: campaigns
    };
    
    // data klasörünü oluştur
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // Veriyi kaydet
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(data, null, 2));
    console.log('✅ Veriler data/maximum-campaigns.json dosyasına kaydedildi');
    
    // Özet bilgiyi de kaydet
    const summary = {
      lastUpdate: new Date().toISOString(),
      banks: [
        {
          name: 'Maximum',
          campaignCount: campaigns.length,
          lastChecked: new Date().toISOString()
        }
      ]
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    console.log('✅ Özet bilgi kaydedildi');
    
  } catch (error) {
    console.error('❌ Hata oluştu:', error);
  } finally {
    await browser.close();
    console.log('🏁 Browser kapatıldı');
  }
}

// Scraper'ı çalıştır
scrapeMaximum()
  .then(() => console.log('✨ Scraping tamamlandı!'))
  .catch(error => console.error('💥 Scraping hatası:', error));
