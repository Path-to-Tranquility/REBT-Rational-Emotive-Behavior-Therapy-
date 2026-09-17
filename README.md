# REBT thought record

A local browser form for Rational Emotive Behavior Therapy (REBT) reflection.
Requires Python 3 and a web browser.
No extra packages or internet connection are needed.

## Run

From this folder:

```powershell
python app.py
```

Open **http://127.0.0.1:8765** in your browser. Keep the terminal running while
using the form. Press Ctrl+C in the terminal to stop the server. The server
accepts connections only from this computer. Open the address above rather
than opening `index.html` directly.

Choose one situation and follow the instructions and examples in A–E:

- **A — Activating event:** describe what happened using observable facts.
- **B — Beliefs:** write what you told yourself about the event.
- **C — Consequences:** fill in negative emotions and behaviour separately.
- **D — Disputation:** examine the evidence, logic, and usefulness of your belief.
- **E — Effective new belief and response:** write a flexible belief, a new
  healthy negative emotion to work toward, and a new constructive behaviour.

Optionally add a practice plan. Enter the date and your actual emotional distress
before and after reflection, then click **Save entry to CSV**.

Each successful submission appends one record to `data/rebt_entries.csv`, next
to the application. The folder and column header are created on the first save.
Records include a unique ID and a timestamp with the local time zone. Commas,
quotation marks, and multiline answers are preserved using standard CSV quoting.
The form clears only after a successful save; errors leave your answers in place.

On the next successful submission, an older CSV is automatically upgraded with
the new columns. A uniquely named backup is saved beside it first. Old combined
consequence answers remain intact in the `consequences` column; the new separate
fields are left blank for old entries. New entries use the separate columns.

The CSV is plain text stored on your computer. Close it in Excel before saving
another entry if Excel has locked the file. Journal data is excluded from Git.
