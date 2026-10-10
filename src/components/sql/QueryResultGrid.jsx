import React from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaClock, FaTable } from 'react-icons/fa';

export default function QueryResultGrid({
  result = null,
  isExecuting = false,
  evaluationFeedback = null,
}) {
  if (isExecuting) {
    return (
      <div className="p-8 text-center border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/60">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mb-2" />
        <p className="text-xs text-slate-500 font-medium">Executing SQL query against sandbox database...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40">
        <FaTable className="size-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No Query Executed Yet</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Write your query and click <span className="font-semibold text-indigo-500">Run Query</span> to preview output records.
        </p>
      </div>
    );
  }

  // Syntax or Execution Error
  if (!result.success || result.error) {
    return (
      <div className="border border-red-200 dark:border-red-900/60 rounded-2xl bg-red-50/50 dark:bg-red-950/20 p-4 space-y-2">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
          <FaExclamationTriangle />
          <span>Execution / Syntax Error</span>
        </div>
        <pre className="p-3 bg-red-100/60 dark:bg-red-950/50 rounded-xl text-red-700 dark:text-red-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
          {result.error}
        </pre>
        <p className="text-[11px] text-red-500/80">
          Tip: Verify table names, column names, commas, and SQL dialect syntax.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 space-y-0">
      {/* Execution Stats Banner */}
      <div className="p-2.5 px-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
            <FaCheckCircle />
            Executed Successfully
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'} returned
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
            <FaClock className="text-[10px]" />
            {result.executionTimeMs}ms
          </span>
        </div>

        {evaluationFeedback && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              evaluationFeedback.passed
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            {evaluationFeedback.feedback}
          </span>
        )}
      </div>

      {/* Query Result Grid Table */}
      {result.rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 italic">
          Query returned an empty result set (0 rows).
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 z-10">
              <tr>
                <th className="py-2 px-3 text-slate-400 font-sans text-[10px] w-10">#</th>
                {(result.columns || []).map((col) => (
                  <th key={col} className="py-2 px-3 font-bold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {result.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition"
                >
                  <td className="py-2 px-3 text-slate-400 text-[10px] select-none font-sans">
                    {rIdx + 1}
                  </td>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="py-2 px-3 text-slate-800 dark:text-slate-200">
                      {cell === null || cell === undefined ? (
                        <span className="text-slate-400 italic font-sans text-[11px]">NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
