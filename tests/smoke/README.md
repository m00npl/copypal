# Smoke Tests

Podstawowe testy sprawdzające czy aplikacja działa poprawnie.

## Uruchamianie testów

### Lokalnie (z działającymi kontenerami)

```bash
# Wszystkie testy
bun test:smoke

# Tylko backend
bun test:smoke:backend

# Tylko frontend
bun test:smoke:frontend

# Tylko integracja
bun test:smoke:integration
```

### Produkcja

```bash
# Wszystkie testy na produkcji
bun test:smoke:production
```

### Własne środowisko

```bash
API_BASE=https://custom.example.com/api FRONTEND_URL=https://custom.example.com bun test tests/smoke/*.test.ts
```

## Struktura testów

- **backend.test.ts** - Testy API backendu
  - Health endpoint
  - CORS
  - Tworzenie clipboard
  - Autoryzacja
  - WebSocket
  - FilesDB v2

- **frontend.test.ts** - Testy frontendu
  - Ładowanie strony
  - Static assets
  - Manifest i service worker
  - Ikony
  - SPA routing

- **integration.test.ts** - Testy integracyjne
  - End-to-end flow tworzenia i pobierania clipboard
  - Flow autoryzacji
  - Upload i progress tracking
  - GlitchTip
  - CORS między frontend i backend

## Wymagania

- Bun runtime
- Działające instancje backend i frontend (lokalnie lub zdalnie)

## CI/CD

Testy można dodać do GitHub Actions:

```yaml
- name: Run smoke tests
  run: |
    bun test:smoke:production
```
