# REBT thought record

A local browser form for Rational Emotive Behavior Therapy (REBT) reflection.
Requires Python 3 and a web browser.
No extra packages are needed. The manual form works without internet access.

## Fill the form by voice

Run `python app.py` and open **http://127.0.0.1:8765/voice**.
The separate `voice.html` page keeps the same fields and CSV save behavior.
Select **Start guided voice form** and allow microphone access. The app reads
a short, conversational question aloud, then listens to your English answer. Pause for about 1.5 seconds
or select **Done answering** to finish. The app shows your answer and asks
you to say **yes** (keep it in the form) or **redo** (answer again).
After the last question, it reads the full record and asks for final permission:
say **save entry** to write to CSV, or **redo** to review the questions again.
Nothing is written to CSV until this final confirmation. Buttons are also available.

Use **Read question and answer orally** beside a field to revisit just that question.
Use **Stop voice** to return to typing; it discards the current unconfirmed answer
and preserves confirmed answers. **Retry voice** repeats a prompt after a speech
error. For distress ratings, say a number from zero to ten; say **skip** for the
optional practice plan. Today's date is filled automatically; edit it before starting.
You can interrupt the answer confirmation with yes, correct, or yup to keep it,
or no, na, not at all, or redo to answer again. Unclear replies keep listening.
Initial questions and the final CSV review finish speaking before listening.
Headphones help prevent speaker audio from reaching the microphone; simultaneous
speech and listening depend on browser and device support.

Speech recognition requires a supported browser (try Chrome) and may need
internet access. The browser may send audio to its speech provider; this app
does not record audio and saves only the form text after your final save confirmation.
If speech is unavailable or permission is denied, you can still type answers.
See [browser speech recognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

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
