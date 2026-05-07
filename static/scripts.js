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
                
                // Apply blurred preview for conversion
                const reportContent = document.getElementById('report-content');
                reportContent.innerHTML = marked.parse(statusData.supporting_report);
                reportContent.classList.add('blurred-content');
                
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

document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'a' || e.key === 'x')) { e.preventDefault(); }
});

async function mockPayment() {
    alert("Payment Processed. Generating secure document...");
    window.location.href = '/api/download/' + currentTaskId;
}

// Updated Organic, High-Variance Flux
function simulateNetworkFlux() {
    const agentDisplay = document.getElementById('agent-count');
    if (!agentDisplay) return;

    let count = 14;

    setInterval(() => {
        // High-variance: Shift by -3 to +3 for organic movement
        const flux = Math.floor(Math.random() * 7) - 3; 
        count += flux;

        // Realistic range: 4 (quiet) to 28 (surge)
        if (count < 4) count = 6;
        if (count > 28) count = 22;

        agentDisplay.innerText = count;
    }, 2500); 
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
        <button class="pay-btn" onclick="alert('In a real scenario, this would trigger payment.')">Test Pay $4.99</button>
    `;
}

window.addEventListener('DOMContentLoaded', () => {
    const leds = document.querySelectorAll('.blink-led');
    leds.forEach(led => {
        led.style.animation = 'none';
        led.offsetHeight; 
        led.style.animation = null; 
    });
    
    simulateNetworkFlux(); 
});