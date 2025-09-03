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
      // Scroll down
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(2000);
      
      // Try to click load more button
      const buttonClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, div[role="button"], span');
        for (const btn of buttons) {
          const text = (btn.innerText || btn.textContent || '').toLowerCase();
          if (text.includes('daha fazla') || text.includes('daha çok') || text.includes('göster')) {
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
        console.log('✅ Tüm kampanyalar yüklendi (buton bulunamadı)');
        break;
      }
    }
    
    // ============= DEBUG: TÜM LİNKLERİ GÖSTER =============
    console.log('\n🔍 DEBUG: Sayfadaki tüm linkler analiz ediliyor...\n');
    
    const debugInfo = await page.evaluate(() => {
      // Önce tüm /kampanyalar/ içeren linkleri bul
      const allLinks = document.querySelectorAll('a[href*="/kampanyalar/"]');
      
      const linkAnalysis = {
        totalLinks: allLinks.length,
        allHrefs: [],
        categorizedLinks: {
          categories: [],
          campaigns: [],
          other: []
        }
      };
      
      // Kategori patternleri
      const categoryPatterns = [
        'bireysel', 'ticari', 'seyahat-kampanyalari', 'ets-kampanyalari',
        'akaryakit-kampanyalari', 'giyim-aksesuar', 'market-kampanyalari',
        'elektronik-kampanyalari', 'beyaz-esya', 'mobilya-dekorasyon',
        'egitim-kirtasiye', 'online-alisveris', 'otomotiv-kampanyalari',
        'vergi-odemeleri', 'diger-kampanyalar', 'yeme-icme', 'arac-kiralama',
        'bankamatik-kampanyalari', 'pati-kart'
      ];
      
      allLinks.forEach(link => {
        const href = link.href;
        linkAnalysis.allHrefs.push(href);
        
        // Kategori mi kontrol et
        const isCategory = categoryPatterns.some(pattern => 
          href.toLowerCase().includes(pattern)
        );
        
        if (isCategory) {
          linkAnalysis.categorizedLinks.categories.push(href);
        } else if (href.split('/').filter(s => s).length > 4) {
          // URL'de en az 5 segment varsa muhtemelen gerçek kampanya
          linkAnalysis.categorizedLinks.campaigns.push(href);
        } else {
          linkAnalysis.categorizedLinks.other.push(href);
        }
      });
      
      return linkAnalysis;
    });
    
    console.log(`📊 TOPLAM LİNK SAYISI: ${debugInfo.totalLinks}`);
    console.log(`\n📁 KATEGORİ LİNKLERİ (${debugInfo.categorizedLinks.categories.length} adet):`);
    debugInfo.categorizedLinks.categories.slice(0, 5).forEach(link => {
      console.log(`   - ${link}`);
    });
    
    console.log(`\n🎯 KAMPANYA LİNKLERİ (${debugInfo.categorizedLinks.campaigns.length} adet):`);
    debugInfo.categorizedLinks.campaigns.slice(0, 10).forEach(link => {
      console.log(`   - ${link}`);
    });
    
    console.log(`\n❓ DİĞER LİNKLER (${debugInfo.categorizedLinks.other.length} adet):`);
    debugInfo.categorizedLinks.other.slice(0, 5).forEach(link => {
      console.log(`   - ${link}`);
    });
    
    // ============= KAMPANYA LİNKLERİNİ AL (BASİTLEŞTİRİLMİŞ) =============
    console.log('\n📝 Gerçek kampanya linkleri seçiliyor...');
    
    const campaignLinks = await page.evaluate(() => {
      const links = new Set();
      
      // Basit yaklaşım: Tüm /kampanyalar/ linklerini al
      const allLinks = document.querySelectorAll('a[href*="/kampanyalar/"]');
      
      // Sadece basit kategori isimlerini filtrele
      const excludeKeywords = [
        'bireysel', 'ticari', 'kampanyalari' // sadece genel kategori isimleri
      ];
      
      allLinks.forEach(link => {
        const href = link.href;
        const lastSegment = href.split('/').filter(s => s).pop() || '';
        
        // Son segment sadece kategori ismi değilse ekle
        const isSimpleCategory = excludeKeywords.some(keyword => 
          lastSegment === keyword || lastSegment.endsWith('-kampanyalari')
        );
        
        if (!isSimpleCategory && href.includes('/kampanyalar/') && lastSegment.length > 10) {
          links.add(href);
        }
      });
      
      return Array.from(links);
    });
    
    console.log(`✅ ${campaignLinks.length} kampanya linki bulundu`);
    
    if (campaignLinks.length === 0) {
      console.log('\n⚠️ HİÇ KAMPANYA LİNKİ BULUNAMADI!');
      console.log('Alternatif yöntem deneniyor...');
      
      // Alternatif: Kampanya kartlarını bul
      const alternativeLinks = await page.evaluate(() => {
        const links = [];
        
        // Farklı selektorlar dene
        const selectors = [
          '.campaign-card a',
          '.kampanya-item a',
          'article a',
          'div[class*="campaign"] a',
          'div[class*="kampanya"] a',
          'a[href*="maximum.com.tr/kampanyalar/"]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          console.log(`Selector "${selector}" ile ${elements.length} element bulundu`);
          
          elements.forEach(el => {
            if (el.href && !links.includes(el.href)) {
              links.push(el.href);
            }
          });
        }
        
        // Unique yap ve filtrele
        return [...new Set(links)].filter(href => 
          href.includes('/kampanyalar/') && 
          href.split('/').length > 5
        );
      });
      
      if (alternativeLinks.length > 0) {
        console.log(`✅ Alternatif yöntemle ${alternativeLinks.length} link bulundu`);
        campaignLinks.push(...alternativeLinks);
      }
    }
    
    // İlk 5 linki göster
    console.log('\n📌 İlk 5 kampanya linki:');
    campaignLinks.slice(0, 5).forEach((link, i) => {
      console.log(`${i + 1}. ${link}`);
    });
    
    // ============= KAMPANYA DETAYLARINI AL =============
    const allCampaigns = [];
    const maxToScrape = Math.min(campaignLinks.length, 5); // Test için sadece ilk 5
    
    console.log(`\n🎯 Test için ilk ${maxToScrape} kampanya alınacak...`);
    
    for (let i = 0; i < maxToScrape; i++) {
      const link = campaignLinks[i];
      console.log(`\n📍 [${i + 1}/${maxToScrape}] ${link.split('/').pop()}`);
      
      try {
        await page.goto(link, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        await sleep(1500);
        
        const campaignDetail = await page.evaluate((url) => {
          const cleanText = (text) => text ? text.trim().replace(/\s+/g, ' ') : '';
          
          // Başlık
          const h1 = document.querySelector('h1');
          const title = h1 ? cleanText(h1.innerText) : 'Başlık bulunamadı';
          
          // İlk paragraf
          const firstP = document.querySelector('p');
          const description = firstP ? cleanText(firstP.innerText).substring(0, 200) : '';
          
          return {
            url: url,
            title: title,
            description: description,
            scrapedAt: new Date().toISOString()
          };
        }, link);
        
        console.log(`   ✅ "${campaignDetail.title.substring(0, 50)}..."`);
        allCampaigns.push(campaignDetail);
        
      } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
      }
    }
    
    // ============= VERİYİ KAYDET =============
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    const result = {
      debug: true,
      debugInfo: debugInfo,
      campaignLinksFound: campaignLinks.length,
      campaignsScraped: allCampaigns.length,
      sampleCampaigns: allCampaigns
    };
    
    fs.writeFileSync('data/debug-output.json', JSON.stringify(result, null, 2));
    console.log('\n💾 Debug bilgileri data/debug-output.json dosyasına kaydedildi');
    
    // Screenshot al
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: false });
    console.log('📸 Screenshot: debug-screenshot.png');
    
  } catch (error) {
    console.error('❌ Ana hata:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Browser kapatıldı');
  }
}

// Başlat
scrapeMaximum()
  .then(() => {
    console.log('✨ Debug tamamlandı!');
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
