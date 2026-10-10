import React, { useState } from 'react';
import {
  FaDatabase,
  FaTable,
  FaKey,
  FaChevronDown,
  FaChevronRight,
  FaEye,
  FaTimes,
} from 'react-icons/fa';

export default function SchemaExplorer({ tables = [] }) {
  const [expandedTables, setExpandedTables] = useState(() => {
    // Expand the first table by default
    const init = {};
    if (tables.length > 0) init[tables[0].tableName] = true;
    return init;
  });

  const [inspectTable, setInspectTable] = useState(null);

  const toggleTable = (tableName) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="p-3 text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-900 rounded-lg">
        No database tables defined for this assessment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <FaDatabase className="text-indigo-500" />
          Database Schema ({tables.length} {tables.length === 1 ? 'Table' : 'Tables'})
        </h4>
      </div>

      <div className="space-y-2">
        {tables.map((tbl) => {
          const isExpanded = Boolean(expandedTables[tbl.tableName]);
          return (
            <div
              key={tbl.tableName}
              className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/60 transition"
            >
              {/* Table header bar */}
              <div
                onClick={() => toggleTable(tbl.tableName)}
                className="p-2.5 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-800 cursor-pointer select-none transition"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <FaChevronDown className="text-slate-400 text-xs" />
                  ) : (
                    <FaChevronRight className="text-slate-400 text-xs" />
                  )}
                  <FaTable className="text-indigo-500 text-xs" />
                  <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                    {tbl.tableName}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({(tbl.columns || []).length} cols • {(tbl.sampleData || []).length} rows)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectTable(tbl);
                  }}
                  title="Preview sample table data"
                  className="px-2 py-0.5 rounded text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1 transition"
                >
                  <FaEye className="text-[10px]" />
                  Preview
                </button>
              </div>

              {/* Collapsible columns list */}
              {isExpanded && (
                <div className="p-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  {tbl.description && (
                    <p className="text-[11px] text-slate-400 italic mb-2">
                      {tbl.description}
                    </p>
                  )}
                  <div className="space-y-1 font-mono text-xs">
                    {(tbl.columns || []).map((col) => (
                      <div
                        key={col.name}
                        className="flex items-center justify-between p-1 px-1.5 rounded bg-slate-50/50 dark:bg-slate-800/30 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {col.isPrimaryKey && (
                            <FaKey className="text-amber-500 text-[10px]" title="Primary Key" />
                          )}
                          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                            {col.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans uppercase">
                          {col.type || 'TEXT'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sample Data Preview Modal */}
      {inspectTable && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FaTable className="text-indigo-500 text-sm" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                  Sample Data: {inspectTable.tableName}
                </h3>
                <span className="text-xs text-slate-400">
                  ({(inspectTable.sampleData || []).length} records)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectTable(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1">
              {!inspectTable.sampleData || inspectTable.sampleData.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No sample records populated in this table.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <tr>
                        {(inspectTable.columns || []).map((c) => (
                          <th key={c.name} className="p-2.5 font-bold">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {inspectTable.sampleData.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                        >
                          {(inspectTable.columns || []).map((c) => (
                            <td key={c.name} className="p-2.5 text-slate-700 dark:text-slate-300">
                              {row[c.name] === null || row[c.name] === undefined ? (
                                <span className="text-slate-400 italic">NULL</span>
                              ) : (
                                String(row[c.name])
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

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectTable(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
