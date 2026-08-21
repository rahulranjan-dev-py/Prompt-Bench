// The application shell.
//
// PromptBench.jsx is your file, copied in byte-for-byte with zero edits. It is
// a self-contained root component: it ships its own CSS (the `CSS` constant it
// injects) and owns all of its own state, so this shell deliberately does
// nothing except mount it. Everything it needs from the host environment
// (window.storage, and an authenticated /v1/messages endpoint) is supplied by
// electron/preload.js, not from here.
import PromptBench from './PromptBench.jsx';

export default function App() {
  return <PromptBench />;
}
