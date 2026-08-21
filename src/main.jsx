// Side-effect import: installs the window.fetch shim that routes Anthropic
// calls through the main process. Must run before PromptBench mounts.
import './host-bridge.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// StrictMode double-invokes effects in development only. PromptBench's effects
// are idempotent (a library read and a library write), so this is safe.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
