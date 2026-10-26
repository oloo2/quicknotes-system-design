# QuickNotes

QuickNotes is a browser-based notes app prototype that demonstrates connecting
a front end to a REST API. It uses JSONPlaceholder to load, create, and delete
practice notes, and includes design documents for a scalable online service.

## Run the API client

1. Open `index.html` in a modern web browser while connected to the internet.
   The client calls the JSONPlaceholder practice API, so network access is
   required.
2. Select **Load notes** to fetch and display ten notes.
3. Enter a title (required, up to 100 characters) and an optional note body,
   then select **Add note**. Use **Delete** on a displayed note to remove it
   from the current view.

JSONPlaceholder simulates write requests and does not persist created or
deleted data. Refreshing the page starts a new session.

## Design documents

- [API design](docs/api-design.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)

## What I learned

- How to make browser `GET`, `POST`, and `DELETE` requests and handle loading,
  success, empty, and error states.
- Why input validation and safe `textContent` rendering matter when displaying
  user-provided text.
- How relational tables, primary and foreign keys, and indexes represent users,
  notes, and tags.
- How caching, read replicas, queues, and horizontally scaled app servers
  address availability and growth, while introducing trade-offs.
