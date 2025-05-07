require('dotenv').config();
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const express = require('express');
const app = express();
const port = 3000;
const schedule = require('node-schedule');

// Function to create a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const PAGE_LOGIN = 'https://zeroq.cl/signin'
const PAGE_DASHBOARD = 'https://zeroq.cl/stats/#/dashboard/3353?_k=ffjy4v'

async function performScraping() {
    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();

        await page.goto(PAGE_LOGIN);
        
        await page.waitForSelector('input[name="email"]');
        await page.waitForSelector('input[name="password"]');
        await page.waitForSelector('div.iHOCkK');

        await page.type('input[name="email"]', process.env.PAGE_USER);
        await page.type('input[name="password"]', process.env.PAGE_PASS);

        await Promise.all([
            page.waitForNavigation(),
            page.click('div.iHOCkK')
        ]);

        console.log('Successfully logged in');

        await page.goto(PAGE_DASHBOARD);

        // Handle initial popup
        await page.waitForSelector('button#ok');
        await page.click('button#ok');

        console.log('Successfully navigated to dashboard');

        // Handle calendar selection
        await page.waitForSelector('.ant-calendar-range-picker-input');
        await page.click('.ant-calendar-range-picker-input');

        // Wait for and click the month selector
        await page.waitForSelector('.ant-calendar-month-select');
        await page.click('.ant-calendar-month-select');

        // Calculate target dates
        const currentDate = new Date();
        const targetMonth = currentDate.getMonth() - 1;
        const targetYear = currentDate.getFullYear();

        // Spanish month names
        const monthNames = [
            'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
        ];

        // Get last day of target month
        const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        
        // Format the dates we're looking for
        const firstDayTitle = `1 de ${monthNames[targetMonth]} de ${targetYear}`;
        const lastDayTitle = `${lastDay} de ${monthNames[targetMonth]} de ${targetYear}`;

        // Select previous month from dropdown
        await page.waitForSelector('.ant-calendar-month-panel-cell');
        const monthCells = await page.$$('.ant-calendar-month-panel-cell');
        await monthCells[targetMonth].click();

        // Select first day using dynamic month and year
        const firstDaySelector = `td[title*="1 de ${monthNames[targetMonth]} de ${targetYear}"] .ant-calendar-date`;
        await page.waitForSelector(firstDaySelector);
        await page.click(firstDaySelector);

        // Select last day using calculated lastDay
        const lastDaySelector = `td[title*="${lastDay} de ${monthNames[targetMonth]} de ${targetYear}"] .ant-calendar-date`;
        await page.waitForSelector(lastDaySelector);
        await page.click(lastDaySelector);

        console.log('Successfully selected date range');

        // Wait for data to load
        await delay(2000);

        // Wait for data to load and button to be available
        await page.waitForSelector('button.ant-btn.download___3b0b3');
        
        // Click download button
        await page.click('button.ant-btn.download___3b0b3');
        
        // Wait for download to complete and process CSV
        const fs = require('fs');
        const csv = require('csv-parse');
        const path = require('path');

        // Wait for download in Downloads folder
        const downloadPath = path.join(process.env.USERPROFILE, 'Downloads');
        
        // Function to find most recent CSV file
        const findLatestCSV = () => {
            const files = fs.readdirSync(downloadPath)
                .filter(file => file.endsWith('.csv'))
                .map(file => ({
                    name: file,
                    time: fs.statSync(path.join(downloadPath, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            return files.length > 0 ? files[0].name : null;
        };

        // Wait for CSV file to appear
        await delay(3000); // Wait for download to complete
        const csvFileName = findLatestCSV();
        
        if (csvFileName) {
            console.log(`Found CSV file: ${csvFileName}`);
            
            // Read and parse CSV file
            const csvFilePath = path.join(downloadPath, csvFileName);
            const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
            
            // Parse CSV data with modified options
            csv.parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                delimiter: ',',
                quote: '"',
                relax_column_count: true,  // Allow flexible column count
                columns: ['Linea', 'Motivo', 'Cantidad'],  // Define columns explicitly
                on_record: (record, {lines}) => {
                    // Combine split fields for "Linea" if necessary
                    if (record.length > 3) {
                        return {
                            Linea: record.slice(0, -2).join(' '),
                            Motivo: record[record.length - 2],
                            Cantidad: record[record.length - 1]
                        };
                    }
                    return record;
                }
            }, (err, records) => {
                if (err) {
                    console.error('Error parsing CSV:', err);
                    return;
                }

                // Setup Express routes
                app.get('/data', (req, res) => {
                    res.json(records);
                });

                // Start server
                app.listen(port, () => {
                    console.log(`Server running at http://localhost:${port}/data`);
                });
            });
        }

        // Add near the end of the try block
                await browser.close();
                
            } catch (error) {
                console.error('Scraping error:', error);
                if (browser) await browser.close();
            } finally {
                if (browser) await browser.close();
            }
}

// Schedule the scraping to run daily at 1:00 AM
schedule.scheduleJob('0 1 * * *', async () => {
    console.log('Starting daily data update:', new Date().toLocaleString());
    await performScraping();
});

// Initial run
performScraping();