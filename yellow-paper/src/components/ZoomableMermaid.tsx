import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface ZoomableMermaidProps {
  chart: string;
}

const ZoomableMermaid: React.FC<ZoomableMermaidProps> = ({ chart }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (mermaidRef.current) {
      const formattedChart = chart.replace(/\n/g, "NEWLINE");
      console.log(formattedChart);

      mermaid.render("mermaid-chart", chart, (svgCode) => {
        mermaidRef.current!.innerHTML = svgCode;
      });

      // mermaid.init(undefined, mermaidRef.current);

      // const svg = mermaidRef.current.querySelector("svg");
      // if (svg) {
      //   svg.setAttribute("width", "100%");
      //   svg.setAttribute("height", "100%");
      // }
    }
  }, [chart]);

  useEffect(() => {
    if (mermaidRef.current) {
      const svg = mermaidRef.current.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", `${zoom * 100}%`);
        svg.setAttribute("height", `${zoom * 100}%`);
      }
    }
  }, [zoom]);

  const handleZoomIn = () => {
    setZoom((prevZoom) => prevZoom + 0.1);
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(prevZoom - 0.1, 0.1));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  return (
    <div>
      <div>
        <button onClick={handleZoomIn}>Zoom In</button>
        <button onClick={handleZoomOut}>Zoom Out</button>
        <button onClick={handleResetZoom}>Reset Zoom</button>
      </div>
      <div style={{ overflow: "auto", width: "100%" }}>
        <div
          ref={mermaidRef}
          style={{
            transformOrigin: "top left",
            transform: `scale(${zoom})`,
          }}
        >
          {chart}
        </div>
      </div>
    </div>
  );
};

export default ZoomableMermaid;
