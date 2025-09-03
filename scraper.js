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
    
    while (loadMoreCount < 10) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(2000);
      
      const buttonClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, div[role="button"], span');
        for (const btn of buttons) {
          const text = (btn.innerText || btn.textContent || '').toLowerCase();
          if (text.includes('daha fazla') || text.includes('göster')) {
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
        console.log('✅ Tüm kampanyalar yüklendi');
        break;
      }
    }
    
    // ============= KAMPANYA LİNKLERİNİ TOPLA =============
    console.log('📝 Kampanya linkleri toplanıyor...');
    
    const campaignLinks = await page.evaluate(() => {
      const links = new Set();
      
      // Kategori sayfalarını tanımla (bunları HARİÇ TUT)
      const categoryPages = [
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
        '/online-alisveris-ve-eticaret-kampanyalari',
        '/otomotiv-kampanyalari',
        '/vergi-odemeleri',
        '/diger-kampanyalar',
        '/yeme-icme-restaurant-kampanyalari',
        '/maximum-pati-kart-kampanyalari',
        '/arac-kiralama-kampanyalari',
        '/bankamatik-kampanyalari'
      ];
      
      // Tüm kampanya linklerini al
      const allLinks = document.querySelectorAll('a[href*="/kampanyalar/"]');
      
      allLinks.forEach(link => {
        const href = link.href;
        
        // Ana sayfa ve anchor'ları hariç tut
        if (href.endsWith('/kampanyalar') || href.includes('#')) {
          return;
        }
        
        // Kategori sayfası mı kontrol et
        const isCategory = categoryPages.some(category => 
          href.endsWith(category) || 
          href.endsWith(category + '/')
        );
        
        // Kategori değilse ve /kampanyalar/ içeriyorsa ekle
        if (!isCategory && href.includes('/kampanyalar/')) {
          links.add(href);
        }
      });
      
      return Array.from(links);
    });
    
    console.log(`✅ ${campaignLinks.length} kampanya linki bulundu`);
    
    // Unique yap (aynı linkler birden fazla kez gelmiş olabilir)
    const uniqueCampaignLinks = [...new Set(campaignLinks)];
    console.log(`📊 ${uniqueCampaignLinks.length} benzersiz kampanya`);
    
    // İlk 5 linki göster
    console.log('\n📌 İlk 5 kampanya:');
    uniqueCampaignLinks.slice(0, 5).forEach((link, i) => {
      const name = link.split('/').pop();
      console.log(`${i + 1}. ${name}`);
    });
    
    // ============= HER KAMPANYANIN DETAYINI ÇEK =============
    const allCampaigns = [];
    const totalToScrape = uniqueCampaignLinks.length;
    
    console.log(`\n🎯 ${totalToScrape} kampanyanın detayı alınacak...\n`);
    
    for (let i = 0; i < totalToScrape; i++) {
      const link = uniqueCampaignLinks[i];
      const campaignName = link.split('/').pop();
      
      // İlerleme göstergesi
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`📊 İlerleme: ${i + 1}/${totalToScrape}`);
      }
      
      try {
        await page.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await sleep(1000);
        
        const campaignDetail = await page.evaluate((url) => {
          const cleanText = (text) => text ? text.trim().replace(/\s+/g, ' ') : '';
          
          // Başlık
          let title = '';
          const h1 = document.querySelector('h1');
          if (h1) title = cleanText(h1.innerText);
          
          // Kampanya tarihleri
          let startDate = '';
          let endDate = '';
          const bodyText = document.body.innerText || '';
          
          // "KAMPANYA TARİHLERİ" bölümünü bul
          const dateMatch = bodyText.match(/KAMPANYA TARİHLERİ[:\s]*([^\n]+)/i);
          if (dateMatch) {
            const dateText = dateMatch[1];
            const dates = dateText.match(/\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4}/g);
            if (dates && dates.length >= 2) {
              startDate = dates[0];
              endDate = dates[1];
            } else if (dates && dates.length === 1) {
              endDate = dates[0];
            }
          }
          
          // Açıklama
          let description = '';
          const detailsMatch = bodyText.match(/Kampanya Ayrıntıları[:\s]*([^​\n]+(?:\n[^​\n]+){0,3})/i);
          if (detailsMatch) {
            description = cleanText(detailsMatch[1]).substring(0, 500);
          } else {
            // İlk uzun paragrafı al
            const paragraphs = document.querySelectorAll('p');
            for (const p of paragraphs) {
              const text = cleanText(p.innerText);
              if (text.length > 100) {
                description = text.substring(0, 500);
                break;
              }
            }
          }
          
          // Görsel
          let image = '';
          const images = document.querySelectorAll('img');
          for (const img of images) {
            if (img.src && 
                (img.src.includes('kampanya') || 
                 img.src.includes('580x460') ||
                 img.alt?.toLowerCase().includes('kampanya'))) {
              image = img.src;
              break;
            }
          }
          
          // İndirim oranı
          let discountRate = '';
          const discountMatch = (title + ' ' + description).match(/%(\d+)/);
          if (discountMatch) {
            discountRate = discountMatch[1] + '%';
          } else {
            // TL indirimi ara
            const tlMatch = (title + ' ' + description).match(/(\d+\.?\d*)\s*TL/i);
            if (tlMatch) {
              discountRate = tlMatch[1] + ' TL';
            }
          }
          
          // Merchant/Marka
          let merchant = 'Maximum';
          if (title.includes("'")) {
            const merchantMatch = title.match(/([^']+)'(?:de|da|te|ta|den|dan|nde|nda)/);
            if (merchantMatch) merchant = merchantMatch[1].trim();
          }
          
          return {
            url: url,
            title: title || 'Başlık bulunamadı',
            description: description || '',
            startDate: startDate,
            endDate: endDate || 'Belirtilmemiş',
            discountRate: discountRate,
            merchant: merchant,
            image: image,
            scrapedAt: new Date().toISOString()
          };
        }, link);
        
        allCampaigns.push(campaignDetail);
        
        // Her 10 kampanyada bir detay göster
        if ((i + 1) % 10 === 0) {
          console.log(`   ✅ Son: "${campaignDetail.title.substring(0, 40)}..."`);
        }
        
        // Rate limiting
        await sleep(500 + Math.random() * 500);
        
      } catch (error) {
        console.log(`   ❌ Hata (${campaignName}): ${error.message}`);
        
        allCampaigns.push({
          url: link,
          title: campaignName,
          error: error.message,
          scrapedAt: new Date().toISOString()
        });
      }
    }
    
    // ============= VERİYİ KAYDET =============
    console.log('\n💾 Veriler kaydediliyor...');
    
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    const successfulCampaigns = allCampaigns.filter(c => !c.error);
    
    const result = {
      success: true,
      bank: 'Maximum',
      url: 'https://www.maximum.com.tr/kampanyalar',
      scrapedAt: new Date().toISOString(),
      statistics: {
        totalFound: uniqueCampaignLinks.length,
        totalScraped: allCampaigns.length,
        successful: successfulCampaigns.length,
        failed: allCampaigns.length - successfulCampaigns.length,
        withDates: successfulCampaigns.filter(c => c.endDate && c.endDate !== 'Belirtilmemiş').length,
        withImages: successfulCampaigns.filter(c => c.image).length,
        withDiscounts: successfulCampaigns.filter(c => c.discountRate).length
      },
      campaigns: allCampaigns
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    
    console.log('\n📊 ÖZET:');
    console.log(`✅ Toplam: ${result.statistics.totalScraped} kampanya`);
    console.log(`   - Başarılı: ${result.statistics.successful}`);
    console.log(`   - Hatalı: ${result.statistics.failed}`);
    console.log(`   - Tarihli: ${result.statistics.withDates}`);
    console.log(`   - Görselli: ${result.statistics.withImages}`);
    console.log(`   - İndirimli: ${result.statistics.withDiscounts}`);
    
    // Summary dosyası
    const summary = {
      lastUpdate: new Date().toISOString(),
      success: true,
      banks: [{
        name: 'Maximum',
        campaignCount: successfulCampaigns.length,
        status: 'success'
      }]
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    
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
    console.log('\n🏁 İşlem tamamlandı!');
  }
}

// Başlat
scrapeMaximum()
  .then(() => {
    console.log('✨ Maximum kampanyaları başarıyla toplandı!');
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
