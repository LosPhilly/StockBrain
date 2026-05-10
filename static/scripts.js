let currentTaskId = "";
let lastLogIndex = 0;
let pollInterval;

// ==========================================
// I. THEME & UI INITIALIZATION
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        updateLogos(true);
        document.getElementById('theme-toggle').innerHTML = '🌙 Dark Mode';
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    document.getElementById('theme-toggle').innerHTML = isLight ? '🌙 Dark Mode' : '☀️ Light Mode';
    updateLogos(isLight);
}

function updateLogos(isLight) {
    const logos = document.querySelectorAll('.sb-logo');
    logos.forEach(img => {
        img.src = isLight ? '/assets/logo/stockBrainBlack.png' : '/assets/logo/stockBrainWhite.png';
    });
}

initTheme();

function handleEnter(event) {
    if (event.key === "Enter") {
        startAnalysis();
    }
}

// ==========================================
// II. SYMBOL AUTOCOMPLETE (YFINANCE)
// ==========================================
/**
 * Hooks into the Yahoo Finance autocomplete pipe to suggest 
 * institutional tickers as the user types.
 */
async function handleAutocomplete() {
    const input = document.getElementById('ticker');
    const query = input.value.toUpperCase().trim();
    
    // Clear previous timeout to prevent API flooding
    clearTimeout(autocompleteTimeout);
    
    if (query.length < 1) {
        hideAutocomplete();
        return;
    }

    autocompleteTimeout = setTimeout(async () => {
        try {
            // Using a JSONP/CORS-friendly approach or your backend proxy
            const response = await fetch(`https://autoc.finance.yahoo.com/autoc?query=${query}&region=1&lang=en`);
            const data = await response.json();
            renderSuggestions(data.ResultSet.Result);
        } catch (e) {
            console.error("Autocomplete Node Offline:", e);
        }
    }, 300); // 300ms debounce
}

function renderSuggestions(results) {
    let list = document.getElementById('ticker-suggestions');
    if (!list) {
        list = document.createElement('div');
        list.id = 'ticker-suggestions';
        list.className = 'autocomplete-panel';
        document.querySelector('.input-group').appendChild(list);
    }

    list.innerHTML = results.slice(0, 5).map(res => `
        <div class="suggestion-item" onclick="selectTicker('${res.symbol}')">
            <span class="sugg-symbol">${res.symbol}</span>
            <span class="sugg-name">${res.name}</span>
        </div>
    `).join('');
    list.style.display = 'block';
}

function selectTicker(symbol) {
    document.getElementById('ticker').value = symbol;
    hideAutocomplete();
    startAnalysis();
}

function hideAutocomplete() {
    const list = document.getElementById('ticker-suggestions');
    if (list) list.style.display = 'none';
}



/**
 * Opens the tactical modal overlay for Terms of Service.
 * Prevents default anchor behavior to keep the user's dashboard position.
 */
function showTerms(e) {
    if (e) e.preventDefault(); // This stops the '#' jump
    
    const modal = document.getElementById('terms-modal');
    const overlay = document.getElementById('modal-overlay');
    
    if (modal && overlay) {
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
}

/**
 * Closes the modal and restores focus to the dashboard/landing page.
 */
function closeTerms() {
    document.getElementById('terms-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
}


function appendLog(time, type, text) {
    const tableBody = document.getElementById('log-table-body');
    tableBody.insertAdjacentHTML('beforeend', `<tr class="log-row"><td class="log-time">${time}</td><td class="log-type">${type}</td><td class="log-content">${text}</td></tr>`);
    
    const scrollContainer = document.getElementById('log-scroll-container');
    if(scrollContainer) { 
        scrollContainer.scrollTop = scrollContainer.scrollHeight; 
    }
}

/**
 * DEPLOY ANALYTICAL SWARM
 * Orchestrates the transition from landing to live dashboard and manages
 * the lifecycle of the multi-agent market analysis.
 */
async function startAnalysis() {
    const tickerInput = document.getElementById('ticker');
    const ticker = tickerInput.value.toUpperCase().trim();
    
    // 1. Validation & Security Gate
    const tickerRegex = /^[A-Z]{1,5}$/;
    if (!tickerRegex.test(ticker)) {
        alert("SECURITY ALERT: Invalid Ticker Format. Use 1-5 alphabetic characters only.");
        tickerInput.value = "";
        return;
    }
    if (!ticker) return;

    // 2. UI Transition: Combat Mode
    prepareDashboardUI(ticker);
    
    // 3. Widget Initialization
    if (typeof injectGoogleTrends === 'function') {
        injectGoogleTrends(ticker);
    }

    // 4. Analysis Initiation
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: ticker })
        });
        
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        currentTaskId = data.task_id;
        lastLogIndex = 0;

        // 5. Polling Lifecycle
        pollInterval = setInterval(() => pollSystemStatus(currentTaskId), 2000);

    } catch (error) {
        console.error("Critical System Failure:", error);
        document.getElementById('report-content').innerHTML = `<h3 style="color:red">INITIALIZATION ERROR: ${error.message}</h3>`;
    }
}

/**
 * UI STATE MANAGER
 * Swaps landing page for the mission-critical dashboard.
 */
function prepareDashboardUI(ticker) {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    document.getElementById('dash-ticker-title').innerText = `Live Analysis: ${ticker}`;
    document.getElementById('report-wrapper').style.display = 'block';
    
    // Reset badges for new run
    document.querySelectorAll('.status-badge').forEach(badge => {
        badge.className = 'status-badge status-Pending';
        badge.innerText = 'Pending';
    });
}

/**
 * SYSTEM STATUS POLLING
 * Fetches logs and agent states from the FastAPI backend.
 * Now hardened to handle state recovery from Task IDs.
 */
async function pollSystemStatus(recoveredId = null) {
    const targetId = recoveredId || currentTaskId;
    if (!targetId) return;

    try {
        const res = await fetch(`/api/status/${targetId}`);
        const data = await res.json();

        // 1. Update Audit Trail
        if (data.logs && data.logs.length > lastLogIndex) {
            data.logs.slice(lastLogIndex).forEach(log => appendLog(log.time, log.type, log.content));
            lastLogIndex = data.logs.length;
        }

        // 2. Update Agent Status Badges
        if (data.agent_statuses) {
            Object.entries(data.agent_statuses).forEach(([id, status]) => {
                const el = document.getElementById(id);
                if (el) {
                    const statusType = status.split(' ')[0];
                    el.className = `status-badge status-${statusType}`;
                    el.innerText = status;
                }
            });
        }

        // 3. MISSION-CRITICAL: Hydrate Reports and correct Ticker labels
        if (data.status === 'completed') {
            clearInterval(pollInterval);
            
            // Set the ticker correctly (e.g., 'SCHD') instead of 'ANALYSIS'
            const displayTicker = data.ticker || "ANALYSIS";
            document.getElementById('dash-ticker-title').innerText = `Live Analysis: ${displayTicker}`;
            
            // Pass the real ticker to the renderer for the bottom status bar
            renderFinalReport(data, displayTicker);
        } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            renderSystemError(data.error);
        }
    } catch (e) {
        console.warn("Telemetry Lost. Retrying...", e);
    }
}

/**
 * FINAL REPORT RENDERER
 * Finalizes the UI with the PM decision and export bar.
 */
function renderFinalReport(statusData, ticker) {
    document.getElementById('report-date').innerText = new Date().toLocaleDateString();
    
    // 1. Render Portfolio Manager Decision
    const pmDecision = statusData.pm_decision;
    if (pmDecision) {
        document.getElementById('pm-content').innerHTML = marked.parse(pmDecision);
        document.getElementById('pm-decision-wrapper').style.display = 'block';
    }

    // 2. Render Supporting Dossier
    const reportContent = document.getElementById('report-content');
    if (statusData.supporting_report) {
        reportContent.innerHTML = marked.parse(statusData.supporting_report);
    }

    // 3. Update Global Status Bar (Fixes the 'undefined' ticker error)
    const dlBar = document.getElementById('dl-bar');
    const isBullish = pmDecision && (pmDecision.includes("BUY") || pmDecision.includes("Overweight"));
    const signalType = isBullish ? "BULLISH" : "CAUTION";
    
    dlBar.innerHTML = `
        <span class="download-text">⚠️ <strong>${signalType} SIGNAL DETECTED:</strong> Intelligence briefing finalized for ${ticker}.</span>
        <button class="pay-btn" onclick="mockPayment()">Export Executive PDF — $4.99</button>
    `;
    dlBar.style.display = 'flex';
}

function renderSystemError(errorMsg) {
    document.getElementById('report-content').innerHTML = `<h3 style="color:red">ANALYSIS FAILED: ${errorMsg}</h3>`;
}


/**
 * Dynamically injects the Google Trends interest-over-time widget
 */
function injectGoogleTrends(ticker) {
    const container = document.getElementById('trends-container');
    if (!container) return;
    container.innerHTML = ""; // Clear
    
    const script = document.createElement('script');
    script.src = "https://ssl.gstatic.com/trends_nrtr/3620_RC01/embed_loader.js";
    script.onload = () => {
        window.trends.embed.renderExploreWidgetTo(container, "TIMESERIES", {
            "comparisonItem": [{"keyword": ticker, "geo": "", "time": "today 12-m"}],
            "category": 0, "property": ""
        }, {"exploreQuery": `q=${ticker}`, "guestPath": "https://trends.google.com:443/trends/embed/"});
    };
    document.head.appendChild(script);
}

// ==========================================
// IV. UTILITIES & EXPORT
// ==========================================
function finalizeAnalysis(statusData, ticker) {
    document.getElementById('report-date').innerText = new Date().toLocaleDateString();
    const pmDecision = statusData.pm_decision;
    document.getElementById('pm-content').innerHTML = marked.parse(pmDecision);
    document.getElementById('pm-decision-wrapper').style.display = 'block';
    
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = marked.parse(statusData.supporting_report);
    reportContent.classList.add('blurred-content');
    
    const dlBar = document.getElementById('dl-bar');
    const signalType = (pmDecision.includes("BUY") || pmDecision.includes("Overweight")) ? "BULLISH" : "CAUTION";
    
    dlBar.innerHTML = `
        <span class="download-text">⚠️ <strong>${signalType} SIGNAL DETECTED:</strong> Briefing finalized for ${ticker}.</span>
        <button class="pay-btn" onclick="mockPayment()">Export Executive PDF — $4.99</button>
    `;
    dlBar.style.display = 'flex';
}

/**
 * Handles the transition from a blurred web preview to a 
 * professional-grade PDF export of the current scan.
 */
async function processInstitutionalExport() {
    // In production, this would trigger your payment gateway (e.g., Stripe)
    alert("Payment Processed. Generating Secure Institutional Briefing...");

    // 1. Remove visual restrictions for the export
    const reportContent = document.getElementById('report-content');
    reportContent.classList.remove('blurred-content');

    // 2. Trigger the browser print engine (using print-specific CSS to format)
    window.print();

    // 3. Re-apply restrictions if the user continues to view the dashboard
    reportContent.classList.add('blurred-content');
}

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'a' || e.key === 'x')) { e.preventDefault(); }
});

async function mockPayment() {
    const stripeLink = "https://buy.stripe.com/3cIbJ23g89um9s49dBffy00"; 
    
    // FORENSIC LOG: Verify the ID exists before redirecting
    //console.log("CRITICAL: Redirecting to Stripe for Task ID:", currentTaskId);
    
    // if (!currentTaskId) {
    //     alert("SYSTEM ERROR: Analysis context lost. Please restart the scan.");
     //    return;
     //}

    // Stripe metadata in URL parameters requires the 'prefilled_metadata' prefix
    const checkoutUrl = `${stripeLink}?client_reference_id=${currentTaskId}`;
    window.location.href = checkoutUrl;
}

// Updated Organic, High-Variance Flux
/**
 * Simulates real-time network flux for the analytical swarm.
 * Engineered for server-side stability at StockBrain.io.
 */
function simulateNetworkFlux() {
    // Force a fresh grab of the element
    const agentDisplay = document.getElementById('agent-count');
    
    if (!agentDisplay) {
        // If not found, the DOM might still be loading; retry in 500ms
        setTimeout(simulateNetworkFlux, 500);
        return;
    }

    let count = 14;

    // Ensure we don't have multiple intervals running on the live server
    if (window.fluxInterval) clearInterval(window.fluxInterval);

    window.fluxInterval = setInterval(() => {
        // High-variance: Shift by -3 to +3 for organic movement
        const flux = Math.floor(Math.random() * 7) - 3; 
        count += flux;

        // Realistic range: 6 to 28 based on active deployment
        if (count < 6) count = 8;
        if (count > 28) count = 22;

        agentDisplay.innerText = count;
    }, 2500); 
}

// Function to return to the landing page and reset the swarm state
function returnToLanding() {
    // 1. Stop any active polling
    if (pollInterval) clearInterval(pollInterval);
    
    // 2. Clear task data
    currentTaskId = "";
    lastLogIndex = 0;

    // 3. Reset UI elements
    document.getElementById('ticker').value = "";
    document.getElementById('log-table-body').innerHTML = "";
    document.getElementById('pm-content').innerHTML = "";
    document.getElementById('pm-decision-wrapper').style.display = 'none';
    document.getElementById('dl-bar').style.display = 'none';
    
    // 4. Reset status badges to Pending
    const badges = document.querySelectorAll('.status-badge');
    badges.forEach(badge => {
        badge.className = 'status-badge status-Pending';
        badge.innerText = 'PENDING';
    });

    // 5. Switch visibility
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('landing-page').style.display = 'flex';
}


/**
 * HIGH-FIDELITY DASHBOARD RECOVERY & EXPORT
 * Performs the forensic handshake to recover the Task ID, hydrates the UI
 * with the full dossier, and manages the transition to a clean on-screen view.
 */
async function generateExecutivePDF() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) return;

    try {
        const response = await fetch(`/api/download?session_id=${sessionId}`);
        
        if (response.ok) {
            const data = await response.json();
            currentTaskId = data.task_id; // RECOVER IDENTITY

            // 1. RE-FETCH FULL DATA: Populates the blank Markdown containers
            await pollSystemStatus(currentTaskId); 

            // 2. UI VISIBILITY: Ensure the Dashboard is the active view
            document.getElementById('landing-page').style.display = 'none';
            document.getElementById('dashboard').style.display = 'flex';
            
            // 3. SURGICAL HIDE: Hide technical panels ONLY
            const progressPane = document.querySelector('.progress-pane');
            const msgPane = document.querySelector('.msg-pane');
            if (progressPane) progressPane.style.display = 'none';
            if (msgPane) msgPane.style.display = 'none';

            // 4. FORCE REPORT VISIBILITY: Explicitly show the result containers
            document.getElementById('pm-decision-wrapper').style.display = 'block';
            document.getElementById('report-wrapper').style.display = 'block';

            // 5. THE UNBLUR: Remove visual lock from the Supporting Documentation
            const reportContent = document.getElementById('report-content');
            if (reportContent) {
                reportContent.classList.remove('blurred-content');
                reportContent.style.filter = "none"; // CSS Override
                reportContent.style.opacity = "1";   // CSS Override
            }

            // 6. PRINT EXECUTION: 1.5s delay to ensure tables/Marked.js finish rendering
            setTimeout(() => {
                window.print();
                
                // 7. FORENSIC CLEANUP: Remove session_id to prevent re-print loops
                window.history.replaceState({}, document.title, "/");
                
                console.log("State restored: Full intelligence briefing now legible on-screen.");
            }, 1500);
        }
    } catch (e) {
        console.error("Forensic node sync failure:", e);
    }
}


/**
 * INTERNAL PRINT ENGINE
 * Handles the visual transition and triggers the browser's native PDF generator.
 */
function executeInstitutionalPrint() {
    const reportContent = document.getElementById('report-content');
    
    // Remove visual restrictions
    reportContent.classList.remove('blurred-content');
    
    // Trigger print engine
    window.print();
    
    // Re-apply restrictions for security
    reportContent.classList.add('blurred-content');
}


/**
 * SET TICKER
 * Populates the search input from trending chips and triggers analysis.
 */
function setTicker(symbol) {
    const input = document.getElementById('ticker');
    input.value = symbol;
    startAnalysis();
}

/**
 * GOOGLE TRENDS INTEGRATION
 * Injects a live interest-over-time widget for the active ticker.
 */
function injectGoogleTrends(ticker) {
    const container = document.getElementById('trends-container');
    const mount = document.getElementById('trends-widget-mount');
    
    if (!container || !mount) return;
    
    container.style.display = 'block'; // Reveal the panel
    mount.innerHTML = ""; // Clear existing widget

    const script = document.createElement('script');
    script.src = "https://ssl.gstatic.com/trends_nrtr/3620_RC01/embed_loader.js";
    script.onload = () => {
        window.trends.embed.renderExploreWidgetTo(mount, "TIMESERIES", {
            "comparisonItem": [{"keyword": ticker, "geo": "", "time": "today 12-m"}],
            "category": 0,
            "property": ""
        }, {
            "exploreQuery": `q=${ticker}`,
            "guestPath": "https://trends.google.com:443/trends/embed/"
        });
    };
    document.head.appendChild(script);
}

// EXAMPLE REPORT LOAD
// DEBUG - MOCK PAY BUTTON <button class="pay-btn" onclick="mockPayment()">Export Executive PDF — $4.99</button>
function loadExampleReport() {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    document.getElementById('dash-ticker-title').innerText = "Live Analysis: O (Example)";
    
    const statuses = ['st-market', 'st-bull', 'st-rmanager', 'st-trader', 'st-risk1', 'st-pmanager'];
    statuses.forEach(id => {
        const el = document.getElementById(id);
        el.className = 'status-badge status-Completed';
        el.innerText = 'COMPLETED';
    });

    const examplePM = `
# Portfolio Manager Decision: O
**Rating**: Overweight
**Price Target**: 68.5
**Thesis**: The investment case for O rests on a structural bullish trend where the 50-day SMA ($63.26) remains above the 200-day SMA ($58.83). The contraction of the ATR suggests a 'coiling spring' effect.
    `;
    
    document.getElementById('pm-content').innerHTML = marked.parse(examplePM);
    document.getElementById('pm-decision-wrapper').style.display = 'block';
    
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = "### [DATA BLOCKED]\nDetailed agent research and adversarial debates are only available in the Executive Briefing.";
    reportContent.classList.add('blurred-content');

    const dlBar = document.getElementById('dl-bar');
    dlBar.style.display = 'flex';
    dlBar.innerHTML = `
        <span class="download-text">⚠️ <strong>EXAMPLE REPORT:</strong> This is how the finalized $4.99 intelligence briefing appears.</span>
	    
        
    `;
}

async function loadTrending() {
    const list = document.getElementById('trending-list');
    if (!list) return;

    try {
        const response = await fetch('/api/trending');
        const tickers = await response.json();
        
        list.innerHTML = ''; // Wipe the "nothing" away
        
        tickers.forEach(symbol => {
            const pill = document.createElement('div');
            pill.className = 'ticker-pill'; // <--- THIS IS CRITICAL FOR THE CSS TO WORK
            pill.innerText = `$${symbol}`;
            pill.onclick = () => {
                const input = document.getElementById('ticker');
                if (input) input.value = symbol;
            };
            list.appendChild(pill);
        });
    } catch (err) {
        console.error("Trending UI Sync Failed:", err);
    }
}

// Run on startup
document.addEventListener('DOMContentLoaded', loadTrending);



// ==========================================
// V. CONSOLIDATED MASTER BOOTSTRAP
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Auto-Verify Payment Return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('session_id')) {
        console.log("Return verified session detected.");
        generateExecutivePDF();
    }

    // Input Handlers
    const tInput = document.getElementById('ticker');
    if (tInput) {
        tInput.addEventListener('input', handleAutocomplete);
        tInput.addEventListener('keypress', e => e.key === "Enter" && startAnalysis());
    }

    // UI Effects & Global listeners
    document.querySelectorAll('.blink-led').forEach(led => led.style.animation = 'hardware-pulse 1.2s infinite');
    document.addEventListener('click', e => e.target.id !== 'ticker' && hideAutocomplete());
    document.addEventListener('keydown', e => e.ctrlKey && ['c', 'a', 'x'].includes(e.key) && e.preventDefault());
    
    simulateNetworkFlux();
});