# Glide

**Turn any web app into a natural language interface.**

Glide is a Chrome extension that lets users automate web app actions by typing natural language commands. Powered by Gemini, it parses commands like *"add farmer Jane Wambui from Kericho"* or *"rekodi delivery ya James Mwangi, kilo 200, grade A"* — then navigates, fills forms, and submits automatically.

No code changes required in the target app. Just generate a manifest and drop it in.

## How It Works

```
1. Scan    → Glide scans the app's DOM to detect forms, fields, and navigation
2. Enhance → Gemini enriches the scan into a semantic manifest
3. Type    → Users type commands in any language
4. Execute → Gemini parses intent + entities, Ghost Navigator automates the UI
```

### The Manifest

A manifest is a structured JSON file that describes an app's navigation, forms, and fields. It's the contract between the app and the AI — no screenshots, no guessing.

```json
{
  "actions": {
    "add-farmer": {
      "route": "farmers",
      "trigger": { "selector": "button.btn-primary", "type": "click" },
      "form": {
        "full_name": {
          "selector": "label:Full Name",
          "type": "text",
          "semantic": ["name", "called", "named"]
        }
      }
    }
  }
}
```

Any developer can generate one in minutes using the built-in manifest generator.

## Features

- **Natural language commands** — type what you want, Gemini handles the rest
- **Multilingual** — English, Swahili, and any language Gemini supports
- **Create, Update, Delete** — full CRUD via natural language
- **Ghost Navigator** — visual automation with highlighted elements and character-by-character typing
- **Fuzzy matching** — handles typos, plurals, and language variations in dropdown selection
- **Zero code changes** — works with any web app via a manifest file
- **Manifest generator** — scan any app and generate a manifest automatically
- **Cross-page navigation** — handles SPA route changes with execution state hand-off
- **Cancellable** — stop execution mid-flight at any step

## Gemini Integration

Glide uses the Gemini API in two critical ways:

1. **Manifest Enhancement** — After the DOM scanner produces a raw manifest, Gemini enriches it with semantic hints, multilingual keywords, and field descriptions
2. **Command Parsing** — Every user command is sent to Gemini with the full manifest as `systemInstruction`. Gemini extracts entities and returns a structured execution plan using `responseMimeType: 'application/json'`

**Gemini 3 features used:**
- `systemInstruction` for passing manifest context
- JSON response mode for guaranteed valid structured outputs
- Low temperature (0.1) for deterministic parsing
- Native multilingual support (English + Swahili code-switching)

## Getting Started

### Prerequisites

- Node.js 18+
- A Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Install & Build

```bash
git clone https://github.com/YOUR_USERNAME/glide.git
cd glide
npm install
npm run build
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Try It

1. Open any Glide-enabled web app (one with a `glide.manifest.json` in its public folder)
2. Click the Glide extension icon
3. Enter your Gemini API key in settings
4. Type a command and go

### Glide-Enable Any App

1. Open the app in Chrome
2. Click Glide → **Generate Manifest**
3. Scan → Generate Draft → Enhance with AI → Download
4. Place `glide.manifest.json` in the app's `public/` folder
5. Refresh the page — Glide is ready

## Architecture

```
glide/
├── src/
│   ├── background/      # Service worker — Gemini API calls, manifest enhancement
│   ├── content/          # Content script — DOM scanner, Ghost Navigator, execution engine
│   ├── popup/            # React UI — command input, confirmation, manifest generator
│   ├── shared/           # Constants, i18n, cancellation tokens
│   └── types/            # TypeScript types for manifest, execution plans
├── manifest.json         # Chrome Extension Manifest V3
└── vite.config.ts        # Build config (modulePreload: false for service worker safety)
```

## Tech Stack

- **Extension:** Chrome Manifest V3
- **UI:** React 18, Zustand, TypeScript
- **AI:** Gemini 3 Flash (with Pro fallback)
- **Build:** Vite

## License

MIT
