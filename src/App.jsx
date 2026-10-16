import { useEffect, useRef, useState } from 'react';
import {
  COLUMNS, MARKETS, TYPES, VALUE_KEYS,
  emptyRecord, fromCsvLine, fromJson, nowTimestamp, toCsvLine, validate, valueKeysFor,
} from './schema.js';

const STORAGE_KEY = 'output-json-records';
const LABELS = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]));

function newDraft(prev) {
  // Keep the market/type of the previous entry so repeated input is quick.
  return {
    ...emptyRecord(),
    market: prev?.market || 'GOVT',
    type: prev?.type || 'Bid',
  };
}

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export default function App() {
  const [records, setRecords] = useState(loadStored);
  const [draft, setDraft] = useState(() => newDraft());
  const [formOpen, setFormOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [errors, setErrors] = useState({});
  const [highlight, setHighlight] = useState(null);
  const [notice, setNotice] = useState('');
  const csvInput = useRef(null);
  const jsonInput = useRef(null);
  const tableWrap = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      /* storage unavailable — records still live in memory */
    }
  }, [records]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  // Scroll to the record that was just added or changed and flash it.
  useEffect(() => {
    if (highlight === null) return;
    tableWrap.current
      ?.querySelector(`[data-row="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  // Escape closes the form window.
  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e) => e.key === 'Escape' && closeForm();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const activeValueKeys = valueKeysFor(draft.market, draft.type);
  const errorFields = Object.keys(errors).filter((k) => errors[k]);

  const set = (key) => (e) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  function openNew() {
    setDraft(newDraft(draft));
    setEditIndex(null);
    setErrors({});
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditIndex(null);
    setErrors({});
  }

  function submit(e) {
    e.preventDefault();
    // Blank out value columns that don't belong to this market/type, so
    // hidden fields can never block saving.
    const clean = { ...draft };
    for (const k of VALUE_KEYS) if (!activeValueKeys.includes(k)) clean[k] = '';

    const errs = validate(clean);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (editIndex === null) {
      // New records are stamped with the time they were added; edits keep theirs.
      clean.timestamp = nowTimestamp();
      setRecords((r) => [...r, clean]);
      setHighlight(records.length);
      setNotice('Record added');
    } else {
      setRecords((r) => r.map((rec, i) => (i === editIndex ? clean : rec)));
      setHighlight(editIndex);
      setNotice('Record updated');
    }
    setDraft(newDraft(clean));
    closeForm();
  }

  function edit(i) {
    setDraft({ ...records[i] });
    setEditIndex(i);
    setErrors({});
    setFormOpen(true);
  }

  function duplicate(i) {
    setDraft({ ...records[i], timestamp: '' });
    setEditIndex(null);
    setErrors({});
    setFormOpen(true);
  }

  function remove(i) {
    setRecords((r) => r.filter((_, j) => j !== i));
  }

  function clearAll() {
    if (records.length && confirm(`Delete all ${records.length} records?`)) setRecords([]);
  }

  async function importFile(e, kind) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      const imported =
        kind === 'csv'
          ? text.split(/\r?\n/).filter((l) => l.trim()).map(fromCsvLine)
          : JSON.parse(text).map(fromJson);
      setRecords((r) => [...r, ...imported]);
      setNotice(`Imported ${imported.length} records from ${file.name}`);
    } catch (err) {
      setNotice(`Could not read ${file.name}: ${err.message}`);
    }
  }

  function saveCsv(i) {
    const r = records[i];
    const blob = new Blob([toCsvLine(r) + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = r.timestamp.slice(0, 19).replace(/[:T]/g, '-');
    a.download = `${r.instrument}_${r.type}_${stamp}.csv`.replace(/[\\/]/g, '-');
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const field = (key, props = {}) => (
    <label className={`field ${errors[key] ? 'has-error' : ''}`}>
      <span>{LABELS[key]}</span>
      <input value={draft[key]} onChange={set(key)} {...props} />
      {errors[key] && <small>{errors[key]}</small>}
    </label>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Quote JSON Builder</h1>
          <p>Enter quotes, trades and fixings and save them as CSV.</p>
        </div>
        <button className="primary add-button" onClick={openNew}>+ Add record</button>
      </header>

      <section className="card records">
        <div className="toolbar">
          <h2>Records ({records.length})</h2>
          <div className="toolbar-buttons">
            <button onClick={() => csvInput.current.click()}>Import CSV</button>
            <button onClick={() => jsonInput.current.click()}>Import JSON</button>
            <button onClick={clearAll} disabled={!records.length}>Clear all</button>
            <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => importFile(e, 'csv')} />
            <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e, 'json')} />
          </div>
        </div>

        <div className="table-wrap" ref={tableWrap}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>ISIN</th><th>Issue</th><th>Market</th><th>Type</th>
                <th>Values</th><th className="num">Volume</th><th>Timestamp</th><th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr><td colSpan={9} className="empty">No records yet. Press “Add record” or import a CSV.</td></tr>
              )}
              {records.map((r, i) => (
                <tr key={i} data-row={i} className={i === highlight ? 'highlight' : ''}>
                  <td>{i + 1}</td>
                  <td>{r.instrument}</td>
                  <td>{r.ticker}</td>
                  <td>{r.market}</td>
                  <td><span className={`tag ${r.type.toLowerCase()}`}>{r.type}</span></td>
                  <td className="values">
                    {VALUE_KEYS.filter((k) => r[k] !== '').map((k) => (
                      <span key={k}>{LABELS[k]}: <b>{r[k]}</b></span>
                    ))}
                  </td>
                  <td className="num">{r.volume}</td>
                  <td className="mono">{r.timestamp}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => saveCsv(i)}>Save CSV</button>
                      <button onClick={() => edit(i)}>Edit</button>
                      <button onClick={() => duplicate(i)}>Copy</button>
                      <button className="danger" onClick={() => remove(i)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeForm()}>
          <form className="card modal" onSubmit={submit} noValidate role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>{editIndex === null ? 'New record' : `Editing record #${editIndex + 1}`}</h2>
              <button type="button" className="ghost close" onClick={closeForm} aria-label="Close">×</button>
            </div>

            <div className="grid">
              {field('instrument', { placeholder: 'UZA000002255', autoFocus: true })}
              {field('ticker', { placeholder: '24094UM' })}

              <label className="field">
                <span>Market</span>
                <select value={draft.market} onChange={set('market')}>
                  {MARKETS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Type</span>
                <select value={draft.type} onChange={set('type')}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>

              {activeValueKeys.map((k) => (
                <div key={k}>{field(k, { inputMode: 'decimal', placeholder: '0.0000' })}</div>
              ))}

              {field('volume', { inputMode: 'numeric', placeholder: '1000' })}
            </div>

            {errorFields.length > 0 && (
              <p className="form-error">
                Please fix: {errorFields.map((k) => `${LABELS[k] || k} (${errors[k]})`).join(', ')}
              </p>
            )}

            <div className="actions">
              <button type="submit" className="primary">
                {editIndex === null ? 'Add record' : 'Save changes'}
              </button>
              <button type="button" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
