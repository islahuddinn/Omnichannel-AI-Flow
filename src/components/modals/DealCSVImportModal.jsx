// src/components/modals/DealCSVImportModal.jsx
/**
 * Deal CSV Import Modal Component
 * Handles CSV file upload and import progress tracking for deals
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Download, Users, SkipForward, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function DealCSVImportModal({ isOpen, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importJob, setImportJob] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, completed, failed
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const [startTime, setStartTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Poll for import status
  useEffect(() => {
    if (!importJob?.jobId && !importJob?._id) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (status === 'completed' || status === 'failed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (status !== 'pending' && status !== 'processing') {
      return;
    }

    let isPolling = true;
    const jobIdParam = importJob._id || importJob.jobId;

    const pollStatus = async () => {
      if (!isPolling) return;

      try {
        const response = await fetch(`/api/deals/import?jobId=${jobIdParam}`);
        const result = await response.json();

        if (!isPolling) return;

        if (result.success && result.data) {
          const job = result.data;
          const newStatus = job.status;

          if (newStatus === 'processing' && job.processedRecords > 0) {
            const elapsed = startTime ? (new Date() - startTime) / 1000 : 0;
            const processed = job.processedRecords || 0;
            const total = job.totalRecords || processed;

            if (processed > 0 && total > processed && elapsed > 0) {
              const rate = processed / elapsed;
              const remaining = total - processed;
              const estimatedSeconds = remaining / rate;

              if (estimatedSeconds < 60) {
                setTimeRemaining(`${Math.round(estimatedSeconds)} seconds`);
              } else if (estimatedSeconds < 3600) {
                const minutes = Math.floor(estimatedSeconds / 60);
                const seconds = Math.round(estimatedSeconds % 60);
                setTimeRemaining(`${minutes}m ${seconds}s`);
              } else {
                const hours = Math.floor(estimatedSeconds / 3600);
                const minutes = Math.floor((estimatedSeconds % 3600) / 60);
                setTimeRemaining(`${hours}h ${minutes}m`);
              }
            } else {
              setTimeRemaining('Calculating...');
            }
          } else if (newStatus === 'completed' || newStatus === 'failed') {
            setTimeRemaining(null);
          }

          setImportJob(job);
          setProgress(job.progress || 0);
          setStatus(newStatus);

          if (newStatus === 'completed' || newStatus === 'failed') {
            isPolling = false;
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            if (newStatus === 'completed') {
              toast.success(`Import completed! ${job.successfulImports || 0} deals imported successfully.`);
              queryClient.invalidateQueries({ queryKey: ['deals'] });
              onSuccess?.();
            } else {
              toast.error(`Import failed: ${job.error || 'Unknown error'}`);
            }
          }
        } else if (result.error && result.error.includes('not found')) {
          isPolling = false;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setStatus('failed');
          toast.error('Import job not found');
        }
      } catch (error) {
        console.error('Error polling import status:', error);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    pollIntervalRef.current = interval;

    return () => {
      isPolling = false;
      clearInterval(interval);
      pollIntervalRef.current = null;
    };
  }, [importJob?.jobId, importJob?._id, status, onSuccess, startTime, queryClient]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv') && selectedFile.type !== 'text/csv') {
      toast.error('Please select a CSV file');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast.error('File size exceeds 500MB limit');
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      setIsUploading(true);
      setStatus('uploading');

      // Step 1: Upload file to temporary storage
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/api/deals/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResult.success) {
        setStatus('idle');
        toast.error(uploadResult.error || 'Failed to upload file');
        return;
      }

      // Step 2: Start import job with uploaded file
      const importResponse = await fetch('/api/deals/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: uploadResult.data.fileId,
          fileName: uploadResult.data.fileName,
          fileSize: uploadResult.data.fileSize,
          filePath: uploadResult.data.filePath,
        }),
      });

      const importResult = await importResponse.json();

      if (importResult.success) {
        setImportJob(importResult.data);
        setStatus('processing');
        setStartTime(new Date());
        toast.success('CSV file uploaded successfully. Import started!');
      } else {
        setStatus('idle');
        toast.error(importResult.error || 'Failed to start import');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setStatus('idle');
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (status === 'processing') {
      toast.info('Import will continue in the background. You can check the status later.');
    }

    if (status !== 'processing') {
      setFile(null);
      setImportJob(null);
      setProgress(0);
      setStatus('idle');
      setStartTime(null);
      setTimeRemaining(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    onClose();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const downloadErrors = () => {
    if (!importJob?.importErrors || importJob.importErrors.length === 0) return;

    const escapeCSV = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvContent = [
      ['Row', 'Field', 'Error'],
      ...importJob.importErrors.map(err => [err.row || '', err.field || '', err.error || '']),
    ].map(row => row.map(escapeCSV).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deal-import-errors-${importJob.jobId || 'unknown'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Deals from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import deals. All columns will be dynamically stored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Upload Section */}
          {status === 'idle' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="deal-csv-file">CSV File</Label>
                <div className="mt-2">
                  <Input
                    ref={fileInputRef}
                    id="deal-csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const droppedFile = e.dataTransfer.files[0];
                      if (droppedFile) {
                        if (!droppedFile.name.endsWith('.csv') && droppedFile.type !== 'text/csv') {
                          toast.error('Please select a CSV file');
                          return;
                        }
                        if (droppedFile.size > 500 * 1024 * 1024) {
                          toast.error('File size exceeds 500MB limit');
                          return;
                        }
                        setFile(droppedFile);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    aria-label={file ? `Selected file: ${file.name}. Click to change.` : 'Click or drag to select CSV file'}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'}`}
                  >
                    {file ? (
                      <div className="space-y-3">
                        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                          <FileText className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{file.name}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                        >
                          Remove file
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto">
                          <Upload className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            Click or drag & drop to upload
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            CSV files up to 500MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-2">
                  CSV Format Requirements:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>First row must contain column headers</li>
                  <li>"Id" column will be used as the unique deal identifier</li>
                  <li>All other columns will be stored in the deal's details</li>
                  <li>Duplicate deals (same Id) will be skipped</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={!file || isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Start Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Uploading Section */}
          {status === 'uploading' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Uploading file...
              </p>
            </div>
          )}

          {/* Progress Section */}
          {status === 'processing' && importJob && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    <span className="text-sm font-medium text-foreground">
                      Importing deals...
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {timeRemaining && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeRemaining}
                      </span>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {Math.min(importJob.progress || 0, 100)}%
                    </Badge>
                  </div>
                </div>
                <Progress value={Math.min(importJob.progress || 0, 100)} className="h-2.5" />
                {importJob.totalRecords > 0 && (
                  <p className="text-xs text-muted-foreground text-right">
                    {importJob.processedRecords || 0} of {importJob.totalRecords} records
                  </p>
                )}
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total</p>
                  </div>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    {importJob.totalRecords > 0 ? importJob.totalRecords.toLocaleString() : (importJob.processedRecords > 0 ? `${importJob.processedRecords.toLocaleString()}+` : '...')}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-100 dark:border-green-800/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">Imported</p>
                  </div>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">
                    {(importJob.successfulImports || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <SkipForward className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Duplicates</p>
                  </div>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    {(importJob.skippedImports || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed</p>
                  </div>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">
                    {(importJob.failedImports || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                This may take a while for large files. You can close this dialog — the import will continue in the background.
              </p>
            </div>
          )}

          {/* Completed Section */}
          {status === 'completed' && importJob && (
            <div className="space-y-5">
              <div className="flex flex-col items-center justify-center py-3 gap-2">
                <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  Import Completed
                </h3>
              </div>

              {/* Final Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800/30 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total</p>
                  </div>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    {(importJob.totalRecords || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-100 dark:border-green-800/30 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">Imported</p>
                  </div>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">
                    {(importJob.successfulImports || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800/30 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <SkipForward className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Duplicates</p>
                  </div>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    {(importJob.skippedImports || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800/30 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed</p>
                  </div>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">
                    {(importJob.failedImports || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {importJob.importErrors && importJob.importErrors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Errors ({importJob.importErrors.length})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadErrors}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download Errors
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Row</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importJob.importErrors.slice(0, 10).map((error, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-muted-foreground">{error.row}</td>
                            <td className="px-4 py-2 text-destructive">
                              {error.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importJob.importErrors.length > 10 && (
                      <div className="p-2 text-center text-xs text-muted-foreground bg-muted">
                        Showing first 10 of {importJob.importErrors.length} errors. Download full report above.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

          {/* Failed Section */}
          {status === 'failed' && importJob && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-3 gap-2">
                <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  Import Failed
                </h3>
                <p className="text-sm text-destructive text-center max-w-sm">
                  {importJob.error || 'An unexpected error occurred during import.'}
                </p>
              </div>

              {/* Show partial results if any */}
              {(importJob.successfulImports > 0 || importJob.skippedImports > 0) && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-100 dark:border-green-800/30 text-center">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Imported</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {(importJob.successfulImports || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800/30 text-center">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Duplicates</p>
                    <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                      {(importJob.skippedImports || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-100 dark:border-red-800/30 text-center">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Failed</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">
                      {(importJob.failedImports || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
