const API_URL = "https://jsonplaceholder.typicode.com/posts";
const loadButton = document.querySelector("#load-btn");
const submitButton = document.querySelector("#submit-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");

let notes = [];

function setStatus(message, state) {
  statusMessage.textContent = message;
  statusMessage.className = state ? `status-${state}` : "";
}

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function setButtonsDisabled(disabled) {
  loadButton.disabled = disabled;
  submitButton.disabled = disabled;
  notesList.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-state";
    emptyItem.textContent = "No notes found.";
    notesList.append(emptyItem);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    const title = document.createElement("h2");
    const body = document.createElement("p");
    const deleteButton = document.createElement("button");

    title.textContent = note.title ?? "";
    body.textContent = note.body ?? "";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteNote(note.id));
    item.append(title, body, deleteButton);
    notesList.append(item);
  });
}

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);

async function loadNotes() {
  setButtonsDisabled(true);
  setStatus("Loading notes...", "loading");

  try {
    const loadedNotes = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(loadedNotes)) {
      throw new Error("The server returned an invalid notes list.");
    }

    notes = loadedNotes;
    renderNotes();
    setStatus(`Loaded ${notes.length} notes from the server.`, "success");
  } catch {
    setStatus(
      "Sorry, we couldn't load your notes. Please try again.",
      "error"
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title) {
    setStatus("Please enter a title for your note.", "error");
    titleInput.focus();
    return;
  }

  if (title.length > 100) {
    setStatus("Titles must be 100 characters or fewer.", "error");
    titleInput.focus();
    return;
  }

  setButtonsDisabled(true);
  setStatus("Creating note...", "loading");

  try {
    const createdNote = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    if (!createdNote || createdNote.id === undefined) {
      throw new Error("The server returned an invalid note.");
    }

    notes.unshift(createdNote);
    renderNotes();
    noteForm.reset();
    setStatus("Note created successfully.", "success");
  } catch {
    setStatus(
      "Sorry, we couldn't create your note. Please try again.",
      "error"
    );
  } finally {
    setButtonsDisabled(false);
  }
}

async function deleteNote(id) {
  setButtonsDisabled(true);
  setStatus("Deleting note...", "loading");

  try {
    await request(`${API_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    notes = notes.filter((note) => note.id !== id);
    renderNotes();
    setStatus("Note deleted successfully.", "success");
  } catch {
    setStatus(
      "Sorry, we couldn't delete your note. Please try again.",
      "error"
    );
  } finally {
    setButtonsDisabled(false);
  }
}
