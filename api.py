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

from sqlalchemy import Column, String, Text, create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv() 


from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

# Set this to "PROD" in your environment variables when deploying
ENV = os.getenv("ENV", "DEV")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# The database setup logic stays mostly the same
DATABASE_URL = "sqlite:///./stockbrain.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
class TaskRecord(Base):
    __tablename__ = "tasks"
    task_id = Column(String, primary_key=True, index=True)
    ticker = Column(String)
    pm_decision = Column(Text)
    supporting_report = Column(Text)
    full_download_report = Column(Text)

# This is where the "create_all" logic actually lives
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
    and ensures forensic-grade persistence in SQLite.
    """
    try:
        # 1. Swarm Initialization
        # 1. IMMEDIATE MEMORY HYDRATION: Store the ticker right away
        analysis_tasks[task_id]["ticker"] = ticker
        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = "google" 
        config["output_language"] = "English" 
        
        ta = TradingAgentsGraph(["market", "social", "news", "fundamentals"], debug=True, config=config)
        
        # Initialize Memory State
        analysis_tasks[task_id]["logs"] = []
        analysis_tasks[task_id]["agent_statuses"] = {
            "st-market": "Pending", "st-bull": "Pending", "st-bear": "Pending",
            "st-rmanager": "Pending", "st-trader": "Pending", "st-risk1": "Pending",
            "st-risk2": "Pending", "st-risk3": "Pending", "st-pmanager": "Pending"
        }
        analysis_tasks[task_id]["pm_decision"] = "" 

        def add_log(msg_type, content):
            t = datetime.datetime.now().strftime("%H:%M:%S")
            text = str(content) 
            analysis_tasks[task_id]["logs"].append({
                "time": t, 
                "type": msg_type, 
                "content": text
            })

        add_log("System", f"Initialized LangGraph framework for {ticker}")
        
        # Set dynamic time context for forensic auditability
        init_state = ta.propagator.create_initial_state(ticker, "2026-05-08")
        args = ta.propagator.get_graph_args()
        
        analysis_tasks[task_id]["agent_statuses"]["st-market"] = "In Progress"

        # 2. Live Graph Streaming
        trace = []
        for chunk in ta.graph.stream(init_state, **args):
            # Process internal messages for the Audit Trail
            for message in chunk.get("messages", []):
                msg_class = type(message).__name__
                content = getattr(message, 'content', '')
                if msg_class == "HumanMessage":
                    add_log("Control" if content == "Continue" else "User", content)
                elif msg_class == "ToolMessage":
                    add_log("Data", "Tool returned requested market data.")
                elif msg_class == "AIMessage" and content:
                    add_log("Agent", content)

            # Map Graph state to UI Status Badges
            status_map = analysis_tasks[task_id]["agent_statuses"]
            
            # Phase: Market Research
            if chunk.get("market_report") or chunk.get("fundamentals_report"):
                status_map["st-market"] = "Completed"
                status_map["st-bull"] = "In Progress"
                status_map["st-bear"] = "In Progress"
            
            # Phase: Investment Debate
            if chunk.get("investment_debate_state"):
                debate = chunk["investment_debate_state"]
                if debate.get("judge_decision"):
                    status_map["st-bull"] = "Completed"
                    status_map["st-bear"] = "Completed"
                    status_map["st-rmanager"] = "Completed"
                    status_map["st-trader"] = "In Progress"
                else:
                    status_map["st-rmanager"] = "In Progress"

            # Phase: Tactical Execution Plan
            if chunk.get("trader_investment_plan"):
                status_map["st-trader"] = "Completed"
                status_map["st-risk1"] = "In Progress"
                status_map["st-risk2"] = "In Progress"
                status_map["st-risk3"] = "In Progress"

            # Phase: Risk Management & PM Finalization
            if chunk.get("risk_debate_state"):
                risk = chunk["risk_debate_state"]
                if risk.get("judge_decision"):
                    status_map["st-risk1"] = "Completed"
                    status_map["st-risk2"] = "Completed"
                    status_map["st-risk3"] = "Completed"
                    status_map["st-pmanager"] = "Completed"
                    analysis_tasks[task_id]["pm_decision"] = risk["judge_decision"]
                else:
                    status_map["st-pmanager"] = "In Progress"

            trace.append(chunk)

        # 3. Finalization & Forensic Persistence
        if not trace:
            raise ValueError("Graph execution returned empty trace.")

        final_state = trace[-1]
        
        # Hydrate Memory for immediate UI response
        analysis_tasks[task_id]["supporting_report"] = build_supporting_markdown_report(final_state)
        analysis_tasks[task_id]["full_download_report"] = build_complete_downloadable_report(final_state, ticker)
        
        # Global Status Lock
        for k in analysis_tasks[task_id]["agent_statuses"]:
            analysis_tasks[task_id]["agent_statuses"][k] = "Completed"
        
        analysis_tasks[task_id]["status"] = "completed"
        add_log("System", "Intelligence Briefing Finalized. Awaiting Clearance.")

        # Atomic Commit to SQLite (WAL Mode handles the lock)
        db = SessionLocal()
        try:
            new_task = TaskRecord(
                task_id=task_id,
                ticker=ticker,
                pm_decision=analysis_tasks[task_id].get("pm_decision", "Decision Pending"),
                supporting_report=analysis_tasks[task_id]["supporting_report"],
                full_download_report=analysis_tasks[task_id]["full_download_report"]
            )
            db.merge(new_task) 
            db.commit()
        except Exception as db_err:
            print(f"DATABASE PERSISTENCE FAILURE: {db_err}")
            db.rollback()
        finally:
            db.close()

    except Exception as e:
        print(f"SYSTEM CRITICAL FAILURE: {e}")
        if task_id in analysis_tasks:
            analysis_tasks[task_id]["status"] = "failed"
            analysis_tasks[task_id]["error"] = str(e)


# --- API ROUTES ---

# FIX: Removed response_class=HTMLResponse
@app.get("/")
async def serve_search_page():
    # Serve the external HTML file
    return FileResponse("static/index.html")
	
@app.get("/terms")
async def serve_terms():
    return FileResponse("static/terms.html")

@app.post("/api/analyze")
async def start_analysis(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    analysis_tasks[task_id] = {"status": "processing", "logs": [], "agent_statuses": {}}
    background_tasks.add_task(run_trading_analysis, task_id, req.ticker)
    return {"task_id": task_id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    # 1. Check Active Memory (RAM)
    if task_id in analysis_tasks:
        task_data = analysis_tasks[task_id]
        resp = {
            "status": task_data["status"],
            "logs": task_data.get("logs", []),
            "agent_statuses": task_data.get("agent_statuses", {})
        }
        if task_data["status"] == "completed":
            resp["pm_decision"] = task_data.get("pm_decision", "")
            resp["supporting_report"] = task_data.get("supporting_report", "")
            # FIX: Return the actual ticker from memory if available
            resp["ticker"] = task_data.get("ticker", "ANALYSIS")
        return resp

    # 2. FALLBACK: Pull from SQLite Forensic Database 
    db = SessionLocal()
    # Check by Task ID
    record = db.query(TaskRecord).filter(TaskRecord.task_id == task_id).first()
    
    # Check by Ticker as secondary fallback (Fixes the /SCHD 404 error)
    if not record:
        record = db.query(TaskRecord).filter(TaskRecord.ticker == task_id).order_by(TaskRecord.task_id.desc()).first()
    db.close()

    if record:
        return {
            "status": "completed",
            "ticker": record.ticker, # POPULATES UI WITH 'SCHD', 'AAPL', etc.
            "pm_decision": record.pm_decision,
            "supporting_report": record.supporting_report,
            "agent_statuses": {
                "st-market": "Completed", "st-bull": "Completed", 
                "st-rmanager": "Completed", "st-trader": "Completed", 
                "st-risk1": "Completed", "st-pmanager": "Completed"
            }
        }

    raise HTTPException(status_code=404, detail="Analysis record not found.")

import tempfile
import os
from fastapi import BackgroundTasks, HTTPException
from fastapi.responses import FileResponse


# ==========================================
# IV. THE "CLEARANCE & RESTORE" ENDPOINT
# ==========================================
@app.get("/api/download")
async def verify_clearance(session_id: str = Query(...), task_id: str = None):
    """
    Acts as the Forensic Recovery Node.
    Ensures that when Stripe redirects back, the frontend can recover 
    the full analysis even if the browser state was wiped.
    """
    if not session_id:
        raise HTTPException(status_code=402, detail="Payment session required")
    
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status != "paid":
            raise HTTPException(status_code=402, detail="Payment not confirmed")
        
        # Identity Recovery logic
        actual_task_id = session.client_reference_id or session.metadata.get("task_id") or task_id
        
        if not actual_task_id or actual_task_id == "{client_reference_id}":
            raise HTTPException(status_code=400, detail="Intelligence ID missing")

        # Database Check
        db = SessionLocal()
        record = db.query(TaskRecord).filter(TaskRecord.task_id == actual_task_id).first()
        db.close()

        if record or (actual_task_id in analysis_tasks and analysis_tasks[actual_task_id]["status"] == "completed"):
            return {
                "status": "success",
                "task_id": actual_task_id,
                "message": "Clearance granted. State recovered."
            }
        else:
            raise HTTPException(status_code=404, detail="Analysis record not found in persistence.")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")