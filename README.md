# Men's Dart Night

A dart tournament app with multiple bracket formats: single/double/triple elimination, round robin, compass draw, and ladder.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In your repo: **Settings → Pages**
   - Source: **GitHub Actions**
3. Push to `main` or `master` — the workflow will build and deploy automatically.

The app will be live at `https://<username>.github.io/<repo-name>/`.

### If `git push` fails (401 / “Missing or invalid credentials” / Cursor askpass)

That usually means **HTTPS credentials are wrong or expired**. Easiest fix: this repo’s `origin` is set to **SSH** so Git talks to GitHub with your SSH key instead of Cursor’s HTTPS helper.

1. [Add an SSH key to GitHub](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) if you haven’t already.
2. Test: `ssh -T git@github.com` (should say “Hi username!”).
3. Push: `git push origin main`.

If you must use **HTTPS**, run `gh auth login` in Terminal (or create a [PAT](https://github.com/settings/tokens) and use it when Git asks for a password). You may need to remove stale GitHub entries in **Keychain Access** (search “github”) after a 401.

### If `git push` fails (HTTPS / “could not read Username”)

GitHub no longer accepts account passwords over HTTPS. Use one of these:

1. **SSH (recommended)** — [Add an SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) to your GitHub account, then point the remote at SSH and push:

   ```bash
   git remote set-url origin git@github.com:kevaughnw/victory-dart-night.git
   git push origin main
   ```

2. **HTTPS + Personal Access Token** — Create a [fine-grained or classic PAT](https://github.com/settings/tokens) with `repo` scope. When Git asks for a password, paste the token.

3. **GitHub CLI** — `brew install gh` then `gh auth login` and follow the prompts; it configures Git credentials for you.
