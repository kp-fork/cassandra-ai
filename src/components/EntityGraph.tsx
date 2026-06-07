"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphData } from "@/lib/graph-queries";

interface Props {
  data: GraphData;
}

export default function EntityGraph({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            "font-size": "10px",
            "font-family": "Inter, sans-serif",
            color: "#e4e4f0",
            "text-outline-color": "#0a0a0f",
            "text-outline-width": 2,
            "border-width": 2,
            width: 40,
            height: 40,
          },
        },
        {
          selector: 'node[type="corp"]',
          style: {
            "background-color": "#6c5ce7",
            "border-color": "#a29bfe",
            shape: "rectangle",
            width: 55,
            height: 30,
          },
        },
        {
          selector: 'node[type="person"]',
          style: {
            "background-color": "#00b894",
            "border-color": "#55efc4",
            shape: "ellipse",
          },
        },
        {
          selector: 'node[type="fund"]',
          style: {
            "background-color": "#f39c12",
            "border-color": "#fdcb6e",
            shape: "diamond",
            width: 35,
            height: 35,
          },
        },
        {
          selector: 'node[flags]',
          style: {
            "border-width": 3,
            "border-color": "#e74c3c",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#444466",
            "target-arrow-color": "#444466",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "8px",
            "font-family": "Inter, sans-serif",
            color: "#8888a0",
            "text-outline-color": "#0a0a0f",
            "text-outline-width": 1.5,
          },
        },
        {
          selector: 'edge[type="fund_person"]',
          style: {
            "line-style": "dashed",
            "line-color": "#f39c12",
            "target-arrow-color": "#f39c12",
          },
        },
        {
          selector: 'edge[type="filing_flow"]',
          style: {
            "line-style": "dashed",
            width: 2,
            "line-color": "#e74c3c",
            "target-arrow-color": "#e74c3c",
          },
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 800,
        idealEdgeLength: 120,
        nodeOverlap: 20,
        padding: 30,
      },
      elements: [
        ...data.nodes.map((n) => ({ group: "nodes" as const, data: n.data })),
        ...data.edges.map((e) => ({ group: "edges" as const, data: e.data })),
      ],
    });

    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      const data = node.data();
      if (data.type === "corp") {
        window.open(`/corp/${data.label}`, "_blank");
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[550px] bg-[var(--bg)]"
    />
  );
}
