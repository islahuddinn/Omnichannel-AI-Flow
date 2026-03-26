'use client';
import { BaseEdge } from "reactflow";

export const LoopEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style = {},
    markerEnd,
}) => {
    // Custom control point to pull the curve downward
    const controlOffsetY = 300;

    const controlPointX1 = sourceX;
    const controlPointY1 = sourceY + controlOffsetY;

    const controlPointX2 = targetX;
    const controlPointY2 = targetY + controlOffsetY;

    const edgePath = `M ${sourceX},${sourceY} C ${controlPointX1},${controlPointY1} ${controlPointX2},${controlPointY2} ${targetX},${targetY}`;

    return (
        <BaseEdge
            path={edgePath}
            style={{
                ...style,
                stroke: "#ff0072",
                strokeWidth: 2,
                fill: "none",
            }}
            markerEnd={markerEnd}
        />
    );
};
