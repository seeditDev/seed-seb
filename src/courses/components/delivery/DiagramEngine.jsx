import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';

/**
 * INDEX 0 Compatible Diagram Engine for SEED-SEB
 * 
 * Provides native SVG diagram renderers for:
 * - architecture: Interactive distributed systems nodes & edges with traveling pulse particles
 * - pipeline: Step-by-step pipeline flows with cubic Bezier curves
 * - graph: Directed acyclic graphs (DAGs)
 * - sequence: Vertical execution sequences
 * - cycle: Circular algorithm cycles
 * - stack: Layered system/memory stacks with animated indicator
 * - compare: Side-by-side trade-off comparisons
 * - plot: Coordinate data charts with series
 * - component_legend: Grid of system architecture components
 * - mermaid: SVG state machines, flowcharts & sequence diagrams
 */

// Node theme specifications
const COMPONENT_THEMES = {
  client: {
    border: 'border-slate-500/50',
    bg: 'bg-slate-800/40',
    text: 'text-slate-300',
    tag: 'CLIENT'
  },
  load_balancer: {
    border: 'border-purple-400/60',
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    tag: 'LB'
  },
  server: {
    border: 'border-blue-400/60',
    bg: 'bg-blue-950/40',
    text: 'text-blue-300',
    tag: 'SERVER'
  },
  database: {
    border: 'border-emerald-400/60',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    tag: 'DB'
  },
  cache: {
    border: 'border-amber-400/60',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    tag: 'CACHE'
  },
  queue: {
    border: 'border-pink-400/60',
    bg: 'bg-pink-950/40',
    text: 'text-pink-300',
    tag: 'QUEUE'
  },
  cdn: {
    border: 'border-cyan-400/60',
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-300',
    tag: 'CDN'
  },
  storage: {
    border: 'border-teal-400/60',
    bg: 'bg-teal-950/40',
    text: 'text-teal-300',
    tag: 'STORAGE'
  },
  search_index: {
    border: 'border-indigo-400/60',
    bg: 'bg-indigo-950/40',
    text: 'text-indigo-300',
    tag: 'INDEX'
  },
  worker: {
    border: 'border-yellow-400/60',
    bg: 'bg-yellow-950/40',
    text: 'text-yellow-300',
    tag: 'WORKER'
  },
  api_gateway: {
    border: 'border-violet-400/60',
    bg: 'bg-violet-950/40',
    text: 'text-violet-300',
    tag: 'GATEWAY'
  }
};

// Pulse Particle traveling on SVG path
export const SignalParticle = ({ path, delay = 0, dur = 1.8, color = '#10b981' }) => {
  return (
    <circle
      r={3.5}
      fill={color}
      style={{
        offsetPath: `path("${path}")`,
        animation: `seed-signal-travel ${dur}s linear infinite`,
        animationDelay: `${delay}s`,
        filter: `drop-shadow(0 0 4px ${color})`
      }}
    />
  );
};

// Marker definition for arrows
const ArrowMarker = () => (
  <defs>
    <marker
      id="sd-arrow"
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
    </marker>
  </defs>
);

// Edge Label
const EdgeLabel = ({ x, y, text }) => {
  if (!text) return null;
  const w = Math.min(130, Math.max(50, text.length * 7 + 16));
  return (
    <foreignObject x={x - w / 2} y={y - 11} width={w} height={22}>
      <div className="flex h-full items-center justify-center rounded-full border border-gray-700 bg-[#0b0f19]/90 px-2 text-[10px] font-mono font-medium text-gray-300 shadow">
        <span className="truncate">{text}</span>
      </div>
    </foreignObject>
  );
};

/**
 * 1. Architecture Diagram
 */
export const ArchitectureDiagram = ({ nodes = [], edges = [] }) => {
  if (!nodes || nodes.length === 0) return null;

  const cols = Array.from(new Set(nodes.map(n => n.x))).sort((a, b) => a - b);
  const rows = Array.from(new Set(nodes.map(n => n.y))).sort((a, b) => a - b);
  const colMap = new Map(cols.map((val, idx) => [val, idx]));
  const rowMap = new Map(rows.map((val, idx) => [val, idx]));

  const maxCol = Math.max(0, cols.length - 1);
  const maxRow = Math.max(0, rows.length - 1);
  const width = 224 * maxCol + 156 + 72;
  const height = 148 * maxRow + 82 + 72;

  const nodePos = new Map(
    nodes.map(n => [
      n.id,
      {
        x: 36 + (colMap.get(n.x) ?? 0) * 224,
        y: 36 + (rowMap.get(n.y) ?? 0) * 148
      }
    ])
  );

  const routeOffsets = [0, 18, -18, 36, -36];

  return (
    <div className="w-full overflow-x-auto flex justify-center py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full"
        style={{ width: `${Math.min(width, 920)}px`, minWidth: `${Math.min(width, 360)}px` }}
      >
        <ArrowMarker />
        {edges.map((e, idx) => {
          const from = nodePos.get(e.from);
          const to = nodePos.get(e.to);
          if (!from || !to) return null;

          const fromCenterX = from.x + 78;
          const fromCenterY = from.y + 41;
          const toCenterX = to.x + 78;
          const toCenterY = to.y + 41;
          const dx = toCenterX - fromCenterX;
          const dy = toCenterY - fromCenterY;
          const isHorizontal = Math.abs(dx) >= Math.abs(dy);

          let pathD = '';
          let labelX = (fromCenterX + toCenterX) / 2;
          let labelY = (fromCenterY + toCenterY) / 2;
          const offset = routeOffsets[idx % routeOffsets.length];

          if (from.y === to.y) {
            const startX = dx > 0 ? from.x + 156 : from.x;
            const endX = dx > 0 ? to.x : to.x + 156;
            pathD = `M ${startX} ${fromCenterY} L ${endX} ${fromCenterY}`;
            labelX = (startX + endX) / 2;
            labelY = fromCenterY;
          } else if (from.x === to.x) {
            const startY = dy > 0 ? from.y + 82 : from.y;
            const endY = dy > 0 ? to.y : to.y + 82;
            pathD = `M ${fromCenterX} ${startY} L ${fromCenterX} ${endY}`;
            labelX = fromCenterX;
            labelY = (startY + endY) / 2;
          } else if (isHorizontal) {
            const startX = dx > 0 ? from.x + 156 : from.x;
            const endX = dx > 0 ? to.x : to.x + 156;
            const midX = (startX + endX) / 2 + offset;
            pathD = `M ${startX} ${fromCenterY} L ${midX} ${fromCenterY} L ${midX} ${toCenterY} L ${endX} ${toCenterY}`;
            labelX = midX;
            labelY = (fromCenterY + toCenterY) / 2;
          } else {
            const startY = dy > 0 ? from.y + 82 : from.y;
            const endY = dy > 0 ? to.y : to.y + 82;
            const midY = (startY + endY) / 2 + offset;
            pathD = `M ${fromCenterX} ${startY} L ${fromCenterX} ${midY} L ${toCenterX} ${midY} L ${toCenterX} ${endY}`;
            labelX = (fromCenterX + toCenterX) / 2;
            labelY = midY;
          }

          const isAsync = e.style === 'async';
          const particleColor = isAsync ? '#f97316' : '#10b981';

          return (
            <g key={idx}>
              <path
                d={pathD}
                fill="none"
                stroke={isAsync ? '#94a3b8' : '#64748b'}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={isAsync ? '5 4' : undefined}
                markerEnd="url(#sd-arrow)"
              />
              <SignalParticle
                path={pathD}
                delay={(idx % 5) * 0.3}
                dur={1.8 + (idx % 3) * 0.4}
                color={particleColor}
              />
              {e.label && <EdgeLabel x={labelX} y={labelY} text={e.label} />}
            </g>
          );
        })}

        {nodes.map(n => {
          const pos = nodePos.get(n.id);
          if (!pos) return null;
          const theme = COMPONENT_THEMES[n.kind] || COMPONENT_THEMES.server;

          return (
            <foreignObject key={n.id} x={pos.x} y={pos.y} width={156} height={82}>
              <div
                className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 text-center shadow-md transition-transform hover:scale-105 ${theme.border} ${theme.bg}`}
              >
                <span className={`text-[10px] font-black tracking-wider ${theme.text}`}>
                  {theme.tag}
                </span>
                <span className="line-clamp-2 leading-tight font-semibold text-xs text-slate-100 break-words">
                  {n.label}
                </span>
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * 2. Pipeline Diagram
 */
export const PipelineDiagram = ({ nodes = [] }) => {
  if (!nodes || nodes.length === 0) return null;

  const nodeWidth = 184;
  const gap = 60;
  const totalW = nodeWidth * nodes.length + gap * (nodes.length - 1) + 20;
  const startOffsets = nodes.map((_, i) => 10 + (nodeWidth + gap) * i);

  return (
    <div className="w-full overflow-x-auto flex justify-center py-4">
      <svg
        viewBox={`0 0 ${totalW} 132`}
        className="max-w-full"
        style={{ width: `${Math.min(totalW, 940)}px` }}
      >
        <ArrowMarker />
        {startOffsets.slice(0, -1).map((startX, idx) => {
          const fromX = startX + nodeWidth;
          const toX = startOffsets[idx + 1];
          const midY = 64;
          const pathD = `M ${fromX} ${midY} C ${fromX + 30} ${midY - 16}, ${toX - 30} ${midY + 16}, ${toX} ${midY}`;

          return (
            <g key={idx}>
              <path
                d={pathD}
                fill="none"
                stroke="#64748b"
                strokeWidth={2}
                markerEnd="url(#sd-arrow)"
              />
              <SignalParticle path={pathD} delay={0.3 * idx} color="#3b82f6" />
            </g>
          );
        })}

        {nodes.map((node, idx) => (
          <foreignObject
            key={idx}
            x={startOffsets[idx]}
            y={12}
            width={nodeWidth}
            height={108}
          >
            <div className="flex h-full flex-col justify-between rounded-xl border border-blue-500/30 bg-[#1e293b]/70 p-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-700/50 pb-1">
                <span className="text-[10px] font-bold text-emerald-400">STEP {idx + 1}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <div className="my-1">
                <span className="line-clamp-2 text-xs font-semibold text-slate-100">
                  {node.label}
                </span>
              </div>
              {node.note && (
                <span className="line-clamp-2 text-[10px] leading-tight text-slate-400">
                  {node.note}
                </span>
              )}
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
};

/**
 * 3. Stack Diagram
 */
export const StackDiagram = ({ layers = [] }) => {
  if (!layers || layers.length === 0) return null;

  return (
    <div className="my-4 flex items-center justify-center p-4">
      <div className="flex w-full max-w-md items-stretch gap-3">
        <div className="relative w-4 rounded-full bg-slate-800">
          <span
            className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]"
            style={{ animation: 'seed-stack-dot 2.2s linear infinite' }}
          />
        </div>
        <div className="flex flex-1 flex-col-reverse gap-2">
          {layers.map((layer, idx) => (
            <div
              key={idx}
              className="rounded-lg border-2 border-blue-500/30 px-4 py-3 text-center text-xs font-semibold text-slate-100 shadow transition-all hover:border-blue-400"
              style={{
                backgroundColor: `rgba(30, 58, 138, ${0.15 + idx * 0.1})`
              }}
            >
              {layer}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 4. Sequence Diagram
 */
export const SequenceDiagram = ({ items = [] }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="my-4 flex flex-col gap-3 p-4">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 rounded-lg border border-gray-800 bg-[#1e293b]/50 p-3 shadow"
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-xs font-bold text-blue-400">
            {idx + 1}
          </div>
          <div className="text-xs text-slate-200 leading-relaxed">
            {item}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 5. Compare Diagram
 */
export const CompareDiagram = ({ leftLabel, leftPoints = [], rightLabel, rightPoints = [] }) => {
  return (
    <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-lg">
        <h4 className="border-b border-emerald-500/30 pb-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
          {leftLabel}
        </h4>
        <ul className="mt-3 space-y-2">
          {leftPoints.map((pt, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-slate-200">
              <span className="text-emerald-400">✓</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-lg">
        <h4 className="border-b border-amber-500/30 pb-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          {rightLabel}
        </h4>
        <ul className="mt-3 space-y-2">
          {rightPoints.map((pt, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-slate-200">
              <span className="text-amber-400">⚡</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/**
 * 6. Component Legend
 */
export const ComponentLegend = ({ components = [] }) => {
  if (!components || components.length === 0) return null;

  return (
    <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {components.map((comp, idx) => {
        const theme = COMPONENT_THEMES[comp.kind] || COMPONENT_THEMES.server;
        return (
          <div
            key={idx}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 shadow ${theme.border} ${theme.bg}`}
          >
            <span className={`text-xs font-black tracking-wider ${theme.text}`}>
              {theme.tag}
            </span>
            <span className="text-center text-xs font-semibold text-slate-200">
              {comp.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

let isMermaidInitialized = false;
let mermaidRenderQueue = Promise.resolve();

function initMermaidOnce() {
  if (isMermaidInitialized) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'dark',
      themeVariables: {
        background: '#0f172a',
        primaryColor: '#1e293b',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#3b82f6',
        lineColor: '#60a5fa',
        secondaryColor: '#334155',
        tertiaryColor: '#1e293b',
        textColor: '#f8fafc',
        mainBkg: '#1e293b',
        nodeBorder: '#3b82f6',
        clusterBkg: '#0b0f19',
        clusterBorder: '#334155',
        edgeLabelBackground: '#0b0f19',
        actorBkg: '#1e293b',
        actorBorder: '#3b82f6',
        actorTextColor: '#f8fafc',
        signalColor: '#60a5fa',
        signalTextColor: '#f8fafc'
      }
    });
    isMermaidInitialized = true;
  } catch (e) {
    console.warn('Mermaid init error:', e);
  }
}

/**
 * 7. Clean Serialized Mermaid Diagram
 * Mounts directly into a DOM ref, avoids strict mode unmount collision and null.firstChild bugs
 */
export const MermaidDiagram = ({ code }) => {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!code || !code.trim() || !containerRef.current) return;

    initMermaidOnce();

    const elementId = `mmd-${Math.random().toString(36).substring(2, 9)}`;
    const cleanCode = code.trim();

    // Sequence mermaid render through a promise queue to prevent concurrency collisions
    mermaidRenderQueue = mermaidRenderQueue.then(async () => {
      if (cancelled || !containerRef.current) return;
      try {
        const { svg } = await mermaid.render(elementId, cleanCode);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Mermaid rendering notice:', err?.message || err);
          setError(err instanceof Error ? err.message : 'Diagram unavailable');
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0f172a] my-6 shadow-xl">
      <div className="border-b border-gray-800/80 bg-[#1e293b]/60 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <span className="font-semibold text-emerald-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          ALGORITHM EXECUTION STATE MACHINE
        </span>
        <span className="text-blue-400 text-[11px]">SVG FLOWCHART</span>
      </div>
      <div className="overflow-x-auto p-5 flex justify-center">
        {error ? (
          <div className="w-full">
            <p className="text-xs text-amber-400 font-mono mb-2">Notice: Displaying structured state specifications</p>
            <pre className="text-xs font-mono text-gray-300 bg-[#0b0f19] p-3 rounded-lg border border-gray-800 overflow-x-auto leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="mermaid-render-target mx-auto w-full flex justify-center [&_svg]:mx-auto"
          />
        )}
      </div>
    </div>
  );
};

/**
 * Master Diagram Card Container
 */
export const DiagramCard = ({ title, children }) => {
  return (
    <div className="my-6 rounded-2xl border border-gray-800 bg-[#0f172a] p-4 shadow-xl">
      {title && (
        <div className="mb-4 flex items-center justify-between border-b border-gray-800/80 pb-2">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
            {title}
          </h4>
          <span className="text-[10px] font-mono text-blue-400">INTERACTIVE DIAGRAM</span>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * DiagramViewer:
 * Automatically selects the appropriate visual renderer based on diagram type
 */
const DiagramViewer = ({ diagram }) => {
  if (!diagram) return null;

  return (
    <DiagramCard title={diagram.title}>
      {diagram.type === 'pipeline' && <PipelineDiagram nodes={diagram.nodes} />}
      {diagram.type === 'architecture' && (
        <ArchitectureDiagram nodes={diagram.nodes} edges={diagram.edges} />
      )}
      {diagram.type === 'stack' && <StackDiagram layers={diagram.layers} />}
      {diagram.type === 'sequence' && <SequenceDiagram items={diagram.items} />}
      {diagram.type === 'compare' && (
        <CompareDiagram
          leftLabel={diagram.left_label}
          leftPoints={diagram.left_points}
          rightLabel={diagram.right_label}
          rightPoints={diagram.right_points}
        />
      )}
      {diagram.type === 'component_legend' && (
        <ComponentLegend components={diagram.components} />
      )}
      {diagram.type === 'mermaid' && <MermaidDiagram code={diagram.code} />}
    </DiagramCard>
  );
};

export default DiagramViewer;
