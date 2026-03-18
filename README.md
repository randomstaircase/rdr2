# 🤠 RDR2 Tracker

A personal Red Dead Redemption 2 achievement, compendium, and challenge tracker — styled in the game's iconic Outlaw palette. Lives on GitHub Pages, syncs across devices via the GitHub API.

---

## Features

- **Achievements** — all 52, grouped by category
- **Compendium** — Animals, Plants, Fish, Horses, Weapons, Gang Hideouts
- **Crafting** — Pearson (camp) and Trapper (legendary gear) requirements
- **Challenges** — all 9 challenge sets (Bandit, Explorer, Herbalist, Horseman, Hunter, Master Hunter, Sharpshooter, Survivalist, Treasure Hunter)
- **Story Progress** — all chapters, Prologue through Epilogue Part II
- **Named Playthroughs** — create and name multiple runs, switch between them
- **GitHub sync** — `data.json` is your source of truth, auto-saved to your repo
- **Export CSV** — download your current playthrough as a spreadsheet
- **Import CSV** — restore or migrate from a CSV file

---

## Setup

### 1. Fork or clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/rdr2-tracker.git
```

### 2. Enable GitHub Pages

In your repo settings → **Pages** → Source: `main` branch, `/ (root)`.

Your dashboard will be live at:
```
https://YOUR_USERNAME.github.io/rdr2-tracker/
```

### 3. Create a Personal Access Token (PAT)

1. Go to [GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a name like `rdr2-tracker`
4. Check the `repo` scope (full control of private repositories) — or just `public_repo` if your repo is public
5. Copy the token (starts with `ghp_`)

### 4. Configure the dashboard

1. Open your tracker in a browser
2. Click **⚙ Settings** in the top bar
3. Enter:
   - **GitHub Repo**: `your-username/rdr2-tracker`
   - **Branch**: `main`
   - **Personal Access Token**: `ghp_...`
4. Click **Sync Now** to test the connection

Your settings are saved in `localStorage` — you only need to do this once per device/browser.

---

## Multi-device Usage

Because data lives in `data.json` on GitHub:
- Open the dashboard on any device
- Enter your repo + token in Settings once per device
- All playthroughs and progress sync automatically

---

## Playthroughs

- Click **+ New** to create a named playthrough (e.g. "Honorable Arthur", "100% Run")
- Use the dropdown to switch between playthroughs
- Each playthrough's data is stored separately in `data.json`

---

## Export / Import

- **↓ Export** — downloads a `.csv` of the current playthrough (all sections, Yes/No completion)
- **↑ Import** — loads a `.csv` back in, restoring progress (and creates the playthrough if it doesn't exist)

The CSV format is:
```
Playthrough, Section, Item, Completed
"My Run", "Achievement", "Zoologist", "Yes"
"My Run", "Compendium - Animals", "Alligator", "No"
```

---

## File Structure

```
rdr2-tracker/
├── index.html   # The full dashboard (single file)
├── data.json    # Your progress data (auto-managed, don't edit manually)
└── README.md
```

---

## Notes

- The PAT is stored only in your browser's `localStorage` — it is never committed to the repo
- Changes are auto-synced to GitHub ~3 seconds after you make them
- If two devices edit at the same time, the last write wins — avoid concurrent editing
