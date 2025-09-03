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
      
      const categoryPages = [
        '/bireysel', '/ticari', '/seyahat-kampanyalari', '/ets-kampanyalari',
        '/akaryakit-kampanyalari', '/giyim-aksesuar-kampanyalari', '/market-kampanyalari',
        '/elektronik-kampanyalari', '/beyaz-esya-kampanyalari', '/mobilya-dekorasyon-kampanyalari',
        '/egitim-kirtasiye-kampanyalari', '/online-alisveris-ve-eticaret-kampanyalari',
        '/otomotiv-kampanyalari', '/vergi-odemeleri', '/diger-kampanyalar',
        '/yeme-icme-restaurant-kampanyalari', '/maximum-pati-kart-kampanyalari',
        '/arac-kiralama-kampanyalari', '/bankamatik-kampanyalari'
      ];
      
      const allLinks = document.querySelectorAll('a[href*="/kampanyalar/"]');
      
      allLinks.forEach(link => {
        const href = link.href;
        
        if (href.endsWith('/kampanyalar') || href.includes('#')) {
          return;
        }
        
        const isCategory = categoryPages.some(category => 
          href.endsWith(category) || href.endsWith(category + '/')
        );
        
        if (!isCategory && href.includes('/kampanyalar/')) {
          links.add(href);
        }
      });
      
      return Array.from(links);
    });
    
    const uniqueCampaignLinks = [...new Set(campaignLinks)];
    console.log(`✅ ${uniqueCampaignLinks.length} kampanya bulundu`);
    
    // ============= HER KAMPANYANIN DETAYINI ÇEK =============
    const allCampaigns = [];
    const totalToScrape = uniqueCampaignLinks.length;
    
    console.log(`\n🎯 ${totalToScrape} kampanyanın detayı alınacak...\n`);
    
    for (let i = 0; i < totalToScrape; i++) {
      const link = uniqueCampaignLinks[i];
      
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`📊 İlerleme: ${i + 1}/${totalToScrape}`);
      }
      
      try {
        await page.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await sleep(1500);
        
        const campaignDetail = await page.evaluate((url) => {
          const cleanText = (text) => text ? text.trim().replace(/\s+/g, ' ').replace(/​/g, '') : '';
          
          // Başlık
          let title = '';
          const h1 = document.querySelector('h1');
          if (h1) title = cleanText(h1.innerText);
          
          // Tüm metni al (detayları bulmak için)
          const bodyText = document.body.innerText || '';
          const cleanBodyText = bodyText.replace(/​/g, ''); // Invisible karakterleri temizle
          
          // Kampanya tarihleri
          let startDate = '';
          let endDate = '';
          const dateMatch = cleanBodyText.match(/KAMPANYA TARİHLERİ[:\s]*([^\n]+)/i);
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
          
          // Ana açıklama - Kampanya Ayrıntıları bölümünden
          let description = '';
          let extraDescription = '';
          
          const detailsMatch = cleanBodyText.match(/Kampanya Ayrıntıları(.+?)(?:Kampanyaya dahil olan kartlar|Kampanyaya dâhil olan kartlar|Kampanyaya dahil olmayan|Ek koşullar|Ödül kullanımı|Katılmak için)/si);
          if (detailsMatch) {
            const fullDetails = cleanText(detailsMatch[1]);
            // İlk paragrafı ana açıklama olarak al
            const sentences = fullDetails.split('.');
            if (sentences.length > 2) {
              description = sentences.slice(0, 2).join('.') + '.';
              extraDescription = sentences.slice(2).join('.').trim();
              if (extraDescription && !extraDescription.endsWith('.')) {
                extraDescription += '.';
              }
            } else {
              description = fullDetails;
            }
          }
          
          // Dahil olan kartlar
          let includedCards = '';
          const includedMatch = cleanBodyText.match(/(?:Kampanyaya dahil olan kartlar|Kampanyaya dâhil olan kartlar)[:\s]*([^.]+\.)/i);
          if (includedMatch) {
            includedCards = cleanText(includedMatch[1]);
          }
          
          // Dahil olmayan kartlar ve işlemler
          let excludedCards = '';
          const excludedMatch = cleanBodyText.match(/(?:Kampanyaya dahil olmayan kartlar ve işlemler|Kampanyaya dâhil olmayan kartlar ve işlemler)[:\s]*([^.]+\.)/i);
          if (excludedMatch) {
            excludedCards = cleanText(excludedMatch[1]);
          }
          
          // Ek koşullar
          let additionalConditions = '';
          const conditionsMatch = cleanBodyText.match(/(?:Ek koşullar|Ek Koşullar)[:\s]*(.+?)(?:Kampanya|Türkiye İş Bankası|$)/si);
          if (conditionsMatch) {
            additionalConditions = cleanText(conditionsMatch[1]).substring(0, 1000);
          }
          
          // Görsel - kampanya görseli
          let image = '';
          const images = document.querySelectorAll('img');
          for (const img of images) {
            const src = img.src || '';
            // Kampanya görsellerini bul (580x460 boyutunda olanlar genelde kampanya görseli)
            if (src && (
              src.includes('kampanyagorselleri') ||
              src.includes('580x460') ||
              src.includes('kampanya') && !src.includes('menu') && !src.includes('PublishingImages/menu')
            )) {
              image = src;
              break;
            }
          }
          
          // Eğer görsel bulunamadıysa, en büyük görseli al
          if (!image) {
            let maxWidth = 0;
            for (const img of images) {
              if (img.width > maxWidth && img.src && !img.src.includes('logo') && !img.src.includes('icon')) {
                maxWidth = img.width;
                image = img.src;
              }
            }
          }
          
          // İndirim oranı
          let discountRate = '';
          const discountMatch = (title + ' ' + description).match(/%(\d+)/);
          if (discountMatch) {
            discountRate = discountMatch[1] + '%';
          } else {
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
            description: description || 'Açıklama bulunamadı',
            extraDescription: extraDescription,
            includedCards: includedCards,
            excludedCards: excludedCards,
            additionalConditions: additionalConditions,
            startDate: startDate,
            endDate: endDate || 'Belirtilmemiş',
            discountRate: discountRate,
            merchant: merchant,
            image: image || '',
            scrapedAt: new Date().toISOString()
          };
        }, link);
        
        allCampaigns.push(campaignDetail);
        
        if ((i + 1) % 10 === 0) {
          console.log(`   ✅ Son: "${campaignDetail.title.substring(0, 40)}..."`);
        }
        
        await sleep(500 + Math.random() * 500);
        
      } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
        
        allCampaigns.push({
          url: link,
          title: link.split('/').pop(),
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
        withDiscounts: successfulCampaigns.filter(c => c.discountRate).length,
        withFullDetails: successfulCampaigns.filter(c => c.includedCards || c.excludedCards).length
      },
      campaigns: allCampaigns
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    
    console.log('\n📊 ÖZET:');
    console.log(`✅ Toplam: ${result.statistics.totalScraped} kampanya`);
    console.log(`   - Başarılı: ${result.statistics.successful}`);
    console.log(`   - Detaylı bilgi: ${result.statistics.withFullDetails}`);
    console.log(`   - Görselli: ${result.statistics.withImages}`);
    
  } catch (error) {
    console.error('❌ Ana hata:', error.message);
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
