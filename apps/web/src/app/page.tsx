"use client";

import { useState } from "react";

export default function Dashboard() {
  const [strategy, setStrategy] = useState("zero_shot");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const startRun = async () => {
    setIsRunning(true);
    setProgress([]);
    setSummary(null);

    try {
      const response = await fetch("http://localhost:8787/api/v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, model: "claude-haiku-4-5-20251001", force: true }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.replace("data: ", ""));
            
            if (data.caseId) {
              setProgress((prev) => [`[${data.caseId}] ${data.status}`, ...prev]);
            }
            if (data.summary) {
              setSummary(data.summary);
              setIsRunning(false);
            }
          }
        }
      }
    } catch (error) {
      console.error("Run failed:", error);
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HEALOSBENCH</h1>
            <p className="text-gray-500 text-sm mt-1">Eval Harness for Structured Clinical Extraction</p>
          </div>
          
          <div className="flex gap-4">
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white"
              disabled={isRunning}
            >
              <option value="zero_shot">Zero Shot</option>
              <option value="few_shot">Few Shot</option>
              <option value="cot">Chain of Thought</option>
            </select>
            
            <button 
              onClick={startRun}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isRunning ? "Running Eval..." : "Start Run"}
            </button>
          </div>
        </div>

        {/* Results Summary */}
        {summary && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Total Cases</div>
              <div className="text-2xl font-semibold">{summary.total}</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-green-700">Successes</div>
              <div className="text-2xl font-semibold text-green-800">{summary.successes}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-red-700">Schema Failures</div>
              <div className="text-2xl font-semibold text-red-800">{summary.failures}</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-blue-700">Est. Cost</div>
              <div className="text-2xl font-semibold text-blue-800">${summary.totalCost.toFixed(4)}</div>
            </div>
          </div>
        )}
        {progress.length > 0 && (
          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 overflow-hidden">
            <div className="px-4 py-2 bg-gray-800 text-gray-400 text-xs font-mono uppercase tracking-wider border-b border-gray-700">
              Live Execution Trace
            </div>
            <div className="p-4 h-64 overflow-y-auto font-mono text-sm text-gray-300 space-y-1">
              {progress.map((log, i) => (
                <div key={i} className={log.includes("FAILED") ? "text-red-400" : "text-green-400"}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}