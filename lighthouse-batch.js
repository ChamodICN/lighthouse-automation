const fs = require('fs');
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const URLS_FILE = 'urls.txt';
const OUTPUT_CSV = 'lighthouse-results.csv';

async function killChrome() {
    try {
        await exec('taskkill /F /IM chrome.exe');
    } catch (e) {
        // Ignore if no Chrome process
    }
    await sleep(2000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome() {
    spawn('chrome', [
        '--remote-debugging-port=9222',
        '--user-data-dir=C:\\Users\\Gray\\chrome-debug-profile'
    ], { detached: true, shell: true });
    await sleep(3000);
}

async function runLighthouse(url, device) {
    const jsonFile = `temp-${device}-result.json`;
    const args = [
        url,
        '--port=9222',
        '--output=json',
        `--output-path=${jsonFile}`,
        '--quiet'
    ];
    
    if (device === 'desktop') {
        args.push('--preset=desktop');
    }
    
    try {
        await exec(`lighthouse ${args.join(' ')}`);
        
        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        
        const result = {
            url,
            device,
            performance: Math.round(data.categories.performance.score * 100),
            accessibility: Math.round(data.categories.accessibility.score * 100),
            bestPractices: Math.round(data.categories['best-practices'].score * 100),
            seo: Math.round(data.categories.seo.score * 100),
            fcp: Math.round(data.audits['first-contentful-paint'].numericValue),
            lcp: Math.round(data.audits['largest-contentful-paint'].numericValue),
            tbt: Math.round(data.audits['total-blocking-time'].numericValue),
            cls: parseFloat(data.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
            si: Math.round(data.audits['speed-index'].numericValue)
        };
        
        fs.unlinkSync(jsonFile);
        return result;
    } catch (error) {
        console.error(`Error testing ${url} on ${device}:`, error.message);
        return null;
    }
}

async function main() {
    // Read URLs
    const urls = fs.readFileSync(URLS_FILE, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    
    // Create CSV
    const csvHeader = 'URL,Device,Performance,Accessibility,Best Practices,SEO,FCP,LCP,TBT,CLS,SI\n';
    fs.writeFileSync(OUTPUT_CSV, csvHeader);
    
    // Process each URL
    for (const url of urls) {
        console.log('\n========================================');
        console.log(`Processing: ${url}`);
        console.log('========================================');
        
        for (const device of ['mobile', 'desktop']) {
            console.log(`\nRunning ${device} test...`);
            
            await killChrome();
            await startChrome();
            
            const result = await runLighthouse(url, device);
            
            if (result) {
                const row = `${result.url},${result.device},${result.performance},${result.accessibility},${result.bestPractices},${result.seo},${result.fcp},${result.lcp},${result.tbt},${result.cls},${result.si}\n`;
                fs.appendFileSync(OUTPUT_CSV, row);
                console.log(`✓ ${device} complete - Performance: ${result.performance}`);
            }
        }
    }
    
    await killChrome();
    
    console.log('\n========================================');
    console.log('All tests complete!');
    console.log(`Results saved to: ${OUTPUT_CSV}`);
    console.log('========================================');
}

main().catch(console.error);