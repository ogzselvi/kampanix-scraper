const puppeteer = require('puppeteer');
const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('📄 Maximum kampanyalar sayfasına gidiliyor...');
    
    await page.goto('https://www.maximum.com.tr/kampanyalar', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    console.log('✅ Sayfa yüklendi');
    await sleep(3000);
    
    // ============= TÜM KAMPANYALARI YÜKLE =============
    console.log('🔍 "Daha Fazla Göster" butonları aranıyor...');
    
    let loadMoreCount = 0;
    let previousHeight = 0;
    
    while (loadMoreCount < 20) { // Maksimum 20 kez dene
      // Sayfayı aşağı kaydır
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(2000);
      
      // "Daha Fazla Göster" butonunu bul ve tıkla
      const buttonClicked = await page.evaluate(() => {
        // Tüm butonları kontrol et
        const buttons = document.querySelectorAll('button, a, div[role="button"], span');
        for (const btn of buttons) {
          const text = (btn.innerText || btn.textContent || '').toLowerCase();
          if (text.includes('daha fazla') || 
              text.includes('daha çok') || 
              text.includes('load more') ||
              text.includes('göster')) {
            
            // Görünür mü kontrol et
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      });
      
      if (buttonClicked) {
        loadMoreCount++;
        console.log(`✅ "Daha Fazla Göster" ${loadMoreCount}. kez tıklandı`);
        await sleep(3000);
      } else {
        // Sayfa yüksekliği değişti mi kontrol et
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) {
          console.log('✅ Tüm kampanyalar yüklendi');
          break;
        }
        previousHeight = currentHeight;
        await sleep(2000);
      }
    }
    
    // ============= KAMPANYA LİNKLERİNİ TOPLA =============
    console.log('📝 Kampanya linkleri toplanıyor...');
    
    const campaignLinks = await page.evaluate(() => {
      const links = new Set();
      
      // Tüm linkleri topla
      const allLinks = document.querySelectorAll('a[href*="/kampanyalar/"]');
      
      allLinks.forEach(link => {
        const href = link.href;
        
        // Filtreleme: Gerçek kampanya linkleri
        if (href && 
            href.includes('maximum.com.tr/kampanyalar/') &&
            !href.endsWith('/kampanyalar') && // Ana sayfa değil
            !href.includes('#') && // Anchor değil
            href.split('/').length > 5) { // En az 5 segment (gerçek kampanya)
          
          // Kategori sayfalarını filtrele
          const excludePatterns = [
            '/bireysel',
            '/ticari',
            '/seyahat-kampanyalari',
            '/ets-kampanyalari',
            '/akaryakit-kampanyalari',
            '/giyim-aksesuar-kampanyalari',
            '/market-kampanyalari',
            '/elektronik-kampanyalari',
            '/beyaz-esya-kampanyalari',
            '/mobilya-dekorasyon-kampanyalari',
            '/egitim-kirtasiye-kampanyalari',
            '/online-alisveris',
            '/otomotiv-kampanyalari',
            '/vergi-odemeleri',
            '/diger-kampanyalar',
            '/yeme-icme-restaurant',
            '/arac-kiralama-kampanyalari',
            '/bankamatik-kampanyalari',
            '/maximum-pati-kart'
          ];
          
          const isCategory = excludePatterns.some(pattern => href.includes(pattern));
          
          if (!isCategory) {
            links.add(href);
          }
        }
      });
      
      return Array.from(links);
    });
    
    console.log(`✅ ${campaignLinks.length} gerçek kampanya linki bulundu`);
    console.log('İlk 3 link:', campaignLinks.slice(0, 3));
    
    // ============= HER KAMPANYANIN DETAYINI ÇEK =============
    const allCampaigns = [];
    const totalCampaigns = campaignLinks.length;
    
    console.log(`🎯 ${totalCampaigns} kampanyanın detayı alınacak...`);
    
    for (let i = 0; i < totalCampaigns; i++) {
      const link = campaignLinks[i];
      console.log(`📍 [${i + 1}/${totalCampaigns}] İşleniyor...`);
      
      try {
        await page.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await sleep(1500);
        
        // Kampanya detaylarını al
        const campaignDetail = await page.evaluate((url) => {
          const cleanText = (text) => text ? text.trim().replace(/\s+/g, ' ') : '';
          
          // Başlık
          let title = '';
          const h1 = document.querySelector('h1');
          if (h1) title = cleanText(h1.innerText);
          
          // Kampanya bitiş tarihi - daha akıllı arama
          let endDate = '';
          const bodyText = document.body.innerText || '';
          
          // Farklı tarih formatlarını ara
          const datePatterns = [
            /(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/g, // 31.12.2025 veya 31/12/2025
            /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/gi,
            /SON\s+(\d+)\s+GÜN/i // "SON 27 GÜN" gibi
          ];
          
          // "KAMPANYA TARİHLERİ" bölümünü bul
          const campaignDateMatch = bodyText.match(/KAMPANYA TARİHLERİ[:\s]*([^\n]+)/i);
          if (campaignDateMatch) {
            const dateText = campaignDateMatch[1];
            // İkinci tarihi al (bitiş tarihi)
            const dates = dateText.match(/\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4}/g);
            if (dates && dates.length > 1) {
              endDate = dates[dates.length - 1];
            } else if (dates && dates.length === 1) {
              endDate = dates[0];
            }
          }
          
          // Hala bulunamadıysa diğer patternleri dene
          if (!endDate) {
            for (const pattern of datePatterns) {
              const matches = bodyText.match(pattern);
              if (matches && matches.length > 0) {
                endDate = matches[matches.length - 1];
                break;
              }
            }
          }
          
          // Açıklama - "Kampanya Ayrıntıları" bölümünü bul
          let description = '';
          const detailsMatch = bodyText.match(/Kampanya Ayrıntıları[:\s]*([^​]+?)(?:Kampanyaya dahil olan kartlar|Kampanya koşulları|Ek koşullar|$)/i);
          if (detailsMatch) {
            description = cleanText(detailsMatch[1]).substring(0, 500); // İlk 500 karakter
          }
          
          // Açıklama bulunamadıysa, ilk paragrafı al
          if (!description) {
            const paragraphs = document.querySelectorAll('p');
            for (const p of paragraphs) {
              const text = cleanText(p.innerText);
              if (text.length > 50 && !text.includes('KAMPANYA TARİH')) {
                description = text.substring(0, 500);
                break;
              }
            }
          }
          
          // Kampanya görseli
          let image = '';
          const images = document.querySelectorAll('img');
          for (const img of images) {
            if (img.src && 
                (img.src.includes('kampanya') || 
                 img.src.includes('580x460') ||
                 img.width > 200)) {
              image = img.src;
              break;
            }
          }
          
          // Merchant bilgisi (başlıktan çıkar)
          let merchant = '';
          if (title.includes("'")) {
            const merchantMatch = title.match(/([^']+)'(?:de|da|te|ta|den|dan)/);
            if (merchantMatch) merchant = merchantMatch[1].trim();
          }
          
          // İndirim oranı (başlık veya açıklamadan)
          let discountRate = '';
          const discountMatch = (title + ' ' + description).match(/%(\d+)/);
          if (discountMatch) discountRate = discountMatch[1] + '%';
          
          return {
            url: url,
            title: title || 'Başlık bulunamadı',
            description: description || 'Açıklama bulunamadı',
            endDate: endDate || 'Belirtilmemiş',
            merchant: merchant || 'Maximum',
            discountRate: discountRate || '',
            image: image || '',
            scrapedAt: new Date().toISOString()
          };
        }, link);
        
        allCampaigns.push(campaignDetail);
        
        // İlerleme raporu
        if ((i + 1) % 10 === 0) {
          console.log(`📊 İlerleme: ${i + 1}/${totalCampaigns} kampanya işlendi`);
          console.log(`   Son kampanya: ${campaignDetail.title.substring(0, 50)}...`);
        }
        
        // Rate limiting
        await sleep(500 + Math.random() * 1000);
        
      } catch (error) {
        console.log(`❌ Kampanya detayı alınamadı: ${error.message}`);
        allCampaigns.push({
          url: link,
          title: 'Hata',
          error: error.message,
          scrapedAt: new Date().toISOString()
        });
      }
    }
    
    // ============= VERİYİ KAYDET =============
    console.log('💾 Veriler kaydediliyor...');
    
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    const result = {
      success: true,
      bank: 'Maximum',
      url: 'https://www.maximum.com.tr/kampanyalar',
      scrapedAt: new Date().toISOString(),
      totalCampaignsFound: campaignLinks.length,
      campaignsScraped: allCampaigns.length,
      successfulCampaigns: allCampaigns.filter(c => !c.error).length,
      campaigns: allCampaigns
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    console.log(`✅ ${allCampaigns.length} kampanya kaydedildi`);
    console.log(`   - Başarılı: ${result.successfulCampaigns}`);
    console.log(`   - Hatalı: ${allCampaigns.filter(c => c.error).length}`);
    
    // Özet
    const summary = {
      lastUpdate: new Date().toISOString(),
      success: true,
      bank: 'Maximum',
      statistics: {
        totalFound: campaignLinks.length,
        totalScraped: allCampaigns.length,
        successful: result.successfulCampaigns,
        withDates: allCampaigns.filter(c => c.endDate && c.endDate !== 'Belirtilmemiş').length,
        withImages: allCampaigns.filter(c => c.image).length,
        withDiscounts: allCampaigns.filter(c => c.discountRate).length
      }
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    console.log('📊 İstatistikler:');
    console.log(`   - Tarihli: ${summary.statistics.withDates}`);
    console.log(`   - Görselli: ${summary.statistics.withImages}`);
    console.log(`   - İndirim oranlı: ${summary.statistics.withDiscounts}`);
    
  } catch (error) {
    console.error('❌ Ana hata:', error.message);
    
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    fs.writeFileSync('data/error.json', JSON.stringify({
      error: true,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
    
  } finally {
    await browser.close();
    console.log('🏁 Browser kapatıldı');
  }
}

// Başlat
console.log('🎬 Maximum kampanya scraper başlatılıyor...');

scrapeMaximum()
  .then(() => {
    console.log('✨ Tüm işlemler tamamlandı!');
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
