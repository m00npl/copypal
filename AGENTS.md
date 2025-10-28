# Repository Guidelines

## Project Structure & Module Organization
CopyPal ships as a Bun API (`backend/`) and a Vite React client (`frontend/`). Core handlers live in `backend/src`; built JS goes to `backend/dist`. UI primitives sit under `frontend/src/components`, hooks under `frontend/src/hooks`, styles in `frontend/src/styles` and `index.css`. Agent orchestration assets stay in `coordination/`; runtime transcripts in `memory/`. Use `docker-compose.yml` to launch services together; `nginx-copypal.conf` mirrors the production proxy.

## Build, Test, and Development Commands
Install dependencies with `bun install` in `backend/` and `frontend/`. Run the API via `bun run dev`; compile with `bun run build`; start the bundled server using `bun run start`. The client mirrors those commands (`bun run dev`, `bun run build`, `bun run preview`). To exercise the full stack, run `docker compose up -d` from the repo root and inspect logs with `docker compose logs -f`.

## Coding Style & Naming Conventions
Both packages use TypeScript, ES modules, and two-space indentation. Prefer `camelCase` for functions and variables, `PascalCase` for React components, and `UPPER_SNAKE_CASE` for constants. Import client modules with the `@/` alias instead of deep relative paths. Run `bun run lint` and `bun run typecheck` before opening a PR; ESLint plus the TypeScript compiler enforce consistent formatting and safe typing.

## Testing Guidelines
Automated tests are not yet in place, so accompany new work with them. The backend can rely on Bun’s built-in test runner (`bun test path/to/file.test.ts`), keeping specs beside the source in `backend/src`. Frontend contributors should add Vitest (`npx vitest run`) and name files `*.test.tsx`. Target coverage for API validators, blockchain adapters, and custom hooks, and keep Docker-based smoke runs (`docker compose up`) in your checklist until suites mature.

## Commit & Pull Request Guidelines
Commits follow an imperative, one-line style (“Add file upload support”). Keep each commit scoped to a single concern and mention ticket IDs when relevant. Pull requests must state the problem, solution highlights, and verification steps; attach UI screenshots or terminal output when behaviour changes. Flag environment, schema, or migration impacts so reviewers can plan deployments.

## Security & Configuration Tips
Populate `.env` files from the provided templates and never commit secrets. Rotate SendGrid and blockchain keys periodically and verify `BASE_URL` and CORS settings before shipping builds. If you share data from `memory/` or coordination traces, scrub user content first. When editing nginx or API routing, confirm HTTPS termination and rate limits remain in place.
