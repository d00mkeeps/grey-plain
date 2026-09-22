# Brain Knowledge Base API Reference

> *Auto-generated on every push via GitHub Actions. Do not edit manually.*  
> **Last Generated:** 2026-09-22 09:57:33 UTC  
> **Total Endpoints:** 3

## Endpoints Summary

| Method | Endpoint | Handler | Source File | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | [`/chat`](#chat-post) | `chat()` | `cognitive-trajectory/server/stub_api.py:176` | Stream chat response with activation data. |
| `POST` | [`/replay`](#replay-post) | `replay()` | `cognitive-trajectory/server/stub_api.py:229` | Process a completed conversation and return full enriched data |
| `POST` | [`/save`](#save-post) | `save_conversation()` | `cognitive-trajectory/server/save_api.py:21` | No description provided. |

---

## Endpoint Details

### `POST /chat`
**Handler:** `chat()` (`cognitive-trajectory/server/stub_api.py:176`)  
**Description:** Stream chat response with activation data.

Yields newline-delimited JSON events:
    {type: "brain", data: {regionActivations, dominantNetwork}}
    {type: "token", data: {token, layerActivations}}
    {type: "done",  data: {fullText}}  

```bash
curl -s -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `POST /replay`
**Handler:** `replay()` (`cognitive-trajectory/server/stub_api.py:229`)  
**Description:** Process a completed conversation and return full enriched data
in mock conversation contract shape.  

```bash
curl -s -X POST http://127.0.0.1:8000/replay \
  -H "Content-Type: application/json" \
  -d '{}'
```

### `POST /save`
**Handler:** `save_conversation()` (`cognitive-trajectory/server/save_api.py:21`)  
**Description:** No description provided.  

```bash
curl -s -X POST http://127.0.0.1:8000/save \
  -H "Content-Type: application/json" \
  -d '{}'
```
