# Releasing Maestro (Windows)

The installer is built by GitHub Actions (free for public repos) and published as a GitHub Release.
Installed copies check that release when they start, download a new version in the background and
install it when you close Maestro (or straight away with "Restart and update").

**Nothing secret to set up**: the workflow uses the token GitHub gives every run automatically
(`GITHUB_TOKEN`). No passwords, no keys, no repository secrets.

## One-time setup

1. On GitHub create a **public** repository named exactly **`khaleds-maestro`** (empty: no README).
   (Another name? Change `repo` under `build.publish` in `package.json` to match.)
2. In `D:\khaleds_music_app`:

   ```powershell
   git init
   git add .
   git commit -m "Maestro 0.9.0"
   git branch -M main
   git remote add origin https://github.com/khaledalazzeh2006/khaleds-maestro.git
   git push -u origin main
   ```

   The first push is ~170 MB because the sound library is part of the project; later pushes are small.

## Every release

```powershell
npm run set-version 1.0.0
git commit -am "release: v1.0.0"
git tag v1.0.0
git push
git push --tags
```

Then open the repository's **Actions** tab: the `release` run takes about 10 minutes. When it is green,
**Releases** has `Maestro-Setup-1.0.0.exe` (plus `latest.yml`, which the app reads to find updates).
The tag and the version in `package.json` must be the same number.

## Build an installer on your own PC (no GitHub)

```powershell
npm run dist
```

The installer appears in `release\Maestro-Setup-<version>.exe`. (It does not publish anything.)

## Good to know

- **Windows SmartScreen** says "Windows protected your PC" because the installer is not code-signed
  (certificates cost money): click **More info → Run anyway**. Updates still work.
- The installer is per-user (no admin needed); you can choose the folder; it adds Start-menu and desktop
  shortcuts and opens `.maestro` files with Maestro when double-clicked.
- Your pieces and settings stay when you update or uninstall.
- If a release run fails, open it in Actions: the red step shows the error.
