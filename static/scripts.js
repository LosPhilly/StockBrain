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
        // Swap to the black logo in light mode, white logo in dark mode
        img.src = isLight ? '/assets/logo/stockBrainBlack.png' : '/assets/logo/stockBrainWhite.png';
    });
}

// Ensure theme is set immediately on load
initTheme();

// Handle pressing "Enter" in the search box
function handleEnter(event) {
    if (event.key === "Enter") {
        startAnalysis();
    }
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
    const ticker = document.getElementById('ticker').value.toUpperCase();
    if(!ticker) return;

    // Transition UI to dashboard
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
            
            // Locate the completion block inside pollInterval
			if (statusData.status === 'completed') {
			    document.getElementById('report-date').innerText = new Date().toLocaleDateString();
			    
			    // Parse the decision
			    const pmDecision = statusData.pm_decision;
			    document.getElementById('pm-content').innerHTML = marked.parse(pmDecision);
			    document.getElementById('pm-decision-wrapper').style.display = 'block';
			    
			    document.getElementById('report-content').innerHTML = marked.parse(statusData.supporting_report);
			    
			    // UPDATE: Strategic Conversion Logic
			    const dlBar = document.getElementById('dl-bar');
			    const signalType = pmDecision.includes("BUY") || pmDecision.includes("Overweight") ? "BULLISH" : "CAUTION";
			    
			    dlBar.innerHTML = `
			        <span class="download-text">⚠️ <strong>${signalType} SIGNAL DETECTED:</strong> Unlock full adversarial debate and exit strategy briefing.</span>
			        <button class="pay-btn" onclick="mockPayment()">Get Executive Intelligence — $4.99</button>
			    `;
			    dlBar.style.display = 'flex';
			} else {
			                document.getElementById('report-content').innerHTML = `<h3 style="color:red">ERROR: ${statusData.error}</h3>`;
			            }
			        }
			    }, 2000);
			}

// Anti-Copy Mechanics
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'a' || e.key === 'x')) { e.preventDefault(); }
});

async function mockPayment() {
    alert("Payment Processed. Generating secure document...");
    window.location.href = '/api/download/' + currentTaskId;
}

function simulateNetworkFlux() {
    const agentDisplay = document.getElementById('agent-count');
    if (!agentDisplay) return;

    let count = 14;

    setInterval(() => {
        const flux = Math.floor(Math.random() * 3) - 1; 
        count += flux;

        if (count < 12) count = 13;
        if (count > 19) count = 18;

        agentDisplay.innerText = count;
    }, 3000); 
}

// Function to load the example Realty Income (O) data
function loadExampleReport() {
    // 1. Clear UI and show dashboard
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('dashboard').style.display = 'flex';
    document.getElementById('dash-ticker-title').innerText = "Live Analysis: O (Example)";
    
    // 2. Simulate "Fast" Swarm completion
    const statuses = ['st-market', 'st-bull', 'st-rmanager', 'st-trader', 'st-risk1', 'st-pmanager'];
    statuses.forEach(id => {
        const el = document.getElementById(id);
        el.className = 'status-badge status-Completed';
        el.innerText = 'COMPLETED';
    });

    // 3. Populate with the provided Markdown data
    const examplePM = `
# Portfolio Manager Decision: O
**Rating**: Overweight
**Price Target**: 68.5
**Thesis**: The investment case for O rests on a structural bullish trend where the 50-day SMA ($63.26) remains above the 200-day SMA ($58.83). The contraction of the ATR suggests a 'coiling spring' effect.
    `;
    
    document.getElementById('pm-content').innerHTML = marked.parse(examplePM);
    document.getElementById('pm-decision-wrapper').style.display = 'block';
    
    // Since this is a sample, show the download bar immediately
    document.getElementById('dl-bar').style.display = 'flex';
    document.getElementById('dl-bar').innerHTML = `
        <span class="download-text">⚠️ <strong>EXAMPLE REPORT:</strong> This is how the finalized $4.99 intelligence briefing appears.</span>
        <button class="pay-btn" onclick="alert('In a real scenario, this would trigger Stripe/PayPal payment.')">Test Pay $4.99</button>
    `;
}



window.addEventListener('DOMContentLoaded', () => {
    // Force a reflow to ensure animations trigger on all browsers
    const leds = document.querySelectorAll('.blink-led');
    leds.forEach(led => {
        led.style.animation = 'none';
        led.offsetHeight; /* trigger reflow */
        led.style.animation = null; 
    });
    
    // Start your existing agent flux logic
    simulateNetworkFlux(); 
});