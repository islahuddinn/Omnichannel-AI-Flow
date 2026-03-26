// // src/components/shared/ErrorBoundary.jsx
// 'use client';

// import React from 'react';
// import { AlertCircle, RefreshCw } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// class ErrorBoundary extends React.Component {
//   constructor(props) {
//     super(props);
//     this.state = { hasError: false, error: null };
//   }

//   static getDerivedStateFromError(error) {
//     return { hasError: true, error };
//   }

//   componentDidCatch(error, errorInfo) {
//     // Log error to monitoring service
//     console.error('Error Boundary Caught:', error, errorInfo);
    
//     // Send to error tracking service
//     if (typeof window !== 'undefined' && window.Sentry) {
//       window.Sentry.captureException(error, {
//         contexts: {
//           react: {
//             componentStack: errorInfo.componentStack
//           }
//         }
//       });
//     }
//   }

//   handleReset = () => {
//     this.setState({ hasError: false, error: null });
//   };

//   render() {
//     if (this.state.hasError) {
//       // Custom error UI for specific components
//       if (this.props.fallback) {
//         return this.props.fallback(this.state.error, this.handleReset);
//       }

//       // Default error UI
//       return (
//         <div className="min-h-[400px] flex items-center justify-center p-4">
//           <div className="max-w-md w-full">
//             <Alert variant="destructive">
//               <AlertCircle className="h-4 w-4" />
//               <AlertTitle>Component Error</AlertTitle>
//               <AlertDescription className="mt-2">
//                 <p className="mb-4">
//                   {this.props.message || 'An error occurred while rendering this component.'}
//                 </p>
//                 {process.env.NODE_ENV === 'development' && this.state.error?.message && (
//                   <details className="mt-2">
//                     <summary className="cursor-pointer text-xs hover:underline">
//                       Error Details
//                     </summary>
//                     <pre className="mt-2 text-xs bg-black/10 p-2 rounded overflow-auto">
//                       {this.state.error.message}
//                     </pre>
//                   </details>
//                 )}
//                 <Button
//                   onClick={this.handleReset}
//                   size="sm"
//                   className="mt-4"
//                   variant="outline"
//                 >
//                   <RefreshCw className="mr-2 h-3 w-3" />
//                   Try Again
//                 </Button>
//               </AlertDescription>
//             </Alert>
//           </div>
//         </div>
//       );
//     }

//     return this.props.children;
//   }
// }

// export default ErrorBoundary;




// src/components/shared/ErrorBoundary.jsx
'use client';

import { Component } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, () => this.setState({ hasError: false }));
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {this.props.message || 'Something went wrong'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {this.state.error?.message}
          </p>
          <Button onClick={() => this.setState({ hasError: false })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}