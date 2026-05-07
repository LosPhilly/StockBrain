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
        pollInterval = setInterval(() => pollSystemStatus(ticker), 2000);

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
 */
async function pollSystemStatus(ticker) {
    try {
        const res = await fetch(`/api/status/${currentTaskId}`);
        const data = await res.json();

        // Update Audit Trail
        if (data.logs && data.logs.length > lastLogIndex) {
            data.logs.slice(lastLogIndex).forEach(log => appendLog(log.time, log.type, log.content));
            lastLogIndex = data.logs.length;
        }

        // Update Agent Status Badges
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

        // Handle Finalization
        if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(pollInterval);
            data.status === 'completed' ? renderFinalReport(data, ticker) : renderSystemError(data.error);
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
    
    // Render Portfolio Manager Decision
    const pmDecision = statusData.pm_decision;
    document.getElementById('pm-content').innerHTML = marked.parse(pmDecision);
    document.getElementById('pm-decision-wrapper').style.display = 'block';

    // Render Supporting Dossier (Blurred)
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = marked.parse(statusData.supporting_report);
    reportContent.classList.add('blurred-content');

    // Activate Export Command Bar
    const dlBar = document.getElementById('dl-bar');
    const isBullish = pmDecision.includes("BUY") || pmDecision.includes("Overweight");
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
    //alert("Payment Processed. Generating secure document...");
    //window.location.href = '/api/download/' + currentTaskId;
	// This is your live Stripe Payment Link URL
    const stripeLink = "https://buy.stripe.com/3cIbJ23g89um9s49dBffy00"; 
    
    // Append the currentTaskId so your backend can verify it later
    const checkoutUrl = `${stripeLink}?client_reference_id=${currentTaskId}`;
    
    // Redirect the user to Stripe
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
 * HIGH-FIDELITY PDF EXPORT (SECURE VERIFICATION)
 * Performs a mandatory server-side handshake to confirm Stripe payment 
 * before granting clearance to unblur and print the dossier.
 */
async function generateExecutivePDF() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    // 1. Check for presence of session token in the return URL
    if (!sessionId) {
        alert("SECURITY ALERT: No valid payment session detected. Intelligence remains classified.");
        return;
    }

    try {
        // 2. Request verification and PDF generation from the secure endpoint
        // This hits your FastAPI logic that checks session.payment_status == "paid"
        const response = await fetch(`/api/download?task_id=${currentTaskId}&session_id=${sessionId}`);

        if (response.ok) {
            // Success: Server confirmed Stripe payment and task_id match
            alert("PAYMENT VERIFIED: Intelligence clearance granted. Preparing Institutional Briefing...");
            executeInstitutionalPrint();
        } else if (response.status === 402) {
            alert("ACCESS DENIED: Payment required or transaction not yet confirmed by Stripe.");
        } else if (response.status === 403) {
            alert("SECURITY ALERT: Report ID mismatch. Unauthorized access attempt logged.");
        } else {
            const errorData = await response.json();
            alert(`SYSTEM ERROR: ${errorData.detail || "Unable to verify clearance."}`);
        }

    } catch (error) {
        console.error("Verification Node Communication Failure:", error);
        alert("SYSTEM ERROR: Clearance node offline. Please check your connection.");
    }
}

/**
 * INTERNAL PRINT ENGINE
 * Executes the visual transition for the verified user.
 */
function executeInstitutionalPrint() {
    const reportContent = document.getElementById('report-content');
    
    // Total visibility for verified personnel
    reportContent.classList.remove('blurred-content');
    
    // Trigger native browser print-to-PDF engine
    window.print();
    
    // Re-lock the screen after the print job is sent
    reportContent.classList.add('blurred-content');
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
	<button class="pay-btn" onclick="mockPayment()">Export Executive PDF — $4.99</button>
        
    `;
}



// ==========================================
// V. EVENT LISTENERS
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    simulateNetworkFlux();
    
    // --- NEW: AUTO-VERIFY ON RETURN FROM STRIPE ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('session_id')) {
        // If the user just paid and was redirected back, trigger the verification
        console.log("Payment session detected. Initializing secure unblur...");
        generateExecutivePDF(); 
    }
    // ----------------------------------------------

    const tInput = document.getElementById('ticker');
    if(tInput) tInput.addEventListener('input', handleAutocomplete);

    document.addEventListener('click', (e) => {
        if (e.target.id !== 'ticker') hideAutocomplete();
    });
});

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    simulateNetworkFlux();
    
    // Attach autocomplete to search bar
    const tInput = document.getElementById('ticker');
    if(tInput) tInput.addEventListener('input', handleAutocomplete);

    // Close autocomplete when clicking away
    document.addEventListener('click', (e) => {
        if (e.target.id !== 'ticker') hideAutocomplete();
    });
});

window.addEventListener('DOMContentLoaded', () => {
    // Initialize the blink animation for tactical LEDs
    const leds = document.querySelectorAll('.blink-led');
    leds.forEach(led => {
        led.style.animation = 'none';
        led.offsetHeight; 
        led.style.animation = null; 
    });
    
    // Start the agent swarm flux simulation
    simulateNetworkFlux(); 
});