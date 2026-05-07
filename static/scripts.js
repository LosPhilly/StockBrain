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
            
            if (statusData.status === 'completed') {
                document.getElementById('report-date').innerText = new Date().toLocaleDateString();
                document.getElementById('pm-content').innerHTML = marked.parse(statusData.pm_decision);
                document.getElementById('pm-decision-wrapper').style.display = 'block';
                
                document.getElementById('report-content').innerHTML = marked.parse(statusData.supporting_report);
                
                document.getElementById('dl-bar').style.display = 'flex';
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