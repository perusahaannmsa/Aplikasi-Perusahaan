# Running this project on Replit

- This is the imported React/Vite frontend with an Express server. Install dependencies with `npm ci`.
- Use the **Start application** workflow (command: `PORT=5000 npm run dev`) to run the app in the Replit web preview. For a local shell, run `PORT=5000 npm run dev`.
- Publishing is configured to run `npm run dev` directly, so this project does not require a separate build or `npm run start` step. The published VM still needs to be republished after configuration changes.
- `npm run build` produces the production bundle; `npm run start` serves it after building.
- Railway uses `railway.json`: it runs `npm run build`, then `npm run start`, and checks `/api/health`. Replit and Railway intentionally use separate run configurations.
- Configure optional credentials through Replit Secrets rather than committing `.env` files. See `.env.example` for the environment variable names. `GEMINI_API_KEY` is required for AI endpoints; Google service account variables are needed for related Google features.
- The frontend reads `VITE_FIREBASE_*` settings when provided, but otherwise falls back to a Firebase project configuration already embedded in the imported source. Treat that project as potentially live: do not modify its data unless you intend to.