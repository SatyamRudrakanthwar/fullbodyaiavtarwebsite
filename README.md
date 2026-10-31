# Avatar Guide

A full-body 3D AI avatar that lives on your web page. It talks with visitors by voice or text, answers from the page's content, walks over to point at things, gives guided tours, and helps fill in forms. It never types or submits anything without the visitor's permission.

## 1. Run the avatar server

The server answers the avatar's questions and hosts the widget files. You need Node 18+ and one AI key. [Groq](https://console.groq.com/keys) is free.

```bash
npm install
cp .env.example .env      # add one key, e.g. GROQ_API_KEY=gsk_...
npm run build
npm start                 # http://localhost:8787
```

It serves three things the page will use:

| URL | What it is |
|---|---|
| `/avatar-guide.js` | The widget (one file, no dependencies) |
| `/models/avatar.vrm` | The 3D character |
| `/api/chat` | The AI endpoint |

To make it public, deploy the same folder to any Node host (Render, Railway, a VPS, etc.).

## 2. Add one line to your page

Paste this before `</body>`:

```html
<script src="https://YOUR-SERVER/avatar-guide.js" defer></script>
```

That's all. On load, the avatar reads the page, walks in and offers to help.
See it working on a page that has nothing to do with the demo: run the server and open **http://localhost:8787/embed-example.html**.

### Options

Add these as attributes on the same `<script>` tag:

| Attribute | Default | Example |
|---|---|---|
| `data-name` | `Ava` | `data-name="Max"` |
| `data-accent` | `#6d4aff` | `data-accent="#2f6b3a"` (brand colour) |
| `data-api` | the script's server | `data-api="https://api.example.com"` |
| `data-model` | bundled avatar | `data-model="https://cdn.example.com/me.vrm"` (any VRM model) |
| `data-auto-start` | `true` | `false` = don't walk in and greet on load |

### Controlling it from JavaScript (optional)

```html
<script src="https://YOUR-SERVER/avatar-guide.js" data-manual></script>
<script>
  const guide = AvatarGuide.init({ name: "Ava", accent: "#0a7cff" });
  document.querySelector("#help-btn").onclick = () =>
    guide.handleUserInput("Help me fill in the signup form");
</script>
```

## 3. Tips for best results

The avatar works on any page as-is. These make it smarter:

- **Use semantic HTML.** Use `<section>` with headings, and `<label for="...">` on every form field. Hints linked with `aria-describedby` are read as field help.
- **Give key elements an `id`** (`id="pricing"`, `id="email"`) so pointing is precise.
- **`data-ag-section`** marks a custom container as a page section.
- **`data-ag-ignore`** hides an element from the avatar completely.
- **Match your theme** with CSS variables:
  ```css
  html #ag-root { --ag-accent: #7c5cff; --ag-surface: #211f3a; --ag-ink: #eceaf7; }
  ```

Content changes (new prices, opened panels, form errors) are picked up automatically. There is nothing to re-index.

## Troubleshooting

| Problem | Fix |
|---|---|
| Avatar says it "can't reach my AI service" | Check that the server is running and `.env` has a valid key. The server log shows the exact error |
| Embedded on another domain and requests fail | Set `ALLOWED_ORIGINS=https://your-site.com` in the server's `.env` |
| No voice | Click the page once (browsers block audio until then); use Chrome or Edge for the microphone |
| Free-tier "rate limit" messages | Wait a few seconds between questions, or use a paid key |

## More

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture diagram, how a question flows, where each file sits
- [docs/DETAILS.md](docs/DETAILS.md): demo script, design decisions, all settings
- Local development with live reload: `npm run dev`, then open http://localhost:5173

**Credits:** avatar model `VRM1_Constraint_Twist_Sample` by pixiv Inc. ([three-vrm](https://github.com/pixiv/three-vrm), redistribution and commercial use allowed). Built with [three.js](https://threejs.org) and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm).
