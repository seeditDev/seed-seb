import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Suppress ResizeObserver loop warnings (benign layout updates from Monaco editor)
const RESIZE_OBSERVER_ERROR_MSGS = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
];
window.addEventListener('error', (e) => {
  if (RESIZE_OBSERVER_ERROR_MSGS.includes(e.message) || e.message?.includes('ResizeObserver')) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

// Keep platform detection
const isRunningInPyQt = () => {
  // First, check user agent for QtWebEngine/QtWebKit
  const userAgentCheck = navigator.userAgent.includes('QtWebEngine') || 
                      navigator.userAgent.includes('QtWebKit');
  
  // Second, check for a special flag that PyQt might set
  const flagCheck = window.pyqtFlag === true;
  
  // Third, check if a special PyQt function exists
  const functionCheck = typeof window.pyqtAppReady === 'function';
  
  // Fourth, check if we're not in a regular browser environment
  const notBrowserCheck = !navigator.userAgent.includes('Chrome') && 
                       !navigator.userAgent.includes('Firefox') && 
                       !navigator.userAgent.includes('Safari');
  
  // For development, ALWAYS return true to test PyQt features
  const devOverride = process.env.NODE_ENV === 'development';
  
  console.log('PyQt detection results:', {
    userAgentCheck,
    flagCheck,
    functionCheck,
    notBrowserCheck,
    devOverride
  });
  
  // Return true if any check passes
  return userAgentCheck || flagCheck || functionCheck || notBrowserCheck || devOverride;
};

// Simple mount function
const mount = () => {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.error('Root element not found');
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    // Disable StrictMode in PyQt to avoid double-mounting issues
    root.render(
      isRunningInPyQt() || process.env.NODE_ENV === 'production' ? (
        <App />
      ) : (
        <React.StrictMode>
          <App />
        </React.StrictMode>
      )
    );
  } catch (error) {
    console.error('Error mounting app:', error);
  }
};

// Mount when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
