// src/components/modals/CSVImportModal.jsx
/**
 * CSV Import Modal Component
 * Handles CSV file upload and import progress tracking
 */

'use client';

import { useState, useRef, useEffect } from 'react';
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

export default function CSVImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importJob, setImportJob] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, completed, failed
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const [startTime, setStartTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // Poll for import status
  useEffect(() => {
    // Don't start polling if no job, or if already completed/failed
    if (!importJob?.jobId && !importJob?._id) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Stop polling if job is completed or failed
    if (status === 'completed' || status === 'failed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Only poll if status is 'pending' or 'processing'
    if (status !== 'pending' && status !== 'processing') {
      return;
    }

    let isPolling = true;
    // ✅ Use _id first (MongoDB ObjectId), fallback to jobId (hex string)
    const jobIdParam = importJob._id || importJob.jobId;

    const pollStatus = async () => {
      if (!isPolling) return;

      try {
        // ✅ Poll using _id or jobId
        const response = await fetch(`/api/contacts/import?jobId=${jobIdParam}`);
        const result = await response.json();

        if (!isPolling) return;

        if (result.success && result.data) {
          const job = result.data;
          const newStatus = job.status;
          
          // ✅ Calculate time remaining
          if (newStatus === 'processing' && job.processedRecords > 0) {
            const elapsed = startTime ? (new Date() - startTime) / 1000 : 0; // seconds
            const processed = job.processedRecords || 0;
            const total = job.totalRecords || processed;
            
            if (processed > 0 && total > processed && elapsed > 0) {
              // Calculate average processing rate (records per second)
              const rate = processed / elapsed;
              const remaining = total - processed;
              const estimatedSeconds = remaining / rate;
              
              // Format time remaining
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
          
          // Update state
          setImportJob(job);
          setProgress(job.progress || 0);
          setStatus(newStatus);

          // Stop polling if job is completed or failed
          if (newStatus === 'completed' || newStatus === 'failed') {
            isPolling = false;
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            if (newStatus === 'completed') {
              toast.success(`Import completed! ${job.successfulImports || 0} contacts imported successfully.`);
              onSuccess?.();
            } else {
              toast.error(`Import failed: ${job.error || 'Unknown error'}`);
            }
          }
        } else if (result.error && result.error.includes('not found')) {
          // Job not found, stop polling
          isPolling = false;
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setStatus('failed');
          toast.error('Import job not found');
        }
      } catch {
        // Don't stop polling on network errors, but log them
      }
    };

    // Poll immediately, then every 3 seconds
    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    pollIntervalRef.current = interval;

    return () => {
      isPolling = false;
      clearInterval(interval);
      pollIntervalRef.current = null;
    };
  }, [importJob?.jobId, importJob?._id, status, onSuccess, startTime]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.endsWith('.csv') && selectedFile.type !== 'text/csv') {
      toast.error('Please select a CSV file');
      return;
    }

    // Validate file size (max 500MB)
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

      const formData = new FormData();
      formData.append('file', file);
      // Optional: Add departmentId and channelAccountId if needed
      // formData.append('departmentId', departmentId);
      // formData.append('channelAccountId', channelAccountId);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setImportJob(result.data);
        setStatus('processing');
        setStartTime(new Date()); // ✅ Track start time for time remaining calculation
        toast.success('CSV file uploaded successfully. Import started!');
      } else {
        setStatus('idle');
        toast.error(result.error || 'Failed to start import');
      }
    } catch {
      setStatus('idle');
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    // ✅ Allow closing during processing - backend will continue
    if (status === 'processing') {
      // Show info that import will continue in background
      toast.info('Import will continue in the background. You can check the status later.');
    }

    // Reset state (but keep polling if job exists)
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
    a.download = `import-errors-${importJob.jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="!max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import contacts. Each contact will automatically receive a dedicated WebChat link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* File Upload Section */}
          {status === 'idle' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
                <div className="mt-2">
                  <Input
                    ref={fileInputRef}
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/10'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/10'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-900/10');
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
                    className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:outline-none transition-all"
                  >
                    {file ? (
                      <div className="space-y-3">
                        <div className="h-14 w-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
                          <FileText className="h-7 w-7 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
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
                        <div className="h-14 w-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto">
                          <Upload className="h-7 w-7 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-700 dark:text-gray-300">
                            Click or drag & drop to upload
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            CSV files up to 500MB
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  CSV Format Requirements:
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>First row must contain column headers</li>
                  <li>At least one of: Email or Phone is required per contact</li>
                  <li>All unknown fields will be stored in the contact's "details" field</li>
                  <li>Each imported contact will automatically receive a WebChat link</li>
                </ul>
              </div>
            </div>
          )}

          {/* Progress Section */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="space-y-5">
              {/* Upload Progress */}
              {status === 'uploading' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Uploading file...
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {Math.min(progress, 100)}%
                    </span>
                  </div>
                  <Progress value={Math.min(progress, 100)} className="h-2" />
                </div>
              )}

              {/* Import Progress */}
              {status === 'processing' && importJob && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Importing contacts...
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {timeRemaining && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
                        {importJob.processedRecords || 0} of {importJob.totalRecords} records
                      </p>
                    )}
                  </div>

                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users className="h-3.5 w-3.5 text-blue-500" />
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

                  <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                    This may take a while for large files. You can close this dialog — the import will continue in the background.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Completed Section */}
          {status === 'completed' && importJob && (
            <div className="space-y-5">
              <div className="flex flex-col items-center justify-center py-3 gap-2">
                <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Import Completed
                </h3>
              </div>

              {/* Final Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800/30 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
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
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {importJob.importErrors.slice(0, 10).map((error, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{error.row}</td>
                            <td className="px-4 py-2 text-red-600 dark:text-red-400">
                              {error.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importJob.importErrors.length > 10 && (
                      <div className="p-2 text-center text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                        Showing first 10 of {importJob.importErrors.length} errors. Download full report above.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Failed Section */}
          {status === 'failed' && importJob && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-3 gap-2">
                <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Import Failed
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-sm">
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
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2">
            {status === 'idle' && (
              <>
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
              </>
            )}

            {(status === 'completed' || status === 'failed') && (
              <Button onClick={handleClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

