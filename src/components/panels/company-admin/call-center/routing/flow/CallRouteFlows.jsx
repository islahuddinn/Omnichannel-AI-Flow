"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw, Copy } from "lucide-react";

import { CustomNode1, CustomNode2, TerminalNode } from "./CustomNodes";
import { Node1Modal, Node2Modal } from "./node-modals";

const nodeTypes = {
  customNode1: CustomNode1,
  customNode2: CustomNode2,
  terminalNode: TerminalNode,
};

export default function CallRouteFlows({
  initialRoutingData,
  onSave,
  isSaving,
}) {
  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Modals State
  const [node1ModalOpen, setNode1ModalOpen] = useState(false);
  const [node2ModalOpen, setNode2ModalOpen] = useState(false);

  // Selection State
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedParentNode, setSelectedParentNode] = useState(null);

  // Global Flow Settings
  const [loopSelection, setLoopSelection] = useState("no");
  const [hasChanges, setHasChanges] = useState(false);
  const [nodesInitialized, setNodesInitialized] = useState(false);

  // Refs
  const initialFlowRef = useRef({ nodes: [], edges: [] });
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // --- ID Management ---
  const getNextConsecutiveIds = useCallback((count) => {
    const currentNodes = nodesRef.current;
    const existingIds = new Set(
      currentNodes
        .map((node) => parseInt(node.id, 10))
        .filter((id) => !isNaN(id))
    );

    let startId = 1;
    while (true) {
      let canUseRange = true;
      for (let i = 0; i < count; i++) {
        if (existingIds.has(startId + i)) {
          canUseRange = false;
          break;
        }
      }

      if (canUseRange) {
        return Array.from({ length: count }, (_, i) =>
          (startId + i).toString()
        );
      }
      startId++;
    }
  }, []);

  // --- Handlers ---

  const handleNewProcess = useCallback((parentNode) => {
    setSelectedParentNode(parentNode);
    setSelectedNode(null); // Clear selected node as we are creating new
    setNode2ModalOpen(true);
  }, []);

  const handleNode2SettingsClick = useCallback((node) => {
    setSelectedParentNode(node); // Source sets selectedParentNode to the node being edited
    setSelectedNode(node);
    // Do not update global loopSelection state based on individual node click
    // to prevent overwriting the global loop status when clicking a non-loop node.
    setNode2ModalOpen(true);
  }, []);

  // --- Delete Logic (Exact Source Match) ---
  const handleDeleteNode = useCallback(
    (nodeIdToDelete) => {
      const currentNodes = [...nodesRef.current];
      const currentEdges = [...edgesRef.current];

      const nodeIndex = currentNodes.findIndex(
        (node) => node.id === nodeIdToDelete
      );
      if (nodeIndex === -1) {
        toast.error("The node you attempted to delete was not found.");
        return;
      }

      // Collect nodes to delete (Action + 2 Terminals)
      const nodesToDelete = [nodeIdToDelete];
      let terminalNodesCount = 0;

      for (
        let i = nodeIndex + 1;
        i < currentNodes.length && terminalNodesCount < 2;
        i++
      ) {
        if (currentNodes[i]?.type === "terminalNode") {
          nodesToDelete.push(currentNodes[i].id);
          terminalNodesCount++;
        } else {
          break;
        }
      }

      // Find incoming edge to the deleted node
      const incomingEdge = currentEdges.find(
        (edge) => edge.target === nodeIdToDelete
      );
      const sourceNodeId = incomingEdge ? incomingEdge.source : null;

      // Find next available node after the deleted group
      let targetNodeId = null;
      for (let i = nodeIndex + 1; i < currentNodes.length; i++) {
        const candidateId = currentNodes[i].id;
        if (!nodesToDelete.includes(candidateId)) {
          targetNodeId = candidateId;
          break;
        }
      }

      // Filter remaining nodes
      const remainingNodes = currentNodes.filter(
        (n) => !nodesToDelete.includes(n.id)
      );

      // Create ID mapping: old ID -> new ID (renumbering to keep IDs sequential)
      const idMapping = {};
      remainingNodes.forEach((node, idx) => {
        idMapping[node.id] = String(idx + 1);
      });

      // Update nodes with new IDs and positions
      const updatedNodes = remainingNodes.map((node, idx) => {
        const originalIdx = currentNodes.findIndex((n) => n.id === node.id);
        const newId = String(idx + 1);

        let updatedNode = {
          ...node,
          id: newId,
        };

        // Shift position of nodes after deleted group
        if (originalIdx > nodeIndex + terminalNodesCount) {
          updatedNode.position = {
            ...node.position,
            x: node.position.x - 600,
            y: node.position.y - 85,
          };
        }

        return updatedNode;
      });

      // Update edges with new IDs
      const filteredEdges = currentEdges.filter(
        (edge) =>
          !nodesToDelete.includes(edge.source) &&
          !nodesToDelete.includes(edge.target)
      );

      // Remap edges to new IDs
      const remappedEdges = filteredEdges.map((edge) => ({
        ...edge,
        id: `e${idMapping[edge.source]}-${idMapping[edge.target]}`,
        source: idMapping[edge.source],
        target: idMapping[edge.target],
      }));

      // Reconnect if possible (using new IDs)
      if (sourceNodeId && targetNodeId) {
        const newSourceId = idMapping[sourceNodeId];
        const newTargetId = idMapping[targetNodeId];

        if (newSourceId && newTargetId) {
          const alreadyExists = remappedEdges.some(
            (e) => e.source === newSourceId && e.target === newTargetId
          );
          if (!alreadyExists) {
            remappedEdges.push({
              id: `e${newSourceId}-${newTargetId}`,
              source: newSourceId,
              target: newTargetId,
            });
          }
        }
      }

      // Sort edges
      const sortedEdges = remappedEdges.sort((a, b) => {
        const sourceCompare = parseInt(a.source) - parseInt(b.source);
        if (sourceCompare !== 0) return sourceCompare;
        return parseInt(a.target) - parseInt(b.target);
      });

      // Re-attach callbacks to updated nodes
      const nodesWithCallbacks = updatedNodes.map((node) => {
        if (node.type === "customNode1") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => setNode1ModalOpen(true),
              onAddClick: () => handleNewProcess(node),
            },
          };
        } else if (node.type === "customNode2") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => handleNode2SettingsClick(node),
              onAddClick: () => handleNewProcess(node),
              onDeleteClick: (nodeId) => handleDeleteNode(nodeId),
            },
          };
        } else if (node.type === "terminalNode") {
          return {
            ...node,
            data: {
              ...node.data,
              onPlusClick: () => handleNewProcess(node),
            },
          };
        }
        return node;
      });

      setNodes(nodesWithCallbacks);
      setEdges(sortedEdges);
      setSelectedParentNode(null);

      toast.success("The node and its connections have been removed.");
    },
    [handleNewProcess, handleNode2SettingsClick]
  );

  // --- Save Node 2 Logic (Exact Source Match) ---
  const handleCreateNode2 = (data) => {
    if (!selectedParentNode) return;

    const currentNodes = [...nodesRef.current];
    const effectiveLoopSelection =
      data.loopSelection !== undefined ? data.loopSelection : loopSelection;
    const isLoopEnabled = effectiveLoopSelection === "yes";

    const isExistingNode = currentNodes.some(
      (node) => node.id === selectedParentNode.id && node.type === "customNode2"
    );

    if (isExistingNode) {
      // 1. Update the target node first
      let updatedNodes = currentNodes.map((node) => {
        if (node.id === selectedParentNode.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...data,
              onSettingsClick: () => handleNode2SettingsClick(node),
              onAddClick: () => handleNewProcess(node),
              onDeleteClick: (id) => handleDeleteNode(id),
            },
          };
        }
        return node;
      });

      // 2. Apply Loop Logic: If Loop is YES, only the LAST customNode2 gets "yes". Use index to find last.
      // If Loop is NO, all get "no".
      if (isLoopEnabled) {
        // Find indices of all customNode2s
        const customNode2Indices = updatedNodes
          .map((n, i) => (n.type === "customNode2" ? i : -1))
          .filter((i) => i !== -1);

        if (customNode2Indices.length > 0) {
          const lastIndex = customNode2Indices[customNode2Indices.length - 1];
          updatedNodes = updatedNodes.map((node, i) => {
            if (node.type === "customNode2") {
              return {
                ...node,
                data: {
                  ...node.data,
                  loopSelection: i === lastIndex ? "yes" : "no",
                },
              };
            }
            return node;
          });
        }
      } else {
        // Loop disabled: Clear all
        updatedNodes = updatedNodes.map((node) => {
          if (node.type === "customNode2") {
            return { ...node, data: { ...node.data, loopSelection: "no" } };
          }
          return node;
        });
      }

      setNodes(updatedNodes);
      setLoopSelection(isLoopEnabled ? "yes" : "no");
    } else {
      // Check if we actually have action data or if it's just a loop toggle
      const hasActionData =
        data.agentId || data.groupId || data.audioId || data.externalNumber;

      if (!hasActionData) {
        // User didn't select an action, possibly just toggled loop/loop-off
        // We should NOT create a new node, but we SHOULD apply loop logic to existing nodes.
        // Assuming "last customNode2" is relative to the *entire* flow for loop purposes.

        setNodes((nds) => {
          let updatedNodes = [...nds];

          if (isLoopEnabled) {
            const customNode2Indices = updatedNodes
              .map((n, i) => (n.type === "customNode2" ? i : -1))
              .filter((i) => i !== -1);

            if (customNode2Indices.length > 0) {
              const lastIndex =
                customNode2Indices[customNode2Indices.length - 1];
              updatedNodes = updatedNodes.map((node, i) => {
                if (node.type === "customNode2") {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      loopSelection: i === lastIndex ? "yes" : "no",
                    },
                  };
                }
                return node;
              });
            }
          } else {
            updatedNodes = updatedNodes.map((node) => {
              if (node.type === "customNode2") {
                return { ...node, data: { ...node.data, loopSelection: "no" } };
              }
              return node;
            });
          }
          return updatedNodes;
        });
        setLoopSelection(isLoopEnabled ? "yes" : "no");
        // Do NOT create new nodes or edges
      } else {
        // Create new nodes
        const [newNodeId, answerNodeId, unanswerNodeId] =
          getNextConsecutiveIds(3);

        setNodes((nds) => {
          const parentPosition = nds.find((n) => n.id === selectedParentNode.id)
            ?.position || { x: 0, y: 0 };

          const xPosition = parentPosition.x + 300;
          const yPosition = parentPosition.y;

          const newNode = {
            id: newNodeId,
            type: "customNode2",
            position: { x: xPosition, y: yPosition },
            data: {
              ...data,
              loopSelection: "no", // Will be set by loop logic below
              onSettingsClick: () =>
                handleNode2SettingsClick({ id: newNodeId, data: { ...data } }),
              onAddClick: () => handleNewProcess({ id: newNodeId }),
              onDeleteClick: (nodeId) => handleDeleteNode(nodeId),
            },
          };

          const answerNode = {
            id: answerNodeId,
            type: "terminalNode",
            position: { x: xPosition + 400, y: yPosition },
            data: {
              label: "Answered",
              isAnswer: true,
              onPlusClick: () => handleNewProcess({ id: answerNodeId }),
            },
          };

          const unanswerNode = {
            id: unanswerNodeId,
            type: "terminalNode",
            position: { x: xPosition + 400, y: yPosition + 85 },
            data: {
              label: "Unanswered",
              isAnswer: false,
              onPlusClick: () => handleNewProcess({ id: unanswerNodeId }),
            },
          };

          // Construct new list to apply loop logic
          let newNodesList = [...nds, newNode, answerNode, unanswerNode];

          // Apply Loop Logic
          if (isLoopEnabled) {
            // New node is inherently the last one if we append it,
            // but let's be safe and find the last index
            const customNode2Indices = newNodesList
              .map((n, i) => (n.type === "customNode2" ? i : -1))
              .filter((i) => i !== -1);

            if (customNode2Indices.length > 0) {
              const lastIndex =
                customNode2Indices[customNode2Indices.length - 1];
              newNodesList = newNodesList.map((node, i) => {
                if (node.type === "customNode2") {
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      loopSelection: i === lastIndex ? "yes" : "no",
                    },
                  };
                }
                return node;
              });
            }
          } else {
            newNodesList = newNodesList.map((node) => {
              if (node.type === "customNode2") {
                return { ...node, data: { ...node.data, loopSelection: "no" } };
              }
              return node;
            });
          }

          return newNodesList;
        });

        // Update Edges
        setEdges((eds) => {
          const newEdges = [
            {
              id: `e${selectedParentNode.id}-${newNodeId}`,
              source: selectedParentNode.id,
              target: newNodeId,
            },
            {
              id: `e${newNodeId}-${answerNodeId}`,
              source: newNodeId,
              target: answerNodeId,
            },
            {
              id: `e${newNodeId}-${unanswerNodeId}`,
              source: newNodeId,
              target: unanswerNodeId,
            },
          ];

          return [
            ...eds.filter((edge) => !edge.id.startsWith("loop-")),
            ...newEdges,
          ];
        });
        setLoopSelection(isLoopEnabled ? "yes" : "no");
      } // End else hasActionData
      setLoopSelection(isLoopEnabled ? "yes" : "no");
    } // End else isExistingNode

    setNode2ModalOpen(false);
    setSelectedParentNode(null);
    setSelectedNode(null);
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNode1Save = (name) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "customNode1") {
          return { ...n, data: { ...n.data, label: name } };
        }
        return n;
      })
    );
    setNode1ModalOpen(false);
  };

  // --- Copy & Revert ---

  const handleCopyCallFlow = () => {
    const cleanNodes = nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onSettingsClick: undefined,
        onAddClick: undefined,
        onDeleteClick: undefined,
        onPlusClick: undefined,
      },
    }));
    const flowData = { nodes: cleanNodes, edges };
    navigator.clipboard.writeText(JSON.stringify(flowData, null, 2));
    toast.success("Flow data copied to clipboard");
  };

  const handleRevertChanges = () => {
    if (initialFlowRef.current.nodes.length > 0) {
      // Re-attach callbacks
      const attachCallbacks = (node) => {
        if (node.type === "customNode1") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => setNode1ModalOpen(true),
              onAddClick: () => handleNewProcess(node),
            },
          };
        } else if (node.type === "customNode2") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => handleNode2SettingsClick(node),
              onAddClick: () => handleNewProcess(node),
              onDeleteClick: (nodeId) => handleDeleteNode(nodeId),
            },
          };
        } else if (node.type === "terminalNode") {
          return {
            ...node,
            data: {
              ...node.data,
              onPlusClick: () => handleNewProcess(node),
            },
          };
        }
        return node;
      };

      const revertedNodes = initialFlowRef.current.nodes.map(attachCallbacks);
      setNodes(revertedNodes);
      setEdges(initialFlowRef.current.edges);
      toast.success("Changes reverted to initial state");
    }
  };

  const handleSaveFlow = () => {
    const cleanNodes = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        ...n.data,
        onSettingsClick: undefined,
        onAddClick: undefined,
        onDeleteClick: undefined,
        onPlusClick: undefined,
      },
    }));

    onSave({
      nodes: cleanNodes,
      edges,
      isLoop: loopSelection === "yes" ? 1 : 0,
    });
  };

  // --- Initialization ---
  useEffect(() => {
    if (initialRoutingData?.flowData) {
      setLoopSelection(initialRoutingData.isLoop ? "yes" : "no");

      const attachCallbacks = (node) => {
        if (node.type === "customNode1") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => setNode1ModalOpen(true),
              onAddClick: () => handleNewProcess(node),
            },
          };
        } else if (node.type === "customNode2") {
          return {
            ...node,
            data: {
              ...node.data,
              onSettingsClick: () => handleNode2SettingsClick(node),
              onAddClick: () => handleNewProcess(node),
              onDeleteClick: (nodeId) => handleDeleteNode(nodeId),
            },
          };
        } else if (node.type === "terminalNode") {
          return {
            ...node,
            data: {
              ...node.data,
              onPlusClick: () => handleNewProcess(node),
            },
          };
        }
        return node;
      };

      const loadedNodes =
        initialRoutingData.flowData.nodes.map(attachCallbacks);
      setNodes(loadedNodes);
      setEdges(initialRoutingData.flowData.edges);
      initialFlowRef.current = {
        nodes: loadedNodes,
        edges: initialRoutingData.flowData.edges,
      };
    } else {
      // Initial Node
      const customNode1 = {
        id: "1",
        type: "customNode1",
        position: { x: 50, y: 100 },
        data: {
          phoneNumber: initialRoutingData?.phoneNumber || "",
          label: initialRoutingData?.internalName || "Incoming Call",
          onSettingsClick: () => setNode1ModalOpen(true),
          onAddClick: () => handleNewProcess({ id: "1" }),
        },
      };

      setNodes([customNode1]);
      setEdges([]);
      initialFlowRef.current = { nodes: [customNode1], edges: [] };
    }
    setNodesInitialized(true);
  }, [initialRoutingData]);

  // Check for changes
  useEffect(() => {
    const hasNodeChanges = nodes.length !== initialFlowRef.current.nodes.length;
    const hasEdgeChanges = edges.length !== initialFlowRef.current.edges.length;
    setHasChanges(hasNodeChanges || hasEdgeChanges);
  }, [nodes, edges]);

  // Determine background color based on theme (using CSS variable hook or simple check)
  // Since we can't easily use hooks inside the return for color prop, we'll rely on CSS variables where possible
  // or default to a standard color that works for both or transparent.

  return (
    <div className="w-full h-full relative flex flex-col">
      {/* Top Bar with Loop Indicator and Copy Button */}
      <div className="flex gap-2 justify-end mb-2 p-2 shrink-0">
        {loopSelection === "yes" && (
          <button
            className="text-sm text-primary bg-primary/10 border-[0.83px] border-primary/20 rounded-[5.53px] px-4 py-1 flex items-center gap-2 hover:bg-primary/20 transition-colors"
            title="Loop is enabled"
          >
            <RefreshCw className="w-4 h-4" />
            Routing Is In Loop
          </button>
        )}

        <button
          onClick={handleCopyCallFlow}
          className="text-sm p-2 text-muted-foreground border border-border rounded-[5.53px] px-4 py-1 flex items-center gap-2 bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy Call Flow
        </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative overflow-hidden ">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          // onNodesChange={onNodesChange}
          // onEdgesChange={onEdgesChange}
          // onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          {/* <Background className="bg-background" color="hsl(var(--muted-foreground))" gap={16} size={1} /> */}
          <Controls className="bg-card border-border fill-foreground" />
        </ReactFlow>
      </div>

      {/* Modals */}
      <Node2Modal
        isOpen={node2ModalOpen}
        onClose={() => {
          setNode2ModalOpen(false);
          setSelectedNode(null);
          setSelectedParentNode(null);
        }}
        onSave={handleCreateNode2}
        initialData={selectedNode?.data}
        nodes={nodes}
        loopSelection={loopSelection}
        setLoopSelection={setLoopSelection}
        departmentIds={initialRoutingData?.departmentIds}
      />

      <Node1Modal
        isOpen={node1ModalOpen}
        onClose={() => setNode1ModalOpen(false)}
        onSave={handleNode1Save}
        initialValue={
          nodes.find((n) => n.type === "customNode1")?.data?.label || ""
        }
      />

      {/* Bottom Buttons */}
      <div className="p-2 flex gap-4 shrink-0">
        <Button
          type="button"
          onClick={handleRevertChanges}
          variant="outline"
          className="rounded-[5.53px] text-base font-bold bg-muted text-muted-foreground hover:bg-muted/90 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasChanges}
        >
          Revert Changes
        </Button>

        <Button
          onClick={handleSaveFlow}
          className="rounded-[5.53px] text-base font-bold"
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Flow
        </Button>
      </div>
    </div>
  );
}
