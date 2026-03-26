// src/components/automation/OutcomesSection.jsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Settings, Trash2, Loader2, Sparkles, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import OutcomeModal from '@/components/modals/OutcomeModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Custom node component for outcomes
const OutcomeNode = ({ data, selected }) => {
  const maxLength = 18;
  const displayText = data.label.length > maxLength
    ? data.label.substring(0, maxLength) + '...'
    : data.label;

  const matchCount = data.matchCount || 0;
  const matchRate = data.matchRate || 0;
  // Color based on match rate: green (good), yellow (moderate), default green
  const bgColor = matchRate >= 50 ? 'bg-emerald-600 dark:bg-emerald-700' : matchRate > 0 ? 'bg-amber-600 dark:bg-amber-700' : 'bg-green-600 dark:bg-green-700';
  const borderColor = matchRate >= 50 ? 'border-emerald-800 dark:border-emerald-900' : matchRate > 0 ? 'border-amber-800 dark:border-amber-900' : 'border-green-800 dark:border-green-900';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          whileHover={{ scale: 1.05 }}
          className={cn(
            "relative w-[60px] sm:w-[70px] h-[200px] sm:h-[220px] rounded-2xl shadow-lg border-2 transition-all cursor-pointer group overflow-visible flex flex-col items-center justify-between pt-4 pb-3",
            bgColor,
            selected ? "border-blue-500 ring-2 ring-blue-300 scale-105" : borderColor
          )}
        >
          {/* Match count badge — positioned inside node on small screens */}
          {matchCount > 0 && (
            <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 z-30 h-4 min-w-4 sm:h-5 sm:min-w-5 px-0.5 sm:px-1 rounded-full bg-white dark:bg-gray-900 border border-border flex items-center justify-center shadow">
              <span className="text-[8px] sm:text-[9px] font-bold text-foreground">{matchCount}</span>
            </div>
          )}
          {/* Connection handle at the top - positioned first so it's behind */}
          <Handle
            type="target"
            position={Position.Top}
            className="!bg-green-600 !border-2 !border-white !w-3 !h-3 !z-0"
            style={{ top: -6 }}
          />
          
          {/* Settings icon - top center with subtle background */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              data.onSettingsClick();
            }}
            className="p-1 rounded-full bg-green-500/30 hover:bg-green-500/50 transition-all z-20 relative"
            title="Settings"
          >
            <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
          </motion.button>
          
          {/* Node label - vertical, centered */}
          <div className="flex-1 flex items-center justify-center px-2">
            <span
              className="text-white text-[10px] sm:text-xs font-medium leading-tight text-center"
              style={{ writingMode: 'vertical-rl' }}
            >
              {displayText}
            </span>
          </div>

          {/* Three dots - bottom center */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteClick();
            }}
            className="p-1 rounded bg-white/20 hover:bg-white/40 transition-all z-10"
            title="Delete"
          >
            <div className="flex flex-col gap-0.5">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
            </div>
          </motion.button>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs z-50">
        <p className="font-medium">{data.label}</p>
        {matchCount > 0 && <p className="text-xs text-muted-foreground">{matchCount} matches ({matchRate.toFixed(0)}% rate)</p>}
      </TooltipContent>
    </Tooltip>
  );
};

// Custom node component for root automation
const RootNode = ({ data }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative min-w-[140px] sm:min-w-[180px] min-h-[90px] sm:min-h-[110px] bg-muted rounded-lg shadow-lg border-2 border-border p-3 sm:p-4"
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <h3 className="font-semibold text-foreground text-sm sm:text-base truncate flex-1">
          {data.label}
        </h3>
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={data.onSettingsClick}
          className="ml-2 p-1 rounded hover:bg-muted transition-colors shrink-0"
          title="Settings"
        >
          <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
        </motion.button>
      </div>
      <div className="flex justify-center relative">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={data.onAddClick}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all shadow-md hover:shadow-lg z-10 relative"
          title="Add Outcome"
        >
          <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </motion.button>
        {/* Connection handle at the bottom */}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-blue-500 !border-2 !border-white !w-3 !h-3"
          style={{ bottom: -6 }}
        />
      </div>
    </motion.div>
  );
};

const nodeTypes = {
  outcome: OutcomeNode,
  root: RootNode,
};

export default function OutcomesSection({ automationId, automationName, onSave }) {
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [outcomeToDelete, setOutcomeToDelete] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null); // Array of suggestions
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [savingSuggestionIdx, setSavingSuggestionIdx] = useState(null);

  // Fetch outcomes
  const { data: outcomes, isLoading } = useQuery({
    queryKey: ['outcomes', automationId],
    queryFn: async () => {
      const result = await apiClient.get(`/automations/${automationId}/outcomes`);
      // ✅ Ensure we always return an array
      const data = result.data;
      return Array.isArray(data) ? data : [];
    },
    enabled: !!automationId,
  });

  // Fetch stats for match counts on nodes
  const { data: statsData } = useQuery({
    queryKey: ['automation-stats-mini', automationId],
    queryFn: async () => {
      const result = await apiClient.get(`/automations/${automationId}/stats`);
      return result.data;
    },
    enabled: !!automationId,
    staleTime: 60000,
  });

  // Build outcome match count map (memoized to avoid infinite re-render loop)
  const outcomeMatchMap = useMemo(() => {
    const map = {};
    if (statsData?.outcomeStats) {
      for (const os of statsData.outcomeStats) {
        map[os.outcomeId?.toString()] = { matched: os.matched || 0, matchRate: os.matchRate || 0 };
      }
    }
    return map;
  }, [statsData]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (outcomeId) => {
      const result = await apiClient.delete(`/automations/${automationId}/outcomes/${outcomeId}`);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete outcome');
      }
      return result;
    },
    onSuccess: async () => {
      // Invalidate and refetch to get real-time updates
      await queryClient.invalidateQueries({ queryKey: ['outcomes', automationId] });
      await queryClient.refetchQueries({
        queryKey: ['outcomes', automationId],
      });
      toast.success('Outcome deleted successfully');
      setDeleteDialogOpen(false);
      setOutcomeToDelete(null);
      // Call onSave callback to update completion status
      if (onSave) {
        await onSave();
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete outcome');
    },
  });

  // AI Suggest outcomes
  const handleSuggestOutcomes = useCallback(async () => {
    setIsSuggesting(true);
    setAiSuggestions(null);
    try {
      const result = await apiClient.post(`/automations/${automationId}/suggest-outcomes`, {});
      if (result.success && result.data?.suggestions?.length > 0) {
        setAiSuggestions(result.data.suggestions);
        toast.success(`${result.data.suggestions.length} outcomes suggested by AI`);
      } else {
        toast.error(result.error || 'No suggestions generated. Make sure the automation has a message configured.');
      }
    } catch (error) {
      console.error('Suggest error:', error);
      toast.error(error.message || 'Failed to generate suggestions');
    } finally {
      setIsSuggesting(false);
    }
  }, [automationId]);

  // Save a single AI suggestion as a real outcome
  const handleAcceptSuggestion = useCallback(async (suggestion, index) => {
    setSavingSuggestionIdx(index);
    try {
      const result = await apiClient.post(`/automations/${automationId}/outcomes`, {
        outcomeName: suggestion.outcomeName,
        possibleOutcome: suggestion.possibleOutcome,
        followUpAction: suggestion.followUpAction,
      });
      if (result.success) {
        toast.success(`Outcome "${suggestion.outcomeName}" created`);
        // Remove from suggestions list
        setAiSuggestions(prev => prev.filter((_, i) => i !== index));
        // Refresh outcomes
        await queryClient.invalidateQueries({ queryKey: ['outcomes', automationId] });
        if (onSave) await onSave();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to save outcome');
    } finally {
      setSavingSuggestionIdx(null);
    }
  }, [automationId, queryClient, onSave]);

  // Accept all suggestions at once
  const handleAcceptAll = useCallback(async () => {
    if (!aiSuggestions?.length) return;
    setSavingSuggestionIdx(-1); // -1 means all
    try {
      for (let i = 0; i < aiSuggestions.length; i++) {
        const s = aiSuggestions[i];
        await apiClient.post(`/automations/${automationId}/outcomes`, {
          outcomeName: s.outcomeName,
          possibleOutcome: s.possibleOutcome,
          followUpAction: s.followUpAction,
        });
      }
      toast.success(`${aiSuggestions.length} outcomes created`);
      setAiSuggestions(null);
      await queryClient.invalidateQueries({ queryKey: ['outcomes', automationId] });
      if (onSave) await onSave();
    } catch (error) {
      toast.error(error.message || 'Failed to save outcomes');
    } finally {
      setSavingSuggestionIdx(null);
    }
  }, [aiSuggestions, automationId, queryClient, onSave]);

  const handleAddOutcome = useCallback(() => {
    setSelectedOutcome(null);
    setModalOpen(true);
  }, []);

  const handleEditOutcome = useCallback((outcome) => {
    // Fetch full outcome data including follow-up action
    apiClient.get(`/automations/${automationId}/outcomes/${outcome._id}`)
      .then((result) => {
        if (result.success) {
          setSelectedOutcome(result.data);
          setModalOpen(true);
        }
      })
      .catch((error) => {
        console.error('Error fetching outcome:', error);
        toast.error('Failed to load outcome details');
      });
  }, [automationId]);

  const handleDeleteClick = useCallback((outcome) => {
    setOutcomeToDelete(outcome);
    setDeleteDialogOpen(true);
  }, []);

  // Update nodes and edges when outcomes change
  useEffect(() => {
    // ✅ Ensure outcomes is an array before processing
    if (!outcomes || !Array.isArray(outcomes)) {
      // Set empty nodes/edges if outcomes is not an array
      const rootNode = {
        id: 'root',
        type: 'root',
        position: { x: 410, y: 80 },
        data: { 
          label: automationName || 'Automation',
          onSettingsClick: () => {
            toast.info('Automation settings coming soon');
          },
          onAddClick: handleAddOutcome,
        },
        draggable: false,
      };
      setNodes([rootNode]);
      setEdges([]);
      return;
    }

    // Calculate center position based on viewport
    const centerX = 500;
    const rootY = 80;

    const rootNode = {
      id: 'root',
      type: 'root',
      position: { x: centerX - 90, y: rootY }, // Center the root node
      data: { 
        label: automationName || 'Automation',
        onSettingsClick: () => {
          // Root settings - could open automation settings
          toast.info('Automation settings coming soon');
        },
        onAddClick: handleAddOutcome,
      },
      draggable: false,
    };

    // Calculate positions for outcome nodes in a horizontal line below root
    const totalOutcomes = outcomes.length;
    const spacing = 100; // Horizontal spacing between nodes (reduced for smaller circular nodes)
    const startX = centerX - ((totalOutcomes - 1) * spacing) / 2;
    const outcomeY = rootY + 180; // Vertical position below root

    const outcomeNodes = outcomes.map((outcome, index) => {
      const x = startX + (index * spacing);

      const matchInfo = outcomeMatchMap[outcome._id?.toString()] || {};
      return {
        id: outcome._id,
        type: 'outcome',
        position: { x, y: outcomeY },
        data: {
          label: outcome.outcomeName || 'Outcome',
          matchCount: matchInfo.matched || 0,
          matchRate: matchInfo.matchRate || 0,
          onSettingsClick: () => handleEditOutcome(outcome),
          onDeleteClick: () => handleDeleteClick(outcome),
        },
        draggable: true,
      };
    });

    // Create edges from root to all outcomes (connecting from the + button area)
    const outcomeEdges = outcomes.map((outcome, index) => {
      const targetX = startX + (index * spacing);
      return {
        id: `root-${outcome._id}`,
        source: 'root',
        target: outcome._id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#9ca3af', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#9ca3af',
          width: 20,
          height: 20,
        },
      };
    });

    setNodes([rootNode, ...outcomeNodes]);
    setEdges(outcomeEdges);
  }, [outcomes, automationName, handleAddOutcome, handleEditOutcome, handleDeleteClick, outcomeMatchMap]);

  const handleDeleteConfirm = () => {
    if (outcomeToDelete) {
      deleteMutation.mutate(outcomeToDelete._id);
    }
  };

  const handleModalSuccess = async () => {
    // Invalidate and refetch to get real-time updates
    await queryClient.invalidateQueries({ queryKey: ['outcomes', automationId] });
    await queryClient.refetchQueries({
      queryKey: ['outcomes', automationId],
    });
    setModalOpen(false);
    setSelectedOutcome(null);
    // Call onSave callback to update completion status
    if (onSave) {
      await onSave();
    }
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 min-h-[500px] sm:min-h-[600px]"
    >
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <div className="w-4 h-4 bg-green-600 dark:bg-green-500 rounded-full"></div>
                </div>
                Outcomes
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Set OWM flow and its outcomes
              </p>
            </div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button onClick={handleAddOutcome} size="sm" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Add Outcome
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={handleSuggestOutcomes}
                size="sm"
                variant="outline"
                disabled={isSuggesting}
                className="w-full sm:w-auto border-primary/30 text-primary hover:bg-primary/5"
              >
                {isSuggesting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" />Suggest with AI</>
                )}
              </Button>
            </motion.div>
          </motion.div>
        </CardHeader>

        {/* AI Suggestions Panel */}
        <AnimatePresence>
          {aiSuggestions && aiSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-6 mb-4"
            >
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">AI Suggested Outcomes</span>
                    <span className="text-xs text-muted-foreground">({aiSuggestions.length} suggestions)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="default" onClick={handleAcceptAll} disabled={savingSuggestionIdx !== null} className="h-7 text-xs">
                      {savingSuggestionIdx === -1 ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Accept All
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAiSuggestions(null)} className="h-7 text-xs text-muted-foreground">
                      <X className="mr-1 h-3 w-3" />Dismiss
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {aiSuggestions.map((s, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-3 p-3 bg-background rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.outcomeName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.possibleOutcome}</p>
                        <p className="text-xs text-primary/70 mt-1 italic">Follow-up: {s.followUpAction.substring(0, 100)}...</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                          onClick={() => handleAcceptSuggestion(s, idx)}
                          disabled={savingSuggestionIdx !== null}
                          title="Accept this outcome"
                        >
                          {savingSuggestionIdx === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setSelectedOutcome({ outcomeName: s.outcomeName, possibleOutcome: s.possibleOutcome, followUpAction: s.followUpAction });
                            setModalOpen(true);
                          }}
                          title="Edit before accepting"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setAiSuggestions(prev => prev.filter((_, i) => i !== idx))}
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <CardContent>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="w-full h-[400px] sm:h-[500px] md:h-[600px] border border-border rounded-lg bg-card overflow-hidden"
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              className="bg-card"
              minZoom={0.2}
              maxZoom={2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            >
              <Background color="var(--border)" gap={16} />
              <Controls className="bg-card border border-border rounded-lg shadow-sm" />
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === 'root') return '#3b82f6';
                  return '#16a34a';
                }}
                className="bg-card border border-border rounded-lg shadow-sm"
                pannable
                zoomable
              />
            </ReactFlow>
          </motion.div>
          <AnimatePresence>
            {(!outcomes || outcomes.length === 0) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 text-center py-8 text-muted-foreground"
              >
                <p className="text-sm">No outcomes created yet. Click "Add Outcome" or the + icon to get started.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <AnimatePresence>
        {modalOpen && (
          <OutcomeModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            automationId={automationId}
            outcome={selectedOutcome}
            onSuccess={handleModalSuccess}
          />
        )}
      </AnimatePresence>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Outcome</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{outcomeToDelete?.outcomeName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

