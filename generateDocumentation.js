const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");

function createHeading(text, level) {
    return new Paragraph({
        text: text,
        heading: level,
        spacing: { before: 400, after: 200 }
    });
}

function createSubHeading(text) {
    return new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 300, after: 100 }
    });
}

function createParagraph(text, isBold = false) {
    return new Paragraph({
        children: [new TextRun({ text: text, bold: isBold })],
        spacing: { after: 200 }
    });
}

function createBullet(text, boldText = "") {
    const children = [];
    if (boldText) {
        children.push(new TextRun({ text: boldText + " ", bold: true }));
    }
    children.push(new TextRun({ text: text }));
    
    return new Paragraph({
        children: children,
        bullet: { level: 0 },
        spacing: { after: 100 }
    });
}

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                text: "Commodity Market Aggregation & Automated Reporting System",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),
            new Paragraph({
                text: "Comprehensive Technical Documentation & Interview Preparation Guide",
                heading: HeadingLevel.HEADING_2,
                alignment: AlignmentType.CENTER,
                spacing: { after: 800 }
            }),

            // 1. Executive Summary
            createHeading("1. Executive Summary", HeadingLevel.HEADING_1),
            createParagraph("The project is a distributed, full-stack commodity data aggregation and automated reporting system designed to streamline workflows for traders and risk managers. It eliminates manual data collection by automatically pulling market data, parsing complex local warehouse inventory files, scraping economic events, and generating real-time interactive dashboards and automated MS Teams/Word reports."),
            createParagraph("The system is broadly divided into two major components:"),
            createBullet("The Full-Stack Dashboard Application: A React-based frontend providing interactive charting, historical Open Interest (OI) analysis, and Cocoa warehouse stock visualizations.", "1."),
            createBullet("The Automated Reporting Bot (Node.js/PM2): A background service that runs on precise cron schedules (e.g., 08:00 AM BST and 15:00 BST) to scrape external data, parse Excel files, generate Adaptive Cards for Microsoft Teams, and silently build comprehensive Word (.docx) summaries.", "2."),

            // 2. Technology Stack Breakdown
            createHeading("2. Technology Stack Breakdown", HeadingLevel.HEADING_1),
            createSubHeading("Frontend Architecture"),
            createBullet("React & Vite: Chosen for fast HMR (Hot Module Replacement) and optimized build times compared to standard Create-React-App.", "Framework:"),
            createBullet("Chart.js / Recharts: Utilized for rendering complex multi-line charts representing historic OI, commodity ratios, and regional stock changes (e.g., London Origin Data).", "Visualization:"),
            
            createSubHeading("Backend & Automation Architecture"),
            createBullet("Node.js & Express: The core runtime and server framework handling API requests, business logic, and automated scheduling.", "Runtime:"),
            createBullet("PM2 (Process Manager): Manages background daemon processes (backend, frontend, teams-macro-card), ensuring they remain alive. Integrated with a custom Windows Task Scheduler batch script for boot-resurrection.", "Process Management:"),
            createBullet("Axios & Cheerio: Axios handles HTTP requests to internal Hertshten APIs and external sources. Cheerio is used for lightweight DOM parsing/scraping of HTML responses (e.g., Economic Calendars).", "Data Fetching:"),
            createBullet("XLSX & DOCX Libraries: 'xlsx' is used for parsing massive, dynamically changing warehouse inventory Excel files. 'docx' is used for programmatically generating the daily Afternoon Contract Summary.", "File Manipulation:"),
            createBullet("Tesseract.js (OCR): Optical Character Recognition implementation to extract commodity ratios from user-uploaded images, converting unstructured image data into structured database rows.", "OCR:"),
            
            createSubHeading("Database"),
            createBullet("PostgreSQL: A robust relational database used to store historical OI, Cocoa London Origin Stock, LIFFE Cocoa (LCC) spread volumes, and OCR-extracted ratio data.", "Primary Database:"),

            // 3. Key Implementation Highlights & Challenges
            createHeading("3. Key Implementation Highlights & Challenges", HeadingLevel.HEADING_1),
            
            createSubHeading("A. Automated MS Teams Briefs & DOCX Generation"),
            createParagraph("The 'teams-macro-card' microservice runs precisely at 08:00 AM to fetch OHLC market data, daily levels, and calendar events in parallel using Promise.all(). It constructs a complex Adaptive Card JSON payload and POSTs it to a Power Automate webhook linked to MS Teams. At 15:00 PM, the system aggregates Outreach & Spread data alongside live Warehouse stock Excel data to dynamically compile a physical Word document (.docx) and silently overwrite the master file on a synced OneDrive folder, causing an auto-refresh in Teams."),
            
            createSubHeading("B. Web Scraping Resiliency & API Fallbacks"),
            createParagraph("Initially, the system scraped Investing.com for the daily US Economic Calendar. However, Investing.com implemented strict Cloudflare rate-limiting (HTTP 429)."),
            createParagraph("Solution: We migrated the primary data source to the TradingView Economic Calendar API for reliable JSON responses. We maintained Investing.com as a fallback mechanism, wrapping it in a robust 3-attempt retry loop with a 5-second backoff delay. This guaranteed that momentary rate limits would not result in empty 'No Events' cards being sent to the trading floor."),
            
            createSubHeading("C. Dynamic Excel Parsing (Complex Warehouse Data)"),
            createParagraph("The warehouse shared drives contain manually updated Excel files (e.g., RC Daily Stocks, KC Final, CC Bags). These files have complex, non-standard layouts. For instance, the 'RC' sheet has a dynamic timestamp column and rows sorted newest-first, often containing undated formula rows."),
            createParagraph("Solution: Implemented an intelligent top-down scanning algorithm using the 'xlsx' library. The script dynamically locates the header row, scans for valid Excel date serials (>43000), and infers dates for missing rows based on relative positioning. This decoupled our parser from strict cell coordinates (e.g., A15), making it resilient to format tweaks by the file owners."),
            
            createSubHeading("D. OCR Data Pipeline & Anomaly Detection"),
            createParagraph("To track commodity ratios, users upload images containing the data. We integrated Tesseract.js to parse text from these images. Early iterations resulted in severe chart data spikes due to OCR misinterpretations (e.g., reading 'change' values instead of 'ratio' values, or misreading dates)."),
            createParagraph("Solution: Built a rigorous regex-based sanitization layer in 'cocoaRatiosOcrSync.js' and executed manual database pruning via PostgreSQL queries to eliminate corrupted records (e.g., specific flawed dates in Feb/March 2026), ensuring the frontend charts rendered smoothly."),
            
            createSubHeading("E. Windows Task Automation (Bypassing PM2 Limitations)"),
            createParagraph("PM2's built-in 'pm2 startup' command does not natively support Windows environments. If the server rebooted overnight, the 08:00 AM cron jobs would fail to run."),
            createParagraph("Solution: Engineered a custom Windows Batch script ('pm2-resurrect.bat') placed securely in the Windows Startup folder. Upon user login, it waits 30 seconds for network interfaces to spin up, runs 'pm2 resurrect' to load the process dump, and executes a 'Missed Window Catch-up' algorithm. If the PC boots between 08:00 AM and 11:00 AM, the script automatically fires the morning card immediately, ensuring the trading team never misses the daily brief due to hardware restarts."),

            // 4. Interview Prep: Anticipated Cross-Questions & Answers
            createHeading("4. Interview Prep: Anticipated Cross-Questions & Answers", HeadingLevel.HEADING_1),
            createParagraph("Use the following Q&A to prepare for technical deep-dives during your interview."),
            
            createSubHeading("Q1: Why did you parse local Excel files instead of using the Microsoft Graph API for SharePoint/OneDrive?"),
            createParagraph("Answer: \"While the Microsoft Graph API is powerful, it introduces significant overhead regarding OAuth 2.0 token management, app registrations in Azure AD, and permissions handling. Because the client already had the OneDrive sync client running locally on the host machine, reading the physical files via the 'xlsx' library from the local path was much faster to implement, completely bypassed authentication hurdles, and provided zero-latency access to the data as long as the OneDrive daemon was syncing.\""),

            createSubHeading("Q2: How did you handle external API rate limits, specifically with the economic calendar?"),
            createParagraph("Answer: \"I implemented a dual-layer strategy. First, I identified a more reliable primary source—the TradingView internal API, which provided clean JSON without harsh rate limits. Second, I kept our original scraper (Investing.com) as a fallback. For the fallback, I built a retry wrapper: if it caught an HTTP 429 (Too Many Requests), it would pause for 5 seconds and retry, up to 3 times. This architectural resilience ensures the macro brief never fails silently due to a transient block.\""),

            createSubHeading("Q3: How did you ensure your Node.js cron jobs survived server reboots on a Windows machine?"),
            createParagraph("Answer: \"PM2 is great for Linux (via systemd), but its startup hooks fail on Windows. I solved this by writing a custom `.bat` script placed in the Windows shell:startup folder. The script introduces a 30-second network delay, calls `pm2 resurrect` to revive the backend/frontend processes, and importantly, includes a 'catch-up' logic block. It checks the system clock, and if the machine booted between 8 AM and 11 AM, it forces the Morning Card to trigger immediately to compensate for the missed 8 AM cron execution.\""),

            createSubHeading("Q4: You mentioned using OCR (Tesseract). What were the challenges with that, and how did you solve chart spikes?"),
            createParagraph("Answer: \"OCR is inherently noisy. When parsing ratio images, Tesseract sometimes confused 'change' column values with the actual 'ratio' values, or misread numbers (like reading an '8' as a 'B'). This resulted in massive artificial spikes in the charting frontend. I solved this by implementing strict Regex pattern matching to validate the extracted strings before DB insertion, bounds checking to reject statistically impossible ratios, and manually running SQL DELETE queries to prune the historical corrupted rows from the PostgreSQL database.\""),

            createSubHeading("Q5: Why did you separate the frontend/backend from the automated reporting scripts?"),
            createParagraph("Answer: \"Separation of concerns. The Dashboard (Vite/React + Express backend) is meant for synchronous, user-driven HTTP requests and real-time visualization. The Reporting scripts (Teams Macro Card, Afternoon DOCX) are asynchronous, background daemon tasks triggered by cron. Running them as separate PM2 processes ensures that if the scraping task crashes due to a network timeout, it doesn't take down the web dashboard that the traders are actively looking at.\"")
        ]
    }]
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("C:\\Users\\Ajit.yadav\\Desktop\\Interview_Documentation_Master.docx", buffer);
    console.log("Successfully generated Interview_Documentation_Master.docx");
}).catch(err => {
    console.error("Error generating doc:", err);
});
