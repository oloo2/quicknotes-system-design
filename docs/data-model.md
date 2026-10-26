# QuickNotes relational data model

QuickNotes uses SQL (PostgreSQL) for its primary data store. Notes, users, and
tags have clear relationships and need reliable transactions and constraints:
for example, a note must belong to a valid user, and a user must not see
another user's notes. Relational foreign keys and unique constraints enforce
these rules while supporting joins and filtering. PostgreSQL can scale reads
and writes through indexing, connection pooling, and managed replication
without giving up transactional consistency.

## Entities and columns

| Entity      | Column          | Type                                  | Constraints                             |
| ----------- | --------------- | ------------------------------------- | --------------------------------------- |
| `users`     | `id`            | `BIGINT GENERATED ALWAYS AS IDENTITY` | Primary key                             |
| `users`     | `email`         | `VARCHAR(320)`                        | Not null, unique                        |
| `users`     | `password_hash` | `TEXT`                                | Not null                                |
| `users`     | `created_at`    | `TIMESTAMPTZ`                         | Not null, defaults to current timestamp |
| `notes`     | `id`            | `BIGINT GENERATED ALWAYS AS IDENTITY` | Primary key                             |
| `notes`     | `user_id`       | `BIGINT`                              | Not null, foreign key to `users.id`     |
| `notes`     | `title`         | `VARCHAR(100)`                        | Not null                                |
| `notes`     | `body`          | `TEXT`                                | Not null, defaults to empty text        |
| `notes`     | `created_at`    | `TIMESTAMPTZ`                         | Not null, defaults to current timestamp |
| `notes`     | `updated_at`    | `TIMESTAMPTZ`                         | Not null, defaults to current timestamp |
| `tags`      | `id`            | `BIGINT GENERATED ALWAYS AS IDENTITY` | Primary key                             |
| `tags`      | `name`          | `VARCHAR(50)`                         | Not null, unique                        |
| `tags`      | `created_at`    | `TIMESTAMPTZ`                         | Not null, defaults to current timestamp |
| `note_tags` | `note_id`       | `BIGINT`                              | Primary key; foreign key to `notes.id`  |
| `note_tags` | `tag_id`        | `BIGINT`                              | Primary key; foreign key to `tags.id`   |
| `note_tags` | `created_at`    | `TIMESTAMPTZ`                         | Not null, defaults to current timestamp |

## Relationships

- **One-to-many:** One user can own many notes. Each note belongs to exactly
  one user through `notes.user_id`; deleting a user cascades to that user's
  notes.
- **Many-to-many:** A note can have many tags, and a tag can be applied to
  many notes. `note_tags` is the junction table, with a composite primary key
  on (`note_id`, `tag_id`) to prevent duplicate assignments. Deleting a note
  or tag cascades to its junction rows.

## PostgreSQL schema

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE note_tags (
    note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX idx_notes_user_updated
    ON notes (user_id, updated_at DESC);

CREATE INDEX idx_note_tags_tag_note
    ON note_tags (tag_id, note_id);
```

`idx_notes_user_updated` supports the common operation of listing a user's
notes in most recently updated order without scanning every user's notes.
`idx_note_tags_tag_note` supports finding notes by tag; the composite primary
key already supports lookups that start with `note_id`.

## Example queries

List a user's notes, newest updates first:

```sql
SELECT id, title, body, created_at, updated_at
FROM notes
WHERE user_id = $1
ORDER BY updated_at DESC
LIMIT 20;
```

List notes and their tags for a user (JOIN across the note-tag relationship):

```sql
SELECT n.id AS note_id, n.title, t.id AS tag_id, t.name AS tag_name
FROM notes AS n
JOIN note_tags AS nt ON nt.note_id = n.id
JOIN tags AS t ON t.id = nt.tag_id
WHERE n.user_id = $1
ORDER BY n.updated_at DESC, t.name;
```

Create a note and return its generated identifier and timestamps:

```sql
INSERT INTO notes (user_id, title, body)
VALUES ($1, $2, $3)
RETURNING id, user_id, title, body, created_at, updated_at;
```

Add a tag to a note without creating a duplicate association:

```sql
INSERT INTO note_tags (note_id, tag_id)
VALUES ($1, $2)
ON CONFLICT (note_id, tag_id) DO NOTHING;
```
