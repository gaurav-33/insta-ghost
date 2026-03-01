# 👻 InstaGhost — Chrome Extension

A powerful Chrome extension to automatically remove Instagram followers in bulk — directly from your official Instagram data export, **no copy-pasting required**.

---

## 📋 Table of Contents

- [Features](#features)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [How to Export Your Instagram Data](#how-to-export-your-instagram-data)
- [How to Use the Extension](#how-to-use-the-extension)
- [Removing Specific Followers](#removing-specific-followers)
- [FAQ & Troubleshooting](#faq--troubleshooting)

---

## ✅ Features

- 📂 **Direct JSON File Upload** — Upload multiple Instagram data files at once; no copy-pasting.
- 🛡️ **Safe List Support** — Upload your "Following" list to protect mutual follows from removal.
- 🎯 **Smart Targeting** — Only removes users in your Followers list who are **not** in your Following list (i.e., non-mutuals).
- ⏸️ **Pause / Resume / Stop** — Full control over the automation process at any time.
- 🧪 **Scroll Test** — Verify the bot can scroll the followers list before you start.
- 👆 **Manual Container Selector** — Click any element to help the bot identify the correct scrollable container if auto-detection fails.
- 🪵 **Live Log Console** — Real-time activity log right within the floating widget.

---

## 📁 Folder Structure

```
insta_extension/
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── content.js       ← Main extension logic
├── manifest.json    ← Chrome extension manifest
└── README.md        ← This file
```

---

## 🚀 Installation

> **Note:** This extension is a local/developer extension and is not published on the Chrome Web Store.

1. **Clone or download** this folder to your computer.

2. Open **Google Chrome** and navigate to:
   ```
   chrome://extensions/
   ```

3. In the top-right corner, turn on **Developer mode**.

4. Click the **"Load unpacked"** button (top-left).

5. Select the `insta_extension` folder on your computer.

6. The extension is now installed! You'll see the icon in your Chrome toolbar.

7. Open [instagram.com](https://www.instagram.com/) — the InstaRemover widget will automatically appear on the page.

---

## ⚙️ Configuration

You can adjust the behavior of the bot by editing the `CONFIG` object at the top of `content.js`:

| Property | Default | Description |
|---|---|---|
| `DELAY_BETWEEN_REMOVALS` | `2000` ms | Wait time between removal actions. Increase this to be safer. |
| `DELAY_AFTER_CONFIRMATION` | `5000` ms | Wait time after confirming a removal dialog. |
| `SCROLL_INTERVAL` | `3000` ms | How long to wait after scrolling for new followers to load. |
| `SCROLL_INCREMENT` | `800` px | How many pixels to scroll down at a time. |
| `MAX_FOLLOWERS` | `1000` | Maximum number of followers to process if no target list is loaded. |
| `MAX_RETRIES` | `3` | Number of retry attempts on failure. |

> **Recommendation:** Keep delays on the higher end (2000ms+) to avoid triggering Instagram's rate limiting or temporary action blocks.

---

## 📦 How to Export Your Instagram Data

To get the follower and following JSON files from Instagram, you must request a **data export** from Instagram. Here's the step-by-step process:

### Step 1: Request Your Data from Instagram

1. Open the **Instagram app** (mobile) or [instagram.com](https://www.instagram.com/) on desktop.
2. Go to your **Profile** → tap the **☰ Menu** (top right).
3. Tap **"Your activity"** → **"Download your information"**.
   - *On Desktop:* Settings → **"Your activity"** → **"Download or transfer information"**
4. Select **"Some of your information"** and check only:
   - ✅ **Followers and following**
5. Tap **Next** → Select **"Download to device"**.
6. Set the **Date range** to "All time".
7. Set **Format** to **JSON** *(very important — do NOT select HTML)*.
8. Set **Media quality** to "Low" (since we only need JSON, not photos).
9. Tap **"Create files"** and wait for an email from Instagram (usually takes a few minutes to a few hours).

### Step 2: Download & Extract the File

1. Check your email for a link from Instagram.
2. Click the link, log in, and download the `.zip` file.
3. **Extract** the zip file on your computer.
4. Navigate to the folder: `your_instagram_activity/connections/followers_and_following/`

### Step 3: Locate the JSON Files

Inside the `followers_and_following` folder, you'll find files like:

| File | Use In Extension |
|---|---|
| `followers_1.json`, `followers_2.json`, ... | **Target Followers** (people to remove) |
| `following.json` | **Safe List** (people to protect) |

> **Note:** If you have many followers, Instagram will split the list across multiple files (`followers_1.json`, `followers_2.json`, etc.). The extension supports uploading **all of them at once**.

---

## 🕹️ How to Use the Extension

1. **Open Instagram** in Chrome and go to your **profile page**.
2. Click **"Followers"** to open the followers list popup/dialog.
3. The **InstaRemover widget** should be visible on screen (drag it if needed).

### Step 1 — Upload Your Data
1. Click the **"📂 Upload JSON Data"** button.
2. In the **"Target Followers JSON files"** section:
   - Click the file picker and select all your `followers_1.json`, `followers_2.json`, etc. files. *You can select multiple at once.*
3. In the **"Safe List (Following) JSON files"** section:
   - Click the file picker and select `following.json`.
4. Click **"Process Uploads"**.
5. The widget will now show **"Data Loaded (X Targets)"** and the log will show a breakdown.

### Step 2 — Select the Scroll Container
1. Click **"👆 Select Container"**.
2. Move your mouse over the **scrollable area of the followers popup** (the list of names).
3. **Click** on it. A green border will flash briefly to confirm selection.

### Step 3 — Test Scroll
1. Click **"⬇️ Test Scroll"** to verify the bot can scroll the list.
2. If the log says "✅ Scroll successful!" you're good to go.

### Step 4 — Start
1. Click **"▶ Start"**.
2. The bot will process each follower, click Remove, confirm the dialog, and move to the next.
3. Use **"⏸ Pause"** to pause at any time, and **"⏹ Stop"** to fully stop.

---

## 🎯 Removing Specific Followers

If you only want to remove a **specific subset** of followers (e.g., fake accounts, old followers, etc.), you can create a custom target list.

### Method: Manual Custom JSON File

Create a JSON file in the same format as Instagram's `followers_1.json`. Here's a template:

```json
[
  {
    "string_list_data": [
      {
        "value": "username_to_remove_1",
        "timestamp": 1700000000
      }
    ]
  },
  {
    "string_list_data": [
      {
        "value": "username_to_remove_2",
        "timestamp": 1700000000
      }
    ]
  }
]
```

Replace `username_to_remove_1` and `username_to_remove_2` with the actual Instagram usernames. Save this as a `.json` file and upload it as the **"Target Followers"** in the extension. Leave the Safe List empty to remove all users in the file.

---

## ❓ FAQ & Troubleshooting

**Q: The widget doesn't appear on Instagram.**
> Make sure the extension is loaded and enabled in `chrome://extensions/`. Try refreshing the Instagram page.

**Q: The bot says "No scrollable list found."**
> Open the Followers popup on Instagram *before* clicking Start. If that doesn't fix it, use the **"👆 Select Container"** button to manually pick the list element.

**Q: The bot gets stuck or stops early.**
> Instagram may have loaded all followers. Check the log. It may also be a rate-limiting issue — try increasing `DELAY_AFTER_CONFIRMATION` to `7000`ms in `content.js`.

**Q: A follower was not removed even though they're in my list.**
> The confirmation dialog may not have appeared in time. Increase `DELAY_BETWEEN_REMOVALS` in the config.

**Q: Will this get my account banned?**
> Automating actions on Instagram always carries some risk. Use reasonable delays, don't remove thousands of followers in one session, and take breaks. The default delays are tuned to be safe for typical usage.

---

## 🏷️ Tags

`instagram` `chrome-extension` `unfollow-bot` `instagram-automation` `follower-remover` `instagram-tools` `javascript` `browser-extension` `instagram-unfollower` `non-followers` `bulk-remove` `instagram-data-export`

---

## 📜 License

This tool is for **personal use only**. Use responsibly and at your own risk. This project is not affiliated with or endorsed by Instagram/Meta.
