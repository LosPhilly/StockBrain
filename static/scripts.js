let currentTaskId = "";
let lastLogIndex = 0;
let pollInterval;

// Theme Logic
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

async function startAnalysis() {
	const tickerInput = document.getElementById('ticker');
    const ticker = document.getElementById('ticker').value.toUpperCase();
	
	// Institutional standard: Tickers are 1-5 alphabetic characters
    const tickerRegex = /^[A-Z]{1,5}$/;
	
	if (!tickerRegex.test(ticker)) {
        alert("SECURITY ALERT: Invalid Ticker Format. Use 1-5 alphabetic characters only.");
        tickerInput.value = "";
        return;
    }
	
    if(!ticker) return;

    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    document.getElementById('dash-ticker-title').innerText = `Live Analysis: ${ticker}`;
    document.getElementById('report-wrapper').style.display = 'block';
    
    lastLogIndex = 0;

    let res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ticker: ticker})
    });
    let data = await res.json();
    currentTaskId = data.task_id;

    pollInterval = setInterval(async () => {
        let statusRes = await fetch('/api/status/' + currentTaskId);
        let statusData = await statusRes.json();
        
        if (statusData.logs) {
            for (let i = lastLogIndex; i < statusData.logs.length; i++) {
                let log = statusData.logs[i];
                appendLog(log.time, log.type, log.content);
            }
            lastLogIndex = statusData.logs.length;
        }

        if (statusData.agent_statuses) {
            for (let [ag_id, status] of Object.entries(statusData.agent_statuses)) {
                let el = document.getElementById(ag_id);
                if (el) {
                    let cssClass = status.split(' ')[0]; 
                    el.className = 'status-badge status-' + cssClass;
                    el.innerText = status;
                }
            }
        }
        
        if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(pollInterval);
            
            if (statusData.status === 'completed') {
                document.getElementById('report-date').innerText = new Date().toLocaleDateString();
                const pmDecision = statusData.pm_decision;
                document.getElementById('pm-content').innerHTML = marked.parse(pmDecision);
                document.getElementById('pm-decision-wrapper').style.display = 'block';
                
                // Populate supporting documents
                const reportContent = document.getElementById('report-content');
                reportContent.innerHTML = marked.parse(statusData.supporting_report);
                // Keep blurred until payment
                reportContent.classList.add('blurred-content');
                
                const dlBar = document.getElementById('dl-bar');
                const signalType = (pmDecision.includes("BUY") || pmDecision.includes("Overweight")) ? "BULLISH" : "CAUTION";
                
                // Logic updated to trigger PDF export flow
                dlBar.innerHTML = `
                    <span class="download-text">⚠️ <strong>${signalType} SIGNAL DETECTED:</strong> Intelligence briefing finalized for ${ticker}.</span>
                    <button class="pay-btn" onclick="processInstitutionalExport()">Export Executive PDF — $4.99</button>
                `;
                dlBar.style.display = 'flex';
            } else {
                document.getElementById('report-content').innerHTML = `<h3 style="color:red">ERROR: ${statusData.error}</h3>`;
            }
        }
    }, 2000);
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
    alert("Payment Processed. Generating secure document...");
    window.location.href = '/api/download/' + currentTaskId;
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

// New Function for High-Fidelity PDF Export
async function generateExecutivePDF() {
    // In a real app, you'd verify payment here
    alert("Payment Verified. Preparing Institutional Grade PDF...");

    // Remove blur for the print
    const reportContent = document.getElementById('report-content');
    reportContent.classList.remove('blurred-content');
    
    // Trigger the browser's print-to-PDF functionality
    // The CSS @media print rules below will format this perfectly
    window.print();
    
    // Re-apply blur if they stay on the page
    reportContent.classList.add('blurred-content');
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
        
    `;
}

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