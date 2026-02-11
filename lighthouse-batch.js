const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const execFile = promisify(require('child_process').execFile);

const URLS_FILE = 'urls.txt';
const OUTPUT_CSV = `lighthouse-results-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9222);
const DEFAULT_PROFILE_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\Gray', 'chrome-debug-profile');
const LIMIT = (() => {
    const arg = process.argv.find(value => value.startsWith('--limit='));
    if (arg) {
        const value = Number(arg.split('=')[1]);
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
    }
    return null;
})();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toSigFigs(value, sig = 3) {
    if (!Number.isFinite(value)) return value;
    return Number.parseFloat(Number(value).toPrecision(sig));
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
        args.push('--emulated-form-factor=desktop');
        args.push('--screenEmulation.width=1669');
        args.push('--screenEmulation.height=919');
        args.push('--screenEmulation.deviceScaleFactor=1');
        args.push('--screenEmulation.mobile=false');
        args.push('--screenEmulation.disabled=false');
    } else {
        args.push('--emulated-form-factor=mobile');
        args.push('--screenEmulation.width=412');
        args.push('--screenEmulation.height=823');
        args.push('--screenEmulation.deviceScaleFactor=2.625');
        args.push('--screenEmulation.mobile=true');
        args.push('--screenEmulation.disabled=false');
    }
    
    try {
        const lighthouseCmd = process.env.LIGHTHOUSE_PATH || 'lighthouse';
        await execFile('cmd', ['/c', lighthouseCmd, ...args], { windowsHide: true });
        
        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        
        let domain = url;
        try {
            domain = new URL(url).hostname;
        } catch (e) {
            // Fallback to raw input if URL parsing fails
        }

        const result = {
            url: domain,
            device,
            performance: Math.round(data.categories.performance.score * 100),
            accessibility: Math.round(data.categories.accessibility.score * 100),
            bestPractices: Math.round(data.categories['best-practices'].score * 100),
            seo: Math.round(data.categories.seo.score * 100),
            fcp: toSigFigs(data.audits['first-contentful-paint'].numericValue / 1000),
            lcp: toSigFigs(data.audits['largest-contentful-paint'].numericValue / 1000),
            tbt: toSigFigs(data.audits['total-blocking-time'].numericValue / 1000),
            cls: parseFloat(data.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
            si: toSigFigs(data.audits['speed-index'].numericValue / 1000)
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
    let urls = fs.readFileSync(URLS_FILE, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    if (LIMIT) {
        urls = urls.slice(0, LIMIT);
        console.log(`Limiting run to first ${urls.length} URL(s).`);
    }
    
    // Create CSV
    const csvHeader = 'URL,Device,Performance,FCP,LCP,TBT,CLS,SI,Accessibility,Best Practices,SEO\n';
    fs.writeFileSync(OUTPUT_CSV, csvHeader);

    await startChrome();
    
    // Process each URL
    for (const url of urls) {
        console.log('\n========================================');
        console.log(`Processing: ${url}`);
        console.log('========================================');
        
        for (const device of ['desktop', 'mobile']) {
            console.log(`\nRunning ${device} test...`);
            
            const result = await runLighthouse(url, device);

            if (result) {
                const row = `${result.url},${result.device},${result.performance},${result.fcp},${result.lcp},${result.tbt},${result.cls},${result.si},${result.accessibility},${result.bestPractices},${result.seo}\n`;
                fs.appendFileSync(OUTPUT_CSV, row);
                console.log(`✓ ${device} complete - Performance: ${result.performance}`);
            }
        }
    }
    
    console.log('\n========================================');
    console.log('All tests complete!');
    console.log(`Results saved to: ${OUTPUT_CSV}`);
    console.log('========================================');
}

main().catch(console.error);
