import { useState, useMemo, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  STRUCTURES — the standard frameworks prompt engineers work from.   */
/*  Field keys are shared across structures on purpose: what you type  */
/*  into "role" carries over when you switch.                          */
/* ------------------------------------------------------------------ */

const FRAMEWORKS = [
  {
    id: "rtf",
    name: "RTF",
    full: "Role · Task · Format",
    best: "Everyday asks. The least structure that still works.",
    fields: [
      { k: "role", label: "Role", hint: "Who should the model be?", ph: "a plain-spoken financial coach who works with first-time investors" },
      { k: "task", label: "Task", hint: "What do you want done?", ph: "explain how index funds work, and whether they suit someone saving for a house in 5 years" },
      { k: "format", label: "Format", hint: "What should the answer look like?", ph: "600 words, no jargon, one worked example with real numbers" },
    ],
  },
  {
    id: "tag",
    name: "TAG",
    full: "Task · Action · Goal",
    best: "When the outcome matters more than the voice.",
    fields: [
      { k: "task", label: "Task", hint: "What is the situation or material?", ph: "I have 40 customer support emails from last month" },
      { k: "action", label: "Action", hint: "What should be done with it?", ph: "group them into themes and count how often each theme appears" },
      { k: "goal", label: "Goal", hint: "What is this for?", ph: "so I can decide which three help-centre articles to write first" },
    ],
  },
  {
    id: "race",
    name: "RACE",
    full: "Role · Action · Context · Expectation",
    best: "Work tasks where the background changes the answer.",
    fields: [
      { k: "role", label: "Role", hint: "Who should the model be?", ph: "a hiring manager who has read 2,000 engineering CVs" },
      { k: "action", label: "Action", hint: "The single thing to do.", ph: "review my CV and mark every line that would get skipped in a 20-second scan" },
      { k: "context", label: "Context", hint: "Background it can't guess.", ph: "I'm a backend engineer with 4 years' experience, applying to early-stage startups, no CS degree" },
      { k: "expectation", label: "Expectation", hint: "What counts as a good answer?", ph: "a marked-up list plus a rewrite of the three weakest lines" },
    ],
  },
  {
    id: "ape",
    name: "APE",
    full: "Action · Purpose · Expectation",
    best: "Short asks where the 'why' does the heavy lifting.",
    fields: [
      { k: "action", label: "Action", hint: "What to do.", ph: "write five subject lines for a product update email" },
      { k: "purpose", label: "Purpose", hint: "Why it exists — the real job.", ph: "get lapsed users to open it; they ignored the last three" },
      { k: "expectation", label: "Expectation", hint: "Shape and limits of the answer.", ph: "under 45 characters each, no exclamation marks, rank them most to least likely to work" },
    ],
  },
  {
    id: "costar",
    name: "CO-STAR",
    full: "Context · Objective · Style · Tone · Audience · Response",
    best: "Writing and marketing, where voice and reader matter.",
    fields: [
      { k: "context", label: "Context", hint: "The situation behind the request.", ph: "we run a 12-person bakery and are opening a second location in March" },
      { k: "objective", label: "Objective", hint: "The one thing this should achieve.", ph: "announce the new shop and get people to sign up for opening-day tastings" },
      { k: "style", label: "Style", hint: "How it should be written.", ph: "short paragraphs, concrete detail, the way a neighbour tells you news" },
      { k: "tone", label: "Tone", hint: "How it should feel.", ph: "warm and a little proud, never salesy" },
      { k: "audience", label: "Audience", hint: "Who reads it.", ph: "regulars aged 30–60 who already follow us on Instagram" },
      { k: "response", label: "Response", hint: "The deliverable.", ph: "one Instagram caption under 150 words plus three comment replies" },
    ],
  },
  {
    id: "crispe",
    name: "CRISPE",
    full: "Capacity · Insight · Statement · Personality · Experiment",
    best: "Open-ended thinking where you want options, not one answer.",
    fields: [
      { k: "role", label: "Capacity", hint: "The expertise to adopt.", ph: "a product strategist who has launched two failed apps and one that worked" },
      { k: "insight", label: "Insight", hint: "What it needs to know first.", ph: "we have 800 signups, 40 weekly actives, and six months of runway" },
      { k: "statement", label: "Statement", hint: "The actual request.", ph: "tell me whether to fix retention or keep chasing signups" },
      { k: "personality", label: "Personality", hint: "The manner of the answer.", ph: "direct, willing to tell me the unflattering version" },
      { k: "experiment", label: "Experiment", hint: "How many angles to try.", ph: "give three separate recommendations with the strongest case for each, then pick one" },
    ],
  },
  {
    id: "risen",
    name: "RISEN",
    full: "Role · Instructions · Steps · End goal · Narrowing",
    best: "Multi-step jobs that have to happen in order.",
    fields: [
      { k: "role", label: "Role", hint: "Who is doing the work.", ph: "a curriculum designer for adult evening classes" },
      { k: "instructions", label: "Instructions", hint: "The overall job.", ph: "build a 6-week beginner watercolour course" },
      { k: "steps", label: "Steps", hint: "The order to work in.", ph: "1) list the skills a beginner needs 2) order them easiest to hardest 3) assign each to a week 4) write one exercise per week" },
      { k: "endgoal", label: "End goal", hint: "What 'done' looks like.", ph: "a week-by-week plan I can hand to a substitute teacher" },
      { k: "narrowing", label: "Narrowing", hint: "Constraints and limits.", ph: "2-hour sessions, max £30 of materials per student, no prior drawing experience" },
    ],
  },
  {
    id: "trace",
    name: "TRACE",
    full: "Task · Request · Action · Context · Example",
    best: "When you have a sample of what 'good' looks like.",
    fields: [
      { k: "task", label: "Task", hint: "The broad job.", ph: "write release notes for our app updates" },
      { k: "request", label: "Request", hint: "The specific ask this time.", ph: "turn this changelog into notes for version 3.2" },
      { k: "action", label: "Action", hint: "The steps to take.", ph: "group changes by what the user notices, drop internal refactors, lead with the biggest fix" },
      { k: "context", label: "Context", hint: "Who it's for and why.", ph: "our users are teachers who read this in an in-app popup and mostly skim" },
      { k: "example", label: "Example", hint: "Paste a good one.", ph: "v3.1 — Attendance now saves offline. Fixed the crash when adding a 31st student." },
    ],
  },
  {
    id: "cot",
    name: "Chain of thought",
    full: "Problem · What's known · Reasoning · Answer",
    best: "Maths, logic, diagnosis — anything with a wrong answer.",
    fields: [
      { k: "problem", label: "Problem", hint: "State it exactly.", ph: "work out whether leasing or buying the van is cheaper over 4 years" },
      { k: "known", label: "What's known", hint: "Every fact and number you have.", ph: "lease £340/mo, 48 months, £1,200 deposit. Buy £22,000, resale ~£9,000 after 4 years, service ~£600/yr either way" },
      { k: "reasoning", label: "How to reason", hint: "The thinking you want shown.", ph: "total each option year by year, state assumptions, flag anything I haven't given you" },
      { k: "answerformat", label: "Answer", hint: "How to deliver the conclusion.", ph: "a table of the working, then one sentence with the recommendation" },
    ],
  },
  {
    id: "fewshot",
    name: "Few-shot",
    full: "Task · Examples · New input",
    best: "Repetitive formatting jobs. Show two or three examples.",
    fields: [
      { k: "task", label: "Task", hint: "The pattern to follow.", ph: "turn messy job titles into a clean standard form" },
      { k: "example", label: "Examples", hint: "Two or three input → output pairs.", ph: "Input: sr. sw eng II → Output: Senior Software Engineer\nInput: mktg mgr, emea → Output: Marketing Manager" },
      { k: "newinput", label: "New input", hint: "The thing to run it on.", ph: "Input: asst. dir of ops (interim)" },
    ],
  },
  {
    id: "xml",
    name: "Tagged",
    full: "Role · Context · Task · Rules · Example · Output",
    style: "xml",
    best: "Long or complicated prompts. Tags stop the parts bleeding together.",
    fields: [
      { k: "role", label: "role", hint: "Who the model is.", ph: "a contracts reviewer for a small design studio" },
      { k: "context", label: "context", hint: "Everything it needs to know.", ph: "the client sent a 9-page MSA. We are the supplier. We've been burned by unlimited revisions before." },
      { k: "task", label: "task", hint: "The job.", ph: "find every clause that could cost us money or time and explain the risk in one line each" },
      { k: "rules", label: "rules", hint: "Hard requirements.", ph: "quote the clause number. Don't give legal advice. Say when something is standard and fine." },
      { k: "example", label: "example", hint: "A sample of good output.", ph: "4.2 — Revisions unlimited until client approval. Risk: no cap on our time." },
      { k: "format", label: "output_format", hint: "The shape of the answer.", ph: "a numbered list, highest risk first, then a two-line summary" },
    ],
  },
];

const ADDONS = [
  {
    id: "cotAdd",
    label: "Think it through first",
    tag: "reasoning",
    text: "Work through this step by step before answering. Show the reasoning, then give the final answer.",
  },
  {
    id: "clarify",
    label: "Ask me questions first",
    tag: "before_you_start",
    text: "If anything above is unclear or missing, ask me up to three questions before you begin.",
  },
  {
    id: "format",
    label: "Lock the output format",
    tag: "output_format",
    field: { hint: "Exact shape of the answer.", ph: "a markdown table with columns: item, cost, why it matters" },
  },
  {
    id: "avoid",
    label: "Set boundaries",
    tag: "avoid",
    field: { hint: "What it must not do.", ph: "no bullet points, no em dashes, don't invent statistics, don't summarise at the end" },
  },
  {
    id: "examples",
    label: "Add examples",
    tag: "examples",
    field: { hint: "Paste one or two samples of good output.", ph: "" },
  },
];

/* Longer guidance, shown in Help. */
const FRAMEWORK_NOTES = {
  rtf: "The default. If you don't know which to pick, pick this. Naming a role does most of the work — 'a plain-spoken financial coach' changes the vocabulary, the examples, and what gets left out.",
  tag: "Built around the last slot. Saying what the work is for lets the model make sensible calls you never thought to specify.",
  race: "RTF with a context slot bolted on. Reach for it when the honest answer depends on facts about your situation that nobody could guess.",
  ape: "The shortest structure with a 'why' in it. Good for one-off asks where a generic answer would be technically correct and completely useless.",
  costar:
    "The one for anything another person will read. Style and tone are separate on purpose: style is how sentences are built, tone is how they feel. You can have short blunt sentences (style) that still read as kind (tone).",
  crispe: "Asks for several answers instead of one, which is the whole point. Use it while you're still deciding, not when you already know what you want.",
  risen: "For work that has to happen in a set order. Writing the steps yourself is the hard part — and usually the part that reveals you hadn't decided.",
  trace: "The example slot is worth more than any adjective. One sample of good output beats three sentences describing it.",
  cot: "Forces the working into the open so you can check it. Use it for anything with a right answer — sums, comparisons, diagnosis, logic puzzles.",
  fewshot: "Pure pattern matching. Give two or three input-to-output pairs and it copies the pattern, quirks included. Ideal for tidying lists, reformatting, renaming.",
  xml: "Tags instead of headings. Once a prompt gets long, or contains material you've pasted in, tags stop your instructions from getting tangled up with the content.",
};

const ADDON_NOTES = {
  cotAdd: "Makes it reason before it answers, rather than committing to its first idea. Costs you a longer reply; usually worth it when there's a right answer.",
  clarify: "The cure for 'I don't know what to specify.' It asks up to three questions, then works from your answers.",
  format: "Table, numbered list, JSON, 200 words — name the shape and you stop getting an essay when you wanted a list.",
  avoid: "What not to do. Often the highest-value line in the whole prompt: no filler intro, don't invent numbers, no summary at the end.",
  examples: "Attaches a sample of good output to any structure, not just few-shot.",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

.pb *, .pb *::before, .pb *::after { box-sizing: border-box; }
.pb {
  --panel:#E4E6E1; --ink:#14171A; --slot:#FAFAF7; --line:#CBCFC6;
  --mute:#79806F; --signal:#1B36D8; --live:#C9F24E; --screen:#14171A;
  background:var(--panel); color:var(--ink); min-height:100vh;
  font-family:'Archivo','Helvetica Neue',Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.pb button { font-family:inherit; cursor:pointer; }
.pb textarea { font-family:inherit; }
.pb :focus-visible { outline:2px solid var(--signal); outline-offset:2px; }

.pb-label { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--mute); }

/* header */
.pb-head { border-bottom:1px solid var(--line); padding:12px 16px; }
.pb-headrow { display:flex; align-items:center; gap:12px; }
.pb-mark { font-size:19px; font-weight:700; letter-spacing:-.03em; }
.pb-sub { font-size:13px; color:var(--mute); display:block; margin-top:2px; }
.pb-util { margin-left:auto; display:flex; gap:6px; flex:none; }
.pb-ubtn { border:1px solid var(--line); background:var(--slot); border-radius:3px;
  padding:6px 11px; font-size:12px; font-weight:600; color:var(--ink);
  display:flex; align-items:center; gap:6px; transition:background .15s,color .15s; }
.pb-ubtn[data-on="1"] { background:var(--ink); color:var(--panel); border-color:var(--ink); }
.pb-badge { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--mute); }
.pb-ubtn[data-on="1"] .pb-badge { color:var(--live); }

.pb-wrap { max-width:1180px; margin:0 auto; padding:16px 16px 56px; }

/* mode switch */
.pb-modes { display:flex; gap:0; border:1px solid var(--line); border-radius:3px;
  background:var(--slot); overflow:hidden; margin-bottom:16px; }
.pb-mode { flex:1; border:0; background:transparent; padding:9px 8px; font-size:13px;
  font-weight:600; color:var(--mute); transition:background .15s,color .15s; }
.pb-mode[data-on="1"] { background:var(--ink); color:var(--panel); }

/* rack */
.pb-rack { border:1px solid var(--line); border-radius:3px; background:var(--slot); margin-bottom:14px; }
.pb-rackbtn { width:100%; border:0; background:transparent; text-align:left;
  padding:11px 13px; display:flex; align-items:center; gap:10px; }
.pb-rackbtn .pb-fw { font-size:15px; font-weight:700; letter-spacing:-.01em; }
.pb-rackbtn .pb-fwfull { font-size:12px; color:var(--mute); }
.pb-chev { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--mute); }
.pb-list { border-top:1px solid var(--line); max-height:340px; overflow-y:auto; }
.pb-item { width:100%; border:0; border-bottom:1px solid var(--line); background:transparent;
  text-align:left; padding:10px 13px; display:block; }
.pb-item:last-child { border-bottom:0; }
.pb-item:hover { background:#F0F1EC; }
.pb-item[data-on="1"] { background:var(--ink); }
.pb-item[data-on="1"] .pb-iname, .pb-item[data-on="1"] .pb-ifull, .pb-item[data-on="1"] .pb-ibest { color:var(--panel); }
.pb-iname { font-size:14px; font-weight:700; }
.pb-ifull { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.06em;
  color:var(--mute); text-transform:uppercase; }
.pb-ibest { font-size:12px; color:var(--mute); margin-top:3px; }

/* layout */
.pb-grid { display:grid; grid-template-columns:1fr; gap:16px; }
@media (min-width:900px){ .pb-grid { grid-template-columns:1fr 1fr; align-items:start; } }

.pb-tabs { display:flex; gap:6px; margin-bottom:12px; }
@media (min-width:900px){ .pb-tabs { display:none; } }
.pb-tab { flex:1; border:1px solid var(--line); background:var(--slot); border-radius:3px;
  padding:8px; font-size:12px; font-weight:600; color:var(--mute);
  display:flex; align-items:center; justify-content:center; gap:6px; }
.pb-tab[data-on="1"] { background:var(--ink); color:var(--panel); border-color:var(--ink); }
.pb-led { width:6px; height:6px; border-radius:50%; background:var(--live); display:inline-block; }

.pb-hide { display:none; }
@media (min-width:900px){ .pb-hide { display:block; } }

/* slots */
.pb-slot { background:var(--slot); border:1px solid var(--line); border-radius:3px;
  padding:10px 12px 4px; margin-bottom:10px; transition:border-color .15s; }
.pb-slot[data-on="1"] { border-color:var(--signal); }
.pb-slothead { display:flex; align-items:center; gap:8px; }
.pb-port { width:7px; height:7px; border-radius:50%; border:1.5px solid var(--mute);
  flex:none; transition:background .15s,border-color .15s; }
.pb-port[data-filled="1"] { background:var(--signal); border-color:var(--signal); }
.pb-slotname { font-size:13px; font-weight:600; }
.pb-hint { font-size:12px; color:var(--mute); margin-left:auto; text-align:right; }
.pb-ta { width:100%; border:0; background:transparent; resize:none; padding:6px 0 8px;
  font-size:16px; line-height:1.45; color:var(--ink); min-height:34px; }
.pb-ta::placeholder { color:#A9AEA1; }
.pb-ta:focus { outline:none; }

/* addons */
.pb-addhead { display:flex; align-items:center; gap:8px; margin:18px 0 8px; }
.pb-rule { flex:1; height:1px; background:var(--line); }
.pb-chips { display:flex; flex-wrap:wrap; gap:6px; }
.pb-chip { border:1px solid var(--line); background:var(--slot); border-radius:20px;
  padding:6px 12px; font-size:12.5px; font-weight:500; color:var(--ink); transition:all .15s; }
.pb-chip[data-on="1"] { background:var(--ink); color:var(--panel); border-color:var(--ink); }

/* screen */
.pb-screen { background:var(--screen); border-radius:3px; overflow:hidden;
  position:sticky; top:12px; }
.pb-scrhead { display:flex; align-items:center; gap:8px; padding:10px 12px;
  border-bottom:1px solid #2A2E33; }
.pb-scrhead .pb-label { color:#767E6C; }
.pb-count { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:10px;
  letter-spacing:.1em; color:#767E6C; }
.pb-scrtabs { display:flex; gap:14px; padding:8px 12px 0; }
.pb-scrtab { border:0; background:transparent; padding:0 0 7px; font-size:12px; font-weight:600;
  color:#767E6C; border-bottom:2px solid transparent; }
.pb-scrtab[data-on="1"] { color:#EDEFE9; border-bottom-color:var(--live); }
.pb-scrtab:disabled { opacity:.35; cursor:default; }
.pb-body { padding:12px; max-height:calc(100vh - 260px); min-height:180px; overflow-y:auto; }
@media (max-width:899px){ .pb-body { max-height:none; } }
.pb-seg { border-left:2px solid #2A2E33; padding:0 0 0 10px; margin-bottom:14px;
  transition:border-color .15s; }
.pb-seg[data-on="1"] { border-left-color:var(--live); }
.pb-segl { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.16em;
  text-transform:uppercase; color:#767E6C; margin-bottom:3px; }
.pb-seg[data-on="1"] .pb-segl { color:var(--live); }
.pb-segb { font-family:'JetBrains Mono',monospace; font-size:12.5px; line-height:1.65;
  color:#EDEFE9; white-space:pre-wrap; word-break:break-word; }
.pb-empty { font-size:13px; color:#767E6C; line-height:1.5; }
.pb-scrfoot { display:flex; gap:8px; padding:10px 12px; border-top:1px solid #2A2E33; flex-wrap:wrap; }
.pb-btn { border:1px solid #3A4038; background:transparent; color:#EDEFE9; border-radius:3px;
  padding:9px 14px; font-size:13px; font-weight:600; transition:all .15s; }
.pb-btn:hover:not(:disabled) { border-color:#EDEFE9; }
.pb-btn:disabled { opacity:.4; cursor:default; }
.pb-btn[data-primary="1"] { background:var(--live); border-color:var(--live); color:var(--ink); }
.pb-btn[data-primary="1"]:hover:not(:disabled) { background:#D6FF6B; }
.pb-msg { padding:0 12px 10px; font-size:12px; color:#767E6C; line-height:1.5; }
.pb-msg[data-err="1"] { color:#FF9E8A; }

/* rewrite mode */
.pb-box { background:var(--slot); border:1px solid var(--line); border-radius:3px; padding:12px; }
.pb-bigta { width:100%; border:0; background:transparent; resize:vertical; min-height:150px;
  font-size:16px; line-height:1.5; color:var(--ink); padding:8px 0; }
.pb-bigta:focus { outline:none; }
.pb-bigta::placeholder { color:#A9AEA1; }
.pb-go { border:0; background:var(--ink); color:var(--panel); border-radius:3px;
  padding:11px 18px; font-size:13.5px; font-weight:600; }
.pb-go:disabled { opacity:.4; cursor:default; }
.pb-note { font-size:12.5px; color:var(--mute); margin-top:10px; line-height:1.5; }
.pb-note[data-err="1"] { color:#B0492F; }
.pb-foot { margin-top:26px; padding-top:14px; border-top:1px solid var(--line);
  font-size:12px; color:var(--mute); line-height:1.6; }

/* saved library */
.pb-panel { max-width:760px; }
.pb-card { background:var(--slot); border:1px solid var(--line); border-radius:3px;
  padding:11px 12px; margin-bottom:10px; }
.pb-cardtop { display:flex; align-items:center; gap:10px; margin-bottom:7px; }
.pb-title { flex:1; min-width:0; border:0; background:transparent; font-family:inherit;
  font-size:15px; font-weight:600; color:var(--ink); padding:2px 0;
  border-bottom:1px solid transparent; }
.pb-title:focus { outline:none; border-bottom-color:var(--signal); }
.pb-meta { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.1em;
  text-transform:uppercase; color:var(--mute); flex:none; }
.pb-preview { font-family:'JetBrains Mono',monospace; font-size:11.5px; line-height:1.55;
  color:var(--mute); white-space:pre-wrap; word-break:break-word;
  max-height:54px; overflow:hidden; margin-bottom:10px; }
.pb-row { display:flex; gap:6px; flex-wrap:wrap; }
.pb-sbtn { border:1px solid var(--line); background:transparent; border-radius:3px;
  padding:7px 12px; font-size:12.5px; font-weight:600; color:var(--ink); transition:border-color .15s; }
.pb-sbtn:hover { border-color:var(--ink); }
.pb-sbtn[data-danger="1"] { color:#9E3B22; }
.pb-sbtn[data-danger="1"]:hover { border-color:#9E3B22; }

/* help */
.pb-h1 { font-size:23px; font-weight:700; letter-spacing:-.025em; margin:0 0 8px; }
.pb-p { font-size:14.5px; line-height:1.62; margin:0 0 12px; max-width:64ch; }
.pb-p[data-dim="1"] { color:var(--mute); }
.pb-sec { margin-top:28px; }
.pb-sech { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.pb-def { background:var(--slot); border:1px solid var(--line); border-radius:3px;
  padding:11px 12px; margin-bottom:8px; }
.pb-defname { font-size:14.5px; font-weight:700; }
.pb-deffull { font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--mute); margin:3px 0 6px; }
.pb-deftext { font-size:13.5px; line-height:1.58; }
.pb-steps { margin:0; padding:0; list-style:none; counter-reset:pbs; }
.pb-step { position:relative; padding-left:28px; margin-bottom:11px;
  font-size:14.5px; line-height:1.55; max-width:64ch; counter-increment:pbs; }
.pb-step::before { content:counter(pbs); position:absolute; left:0; top:2px;
  font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; color:var(--signal); }

@keyframes pb-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.pb-working { animation:pb-pulse 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce){
  .pb *, .pb *::before, .pb *::after { transition:none !important; animation:none !important; }
}
`;

/* ------------------------------------------------------------------ */

const tagify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error("request failed");
  const data = await res.json();
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, truncated: data.stop_reason === "max_tokens" };
}

/* Library lives under one key so a save is one write, not five. */
const LIB_KEY = "bench:library";
const hasStore = typeof window !== "undefined" && !!window.storage;

/* Whether the two AI-backed features can work at all. Set by the desktop shell
   from the API key it resolves; false in a plain browser, and false in the
   desktop app until a key is configured. Everything else here is local
   computation, so the app is fully usable with this off - the features that
   need a key are simply not offered rather than failing when pressed. */
const hasAI = typeof window !== "undefined" && !!window.hasAI;

async function readLibrary() {
  try {
    const r = await window.storage.get(LIB_KEY, false);
    const arr = JSON.parse(r?.value || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return []; // no key yet, or unreadable — start empty
  }
}

async function writeLibrary(items) {
  try {
    return !!(await window.storage.set(LIB_KEY, JSON.stringify(items), false));
  } catch {
    return false;
  }
}

const stamp = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function PromptBench() {
  const [mode, setMode] = useState("build");
  const [fwId, setFwId] = useState("rtf");
  const [rackOpen, setRackOpen] = useState(false);
  const [values, setValues] = useState({});
  const [addons, setAddons] = useState({});
  const [addonValues, setAddonValues] = useState({});
  const [active, setActive] = useState(null);
  const [view, setView] = useState("compose");
  const [tab, setTab] = useState("assembled");
  const [sharpened, setSharpened] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(null);
  const [rough, setRough] = useState("");
  const [note, setNote] = useState(null);
  const [panel, setPanel] = useState(null);
  const [lib, setLib] = useState([]);
  const [libState, setLibState] = useState(hasStore ? "loading" : "off");
  const [confirmId, setConfirmId] = useState(null);

  const fw = FRAMEWORKS.find((f) => f.id === fwId) || FRAMEWORKS[0];
  const isXml = fw.style === "xml";

  const segments = useMemo(() => {
    const out = [];
    fw.fields.forEach((f) => {
      const v = (values[f.k] || "").trim();
      if (v) out.push({ id: f.k, label: f.label, body: v });
    });
    ADDONS.forEach((a) => {
      if (!addons[a.id]) return;
      if (a.field) {
        const v = (addonValues[a.id] || "").trim();
        if (v) out.push({ id: a.id, label: a.tag, body: v });
      } else {
        out.push({ id: a.id, label: a.tag, body: a.text });
      }
    });
    return out;
  }, [fw, values, addons, addonValues]);

  const promptText = useMemo(
    () =>
      segments
        .map((s) =>
          isXml
            ? `<${tagify(s.label)}>\n${s.body}\n</${tagify(s.label)}>`
            : `${s.label.toUpperCase()}\n${s.body}`
        )
        .join("\n\n"),
    [segments, isXml]
  );

  const shown = tab === "sharpened" && sharpened ? sharpened : promptText;
  const words = shown.trim() ? shown.trim().split(/\s+/).length : 0;
  const filled = fw.fields.filter((f) => (values[f.k] || "").trim()).length;

  useEffect(() => {
    if (!hasStore) return;
    let alive = true;
    readLibrary().then((items) => {
      if (!alive) return;
      setLib(items);
      setLibState("ready");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copyText = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      return;
    } catch {
      /* fall through to the old method */
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      setCopied(id);
    } catch {
      setMsg({ err: true, text: "Copy didn't work here. Select the text above and copy it manually." });
    }
    document.body.removeChild(ta);
  };

  const pickFramework = (id) => {
    setFwId(id);
    setSharpened("");
    setTab("assembled");
    setRackOpen(false);
  };

  const saveCurrent = async () => {
    const first = fw.fields.map((f) => (values[f.k] || "").trim()).find(Boolean) || fw.name;
    const item = {
      id: `p${Date.now()}`,
      title: first.replace(/\s+/g, " ").slice(0, 54),
      fwId,
      values: { ...values },
      addons: { ...addons },
      addonValues: { ...addonValues },
      sharpened,
      text: shown,
      savedAt: Date.now(),
    };
    const next = [item, ...lib];
    setLib(next);
    const ok = await writeLibrary(next);
    if (ok) {
      setMsg({ err: false, text: "Saved. It's under Saved, up in the header." });
    } else {
      setLib(lib);
      setMsg({ err: true, text: "That didn't save. Try once more." });
    }
  };

  const openSaved = (item) => {
    setFwId(item.fwId);
    setValues(item.values || {});
    setAddons(item.addons || {});
    setAddonValues(item.addonValues || {});
    setSharpened(item.sharpened || "");
    setTab(item.sharpened ? "sharpened" : "assembled");
    setMode("build");
    setView("prompt");
    setPanel(null);
    setMsg(null);
  };

  const removeSaved = async (id) => {
    const next = lib.filter((i) => i.id !== id);
    setLib(next);
    setConfirmId(null);
    if (!(await writeLibrary(next))) setLib(lib);
  };

  const renameSaved = (id, title) => setLib(lib.map((i) => (i.id === id ? { ...i, title } : i)));

  const sharpen = async () => {
    setBusy("sharpen");
    setMsg(null);
    try {
      const { text, truncated } = await callClaude(
        `You are a prompt engineer. Rewrite the prompt below so it is clearer, more specific, and more likely to get an excellent result.

Rules:
- Keep the same section headers and the same order.
- Tighten vague wording into concrete instructions.
- If a detail is genuinely missing, write it as a [placeholder in square brackets] rather than inventing facts about the user.
- Do not add new sections. Do not pad.
- Return only the rewritten prompt. No preamble, no commentary, no code fences.

PROMPT:
${promptText}`
      );
      if (!text) throw new Error("empty");
      setSharpened(text);
      setTab("sharpened");
      setMsg(
        truncated
          ? { err: true, text: "The sharpened version was cut short. Trim your inputs and run it again." }
          : { err: false, text: "Sharpened. Compare it against the assembled version before you use it." }
      );
    } catch {
      setMsg({ err: true, text: "Sharpening failed. Try again in a moment." });
    }
    setBusy(null);
  };

  const rewrite = async () => {
    setBusy("rewrite");
    setNote(null);
    const menu = FRAMEWORKS.map(
      (f) => `${f.id}: ${f.name} (${f.full}) — ${f.best} Fields: ${f.fields.map((x) => x.k).join(", ")}`
    ).join("\n");
    try {
      const { text } = await callClaude(
        `You are a prompt engineer. A user wrote the rough request below. Pick the structure that fits it best, then split their request into that structure's fields, expanding thin answers into specific, usable instructions.

STRUCTURES:
${menu}

RULES:
- Use only field keys belonging to the structure you pick.
- Fill every field. Where the user didn't say, write a sensible specific default, or a [placeholder in square brackets] if it depends on facts only they know.
- Keep their meaning. Don't invent facts about their situation.
- Reply with raw JSON only, no code fences, in this exact shape:
{"framework":"<id>","values":{"<key>":"<text>"},"note":"<one short sentence on why this structure>"}

ROUGH REQUEST:
${rough}`
      );
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      const target = FRAMEWORKS.find((f) => f.id === parsed.framework);
      if (!target) throw new Error("unknown structure");
      const next = {};
      target.fields.forEach((f) => {
        if (typeof parsed.values?.[f.k] === "string") next[f.k] = parsed.values[f.k];
      });
      setValues((v) => ({ ...v, ...next }));
      setFwId(target.id);
      setSharpened("");
      setTab("assembled");
      setMode("build");
      setView("prompt");
      setNote({ err: false, text: parsed.note || "" });
    } catch {
      setNote({ err: true, text: "That didn't come back cleanly. Try again, or add a sentence about what you want back." });
    }
    setBusy(null);
  };

  const showCompose = view === "compose";

  const savedPanel = (
    <div className="pb-panel">
      <h1 className="pb-h1">Saved prompts</h1>
      {libState === "off" ? (
        <p className="pb-p" data-dim="1">
          Saving isn't available in this window. Copy your prompt out instead — everything else works as normal.
        </p>
      ) : libState === "loading" ? (
        <p className="pb-p" data-dim="1">Loading…</p>
      ) : lib.length === 0 ? (
        <p className="pb-p" data-dim="1">
          Nothing saved yet. Build a prompt you like, hit Save under it, and it waits here for you — next week or next
          month. Tap a title to rename it.
        </p>
      ) : (
        <>
          <p className="pb-p" data-dim="1">
            Open one to keep editing it, slots and all. Tap a title to rename it.
          </p>
          {lib.map((item) => {
            const f = FRAMEWORKS.find((x) => x.id === item.fwId);
            return (
              <div className="pb-card" key={item.id}>
                <div className="pb-cardtop">
                  <input
                    className="pb-title"
                    value={item.title}
                    aria-label="Prompt name"
                    onChange={(e) => renameSaved(item.id, e.target.value)}
                    onBlur={() => writeLibrary(lib)}
                  />
                  <span className="pb-meta">
                    {f ? f.name : "—"} · {stamp(item.savedAt)}
                  </span>
                </div>
                <div className="pb-preview">{item.text}</div>
                <div className="pb-row">
                  <button className="pb-sbtn" onClick={() => openSaved(item)}>Open</button>
                  <button className="pb-sbtn" onClick={() => copyText(item.text, item.id)}>
                    {copied === item.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    className="pb-sbtn"
                    data-danger="1"
                    onClick={() => (confirmId === item.id ? removeSaved(item.id) : setConfirmId(item.id))}
                    onBlur={() => setConfirmId(null)}
                  >
                    {confirmId === item.id ? "Tap again to delete" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  const helpPanel = (
    <div className="pb-panel">
      <h1 className="pb-h1">How this works</h1>
      <p className="pb-p">
        A prompt is just a request. Most weak ones fail for the same reason: they leave out something obvious to you and
        invisible to the model. The structures below are checklists that catch what you left out. None is smarter than
        the others — they each remind you of different things.
      </p>

      <div className="pb-sec">
        <div className="pb-sech">
          <span className="pb-label">Two ways in</span>
          <span className="pb-rule" />
        </div>
        <ol className="pb-steps">
          {hasAI && (
          <li className="pb-step">
            <strong>Fix what I wrote</strong> — type your request the way you'd normally type it, badly and all. It picks
            a structure, splits your words into the right slots, and fills the gaps. Start here if you're stuck.
          </li>
          )}
          <li className="pb-step">
            <strong>Build from scratch</strong> — pick a structure and fill the slots yourself. Every slot has a hint
            and a real example. Skip any that don't apply; blank slots are left out of the prompt.
          </li>
          <li className="pb-step">
            Read the prompt on the dark screen, then <strong>Copy</strong> it and paste it wherever you're working.
          </li>
        </ol>
      </div>

      <div className="pb-sec">
        <div className="pb-sech">
          <span className="pb-label">The eleven structures</span>
          <span className="pb-rule" />
        </div>
        {FRAMEWORKS.map((f) => (
          <div className="pb-def" key={f.id}>
            <div className="pb-defname">{f.name}</div>
            <div className="pb-deffull">{f.full}</div>
            <div className="pb-deftext">
              <em>{f.best}</em> {FRAMEWORK_NOTES[f.id]}
            </div>
          </div>
        ))}
      </div>

      <div className="pb-sec">
        <div className="pb-sech">
          <span className="pb-label">Add-ons</span>
          <span className="pb-rule" />
        </div>
        <p className="pb-p" data-dim="1">
          Extras that clip onto any structure. Toggle them on and they appear at the end of your prompt.
        </p>
        {ADDONS.map((a) => (
          <div className="pb-def" key={a.id}>
            <div className="pb-defname">{a.label}</div>
            <div className="pb-deftext" style={{ marginTop: 4 }}>{ADDON_NOTES[a.id]}</div>
          </div>
        ))}
      </div>

      <div className="pb-sec">
        <div className="pb-sech">
          <span className="pb-label">The rest of the panel</span>
          <span className="pb-rule" />
        </div>
        <div className="pb-def">
          <div className="pb-defname">Sharpen with AI</div>
          <div className="pb-deftext" style={{ marginTop: 4 }}>
            Takes your assembled prompt and tightens the vague parts. It won't invent facts about you — anything it
            can't know comes back as [a placeholder in square brackets] for you to fill. The Assembled and Sharpened
            tabs both stay, so you can compare before you trust it.
          </div>
        </div>
        <div className="pb-def">
          <div className="pb-defname">Saved prompts</div>
          <div className="pb-deftext" style={{ marginTop: 4 }}>
            Save keeps the whole thing — structure, every slot, add-ons — not just the text. Open one later and carry on
            editing. Saves stay on your account, private to you, and survive closing this window.
          </div>
        </div>
        <div className="pb-def">
          <div className="pb-defname">Slots carry over</div>
          <div className="pb-deftext" style={{ marginTop: 4 }}>
            Switch structures and matching slots come with you — what you wrote under Role stays under Role. Run one
            idea through RTF and CO-STAR and see which reads better.
          </div>
        </div>
        <div className="pb-def">
          <div className="pb-defname">The highlight</div>
          <div className="pb-deftext" style={{ marginTop: 4 }}>
            Tap into any slot and its block lights up on the screen, so you can see exactly which part of the prompt
            you're changing.
          </div>
        </div>
      </div>

      <div className="pb-sec">
        <div className="pb-sech">
          <span className="pb-label">Four habits that fix most prompts</span>
          <span className="pb-rule" />
        </div>
        <ol className="pb-steps">
          <li className="pb-step">
            <strong>Say who it's for.</strong> "Explain interest rates" and "explain interest rates to my dad, who ran a
            shop for 30 years" are different requests.
          </li>
          <li className="pb-step">
            <strong>Show what good looks like.</strong> One pasted example beats three sentences describing the style
            you want.
          </li>
          <li className="pb-step">
            <strong>Say what to leave out.</strong> No preamble, no summary at the end, no invented statistics — the
            boundaries slot earns its keep.
          </li>
          <li className="pb-step">
            <strong>Hand over the facts it can't guess.</strong> Numbers, constraints, what you already tried. A model
            can't ask your landlord how old the boiler is.
          </li>
        </ol>
      </div>
    </div>
  );

  return (
    <div className="pb">
      <style>{CSS}</style>

      <header className="pb-head">
        <div className="pb-headrow">
          <span className="pb-mark">Prompt Bench</span>
          <div className="pb-util">
            <button
              className="pb-ubtn"
              data-on={panel === "saved" ? "1" : "0"}
              onClick={() => setPanel(panel === "saved" ? null : "saved")}
            >
              Saved {lib.length > 0 && <span className="pb-badge">{lib.length}</span>}
            </button>
            <button
              className="pb-ubtn"
              data-on={panel === "help" ? "1" : "0"}
              onClick={() => setPanel(panel === "help" ? null : "help")}
            >
              Help
            </button>
          </div>
        </div>
        <span className="pb-sub">
          {panel === "saved"
            ? "Your prompts, kept between sessions."
            : panel === "help"
            ? "Every structure and feature, explained."
            : "Pick a structure, fill the slots, copy the prompt."}
        </span>
      </header>

      <div className="pb-wrap">
        {panel === "saved" ? savedPanel : panel === "help" ? helpPanel : (
        <>
        {hasAI && (
        <div className="pb-modes">
          <button className="pb-mode" data-on={mode === "build" ? "1" : "0"} onClick={() => setMode("build")}>
            Build from scratch
          </button>
          <button className="pb-mode" data-on={mode === "rewrite" ? "1" : "0"} onClick={() => setMode("rewrite")}>
            Fix what I wrote
          </button>
        </div>
        )}

        {mode === "rewrite" ? (
          <div style={{ maxWidth: 720 }}>
            <div className="pb-label" style={{ marginBottom: 8 }}>Your rough version</div>
            <div className="pb-box">
              <textarea
                className="pb-bigta"
                value={rough}
                onChange={(e) => setRough(e.target.value)}
                placeholder="Type it the way you'd normally type it. Messy is fine — that's the point.&#10;&#10;e.g. write something for my landlord about the boiler that keeps breaking, need it fixed properly this time not another patch job"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button className="pb-go" onClick={rewrite} disabled={!rough.trim() || busy === "rewrite"}>
                {busy === "rewrite" ? "Working…" : "Turn this into a prompt"}
              </button>
              <span className="pb-label">Picks a structure and fills it in</span>
            </div>
            {note && <div className="pb-note" data-err={note.err ? "1" : "0"}>{note.text}</div>}
          </div>
        ) : (
          <>
            <div className="pb-tabs">
              <button className="pb-tab" data-on={showCompose ? "1" : "0"} onClick={() => setView("compose")}>
                Compose
              </button>
              <button className="pb-tab" data-on={!showCompose ? "1" : "0"} onClick={() => setView("prompt")}>
                Prompt {segments.length > 0 && <span className="pb-led" />}
              </button>
            </div>

            <div className="pb-grid">
              {/* -------- compose column -------- */}
              <div className={showCompose ? "" : "pb-hide"}>
                <div className="pb-rack">
                  <button className="pb-rackbtn" onClick={() => setRackOpen(!rackOpen)} aria-expanded={rackOpen}>
                    <span>
                      <span className="pb-fw">{fw.name}</span>{" "}
                      <span className="pb-fwfull">{fw.full}</span>
                    </span>
                    <span className="pb-chev">{rackOpen ? "CLOSE ▲" : "CHANGE ▼"}</span>
                  </button>
                  {rackOpen && (
                    <div className="pb-list">
                      {FRAMEWORKS.map((f) => (
                        <button
                          key={f.id}
                          className="pb-item"
                          data-on={f.id === fwId ? "1" : "0"}
                          onClick={() => pickFramework(f.id)}
                        >
                          <span className="pb-iname">{f.name}</span>{" "}
                          <span className="pb-ifull">{f.full}</span>
                          <div className="pb-ibest">{f.best}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {note && !note.err && note.text && <div className="pb-note" style={{ marginBottom: 12 }}>{note.text}</div>}

                {fw.fields.map((f) => {
                  const v = values[f.k] || "";
                  const on = active === f.k;
                  return (
                    <div className="pb-slot" key={f.k} data-on={on ? "1" : "0"}>
                      <div className="pb-slothead">
                        <span className="pb-port" data-filled={v.trim() ? "1" : "0"} />
                        <span className="pb-slotname">{f.label}</span>
                        <span className="pb-hint">{f.hint}</span>
                      </div>
                      <textarea
                        className="pb-ta"
                        rows={2}
                        value={v}
                        placeholder={f.ph}
                        onFocus={() => setActive(f.k)}
                        onBlur={() => setActive(null)}
                        onChange={(e) => setValues({ ...values, [f.k]: e.target.value })}
                      />
                    </div>
                  );
                })}

                <div className="pb-addhead">
                  <span className="pb-label">Add-ons</span>
                  <span className="pb-rule" />
                </div>
                <div className="pb-chips">
                  {ADDONS.map((a) => (
                    <button
                      key={a.id}
                      className="pb-chip"
                      data-on={addons[a.id] ? "1" : "0"}
                      onClick={() => setAddons({ ...addons, [a.id]: !addons[a.id] })}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                {ADDONS.filter((a) => addons[a.id] && a.field).map((a) => (
                  <div className="pb-slot" key={a.id} data-on={active === a.id ? "1" : "0"} style={{ marginTop: 10 }}>
                    <div className="pb-slothead">
                      <span className="pb-port" data-filled={(addonValues[a.id] || "").trim() ? "1" : "0"} />
                      <span className="pb-slotname">{a.label}</span>
                      <span className="pb-hint">{a.field.hint}</span>
                    </div>
                    <textarea
                      className="pb-ta"
                      rows={2}
                      value={addonValues[a.id] || ""}
                      placeholder={a.field.ph}
                      onFocus={() => setActive(a.id)}
                      onBlur={() => setActive(null)}
                      onChange={(e) => setAddonValues({ ...addonValues, [a.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              {/* -------- screen column -------- */}
              <div className={showCompose ? "pb-hide" : ""}>
                <div className="pb-screen">
                  <div className="pb-scrhead">
                    <span className="pb-label">Your prompt</span>
                    <span className="pb-count">
                      {filled}/{fw.fields.length} SLOTS · {words} WORDS
                    </span>
                  </div>
                  <div className="pb-scrtabs">
                    <button className="pb-scrtab" data-on={tab === "assembled" ? "1" : "0"} onClick={() => setTab("assembled")}>
                      Assembled
                    </button>
                    <button
                      className="pb-scrtab"
                      data-on={tab === "sharpened" ? "1" : "0"}
                      disabled={!sharpened}
                      onClick={() => setTab("sharpened")}
                    >
                      Sharpened
                    </button>
                  </div>

                  <div className="pb-body">
                    {tab === "sharpened" && sharpened ? (
                      <div className="pb-segb">{sharpened}</div>
                    ) : segments.length === 0 ? (
                      <p className="pb-empty">
                        Empty for now. Fill a slot on the left and it lands here, section by section. Nothing is required —
                        skip anything that doesn't apply.
                      </p>
                    ) : (
                      segments.map((s) => (
                        <div className="pb-seg" key={s.id} data-on={active === s.id ? "1" : "0"}>
                          <div className="pb-segl">{isXml ? `<${tagify(s.label)}>` : s.label}</div>
                          <div className="pb-segb">{s.body}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {msg && <div className="pb-msg" data-err={msg.err ? "1" : "0"}>{msg.text}</div>}

                  <div className="pb-scrfoot">
                    <button
                      className="pb-btn"
                      data-primary="1"
                      onClick={() => copyText(shown, "main")}
                      disabled={!shown.trim()}
                    >
                      {copied === "main" ? "Copied" : "Copy prompt"}
                    </button>
                    {hasAI && (
                    <button
                      className={busy === "sharpen" ? "pb-btn pb-working" : "pb-btn"}
                      onClick={sharpen}
                      disabled={!promptText.trim() || busy === "sharpen"}
                    >
                      {busy === "sharpen" ? "Sharpening…" : "Sharpen with AI"}
                    </button>
                    )}
                    <button className="pb-btn" onClick={saveCurrent} disabled={!shown.trim() || libState === "off"}>
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <p className="pb-foot">
          The eleven structures are the checklists prompt engineers actually use — RTF, CO-STAR, CRISPE, RISEN and the
          rest. What you type carries over when you switch, so you can try one idea in two structures and see which
          reads better. Help explains each of them.
        </p>
        </>
        )}
      </div>
    </div>
  );
}
