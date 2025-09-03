const puppeteer = require('puppeteer');
const fs = require('fs');

// Basit bekleme fonksiyonu (waitForTimeout yerine)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeMaximum() {
  console.log('🚀 Maximum kampanya scraper başlıyor...');
  console.log('📅 Tarih:', new Date().toLocaleString('tr-TR'));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Viewport'u ayarla (daha fazla içerik görünsün)
    await page.setViewport({ width: 1920, height: 1080 });
    
    // User agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📄 Sayfa oluşturuldu');
    console.log('🔗 Maximum kampanyalar sayfasına gidiliyor...');
    
    // Ana kampanyalar sayfasına git
    await page.goto('https://www.maximum.com.tr/kampanyalar', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    console.log('✅ Sayfa yüklendi');
    await sleep(3000); // İlk yükleme için bekle
    
    // ============= ADIM 1: TÜM KAMPANYALARI YÜKLE =============
    console.log('🔍 "Daha Fazla Göster" butonu aranıyor...');
    
    let loadMoreCount = 0;
    let previousCampaignCount = 0;
    
    while (true) {
      // Mevcut kampanya sayısını al
      const currentCampaignCount = await page.evaluate(() => {
        // Farklı olası selektörleri dene
        const selectors = [
          'a[href*="/kampanyalar/"]',
          '.campaign-card',
          '.kampanya-item',
          '[class*="campaign"]',
          'article',
          '.card'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            return elements.length;
          }
        }
        return 0;
      });
      
      console.log(`📊 Şu an ${currentCampaignCount} kampanya görünüyor`);
      
      // "Daha Fazla Göster" butonunu bul ve tıkla
      const loadMoreClicked = await page.evaluate(() => {
        // Farklı buton selektörleri dene
        const buttonSelectors = [
          'button:contains("Daha Fazla")',
          'button:contains("daha fazla")',
          'button:contains("Göster")',
          'a:contains("Daha Fazla")',
          '[class*="load-more"]',
          '[class*="loadmore"]',
          '[onclick*="loadMore"]'
        ];
        
        // Önce text içeriğine göre ara
        const allButtons = Array.from(document.querySelectorAll('button, a'));
        for (const btn of allButtons) {
          const text = btn.innerText || btn.textContent || '';
          if (text.toLowerCase().includes('daha') || 
              text.toLowerCase().includes('fazla') || 
              text.toLowerCase().includes('more') ||
              text.toLowerCase().includes('göster')) {
            console.log('Buton bulundu:', text);
            btn.click();
            return true;
          }
        }
        
        return false;
      });
      
      if (loadMoreClicked) {
        loadMoreCount++;
        console.log(`✅ "Daha Fazla Göster" butonuna ${loadMoreCount}. kez tıklandı`);
        await sleep(5000); // Yeni kampanyaların yüklenmesi için bekle
        
        // Scroll down yap (lazy loading tetiklemek için)
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await sleep(2000);
        
      } else if (currentCampaignCount === previousCampaignCount) {
        console.log('✅ Tüm kampanyalar yüklendi (buton bulunamadı veya daha fazla kampanya yok)');
        break;
      }
      
      previousCampaignCount = currentCampaignCount;
      
      // Maksimum 20 kez dene (sonsuz döngüye karşı önlem)
      if (loadMoreCount >= 20) {
        console.log('⚠️ Maksimum deneme sayısına ulaşıldı');
        break;
      }
    }
    
    // ============= ADIM 2: KAMPANYA LİNKLERİNİ TOPLA =============
    console.log('📝 Kampanya linkleri toplanıyor...');
    
    const campaignLinks = await page.evaluate(() => {
      const links = new Set(); // Tekrarları önlemek için Set kullan
      
      // Farklı link patternleri dene
      const linkSelectors = [
        'a[href*="/kampanyalar/"]',
        'a[href*="/kampanya/"]',
        'a[href*="campaign"]',
        '.campaign-card a',
        '.kampanya-item a',
        'article a'
      ];
      
      linkSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const href = el.href;
          // Tam URL al ve filtrele
          if (href && 
              href.includes('maximum.com.tr') && 
              (href.includes('/kampanyalar/') || href.includes('/kampanya/')) &&
              !href.endsWith('/kampanyalar') && // Ana sayfa değil
              !href.includes('#')) { // Anchor link değil
            links.add(href);
          }
        });
      });
      
      // Eğer direkt link bulunamadıysa, tüm kartları kontrol et
      if (links.size === 0) {
        console.log('Direkt link bulunamadı, alternatif yöntem deneniyor...');
        
        // Kampanya kartlarını bul
        const cards = document.querySelectorAll('[class*="campaign"], [class*="kampanya"], .card, article');
        cards.forEach(card => {
          const link = card.querySelector('a');
          if (link && link.href) {
            links.add(link.href);
          }
        });
      }
      
      return Array.from(links);
    });
    
    console.log(`✅ ${campaignLinks.length} kampanya linki toplandı`);
    
    // İlk 5 linki göster (debug için)
    console.log('İlk 5 link:', campaignLinks.slice(0, 5));
    
    // ============= ADIM 3: HER KAMPANYANIN DETAYINI ÇEK =============
    const allCampaigns = [];
    const maxCampaignsToScrape = Math.min(campaignLinks.length, 50); // İlk 50 kampanya (test için)
    
    console.log(`🎯 ${maxCampaignsToScrape} kampanyanın detayı alınacak...`);
    
    for (let i = 0; i < maxCampaignsToScrape; i++) {
      const link = campaignLinks[i];
      console.log(`📍 [${i + 1}/${maxCampaignsToScrape}] ${link}`);
      
      try {
        // Detay sayfasına git
        await page.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await sleep(2000); // Sayfa tam yüklensin
        
        // Kampanya detaylarını al
        const campaignDetail = await page.evaluate((url) => {
          // Helper fonksiyon - text temizleme
          const cleanText = (text) => {
            return text ? text.trim().replace(/\s+/g, ' ') : '';
          };
          
          // Başlık
          let title = '';
          const titleSelectors = ['h1', 'h2', '.campaign-title', '.kampanya-baslik', '[class*="title"]'];
          for (const selector of titleSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              title = cleanText(el.innerText || el.textContent);
              if (title) break;
            }
          }
          
          // Açıklama/İçerik
          let description = '';
          const descSelectors = [
            '.campaign-description',
            '.kampanya-detay',
            '.campaign-content',
            '.content',
            '[class*="description"]',
            '[class*="detail"]',
            'article',
            '.main-content'
          ];
          
          for (const selector of descSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              description = cleanText(el.innerText || el.textContent);
              if (description && description.length > 50) break;
            }
          }
          
          // Eğer hala açıklama bulunamadıysa, tüm paragrafları topla
          if (!description || description.length < 50) {
            const paragraphs = Array.from(document.querySelectorAll('p'));
            description = paragraphs
              .map(p => cleanText(p.innerText))
              .filter(text => text.length > 20)
              .join(' ')
              .substring(0, 1000);
          }
          
          // Tarih bilgisi ara
          let endDate = '';
          const datePatterns = [
            /(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})/g, // 31/12/2024 veya 31.12.2024
            /(\d{1,2})\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(\d{4})/gi,
            /kampanya.*?(\d{1,2}[\/.]\d{1,2}[\/.]\d{4}).*?(kadar|tarihine)/gi
          ];
          
          const allText = document.body.innerText || '';
          for (const pattern of datePatterns) {
            const match = allText.match(pattern);
            if (match) {
              endDate = match[match.length - 1]; // Son tarihi al (genelde bitiş tarihi)
              break;
            }
          }
          
          // Koşullar/Şartlar
          let terms = '';
          const termsSelectors = [
            '.terms', 
            '.conditions', 
            '.kosullar', 
            '.sartlar',
            '[class*="terms"]',
            '[class*="condition"]'
          ];
          
          for (const selector of termsSelectors) {
            const el = document.querySelector(selector);
            if (el) {
              terms = cleanText(el.innerText || el.textContent);
              if (terms) break;
            }
          }
          
          // Görsel
          let image = '';
          const imgSelectors = [
            '.campaign-image img',
            '.kampanya-gorsel img',
            'article img',
            'main img',
            'img[alt*="kampanya"]'
          ];
          
          for (const selector of imgSelectors) {
            const img = document.querySelector(selector);
            if (img && img.src) {
              image = img.src;
              break;
            }
          }
          
          return {
            url: url,
            title: title || 'Başlık bulunamadı',
            description: description || 'Açıklama bulunamadı',
            endDate: endDate || 'Tarih bulunamadı',
            terms: terms || '',
            image: image || '',
            scrapedAt: new Date().toISOString()
          };
        }, link);
        
        allCampaigns.push(campaignDetail);
        console.log(`✅ Kampanya detayı alındı: ${campaignDetail.title.substring(0, 50)}...`);
        
        // Her 10 kampanyada bir durum raporu
        if ((i + 1) % 10 === 0) {
          console.log(`📊 İlerleme: ${i + 1}/${maxCampaignsToScrape} kampanya işlendi`);
        }
        
        // Rate limiting - çok hızlı gitme
        await sleep(1000 + Math.random() * 2000); // 1-3 saniye arası rastgele bekle
        
      } catch (error) {
        console.log(`❌ Kampanya detayı alınamadı: ${error.message}`);
        
        // Hata durumunda bile bir kayıt ekle
        allCampaigns.push({
          url: link,
          title: 'Detay alınamadı',
          description: '',
          error: error.message,
          scrapedAt: new Date().toISOString()
        });
      }
    }
    
    // ============= ADIM 4: VERİYİ KAYDET =============
    console.log('💾 Veriler kaydediliyor...');
    
    // data klasörünü oluştur
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // Ana veri dosyası
    const result = {
      success: true,
      bank: 'Maximum',
      url: 'https://www.maximum.com.tr/kampanyalar',
      scrapedAt: new Date().toISOString(),
      totalCampaignsFound: campaignLinks.length,
      campaignsScraped: allCampaigns.length,
      campaigns: allCampaigns
    };
    
    fs.writeFileSync('data/maximum-campaigns.json', JSON.stringify(result, null, 2));
    console.log(`✅ ${allCampaigns.length} kampanya detayı kaydedildi`);
    
    // Özet dosyası
    const summary = {
      lastUpdate: new Date().toISOString(),
      success: true,
      statistics: {
        totalLinksFound: campaignLinks.length,
        detailsScraped: allCampaigns.length,
        successRate: `${Math.round((allCampaigns.filter(c => !c.error).length / allCampaigns.length) * 100)}%`
      }
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    
    // Screenshot al (son durum)
    await page.goto('https://www.maximum.com.tr/kampanyalar', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'screenshot.png', fullPage: false });
    console.log('📸 Screenshot alındı');
    
  } catch (error) {
    console.error('❌ Ana hata:', error.message);
    console.error(error.stack);
    
    // Hata durumunda bile bir şeyler kaydet
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    const errorData = {
      error: true,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('data/error.json', JSON.stringify(errorData, null, 2));
    
  } finally {
    await browser.close();
    console.log('🏁 Browser kapatıldı');
  }
}

// Başlat
console.log('🎬 Maximum kampanya scraper başlatılıyor...');
console.log('⏱️ Bu işlem birkaç dakika sürebilir...');

scrapeMaximum()
  .then(() => {
    console.log('✨ Tüm işlemler tamamlandı!');
    console.log('📂 data/maximum-campaigns.json dosyasını kontrol edin');
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
