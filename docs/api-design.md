# QuickNotes REST API

## Conventions

- Base URL: `https://api.quicknotes.example/v1`
- Requests and responses use JSON (`Content-Type: application/json`).
- All endpoints require a valid bearer access token, except `POST /auth/token`.
- Notes belong to the authenticated user. The server derives the owner from
  the token; clients cannot assign or change note ownership.
- List endpoints return the authenticated user's notes only.

## Endpoints

| Method   | Path              | Description                                                                          | Success status   |
| -------- | ----------------- | ------------------------------------------------------------------------------------ | ---------------- |
| `POST`   | `/auth/token`     | Exchange valid credentials for an access token.                                      | `200 OK`         |
| `GET`    | `/notes`          | List the authenticated user's notes; supports `limit` and `cursor` query parameters. | `200 OK`         |
| `POST`   | `/notes`          | Create a note for the authenticated user.                                            | `201 Created`    |
| `GET`    | `/notes/{noteId}` | Retrieve one note belonging to the authenticated user.                               | `200 OK`         |
| `PATCH`  | `/notes/{noteId}` | Update a note's title or body.                                                       | `200 OK`         |
| `DELETE` | `/notes/{noteId}` | Delete a note belonging to the authenticated user.                                   | `204 No Content` |

## Create a note

`POST /v1/notes`

Request:

```json
{
  "title": "Release checklist",
  "body": "Confirm the deployment and smoke tests."
}
```

Success response (`201 Created`):

```json
{
  "id": "note_01J9Q2M8Y4",
  "title": "Release checklist",
  "body": "Confirm the deployment and smoke tests.",
  "createdAt": "2026-10-26T20:28:34Z",
  "updatedAt": "2026-10-26T20:28:34Z"
}
```

The server generates the note ID and timestamps. `title` is required and
limited to 100 characters; `body` is optional and limited to 20,000 characters.

## List notes

`GET /v1/notes?limit=2`

Success response (`200 OK`):

```json
{
  "items": [
    {
      "id": "note_01J9Q2M8Y4",
      "title": "Release checklist",
      "body": "Confirm the deployment and smoke tests.",
      "createdAt": "2026-10-26T20:28:34Z",
      "updatedAt": "2026-10-26T20:28:34Z"
    },
    {
      "id": "note_01J9Q1T7PX",
      "title": "Ideas",
      "body": "Sketch onboarding improvements.",
      "createdAt": "2026-10-25T16:10:00Z",
      "updatedAt": "2026-10-25T16:10:00Z"
    }
  ],
  "nextCursor": "eyJvZmZzZXQiOjJ9"
}
```

`limit` is optional (default `20`, maximum `100`). When another page is
available, `nextCursor` contains an opaque cursor for the next request;
otherwise it is `null`.

## Error responses

The API may return the following error statuses:

| Status                      | Meaning                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `400 Bad Request`           | Invalid JSON, missing required fields, invalid query parameters, or validation failure. |
| `401 Unauthorized`          | Missing, expired, or invalid access token.                                              |
| `403 Forbidden`             | The authenticated user is not permitted to perform the operation.                       |
| `404 Not Found`             | The resource does not exist or is not available to the authenticated user.              |
| `409 Conflict`              | The request conflicts with the current resource state.                                  |
| `429 Too Many Requests`     | The client exceeded a rate limit.                                                       |
| `500 Internal Server Error` | An unexpected server-side failure occurred.                                             |

Errors use a consistent JSON body. For example, a title validation failure
returns `400 Bad Request`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "title",
        "message": "Title is required and must be 100 characters or fewer."
      }
    ],
    "requestId": "req_01J9Q2Z6VF"
  }
}
```
