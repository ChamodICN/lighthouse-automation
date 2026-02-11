const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const execFile = promisify(require('child_process').execFile);

const URLS_FILE = 'urls.txt';
const OUTPUT_CSV = 'lighthouse-results.csv';
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9222);
const DEFAULT_PROFILE_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\Gray', 'chrome-debug-profile');

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

function resolveChromePath() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

    const prefixes = [
        process.env.PROGRAMFILES,
        process.env['PROGRAMFILES(X86)'],
        process.env.LOCALAPPDATA
    ].filter(Boolean);
    const suffix = path.join('Google', 'Chrome', 'Application', 'chrome.exe');
    for (const prefix of prefixes) {
        const candidate = path.join(prefix, suffix);
        if (fs.existsSync(candidate)) return candidate;
    }
    return 'chrome.exe';
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, res => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
            req.destroy(new Error('Timeout'));
        });
    });
}

async function waitForDebugPort(port, timeoutMs = 15000) {
    const started = Date.now();
    const url = `http://127.0.0.1:${port}/json/version`;
    while (Date.now() - started < timeoutMs) {
        try {
            await requestJson(url);
            return;
        } catch (e) {
            await sleep(300);
        }
    }
    throw new Error(`Chrome debugging port ${port} not ready after ${timeoutMs}ms`);
}

async function startChrome() {
    const chromePath = resolveChromePath();
    const userDataDir = process.env.CHROME_USER_DATA_DIR || DEFAULT_PROFILE_DIR;
    const chromeArgs = [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`
    ];

    spawn('cmd', ['/c', 'start', '', chromePath, ...chromeArgs], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    await waitForDebugPort(DEBUG_PORT);
}

async function runLighthouse(url, device) {
    const jsonFile = `temp-${device}-result.json`;
    const args = [
        url,
        `--port=${DEBUG_PORT}`,
        '--output=json',
        `--output-path=${jsonFile}`,
        '--quiet',
        '--view'
    ];
    
    if (device === 'desktop') {
        args.push('--preset=desktop');
    }
    
    try {
        await execFile('npx', ['lighthouse', ...args]);
        
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
