const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const RESULTS_DIR = 'lighthouse-results';
const EXCEL_PATH = 'C:/Users/Gray/Desktop/Working - Page Speed.xlsx';

// Utility functions from your original script
function normalizeToHostname(value) {
    if (!value) return '';
    try {
        return new URL(value).hostname;
    } catch (e) {
        return String(value).trim();
    }
}

function getCellDateString(cell) {
    let effectiveValue = cell.value;

    if (cell.type === ExcelJS.ValueType.Formula && cell.result !== undefined) {
        effectiveValue = cell.result;
    }

    if (effectiveValue instanceof Date) {
        const year = effectiveValue.getFullYear();
        const month = String(effectiveValue.getMonth() + 1).padStart(2, '0');
        const day = String(effectiveValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (typeof effectiveValue === 'string') {
        return effectiveValue.trim();
    }

    return '';
}

// Check if a cell is considered "empty"
function isCellEmpty(cell) {
    return cell.value === null || cell.value === undefined || cell.value === '';
}

async function main() {
    console.log(`Scanning directory: ${RESULTS_DIR}...`);
    
    // 1. Read all CSV files and build a dictionary of historical results
    // Structure: allData[date][hostname][device] = { performance, fcp, lcp, tbt, cls, si }
    const allData = {};
    
    if (!fs.existsSync(RESULTS_DIR)) {
        console.error(`Directory ${RESULTS_DIR} does not exist!`);
        return;
    }

    const files = fs.readdirSync(RESULTS_DIR).filter(file => file.endsWith('.csv'));
    console.log(`Found ${files.length} CSV files.`);

    for (const file of files) {
        // Extract date from filename (e.g., lighthouse-results-2026-03-30T... -> 2026-03-30)
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) {
            console.warn(`Could not extract date from filename: ${file}. Skipping.`);
            continue;
        }
        const fileDate = dateMatch[1];
        if (!allData[fileDate]) allData[fileDate] = {};

        const filePath = path.join(RESULTS_DIR, file);
        const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
        
        // Skip header line and process rows
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 12) continue; // Skip malformed lines

            const url = cols[0];
            const device = cols[1];
            const hostname = normalizeToHostname(url);

            if (!allData[fileDate][hostname]) allData[fileDate][hostname] = {};
            
            // Store the metrics as numbers
            allData[fileDate][hostname][device] = {
                performance: Number(cols[2]),
                fcp: Number(cols[3]),
                lcp: Number(cols[4]),
                tbt: Number(cols[5]),
                cls: Number(cols[6]),
                si: Number(cols[7])
            };
        }
    }

    console.log('Finished parsing CSVs. Opening Excel workbook...');

    // 2. Open the Excel workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_PATH);
    let updatesMade = 0;

    // 3. Iterate through worksheets and apply data
    workbook.worksheets.forEach(worksheet => {
        const sheetUrl = worksheet.getCell('A1').text || worksheet.getCell('A1').value;
        const sheetHost = normalizeToHostname(sheetUrl);
        
        if (!sheetHost) return; // Skip sheets that don't have a valid URL in A1

        // Iterate through rows in this worksheet
        for (let row = 1; row <= worksheet.rowCount; row += 1) {
            const cell = worksheet.getCell(row, 2); // Column B is the date
            const rowDate = getCellDateString(cell);

            // If we have parsed data for this date AND this hostname
            if (rowDate && allData[rowDate] && allData[rowDate][sheetHost]) {
                const resultsForDate = allData[rowDate][sheetHost];

                // Desktop Check & Write
                if (resultsForDate.desktop) {
                    const d = resultsForDate.desktop;
                    // Check if desktop performance cell is empty before writing
                    if (isCellEmpty(worksheet.getCell(row, 3))) {
                        worksheet.getCell(row, 3).value = d.performance;
                        worksheet.getCell(row, 4).value = d.fcp;
                        worksheet.getCell(row, 5).value = d.tbt;
                        worksheet.getCell(row, 6).value = d.si;
                        worksheet.getCell(row, 7).value = d.lcp;
                        worksheet.getCell(row, 8).value = d.cls;
                        console.log(`[${rowDate}] Wrote Desktop stats for ${sheetHost} (Row ${row})`);
                        updatesMade++;
                    } else {
                        console.log(`[${rowDate}] Skipped Desktop stats for ${sheetHost} (Data already exists)`);
                    }
                }

                // Mobile Check & Write
                if (resultsForDate.mobile) {
                    const m = resultsForDate.mobile;
                    // Check if mobile performance cell is empty before writing
                    if (isCellEmpty(worksheet.getCell(row, 11))) {
                        worksheet.getCell(row, 11).value = m.performance;
                        worksheet.getCell(row, 12).value = m.fcp;
                        worksheet.getCell(row, 13).value = m.tbt;
                        worksheet.getCell(row, 14).value = m.si;
                        worksheet.getCell(row, 15).value = m.lcp;
                        worksheet.getCell(row, 16).value = m.cls;
                        console.log(`[${rowDate}] Wrote Mobile stats for ${sheetHost} (Row ${row})`);
                        updatesMade++;
                    } else {
                        console.log(`[${rowDate}] Skipped Mobile stats for ${sheetHost} (Data already exists)`);
                    }
                }
            }
        }
    });

    // 4. Save Excel if updates were made
    if (updatesMade > 0) {
        console.log(`\nSaving Excel file... (${updatesMade} new records added)`);
        await workbook.xlsx.writeFile(EXCEL_PATH);
        console.log('Update complete!');
    } else {
        console.log('\nNo missing data needed to be backfilled. Excel file unchanged.');
    }
}

main().catch(console.error);