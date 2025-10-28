# Komendy testowe dla różnych rozmiarów plików

## Utworzone pliki testowe

```bash
# Utworzenie plików testowych o różnych rozmiarach
dd if=/dev/urandom of=/tmp/test_rate_limit.bin bs=1024 count=512     # 512KB
dd if=/dev/urandom of=/tmp/test_1mb_optimized.bin bs=1024 count=1024 # 1MB
dd if=/dev/urandom of=/tmp/test_1mb_final.bin bs=1024 count=1024     # 1MB
```

## Komendy dla plików ≤512KB (działają)

### 1. Upload bezpośrednio do FilesDB (SUKCES)
```bash
curl -X POST "https://upload.filedb.online/files" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/tmp/test_rate_limit.bin" \
  -F "ttlDays=1"
```

**Wynik:** ✅ Sukces w ~11 sekund
```json
{"file_id":"924f78be-508d-4472-8efe-964481e9ab18","message":"Upload successful"}
```

### 2. Upload przez CopyPal API (NIEPOPRAWNY FORMAT)
```bash
curl -X POST "https://copypal.online/api/v1/clipboard" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"file\",
    \"filename\": \"test_rate_limit.bin\",
    \"data\": \"$(base64 -i /tmp/test_rate_limit.bin)\",
    \"ttlDays\": 1
  }"
```

**Wynik:** ❌ Błąd walidacji - niepoprawny format API
```json
{"error":"Failed to store in FileDB: [{\"code\":\"invalid_type\",\"expected\":\"string\",\"received\":\"undefined\",\"path\":[\"content\"],\"message\":\"Required\"}]","success":false}
```

### 3. Upload przez CopyPal API (POPRAWNY FORMAT - TIMEOUT)
```bash
curl -X POST "https://copypal.online/api/v1/clipboard" \
  -H "Content-Type: application/json" \
  -d "{
    \"kind\": \"file\",
    \"content\": \"test upload\",
    \"fileName\": \"test_small.bin\",
    \"fileData\": \"$(base64 -i /tmp/test_rate_limit.bin)\",
    \"ttlDays\": 1
  }"
```

**Wynik:** ❌ Timeout Error 524 przez Cloudflare po ~100 sekundach

## Komendy dla plików 1MB (nie działają)

### 1. Upload bezpośrednio do FilesDB (BŁĄD SERWERA)
```bash
time curl -X POST "https://upload.filedb.online/files" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/tmp/test_1mb_optimized.bin" \
  -F "ttlDays=1"
```

**Wynik:** ❌ Internal server error po ~3 minutach
```json
{"error":"Internal server error"}
```

### 2. Upload bezpośrednio do FilesDB (ALTERNATYWNY PLIK - BŁĄD SERWERA)
```bash
time curl -X POST "https://upload.filedb.online/files" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/tmp/test_1mb_final.bin" \
  -F "ttlDays=1"
```

**Wynik:** ❌ Internal server error po ~3 minutach
```json
{"error":"Internal server error"}
```

## Różnice w schemacie API

### CopyPal API Schema (poprawne pola):
```json
{
  "kind": "file",          // NIE "type"
  "content": "string",     // Wymagane nawet dla plików
  "fileName": "string",
  "fileData": "base64",    // NIE "data"
  "ttlDays": number
}
```

### FilesDB API Schema:
```bash
-F "file=@path/to/file"   # Multipart form-data
-F "ttlDays=number"
```

## Podsumowanie wydajności

| Rozmiar pliku | FilesDB bezpośrednio | CopyPal API |
|---------------|---------------------|-------------|
| ≤512KB        | ✅ ~11s             | ❌ Timeout  |
| 1MB+          | ❌ Internal error   | ❌ Timeout  |

## Przyczyny problemów

1. **Pliki 1MB+**: FilesDB ma problemy z większymi plikami (internal server error)
2. **CopyPal Timeout**: Cloudflare timeout (~100s) uniemożliwia duże uploady przez web API
3. **Schema Validation**: CopyPal wymaga poprawnego formatu JSON z właściwymi nazwami pól

## WebSocket Progress Tracking

System WebSocket działa poprawnie dla plików które przechodzą przez API:
- Real-time tracking chunków (32KB każdy)
- Monitoring statusu blockchain upload
- Dual progress bar (User→CopyPal, CopyPal→Arkiv)
- Automatyczne reconnection z exponential backoff