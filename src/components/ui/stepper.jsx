// src/components/ui/stepper.jsx
'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const StepperContext = React.createContext({
  currentStep: 0,
  steps: [],
  completedSteps: [],
  setCurrentStep: () => {},
  setCompletedStep: () => {},
});

export function Stepper({ children, currentStep = 0, onStepChange, className, completedSteps: externalCompletedSteps = [] }) {
  const [internalStep, setInternalStep] = React.useState(currentStep);
  const [internalCompletedSteps, setInternalCompletedSteps] = React.useState([]);
  
  // Use external completedSteps if provided, otherwise use internal state
  const completedSteps = externalCompletedSteps.length > 0 ? externalCompletedSteps : internalCompletedSteps;
  
  const steps = React.Children.toArray(children)
    .filter(child => child.type === StepperStep)
    .map((child, index) => ({
      index,
      label: child.props.label,
      description: child.props.description,
    }));

  const activeStep = currentStep !== undefined ? currentStep : internalStep;

  const setCurrentStep = (step) => {
    if (currentStep === undefined) {
      setInternalStep(step);
    }
    if (onStepChange) {
      onStepChange(step);
    }
  };

  const setCompletedStep = (step, completed) => {
    setCompletedSteps(prev => {
      if (completed) {
        return prev.includes(step) ? prev : [...prev, step];
      } else {
        return prev.filter(s => s !== step);
      }
    });
  };

  return (
    <StepperContext.Provider value={{
      currentStep: activeStep,
      steps,
      completedSteps,
      setCurrentStep,
      setCompletedStep,
    }}>
      <div className={cn('w-full', className)}>
        {/* Step Indicators - Single Row Layout (Responsive) */}
        <div className="flex flex-nowrap gap-2 sm:gap-3 md:gap-4 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {steps.map((step, index) => {
            const isActive = index === activeStep;
            const isCompleted = completedSteps.includes(index);
            const isPast = index < activeStep;
            
            return (
              <div key={index} className="relative flex-shrink-0 flex-1 min-w-[100px] sm:min-w-[120px] md:min-w-[140px] max-w-[200px]">
                <button
                  type="button"
                  onClick={() => {
                    // Allow clicking on any step at any time
                    setCurrentStep(index);
                  }}
                  className={cn(
                    'w-full h-[140px] sm:h-[160px] md:h-[180px] flex flex-col items-center justify-between p-3 sm:p-4 rounded-lg border-2 transition-all overflow-hidden',
                    'hover:shadow-md cursor-pointer',
                    isActive
                      ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
                      : isCompleted
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-sm hover:border-green-600 dark:hover:border-green-400'
                      : isPast
                      ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                >
                  {/* Step Number/Check Icon */}
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 mb-2 transition-all flex-shrink-0',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCompleted
                      ? 'border-green-500 bg-green-500 text-white'
                      : isPast
                      ? 'border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      : 'border-gray-300 dark:border-gray-600 bg-background text-gray-500 dark:text-gray-400'
                  )}>
                    {isCompleted ? (
                      <Check className="h-5 w-5 sm:h-6 sm:w-6" />
                    ) : (
                      <span className="font-semibold text-base sm:text-lg">{index + 1}</span>
                    )}
                  </div>
                  
                  {/* Step Label - Fixed height container */}
                  <div className="text-center w-full flex-1 flex flex-col justify-center min-h-0">
                    <p className={cn(
                      'text-xs sm:text-sm font-semibold mb-1 truncate w-full',
                      isActive
                        ? 'text-primary'
                        : isCompleted
                        ? 'text-green-700 dark:text-green-400'
                        : isPast
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-gray-500 dark:text-gray-400'
                    )}>
                      {step.label}
                    </p>
                    {step.description && (
                      <p className={cn(
                        'text-[10px] sm:text-xs line-clamp-2 min-h-[32px] sm:min-h-[36px]',
                        isActive
                          ? 'text-primary/70'
                          : isCompleted
                          ? 'text-green-600 dark:text-green-500'
                          : 'text-gray-500 dark:text-gray-400'
                      )}>
                        {step.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Completion Badge - Fixed at bottom */}
                  <div className="flex-shrink-0 mt-auto">
                    {isCompleted && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        <Check className="h-3 w-3 mr-1" />
                        Completed
                      </span>
                    )}
                  </div>
                </button>
                
                {/* Connector Line (between steps, responsive) */}
                {index < steps.length - 1 && (
                  <div className={cn(
                    'hidden sm:block absolute top-1/2 -right-1 sm:-right-2 w-2 sm:w-4 h-0.5 z-0 transition-colors',
                    isCompleted || isPast
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content - Fixed height container for consistency */}
        <div className="mt-8 min-h-[500px] sm:min-h-[600px]">
          {React.Children.map(children, (child, index) => {
            if (child.type === StepperStep) {
              return React.cloneElement(child, {
                isActive: index === activeStep,
                stepIndex: index,
              });
            }
            return child;
          })}
        </div>
      </div>
    </StepperContext.Provider>
  );
}

export function StepperStep({ children, label, description, isActive, stepIndex }) {
  if (!isActive) return null;

  return (
    <div className="animate-in fade-in-50 slide-in-from-bottom-4 duration-300">
      {children}
    </div>
  );
}

export function useStepper() {
  const context = React.useContext(StepperContext);
  if (!context) {
    throw new Error('useStepper must be used within Stepper');
  }
  return context;
}
