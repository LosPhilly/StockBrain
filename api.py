from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse # Removed HTMLResponse, added FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fpdf import FPDF
import uuid
import datetime
from dotenv import load_dotenv
import os
import stripe
import textwrap
import yfinance as yf  # <--- Add this to fix the Pylint error
import random

from sqlalchemy import Column, String, Text, create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv() 


from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

# Set this to "PROD" in your environment variables when deploying
ENV = os.getenv("ENV", "DEV")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# The database setup logic stays mostly the same
# --- DATABASE PERSISTENCE LAYER ---
# Prioritize Managed DB URL from Environment Variables
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Production: Managed PostgreSQL
    # Fix for Heroku/DigitalOcean style strings if they start with 'postgres://'
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, 
        connect_args={"sslmode": "require"})
else:
    # Development: Local SQLite
    DATABASE_URL = "sqlite:///./stockbrain.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
# --- UPDATED MODELS ---
class User(Base):
    """
    STORES INSTITUTIONAL ACCESS STATUS:
    Linked to Firebase/RevenueCat app_user_id.
    """
    __tablename__ = "users"
    user_id = Column(String, primary_key=True, index=True)
    is_subscribed = Column(String, default="inactive") # "active" or "inactive"
    last_sync = Column(String)

class TaskRecord(Base):
    """
    CENTRAL TASK REGISTRY:
    Maintains links for both Web (session_id) and App (user_id) flows.
    """
    __tablename__ = "tasks"
    task_id = Column(String, primary_key=True, index=True)
    ticker = Column(String)
    user_id = Column(String, index=True, nullable=True) # NEW: Links to App User History
    pm_decision = Column(Text)
    supporting_report = Column(Text)
    full_download_report = Column(Text)

# This is where the "create_all" logic actually lives
# TEMPORARY: Run once to sync the Managed DB schema
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

if ENV == "PROD":
    # Disable Swagger (/docs) and ReDoc (/redoc) entirely
    app = FastAPI(
        title="StockBrain Engine",
        docs_url=None, 
        redoc_url=None,
        openapi_url=None # This hides the raw JSON schema too
    )
else:
    app = FastAPI(title="StockBrain Engine")
	
app.add_middleware(
    CORSMiddleware,
    # Ensure your live domain is listed here without a trailing slash
    allow_origins=["http://localhost:8000", "https://stockbrain.io"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (HTML, CSS, JS) and assets (Images, Logos)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")

analysis_tasks = {}

class AnalyzeRequest(BaseModel):
    ticker: str
    user_id: str = None # NEW: Passed by Flutter app

def build_supporting_markdown_report(final_state):
    sections = []
    analysts = [("Market Analyst", "market_report"), ("Social Analyst", "sentiment_report"), 
                ("News Analyst", "news_report"), ("Fundamentals Analyst", "fundamentals_report")]
    parts = [f"### {name}\n{final_state[key]}" for name, key in analysts if final_state.get(key)]
    if parts: sections.append("## I. Analyst Team Reports\n" + "\n\n".join(parts))

    debate = final_state.get("investment_debate_state", {})
    r_parts = []
    if debate.get("bull_history"): r_parts.append(f"### Bull Researcher\n{debate['bull_history']}")
    if debate.get("bear_history"): r_parts.append(f"### Bear Researcher\n{debate['bear_history']}")
    if debate.get("judge_decision"): r_parts.append(f"### Research Manager\n{debate['judge_decision']}")
    if r_parts: sections.append("## II. Research Team Decision\n" + "\n\n".join(r_parts))

    if final_state.get("trader_investment_plan"):
        sections.append(f"## III. Trading Team Plan\n### Trader\n{final_state['trader_investment_plan']}")

    risk = final_state.get("risk_debate_state", {})
    rk_parts = []
    if risk.get("aggressive_history"): rk_parts.append(f"### Aggressive Analyst\n{risk['aggressive_history']}")
    if risk.get("conservative_history"): rk_parts.append(f"### Conservative Analyst\n{risk['conservative_history']}")
    if risk.get("neutral_history"): rk_parts.append(f"### Neutral Analyst\n{risk['neutral_history']}")
    if rk_parts: sections.append("## IV. Risk Management Team Decision\n" + "\n\n".join(rk_parts))

    return "\n\n---\n\n".join(sections)

def build_complete_downloadable_report(final_state, ticker):
    header = f"# Trading Analysis Report: {ticker}\n**Generated:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n---\n\n"
    supporting = build_supporting_markdown_report(final_state)
    pm_decision = ""
    risk = final_state.get("risk_debate_state", {})
    if risk.get("judge_decision"): 
        pm_decision = f"## V. Portfolio Manager Decision\n### Portfolio Manager\n{risk['judge_decision']}\n\n---\n\n"
    return header + pm_decision + supporting
	
	
def generate_pdf_from_markdown(content, path):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    
    # Calculate effective width (Page width - left margin - right margin)
    # Standard A4 is 210mm. Default margins are 10mm.
    effective_width = pdf.w - 20 

    # 1. Branding (Logo)
    logo_path = r"\assets\logo\faviLogo.png"
    try:
        pdf.image(logo_path, x=170, y=8, w=25) 
    except Exception as e:
        print(f"Logo not found: {e}")

    # 2. Header Title
    pdf.set_font("Courier", 'B', size=14)
    pdf.cell(effective_width, 10, "STOCKBRAIN EXECUTIVE BRIEFING", ln=True)
    pdf.set_font("Courier", 'I', size=8)
    pdf.cell(effective_width, 5, "Internal Use Only - Proprietary Intelligence", ln=True)
    pdf.ln(10)
    
    # 3. Content Body
    pdf.set_font("Courier", size=10)
    lines = content.split('\n')
    
    for line in lines:
        if not line.strip():
            pdf.ln(5)
            continue
            
        # SAFETY WRAP: Standard Courier 10pt is approx 2.12mm per char. 
        # 75-80 chars is safer than 90+ to avoid margin collisions.
        wrapped_lines = textwrap.wrap(line, width=75, break_long_words=True, replace_whitespace=False)
        
        for w_line in wrapped_lines:
            try:
                clean_line = w_line.encode('latin-1', 'replace').decode('latin-1')
                # Use effective_width instead of 0 to prevent the horizontal space exception
                pdf.multi_cell(effective_width, 8, txt=clean_line)
            except Exception as e:
                # Log specific line failures without crashing the whole process
                print(f"Line skip error: {e}")
                continue

    # 4. Footer
    pdf.set_y(-15)
    pdf.set_font("Courier", 'I', 8)
    pdf.cell(effective_width, 10, f'Page {pdf.page_no()}', align='C')

    pdf.output(path)
	

def run_trading_analysis(task_id: str, ticker: str):
    """
    MISSION-CRITICAL ANALYTICAL SWARM
    Orchestrates the multi-agent graph, manages live state telemetry,
    and ensures forensic-grade persistence in Managed PostgreSQL.
    """
    try:
        # 1. IMMEDIATE MEMORY HYDRATION
        # Ensure the task entry exists in local memory for the polling route
        if task_id not in analysis_tasks:
            analysis_tasks[task_id] = {}
        
        analysis_tasks[task_id]["ticker"] = ticker
        analysis_tasks[task_id]["status"] = "processing"
        analysis_tasks[task_id]["logs"] = []
        analysis_tasks[task_id]["agent_statuses"] = {
            "st-market": "Pending", "st-bull": "Pending", "st-bear": "Pending",
            "st-rmanager": "Pending", "st-trader": "Pending", "st-risk1": "Pending",
            "st-risk2": "Pending", "st-risk3": "Pending", "st-pmanager": "Pending"
        }
        analysis_tasks[task_id]["pm_decision"] = ""

        def add_log(msg_type, content):
            t = datetime.datetime.now().strftime("%H:%M:%S")
            analysis_tasks[task_id]["logs"].append({
                "time": t, 
                "type": msg_type, 
                "content": str(content)
            })

        # 2. TICKER VALIDATION (Prevention of yfinance Empty Ticker Failure)
        if not ticker or ticker.strip() == "":
            raise ValueError("System rejected analysis: Empty ticker symbol provided.")

        add_log("System", f"Deploying AI Syndicate for {ticker}...")

        # 3. SWARM INITIALIZATION
        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = "google" 
        config["output_language"] = "English" 
        
        ta = TradingAgentsGraph(["market", "social", "news", "fundamentals"], debug=True, config=config)
        
        # Set dynamic time context (matching your specific environment date)
        init_state = ta.propagator.create_initial_state(ticker, "2026-05-08")
        args = ta.propagator.get_graph_args()
        args["recursion_limit"] = 250 # Add this to give the agents more "breathing room"
        analysis_tasks[task_id]["agent_statuses"]["st-market"] = "In Progress"

        # 4. LIVE GRAPH STREAMING
        trace = []
        for chunk in ta.graph.stream(init_state, **args):
            # Log agent activity
            for message in chunk.get("messages", []):
                msg_class = type(message).__name__
                content = getattr(message, 'content', '')
                if content:
                    if msg_class == "HumanMessage":
                        add_log("Control" if content == "Continue" else "User", content)
                    elif msg_class == "AIMessage":
                        add_log("Agent", content)

            # UI STATUS MAPPING
            status_map = analysis_tasks[task_id]["agent_statuses"]
            
            if chunk.get("market_report") or chunk.get("fundamentals_report"):
                status_map["st-market"] = "Completed"
                status_map["st-bull"] = "In Progress"
                status_map["st-bear"] = "In Progress"
            
            if chunk.get("investment_debate_state"):
                debate = chunk["investment_debate_state"]
                if debate.get("judge_decision"):
                    status_map["st-bull"] = "Completed"
                    status_map["st-bear"] = "Completed"
                    status_map["st-rmanager"] = "Completed"
                    status_map["st-trader"] = "In Progress"
                else:
                    status_map["st-rmanager"] = "In Progress"

            if chunk.get("trader_investment_plan"):
                status_map["st-trader"] = "Completed"
                status_map.update({"st-risk1": "In Progress", "st-risk2": "In Progress", "st-risk3": "In Progress"})

            if chunk.get("risk_debate_state"):
                risk = chunk["risk_debate_state"]
                if risk.get("judge_decision"):
                    status_map.update({"st-risk1": "Completed", "st-risk2": "Completed", "st-risk3": "Completed", "st-pmanager": "Completed"})
                    analysis_tasks[task_id]["pm_decision"] = risk["judge_decision"]
                else:
                    status_map["st-pmanager"] = "In Progress"

            trace.append(chunk)

        # 5. FINAL REPORT ASSEMBLY
        if not trace:
            raise ValueError("Intelligence swarm failed to return actionable data.")

        final_state = trace[-1]
        supporting = build_supporting_markdown_report(final_state)
        full_report = build_complete_downloadable_report(final_state, ticker)
        
        # Hydrate Memory for immediate UI clearance
        analysis_tasks[task_id].update({
            "status": "completed",
            "supporting_report": supporting,
            "full_download_report": full_report
        })
        
        # Ensure all statuses are locked to Completed
        for k in analysis_tasks[task_id]["agent_statuses"]:
            analysis_tasks[task_id]["agent_statuses"][k] = "Completed"

        add_log("System", "Intelligence Briefing Finalized. Clearance protocol initiated.")

        # 6. ATOMIC PERSISTENCE (Fixes the Rollback issue)
        # We open a FRESH connection here so it doesn't time out during the analysis
        db = SessionLocal()
        try:
            # Check if record exists (it should have been created by start_analysis)
            record = db.query(TaskRecord).filter(TaskRecord.task_id == task_id).first()
            
            if record:
                record.pm_decision = analysis_tasks[task_id].get("pm_decision", "Hold / Neutral")
                record.supporting_report = supporting
                record.full_download_report = full_report
                db.commit()
                print(f"SUCCESS: Task {task_id} committed to Managed DB.")
            else:
                # Fallback: create it if it doesn't exist
                new_task = TaskRecord(
                    task_id=task_id,
                    ticker=ticker,
                    pm_decision=analysis_tasks[task_id].get("pm_decision", "Hold / Neutral"),
                    supporting_report=supporting,
                    full_download_report=full_report
                )
                db.add(new_task)
                db.commit()
                print(f"SUCCESS: Task {task_id} created and committed to Managed DB.")
        except Exception as db_err:
            db.rollback()
            print(f"DATABASE PERSISTENCE FAILURE: {db_err}")
            # We don't crash the whole function here because the data is still in memory
        finally:
            db.close()

    except Exception as e:
        error_msg = f"SYSTEM CRITICAL FAILURE: {str(e)}"
        print(error_msg)
        if task_id in analysis_tasks:
            analysis_tasks[task_id]["status"] = "failed"
            analysis_tasks[task_id]["error"] = str(e)
            add_log("Error", error_msg)


# --- API ROUTES ---

# FIX: Removed response_class=HTMLResponse
@app.get("/")
async def serve_search_page():
    # Serve the external HTML file
    return FileResponse("static/index.html")

@app.get("/api/trending")
async def get_trending_tickers():
    # Rotate queries based on the current hour
    hour = datetime.datetime.now().hour
    
    # Map hours to different "market desks"
    queries = {
        "morning": ["premarket", "nasdaq", "top gainers", "crypto", "equity","bitcoin", "ethereum", "futures"],
        "afternoon": ["crypto", "equity","high volume", "blue chip", "sp500","bitcoin", "ethereum", "futures"],
        "evening": ["crypto", "equity", "bitcoin", "ethereum", "futures"],
        "night": ["crypto", "equity","asia market", "nikkei", "global","bitcoin", "ethereum", "futures"]
    }
    if 5 <= hour < 12:
        current_pool = queries["morning"]
    elif 12 <= hour < 17:
        current_pool = queries["afternoon"]
    elif 17 <= hour < 22:
        current_pool = queries["evening"]
    else:
        current_pool = queries["night"]

    query = random.choice(current_pool)

    try:
        import yfinance as yf
        
        # 1. Try an empty query - This often triggers the default "Most Active" list
        search = yf.Search(query, max_results=10)
        print(f"\n[SYSTEM DEBUG] Attempt 1 (Empty Query) - Quotes: {search.quotes}")
        
        quotes = getattr(search, 'quotes', [])
        
        # 2. If empty, try "equity" or "active"
        if not quotes:
            print("[SYSTEM DEBUG] Attempt 1 failed. Trying 'active'...")
            search = yf.Search("top", max_results=10)
            print(f"[SYSTEM DEBUG] Attempt 2 (Active) - Quotes: {search.quotes}")
            quotes = getattr(search, 'quotes', [])

        if quotes:
            # Clean up and return
            symbols = [q['symbol'].split('=')[0] for q in quotes if 'symbol' in q][:6]
            print(f"[SYSTEM DEBUG] Success! Parsed: {symbols}")
            return symbols

        # 3. Final Fallback if Yahoo is being completely silent
        print("[SYSTEM DEBUG] All Yahoo queries returned empty. Using StockBrain Default Node list.")
        return ["NVDA", "TSLA", "AAPL", "BTC-USD", "AMD", "MSFT"]
        
    except Exception as e:
        print(f"[SYSTEM DEBUG] Critical Sync Error: {e}")
        return ["NVDA", "TSLA", "AAPL", "BTC-USD"]
	
@app.get("/terms")
async def serve_terms():
    return FileResponse("static/terms.html")


@app.post("/api/webhooks/revenuecat")
async def revenuecat_webhook(payload: dict):
    """
    SYNC PROTOCOL:
    Unifies App Store/Play Store entitlements with the local PostgreSQL database.
    """
    event = payload.get("event", {})
    app_user_id = event.get("app_user_id")

    if not app_user_id:
        return {"status": "ignored"}

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == app_user_id).first()
        if not user:
            user = User(user_id=app_user_id)
            db.add(user)

        # Update status based on RevenueCat event type
        if event.get("type") in ["INITIAL_PURCHASE", "RENEWAL"]:
            user.is_subscribed = "active"
        elif event.get("type") in ["EXPIRATION", "CANCELLATION"]:
            user.is_subscribed = "inactive"

        user.last_sync = datetime.datetime.now().isoformat()
        db.commit()
    finally:
        db.close()
    return {"status": "synced"}


@app.post("/api/analyze")
async def start_analysis(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    DEPLOYMENT GATEWAY:
    Assigns a task_id and persists the initial record with optional ownership.
    """
    task_id = str(uuid.uuid4())
    
    db = SessionLocal()
    try:
        new_task = TaskRecord(
            task_id=task_id,
            ticker=req.ticker.upper(),
            user_id=req.user_id, # LINKING: Associates task with the mobile account
            pm_decision="Analysis in progress...",
            supporting_report="",
            full_download_report=""
        )
        db.add(new_task)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"CRITICAL DB FAILURE: {e}")
        raise HTTPException(status_code=500, detail="Database initialization failed")
    finally:
        db.close()

    # Hydrate memory registry for live polling
    analysis_tasks[task_id] = {
        "status": "processing", 
        "logs": [], 
        "agent_statuses": {}, 
        "ticker": req.ticker
    }
    
    # Trigger autonomous swarm in background
    background_tasks.add_task(run_trading_analysis, task_id, req.ticker)
    return {"task_id": task_id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str, user_id: str = None):
    """
    INTELLIGENCE ACCESS HANDLER:
    Checks for authorized clearance via mobile subscription status.
    Web clearance remains handled separately via the /api/download handshake.
    """
    db = SessionLocal()
    record = db.query(TaskRecord).filter(TaskRecord.task_id == task_id).first()
    
    # AUTHORIZATION CHECK (Institutional App Flow)
    is_authorized = False
    if user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user and user.is_subscribed == "active":
            is_authorized = True
    
    db.close()
    local_data = analysis_tasks.get(task_id)

    if record:
        # DATA DELIVERY: Only provide full report if analysis is done
        if record.supporting_report:
            return {
                "status": "completed",
                "ticker": record.ticker,
                "pm_decision": record.pm_decision,
                "supporting_report": record.supporting_report,
                "authorized": is_authorized # Flutter uses this for UI unblurring
            }
        
        # TELEMETRY: Return live logs for the terminal UI
        return {
            "status": "processing",
            "ticker": record.ticker,
            "logs": local_data.get("logs", []) if local_data else [],
            "agent_statuses": local_data.get("agent_statuses", {}) if local_data else {"system": "Syncing"}
        }

    raise HTTPException(status_code=404, detail="Task context lost.")

import tempfile
import os
from fastapi import BackgroundTasks, HTTPException
from fastapi.responses import FileResponse


# ==========================================
# IV. THE "CLEARANCE & RESTORE" ENDPOINT
# ==========================================
@app.get("/api/download")
async def verify_clearance(session_id: str = Query(...)):
    # 1. Validate Session ID format
    if not session_id or session_id in ["{CHECKOUT_SESSION_ID}", "null", "undefined"]:
        print("DOWNLOAD ERROR: Invalid or placeholder session_id received.")
        raise HTTPException(status_code=400, detail="Invalid Session ID")
    
    try:
        # 2. Retrieve the session from Stripe
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except stripe.error.StripeError as e:
            print(f"STRIPE API ERROR: {e}")
            raise HTTPException(status_code=400, detail="Could not verify payment session with Stripe.")

        # 3. Check Payment Status
        if session.payment_status != "paid":
            print(f"PAYMENT NOT PAID: Status is {session.payment_status}")
            raise HTTPException(status_code=402, detail="Payment incomplete")
        
        # 4. Recover Task ID
        actual_task_id = session.client_reference_id
        if not actual_task_id:
            print(f"CRITICAL: client_reference_id is missing for session {session_id}")
            raise HTTPException(status_code=400, detail="Task ID missing from Stripe Session")

        print(f"VERIFYING CLEARANCE: Task {actual_task_id} for Session {session_id}")

        # 5. Database Lookup with fresh connection
        db = SessionLocal()
        try:
            record = db.query(TaskRecord).filter(TaskRecord.task_id == actual_task_id).first()
            
            if not record:
                print(f"DATABASE MISS: Task {actual_task_id} not found in DB.")
                raise HTTPException(status_code=404, detail="Analysis record not found in database.")

            # 6. Check Report Readiness
            has_report = record.supporting_report and len(record.supporting_report) > 50
            
            if has_report:
                print(f"CLEARANCE GRANTED: {record.ticker} report is ready.")
                return {
                    "status": "success",
                    "task_id": actual_task_id,
                    "ticker": record.ticker,
                    "message": "Clearance granted."
                }
            else:
                # This covers the 'ROLLBACK' or 'STILL ANALYZING' case
                print(f"PROCESSING: Task {actual_task_id} exists but report is empty.")
                return {
                    "status": "processing",
                    "task_id": actual_task_id,
                    "message": "Payment verified. Swarm is still finalizing the report..."
                }
        finally:
            db.close()

    except HTTPException:
        # Re-raise FastAPIs internal exceptions (402, 404, etc)
        raise
    except Exception as e:
        # Catch-all for unexpected logic/network errors
        print(f"DOWNLOAD CRITICAL FAILURE: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")

# ==========================================
# FLUTTER APP USER HISTORY
# ==========================================

@app.get("/api/history/{user_id}")
async def get_history(user_id: str):
    """
    FORENSIC RETRIEVAL:
    Returns the history of all intelligence reports associated with an App account.
    """
    db = SessionLocal()
    try:
        tasks = db.query(TaskRecord).filter(TaskRecord.user_id == user_id).all()
        return [
            {
                "task_id": t.task_id, 
                "ticker": t.ticker, 
                "date": datetime.datetime.now().strftime('%Y-%m-%d')
            } 
            for t in tasks
        ]
    finally:
        db.close()