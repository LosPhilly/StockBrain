from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse # Removed HTMLResponse, added FileResponse
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
import uuid
import datetime
from dotenv import load_dotenv

load_dotenv() 

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

app = FastAPI(title="StockBrain Engine")

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

def run_trading_analysis(task_id: str, ticker: str):
    try:
        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = "google" 
        config["output_language"] = "English" 
        
        ta = TradingAgentsGraph(["market", "social", "news", "fundamentals"], debug=True, config=config)
        
        analysis_tasks[task_id]["logs"] = []
        analysis_tasks[task_id]["agent_statuses"] = {
            "st-market": "Pending", "st-bull": "Pending", "st-bear": "Pending",
            "st-rmanager": "Pending", "st-trader": "Pending", "st-risk1": "Pending",
            "st-risk2": "Pending", "st-risk3": "Pending", "st-pmanager": "Pending"
        }
        analysis_tasks[task_id]["pm_decision"] = "" 

        def add_log(msg_type, content):
            t = datetime.datetime.now().strftime("%H:%M:%S")
            text = str(content).replace('\n', ' ')
            if len(text) > 130: text = text[:127] + "..."
            analysis_tasks[task_id]["logs"].append({"time": t, "type": msg_type, "content": text})

        add_log("System", f"Initialized LangGraph framework for {ticker}")
        
        init_state = ta.propagator.create_initial_state(ticker, "2026-05-06")
        args = ta.propagator.get_graph_args()
        
        analysis_tasks[task_id]["agent_statuses"]["st-market"] = "In Progress"

        trace = []
        for chunk in ta.graph.stream(init_state, **args):
            for message in chunk.get("messages", []):
                msg_class = type(message).__name__
                content = getattr(message, 'content', '')
                
                if msg_class == "HumanMessage":
                    add_log("Control" if content == "Continue" else "User", content)
                elif msg_class == "ToolMessage":
                    add_log("Data", "Tool returned requested market data.")
                elif msg_class == "AIMessage" and content:
                    add_log("Agent", content)

                if hasattr(message, "tool_calls") and message.tool_calls:
                    for tc in message.tool_calls:
                        name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
                        add_log("Tool", f"Executing: {name}")

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
                status_map["st-risk1"] = "In Progress"
                status_map["st-risk2"] = "In Progress"
                status_map["st-risk3"] = "In Progress"

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

        final_state = trace[-1]
        for k in analysis_tasks[task_id]["agent_statuses"]:
            analysis_tasks[task_id]["agent_statuses"][k] = "Completed"
            
        add_log("System", "Analysis Finalized. Rendering read-only report.")
        
        analysis_tasks[task_id]["supporting_report"] = build_supporting_markdown_report(final_state)
        analysis_tasks[task_id]["full_download_report"] = build_complete_downloadable_report(final_state, ticker)
        analysis_tasks[task_id]["status"] = "completed"

    except Exception as e:
        analysis_tasks[task_id]["status"] = "failed"
        analysis_tasks[task_id]["error"] = str(e)


# --- API ROUTES ---

# FIX: Removed response_class=HTMLResponse
@app.get("/")
async def serve_search_page():
    # Serve the external HTML file
    return FileResponse("static/index.html")

@app.post("/api/analyze")
async def start_analysis(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    analysis_tasks[task_id] = {"status": "processing", "logs": [], "agent_statuses": {}}
    background_tasks.add_task(run_trading_analysis, task_id, req.ticker)
    return {"task_id": task_id}

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in analysis_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    resp = {
        "status": analysis_tasks[task_id]["status"],
        "logs": analysis_tasks[task_id].get("logs", []),
        "agent_statuses": analysis_tasks[task_id].get("agent_statuses", {})
    }
    
    if analysis_tasks[task_id]["status"] == "completed":
        resp["pm_decision"] = analysis_tasks[task_id].get("pm_decision", "No decision rendered.")
        resp["supporting_report"] = analysis_tasks[task_id].get("supporting_report", "")
        
    return resp

@app.get("/api/download/{task_id}")
async def download_report(task_id: str):
    if task_id not in analysis_tasks or analysis_tasks[task_id]["status"] != "completed":
        raise HTTPException(status_code=400, detail="Report not ready or not found")
    
    markdown_content = analysis_tasks[task_id]["full_download_report"]
    return PlainTextResponse(
        content=markdown_content, 
        media_type="text/markdown", 
        headers={"Content-Disposition": f"attachment; filename=StockBrain_Analysis_{task_id[:8]}.md"}
    )